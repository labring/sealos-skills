#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { validateArtifactData } from './artifact-validator.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const writeResultScript = join(scriptDir, '..', '..', 'k8s-kaniko-job', 'scripts', 'write-result.mjs')

function fixtureRequest() {
  return {
    version: '1.0',
    generated_at: '2026-08-04T10:00:00.000Z',
    source: {
      type: 'sandbox-context',
      github_url: 'https://github.com/example/demo',
      repo: 'example/demo',
      ref: '0123456789abcdef',
      work_dir: '/workspace/demo',
    },
    mode: 'build-required',
    image: {
      image_ref: null,
      target_image: 'ghcr.io/example/demo:deploy-0123456789ab',
    },
    build: {
      context_path: '.',
      dockerfile_path: 'Dockerfile',
      build_args: {},
    },
    runtime: { port: 8080 },
  }
}

test('sandbox build request validates against the main artifact contract', () => {
  const result = validateArtifactData('build-request', fixtureRequest())
  assert.equal(result.valid, true, JSON.stringify(result.errors))
})

test('sandbox placeholder metadata records provenance without values', () => {
  const metadata = {
    version: '1.0',
    generated_at: '2026-08-04T10:00:00.000Z',
    inputs: [
      {
        name: 'ADMIN_PASSWORD',
        strategy: 'password-complexity',
        sensitive: true,
        source: 'sandbox-placeholder',
      },
    ],
  }
  const result = validateArtifactData('sandbox-inputs', metadata)
  assert.equal(result.valid, true, JSON.stringify(result.errors))
  assert.equal(JSON.stringify(metadata).includes('generated-secret-value'), false)
})

test('Kaniko result writer emits the main build-result contract', () => {
  const root = mkdtempSync(join(tmpdir(), 'sealos-kaniko-contract-'))
  try {
    const requestPath = join(root, 'build-request.json')
    const resultPath = join(root, 'build-result.json')
    writeFileSync(requestPath, `${JSON.stringify(fixtureRequest(), null, 2)}\n`)

    const result = spawnSync(process.execPath, [
      writeResultScript,
      '--request', requestPath,
      '--out', resultPath,
      '--status', 'succeeded',
      '--namespace', 'ns-sandbox',
      '--job', 'seakills-kaniko-demo',
      '--pod', 'seakills-kaniko-demo-pod',
      '--log-file', '/tmp/build.log',
    ], { encoding: 'utf8' })

    assert.equal(result.status, 0, result.stderr || result.stdout)
    const artifact = JSON.parse(readFileSync(resultPath, 'utf8'))
    assert.equal(artifact.builder, 'kaniko')
    assert.equal(artifact.push.remote_image, 'ghcr.io/example/demo:deploy-0123456789ab')
    const validation = validateArtifactData('build-result', artifact)
    assert.equal(validation.valid, true, JSON.stringify(validation.errors))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
