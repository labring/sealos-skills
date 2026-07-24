#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  buildAndPush,
  buildxArgs,
  parseArgs,
  resolveBuildxMetadata,
  safeServiceKey,
} from './build-push.mjs'
import { collectProjectArtifacts } from './validate-artifacts.mjs'

const digest = `sha256:${'a'.repeat(64)}`

function makeWorkDir () {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-build-push-test-'))
  fs.writeFileSync(path.join(workDir, 'Dockerfile'), 'FROM scratch\n')
  return workDir
}

test('buildx arguments pin linux/amd64 and preserve the exact per-service build spec', () => {
  const args = buildxArgs(
    'ghcr.io/acme/web:20260725-120000',
    '/tmp/buildx-metadata.json',
    {
      buildContext: '/workspace/apps/web',
      dockerfile: '/workspace/apps/web/Containerfile',
      target: 'runtime',
      buildArgs: ['NODE_ENV=production', 'API_URL'],
    },
  )

  assert.deepEqual(args, [
    'buildx',
    'build',
    '--platform',
    'linux/amd64',
    '-f',
    '/workspace/apps/web/Containerfile',
    '--target',
    'runtime',
    '--build-arg',
    'NODE_ENV=production',
    '--build-arg',
    'API_URL',
    '--tag',
    'ghcr.io/acme/web:20260725-120000',
    '--push',
    '--metadata-file',
    '/tmp/buildx-metadata.json',
    '/workspace/apps/web',
  ])
})

test('CLI accepts repeated per-service build arguments', () => {
  assert.deepEqual(
    parseArgs([
      'node',
      'build-push.mjs',
      '/workspace',
      'acme-web',
      '--service',
      'web',
      '--context',
      'apps/web',
      '--dockerfile',
      'Containerfile',
      '--target',
      'runtime',
      '--build-arg',
      'NODE_ENV=production',
      '--build-arg',
      'API_URL',
    ]),
    {
      workDir: '/workspace',
      repoName: 'acme-web',
      registry: null,
      user: null,
      serviceName: 'web',
      buildContext: 'apps/web',
      dockerfile: 'Containerfile',
      target: 'runtime',
      buildArgs: ['NODE_ENV=production', 'API_URL'],
    },
  )
})

test('resolves the immutable image reference from Buildx metadata', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-buildx-metadata-test-'))
  const metadataPath = path.join(fixtureDir, 'metadata.json')

  try {
    fs.writeFileSync(metadataPath, JSON.stringify({
      'containerimage.digest': digest.toUpperCase(),
    }))

    assert.deepEqual(
      resolveBuildxMetadata('ghcr.io/acme/web:20260725-120000', metadataPath),
      {
        digest,
        imageRef: `ghcr.io/acme/web@${digest}`,
        platforms: ['linux/amd64'],
      },
    )
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true })
  }
})

test('rejects missing or malformed Buildx digests', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-buildx-metadata-test-'))
  const metadataPath = path.join(fixtureDir, 'metadata.json')

  try {
    fs.writeFileSync(metadataPath, JSON.stringify({
      'containerimage.digest': 'sha256:not-a-digest',
    }))

    assert.throws(
      () => resolveBuildxMetadata('acme/web:tag', metadataPath),
      /invalid containerimage\.digest/,
    )
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true })
  }
})

