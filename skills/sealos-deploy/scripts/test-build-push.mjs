#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  buildAndPush,
  buildxArgs,
  ensureGhcrRegistry,
  getDateTag,
  loginGhcr,
  parseArgs,
  preflightLocalBuild,
  resolveBuildxMetadata,
  safeServiceKey,
  verifyGhcrPublicPull,
} from './build-push.mjs'
import { collectProjectArtifacts } from './validate-artifacts.mjs'

const digest = `sha256:${'a'.repeat(64)}`
const anonymousPull = async () => ({
  pullAccess: 'anonymous',
  visibility: 'public',
  status: 200,
})

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
      serviceName: 'web',
      buildContext: 'apps/web',
      dockerfile: 'Containerfile',
      target: 'runtime',
      buildArgs: ['NODE_ENV=production', 'API_URL'],
    },
  )
})

test('CLI rejects removed registry selection flags and all unknown options', () => {
  assert.throws(
    () => parseArgs(['node', 'build-push.mjs', '/workspace', 'web', '--registry', 'ghcr']),
    /--registry is no longer supported.*GHCR/,
  )
  assert.throws(
    () => parseArgs(['node', 'build-push.mjs', '/workspace', 'web', '--user', 'acme']),
    /--user is no longer supported.*GHCR/,
  )
  assert.throws(
    () => parseArgs(['node', 'build-push.mjs', '/workspace', 'web', '--unknown']),
    /Unknown option: --unknown/,
  )
})

test('default tags have a random suffix in addition to the timestamp', () => {
  const first = getDateTag()
  const second = getDateTag()

  assert.match(first, /^\d{8}-\d{6}-[0-9a-f]{6}$/)
  assert.match(second, /^\d{8}-\d{6}-[0-9a-f]{6}$/)
  assert.notEqual(first, second)
})

