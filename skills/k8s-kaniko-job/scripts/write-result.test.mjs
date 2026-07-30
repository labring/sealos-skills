import assert from 'assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import test from 'node:test'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(__dirname, 'write-result.mjs')
const digest = `sha256:${'a'.repeat(64)}`

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
}

function sampleRequest(route = 'standard') {
  return {
    version: '2.0',
    generated_at: '2026-06-16T00:00:00.000Z',
    route,
    source: {
      type: 'sandbox-context',
      github_url: 'https://github.com/example/app',
      repo: 'example/app',
      ref: '0123456789abcdef0123456789abcdef01234567',
      work_dir: '/workspace',
    },
    services: route === 'official-template' ? [] : [
      {
        name: 'database',
        artifact_key: 'database',
        role: 'database',
        mode: 'reuse-image',
        image: {
          image_ref: `postgres@${digest}`,
          target_image: null,
          platforms: ['linux/amd64'],
          pull_access: 'anonymous',
        },
        build: null,
        runtime: { port: 5432 },
      },
      {
        name: 'web',
        artifact_key: 'web',
        role: 'frontend',
        mode: 'build-required',
        image: {
          image_ref: null,
          target_image: 'ghcr.io/example/app-web:test',
          platforms: [],
          pull_access: null,
        },
        build: {
          context_path: '.',
          dockerfile_path: 'Dockerfile',
          target: null,
          build_arg_names: [],
        },
        runtime: { port: 3000 },
      },
    ],
  }
}

function run(args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
}

test('aggregates reused and Kaniko-built services into one successful result', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kaniko-result-'))
  const requestFile = path.join(root, 'build-request.json')
  const resultFile = path.join(root, 'build-result.json')
  writeJson(requestFile, sampleRequest())

  let result = run([
    '--request', requestFile,
    '--out', resultFile,
    '--initialize', 'true',
  ])
  assert.equal(result.status, 0, result.stderr)

  result = run([
    '--request', requestFile,
    '--out', resultFile,
    '--service', 'database',
    '--status', 'skipped',
  ])
  assert.equal(result.status, 0, result.stderr)

  result = run([
    '--request', requestFile,
    '--out', resultFile,
    '--service', 'web',
    '--status', 'succeeded',
    '--digest', digest,
    '--pull-access', 'ghcr_secret_required',
    '--namespace', 'team-a',
    '--job', 'kaniko-web',
    '--pod', 'kaniko-web-pod',
    '--log-file', '/private/logs/web.log',
  ])
  assert.equal(result.status, 0, result.stderr)

  const aggregate = JSON.parse(fs.readFileSync(resultFile, 'utf8'))
  assert.equal(aggregate.status, 'succeeded')
  assert.equal(aggregate.expected_services, 2)
  assert.deepEqual(aggregate.services.map((entry) => entry.artifact_key), ['database', 'web'])
  assert.equal(aggregate.services[0].outcome, 'reused')
  assert.equal(aggregate.services[1].image.image_ref, `ghcr.io/example/app-web@${digest}`)
  assert.equal(aggregate.services[1].image.pull_access, 'ghcr_secret_required')
})

test('a failed service makes the aggregate result fail without a deployable image', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kaniko-result-'))
  const requestFile = path.join(root, 'build-request.json')
  const resultFile = path.join(root, 'build-result.json')
  writeJson(requestFile, sampleRequest())

  const result = run([
    '--request', requestFile,
    '--out', resultFile,
    '--service', 'web',
    '--status', 'failed',
    '--error-phase', 'kaniko',
    '--error-message', 'Dockerfile build failed',
    '--namespace', 'team-a',
    '--job', 'kaniko-web',
    '--log-file', '/private/logs/web.log',
  ])
  assert.equal(result.status, 0, result.stderr)

  const aggregate = JSON.parse(fs.readFileSync(resultFile, 'utf8'))
  assert.equal(aggregate.status, 'failed')
  assert.equal(aggregate.services[0].image.image_ref, null)
  assert.equal(aggregate.services[0].error.phase, 'kaniko')
})

test('official-template route initializes a complete skipped result', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kaniko-result-'))
  const requestFile = path.join(root, 'build-request.json')
  const resultFile = path.join(root, 'build-result.json')
  writeJson(requestFile, sampleRequest('official-template'))

  const result = run([
    '--request', requestFile,
    '--out', resultFile,
    '--initialize', 'true',
  ])
  assert.equal(result.status, 0, result.stderr)

  const aggregate = JSON.parse(fs.readFileSync(resultFile, 'utf8'))
  assert.equal(aggregate.status, 'skipped')
  assert.equal(aggregate.expected_services, 0)
  assert.deepEqual(aggregate.services, [])
})