test('build records the Buildx digest and removes temporary metadata', async () => {
  const workDir = makeWorkDir()
  let metadataDir

  try {
    const result = await buildAndPush(
      workDir,
      'Web App',
      { registry: 'dockerhub', user: 'acme' },
      {
        tag: '20260725-120000',
        serviceName: 'web',
        executeBuildx: ({
          workDir: actualWorkDir,
          remoteImage,
          metadataPath,
          buildContext,
          dockerfile,
          target,
          buildArgs,
        }) => {
          assert.equal(actualWorkDir, workDir)
          assert.equal(remoteImage, 'acme/web-app-web:20260725-120000')
          assert.equal(buildContext, workDir)
          assert.equal(dockerfile, path.join(workDir, 'Dockerfile'))
          assert.equal(target, null)
          assert.deepEqual(buildArgs, [])
          metadataDir = path.dirname(metadataPath)
          fs.writeFileSync(metadataPath, JSON.stringify({
            'containerimage.digest': digest,
          }))
        },
      },
    )

    assert.deepEqual(result, {
      success: true,
      image: `acme/web-app-web@${digest}`,
      pushed_image: 'acme/web-app-web:20260725-120000',
      digest,
      platforms: ['linux/amd64'],
      registry: 'dockerhub',
      service: 'web',
      artifact: path.join(workDir, '.sealos', 'build', 'web', 'build-result.json'),
    })
    assert.equal(fs.existsSync(metadataDir), false)

    const artifact = JSON.parse(fs.readFileSync(
      path.join(workDir, '.sealos', 'build', 'web', 'build-result.json'),
      'utf8',
    ))
    assert.equal(artifact.outcome, 'success')
    assert.deepEqual(artifact.service, {
      name: 'web',
      artifact_key: 'web',
    })
    assert.deepEqual(artifact.build, {
      image_name: 'web-app-web',
      context: '.',
      dockerfile: 'Dockerfile',
      target: null,
      build_arg_names: [],
      started_at: artifact.build.started_at,
    })
    assert.equal(artifact.push.remote_image, 'acme/web-app-web:20260725-120000')
    assert.equal(artifact.push.digest, digest)
    assert.equal(artifact.push.image_ref, `acme/web-app-web@${digest}`)
    assert.deepEqual(artifact.push.platforms, ['linux/amd64'])
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('invalid Buildx metadata fails the build and is still cleaned up', async () => {
  const workDir = makeWorkDir()
  let metadataDir

  try {
    const result = await buildAndPush(
      workDir,
      'web',
      { registry: 'dockerhub', user: 'acme' },
      {
        tag: '20260725-120000',
        executeBuildx: ({ metadataPath }) => {
          metadataDir = path.dirname(metadataPath)
          fs.writeFileSync(metadataPath, JSON.stringify({
            'containerimage.digest': 'not-a-digest',
          }))
        },
      },
    )

    assert.equal(result.success, false)
    assert.match(result.error, /invalid containerimage\.digest/)
    assert.equal(fs.existsSync(metadataDir), false)

    const artifact = JSON.parse(fs.readFileSync(
      path.join(workDir, '.sealos', 'build', 'web', 'build-result.json'),
      'utf8',
    ))
    assert.equal(artifact.outcome, 'failed')
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('build failures do not persist explicit build argument values', async () => {
  const workDir = makeWorkDir()

  try {
    const result = await buildAndPush(
      workDir,
      'web',
      { registry: 'dockerhub', user: 'acme' },
      {
        tag: '20260725-120000',
        buildArgs: ['API_TOKEN=do-not-persist'],
        executeBuildx: () => {
          throw new Error('Command failed: docker buildx build --build-arg API_TOKEN=do-not-persist')
        },
      },
    )

    assert.equal(result.success, false)
    assert.equal(result.error.includes('do-not-persist'), false)
    assert.match(result.error, /API_TOKEN=<redacted>/)

    const artifact = fs.readFileSync(
      path.join(workDir, '.sealos', 'build', 'web', 'build-result.json'),
      'utf8',
    )
    assert.equal(artifact.includes('do-not-persist'), false)
    assert.match(artifact, /API_TOKEN=<redacted>/)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('per-service builds use their own contexts and keep independent artifacts', async () => {
  const workDir = makeWorkDir()
  const webContext = path.join(workDir, 'apps', 'web')
  const apiContext = path.join(workDir, 'apps', 'api')
  fs.mkdirSync(path.join(webContext, 'docker'), { recursive: true })
  fs.mkdirSync(apiContext, { recursive: true })
  fs.writeFileSync(path.join(webContext, 'docker', 'Dockerfile.prod'), 'FROM scratch AS runtime\n')
  fs.writeFileSync(path.join(apiContext, 'Dockerfile'), 'FROM scratch\n')
  const executions = []

  const executeBuildx = (build) => {
    executions.push(build)
    fs.writeFileSync(build.metadataPath, JSON.stringify({
      'containerimage.digest': digest,
    }))
  }

  try {
    const webResult = await buildAndPush(
      workDir,
      'project',
      { registry: 'dockerhub', user: 'acme' },
      {
        tag: '20260725-120000',
        serviceName: 'web',
        buildContext: 'apps/web',
        dockerfile: 'docker/Dockerfile.prod',
        target: 'runtime',
        buildArgs: ['NODE_ENV=production', 'API_TOKEN=do-not-persist'],
        executeBuildx,
      },
    )
    const apiResult = await buildAndPush(
      workDir,
      'project',
      { registry: 'dockerhub', user: 'acme' },
      {
        tag: '20260725-120001',
        serviceName: 'api/backend',
        buildContext: 'apps/api',
        executeBuildx,
      },
    )
    const normalizedApiResult = await buildAndPush(
      workDir,
      'project',
      { registry: 'dockerhub', user: 'acme' },
      {
        tag: '20260725-120001',
        serviceName: 'api-backend',
        buildContext: 'apps/api',
        executeBuildx,
      },
    )

    assert.equal(webResult.success, true)
    assert.equal(apiResult.success, true)
    assert.equal(normalizedApiResult.success, true)
    assert.equal(webResult.pushed_image, 'acme/project-web:20260725-120000')
    assert.equal(
      apiResult.pushed_image,
      `acme/project-${safeServiceKey('api/backend')}:20260725-120001`,
    )
    assert.equal(
      normalizedApiResult.pushed_image,
      'acme/project-api-backend:20260725-120001',
    )
    assert.notEqual(webResult.pushed_image, apiResult.pushed_image)
    assert.notEqual(apiResult.pushed_image, normalizedApiResult.pushed_image)
    assert.equal(executions.length, 3)
    assert.equal(executions[0].buildContext, webContext)
    assert.equal(executions[0].dockerfile, path.join(webContext, 'docker', 'Dockerfile.prod'))
    assert.equal(executions[0].target, 'runtime')
    assert.deepEqual(
      executions[0].buildArgs.map(buildArg => buildArg.value),
      ['NODE_ENV=production', 'API_TOKEN=do-not-persist'],
    )
    assert.equal(executions[1].buildContext, apiContext)
    assert.equal(executions[1].dockerfile, path.join(apiContext, 'Dockerfile'))
    assert.equal(executions[2].buildContext, apiContext)

    const webArtifactPath = path.join(
      workDir,
      '.sealos',
      'build',
      'web',
      'build-result.json',
    )
    const apiArtifactPath = path.join(
      workDir,
      '.sealos',
      'build',
      safeServiceKey('api/backend'),
      'build-result.json',
    )
    const webArtifact = JSON.parse(fs.readFileSync(webArtifactPath, 'utf8'))
    const apiArtifact = JSON.parse(fs.readFileSync(apiArtifactPath, 'utf8'))
    const normalizedApiArtifactPath = path.join(
      workDir,
      '.sealos',
      'build',
      safeServiceKey('api-backend'),
      'build-result.json',
    )

    assert.deepEqual(webArtifact.build.build_arg_names, ['NODE_ENV', 'API_TOKEN'])
    assert.equal(webArtifact.build.context, 'apps/web')
    assert.equal(webArtifact.build.dockerfile, 'docker/Dockerfile.prod')
    assert.equal(JSON.stringify(webArtifact).includes('do-not-persist'), false)
    assert.equal(apiArtifact.service.name, 'api/backend')
    assert.notEqual(webArtifactPath, apiArtifactPath)
    assert.notEqual(apiArtifactPath, normalizedApiArtifactPath)

    const discoveredBuildResults = collectProjectArtifacts(workDir)
      .filter(artifact => artifact.kind === 'build-result')
      .map(artifact => artifact.file)
    assert.deepEqual(
      discoveredBuildResults,
      [apiArtifactPath, normalizedApiArtifactPath, webArtifactPath].sort(),
    )
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('unsafe service names cannot escape the per-service artifact directory', () => {
  const serviceKey = safeServiceKey('../../API')
  assert.match(serviceKey, /^[a-z0-9_][a-z0-9_.-]*$/)
  assert.equal(serviceKey.includes('/'), false)
  assert.notEqual(serviceKey, '..')
})
