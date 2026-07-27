#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(new URL('./extract-deploy-app-name.mjs', import.meta.url))

function run (payload) {
  return spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
    input: JSON.stringify(payload),
  })
}

test('extracts a valid server-generated application name', () => {
  const result = run({
    success: true,
    response: {
      name: 'demo-instance-abc123',
      resources: [{ name: 'demo-instance-abc123' }],
    },
  })

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, 'demo-instance-abc123\n')
})

test('accepts the raw curl response shape without printing it', () => {
  const result = run({
    name: 'demo-instance-curl123',
    args: { ADMIN_PASSWORD: 'do-not-print' },
  })

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, 'demo-instance-curl123\n')
  assert.equal(result.stderr.includes('do-not-print'), false)
})

test('rejects missing, malformed, and overlong application names', () => {
  for (const payload of [
    { response: {} },
    { response: { name: 'Demo-Instance' } },
    { response: { name: 'demo.instance' } },
    { response: { name: `a${'b'.repeat(63)}` } },
  ]) {
    const result = run(payload)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /valid application name/)
    assert.equal(result.stdout, '')
  }
})

test('does not expose unrelated response fields on malformed input', () => {
  const secret = 'deployment-secret-value'
  const result = run({
    response: {
      name: `Invalid-${secret}`,
      args: { ADMIN_PASSWORD: secret },
    },
  })

  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr.includes(secret), false)
})