test('local preflight rejects a bad context before checking Docker or GitHub auth', () => {
  const workDir = makeWorkDir()
  try {
    assert.deepEqual(
      preflightLocalBuild(workDir, 'web', { buildContext: 'missing' }),
      {
        ok: false,
        error: 'Build context directory not found: missing',
      },
    )
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('GHCR login passes the github.com token to Docker through stdin', () => {
  const calls = []
  const ok = loginGhcr('MixedCaseUser', {
    getToken: () => 'secret-token',
    execute: (command, args, options) => {
      calls.push({ command, args, options })
    },
  })

  assert.equal(ok, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].command, 'docker')
  assert.deepEqual(calls[0].args, [
    'login',
    'ghcr.io',
    '-u',
    'MixedCaseUser',
    '--password-stdin',
  ])
  assert.equal(calls[0].options.input, 'secret-token\n')
})

test('GHCR preparation re-reads the active account after scope changes', async () => {
  const detectedUsers = ['BeforeRefresh', 'AfterRefresh']
  const loginUsers = []
  const result = await ensureGhcrRegistry({
    triggerLogin: true,
    hasGhCliImpl: () => true,
    detectGhcrImpl: () => ({
      registry: 'ghcr',
      user: detectedUsers.shift(),
    }),
    ensureScopesImpl: async () => ({ ok: true, refreshed: true }),
    loginGhcrImpl: (user) => {
      loginUsers.push(user)
      return true
    },
  })

  assert.deepEqual(result, {
    ok: true,
    registryInfo: {
      registry: 'ghcr',
      user: 'AfterRefresh',
    },
  })
  assert.deepEqual(loginUsers, ['AfterRefresh'])
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

test('anonymous GHCR verification targets the immutable digest and accepts OCI manifests', async () => {
  const requests = []
  const result = await verifyGhcrPublicPull(
    {
      namespace: 'acme',
      packageName: 'web',
      digest,
    },
    {
      getVisibility: () => 'public',
      sleepImpl: async () => {},
      fetchImpl: async (url, options = {}) => {
        requests.push({ url, options })
        if (url.startsWith('https://ghcr.io/token?')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ token: 'anonymous-token' }),
          }
        }
        return { ok: true, status: 200 }
      },
    },
  )

  assert.equal(result.pullAccess, 'anonymous')
  assert.equal(
    requests[1].url,
    `https://ghcr.io/v2/acme/web/manifests/${digest}`,
  )
  assert.match(
    requests[1].options.headers.Accept,
    /application\/vnd\.oci\.image\.manifest\.v1\+json/,
  )
})

test('GHCR verification distinguishes auth denial from transient uncertainty', async () => {
  const denied = await verifyGhcrPublicPull(
    { namespace: 'acme', packageName: 'web', digest },
    {
      getVisibility: () => 'private',
      sleepImpl: async () => {},
      fetchImpl: async () => ({ ok: false, status: 401 }),
    },
  )
  assert.equal(denied.pullAccess, 'ghcr_secret_required')

  let attempts = 0
  const transient = await verifyGhcrPublicPull(
    { namespace: 'acme', packageName: 'web', digest },
    {
      getVisibility: () => null,
      sleepImpl: async () => {},
      fetchImpl: async () => {
        attempts++
        return { ok: false, status: 503 }
      },
    },
  )
  assert.equal(transient.pullAccess, 'indeterminate')
  assert.equal(attempts, 5)
})

test('build rejects every non-GHCR destination before executing a build', async () => {
  const workDir = makeWorkDir()
  let executed = false
  try {
    const result = await buildAndPush(
      workDir,
      'web',
      { registry: 'quay', user: 'acme' },
      {
        executeBuildx: () => {
          executed = true
        },
      },
    )

    assert.deepEqual(result, {
      success: false,
      error: 'Phase 4 only supports pushing newly built images to GHCR.',
    })
    assert.equal(executed, false)
    assert.equal(fs.existsSync(path.join(workDir, '.sealos')), false)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('build records the Buildx digest and removes temporary metadata', async () => {
  const workDir = makeWorkDir()
  let metadataDir
  let verificationInput

  try {
    const result = await buildAndPush(
      workDir,
      'Web App',
      { registry: 'ghcr', user: 'Acme' },
      {
        tag: '20260725-120000',
        serviceName: 'web',
        verifyPublicPull: async (input) => {
          verificationInput = input
          return anonymousPull()
        },
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
          assert.equal(remoteImage, 'ghcr.io/acme/web-app-web:20260725-120000')
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
      image: `ghcr.io/acme/web-app-web@${digest}`,
      pushed_image: 'ghcr.io/acme/web-app-web:20260725-120000',
      digest,
      platforms: ['linux/amd64'],
      registry: 'ghcr',
      pull_access: 'anonymous',
      requires_image_pull_secret: false,
      service: 'web',
      artifact: path.join(workDir, '.sealos', 'build', 'web', 'build-result.json'),
    })
    assert.deepEqual(verificationInput, {
      namespace: 'acme',
      packageName: 'web-app-web',
      digest,
      imageRef: `ghcr.io/acme/web-app-web@${digest}`,
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
    assert.equal(artifact.push.remote_image, 'ghcr.io/acme/web-app-web:20260725-120000')
    assert.equal(artifact.push.digest, digest)
    assert.equal(artifact.push.image_ref, `ghcr.io/acme/web-app-web@${digest}`)
    assert.deepEqual(artifact.push.platforms, ['linux/amd64'])
    assert.equal(artifact.push.pull_access, 'anonymous')
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('non-anonymous and indeterminate pull states are persisted and require a pull secret', async () => {
  const cases = [
    {
      name: 'private',
      verification: async () => ({
        pullAccess: 'ghcr_secret_required',
        visibility: 'private',
        status: 401,
      }),
      expected: 'ghcr_secret_required',
    },
    {
      name: 'unknown',
      verification: async () => {
        throw new Error('temporary GHCR outage')
      },
      expected: 'indeterminate',
    },
  ]

  for (const testCase of cases) {
    const workDir = makeWorkDir()
    try {
      const result = await buildAndPush(
        workDir,
        `web-${testCase.name}`,
        { registry: 'ghcr', user: 'Acme' },
        {
          tag: '20260725-120000',
          verifyPublicPull: testCase.verification,
          executeBuildx: ({ metadataPath }) => {
            fs.writeFileSync(metadataPath, JSON.stringify({
              'containerimage.digest': digest,
            }))
          },
        },
      )

      assert.equal(result.success, true)
      assert.equal(result.pull_access, testCase.expected)
      assert.equal(result.requires_image_pull_secret, true)
      assert.match(result.warning, /image pull secret/)

      const artifact = JSON.parse(fs.readFileSync(
        path.join(workDir, '.sealos', 'build', `web-${testCase.name}`, 'build-result.json'),
        'utf8',
      ))
      assert.equal(artifact.push.pull_access, testCase.expected)
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true })
    }
  }
})

test('invalid Buildx metadata fails the build and is still cleaned up', async () => {
  const workDir = makeWorkDir()
  let metadataDir

  try {
    const result = await buildAndPush(
      workDir,
      'web',
      { registry: 'ghcr', user: 'acme' },
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
      { registry: 'ghcr', user: 'acme' },
      {
        tag: '20260725-120000',
        buildArgs: ['API_TOKEN=do-not-persist'],
        executeBuildx: () => {
          throw new Error('Command failed: API_TOKEN=do-not-persist; application echoed do-not-persist')
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

test('build failures redact values inherited by name-only build arguments', async () => {
  const workDir = makeWorkDir()
  const previousValue = process.env.INHERITED_SECRET
  process.env.INHERITED_SECRET = 'inherited-do-not-persist'

  try {
    const result = await buildAndPush(
      workDir,
      'web',
      { registry: 'ghcr', user: 'acme' },
      {
        tag: '20260725-120000',
        buildArgs: ['INHERITED_SECRET'],
        executeBuildx: () => {
          throw new Error('application echoed inherited-do-not-persist')
        },
      },
    )

    assert.equal(result.success, false)
    assert.equal(result.error.includes('inherited-do-not-persist'), false)
    assert.match(result.error, /<redacted>/)

    const artifact = fs.readFileSync(
      path.join(workDir, '.sealos', 'build', 'web', 'build-result.json'),
      'utf8',
    )
    assert.equal(artifact.includes('inherited-do-not-persist'), false)
  } finally {
    if (previousValue === undefined) {
      delete process.env.INHERITED_SECRET
    } else {
      process.env.INHERITED_SECRET = previousValue
    }
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
      { registry: 'ghcr', user: 'acme' },
      {
        tag: '20260725-120000',
        serviceName: 'web',
        buildContext: 'apps/web',
        dockerfile: 'docker/Dockerfile.prod',
        target: 'runtime',
        buildArgs: ['NODE_ENV=production', 'API_TOKEN=do-not-persist'],
        executeBuildx,
        verifyPublicPull: anonymousPull,
      },
    )
    const apiResult = await buildAndPush(
      workDir,
      'project',
      { registry: 'ghcr', user: 'acme' },
      {
        tag: '20260725-120001',
        serviceName: 'api/backend',
        buildContext: 'apps/api',
        executeBuildx,
        verifyPublicPull: anonymousPull,
      },
    )
    const normalizedApiResult = await buildAndPush(
      workDir,
      'project',
      { registry: 'ghcr', user: 'acme' },
      {
        tag: '20260725-120001',
        serviceName: 'api-backend',
        buildContext: 'apps/api',
        executeBuildx,
        verifyPublicPull: anonymousPull,
      },
    )

    assert.equal(webResult.success, true)
    assert.equal(apiResult.success, true)
    assert.equal(normalizedApiResult.success, true)
    assert.equal(webResult.pushed_image, 'ghcr.io/acme/project-web:20260725-120000')
    assert.equal(
      apiResult.pushed_image,
      `ghcr.io/acme/project-${safeServiceKey('api/backend')}:20260725-120001`,
    )
    assert.equal(
      normalizedApiResult.pushed_image,
      'ghcr.io/acme/project-api-backend:20260725-120001',
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
