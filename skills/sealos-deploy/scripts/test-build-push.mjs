#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  buildAndPush,
  buildxArgs,
  resolveBuildxMetadata,
} from './build-push.mjs'

const digest = `sha256:${'a'.repeat(64)}`

function makeWorkDir () {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-build-push-test-'))
  fs.writeFileSync(path.join(workDir, 'Dockerfile'), 'FROM scratch\n')
  return workDir
}

test('buildx arguments pin linux/amd64, push, and request a metadata file', () => {
  const args = buildxArgs(
    'ghcr.io/acme/web:20260725-120000',
    '/tmp/buildx-metadata.json',
  )

  assert.deepEqual(args, [
    'buildx',
    'build',
    '--platform',
    'linux/amd64',
    '--tag',
    'ghcr.io/acme/web:20260725-120000',
    '--push',
    '--metadata-file',
    '/tmp/buildx-metadata.json',
    '.',
  ])
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
        executeBuildx: ({ workDir: actualWorkDir, remoteImage, metadataPath }) => {
          assert.equal(actualWorkDir, workDir)
          assert.equal(remoteImage, 'acme/web-app:20260725-120000')
          metadataDir = path.dirname(metadataPath)
          fs.writeFileSync(metadataPath, JSON.stringify({
            'containerimage.digest': digest,
          }))
        },
      },
    )

    assert.deepEqual(result, {
      success: true,
      image: `acme/web-app@${digest}`,
      pushed_image: 'acme/web-app:20260725-120000',
      digest,
      platforms: ['linux/amd64'],
      registry: 'dockerhub',
    })
    assert.equal(fs.existsSync(metadataDir), false)

    const artifact = JSON.parse(fs.readFileSync(
      path.join(workDir, '.sealos', 'build', 'build-result.json'),
      'utf8',
    ))
    assert.equal(artifact.outcome, 'success')
    assert.equal(artifact.push.remote_image, 'acme/web-app:20260725-120000')
    assert.equal(artifact.push.digest, digest)
    assert.equal(artifact.push.image_ref, `acme/web-app@${digest}`)
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
      path.join(workDir, '.sealos', 'build', 'build-result.json'),
      'utf8',
    ))
    assert.equal(artifact.outcome, 'failed')
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})
