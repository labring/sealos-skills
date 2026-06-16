import assert from 'assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import test from 'node:test'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(__dirname, 'detect-image.mjs')

function runDetect(workDir) {
  return spawnSync(process.execPath, [
    script,
    'https://github.com/AykutSarac/jsoncrack.com.git',
    workDir,
  ], {
    encoding: 'utf8',
  })
}

test('treats docker compose build inside fenced README blocks as build-required', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-image-'))
  fs.writeFileSync(path.join(workDir, 'README.md'), [
    '# Example',
    '',
    '### Docker',
    '',
    '```console',
    'cd apps/www',
    '',
    '# Build a Docker image with:',
    'docker compose build',
    '',
    '# Run locally with docker compose',
    'docker compose up',
    '```',
    '',
  ].join('\n'))

  const result = runDetect(workDir)

  assert.equal(result.status, 0, result.stderr)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.found, false)
  assert.equal(payload.mode, 'build-required')
  assert.equal(payload.deployment_mode, 'build')
  assert.match(payload.reason, /README documents docker build/)
})

test('does not let README build signals skip later verified local image references', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-image-'))
  fs.writeFileSync(path.join(workDir, 'README.md'), [
    '# Example',
    '',
    '### Docker',
    '',
    '```console',
    'docker compose build',
    '```',
    '',
  ].join('\n'))
  fs.writeFileSync(path.join(workDir, 'CHANGELOG.md'), [
    '# Release',
    '',
    'docker pull ghcr.io/example/web:v1.0.0',
    '',
  ].join('\n'))

  const result = spawnSync(process.execPath, [
    script,
    workDir,
  ], {
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.mode, 'build-required')
  assert.equal(payload.reason, 'README documents docker build deployment; skipping registry reuse')
  assert(payload.evidence.some((entry) => entry.source === 'release' && /CHANGELOG/.test(entry.signal)))
})
