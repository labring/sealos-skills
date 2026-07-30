import assert from 'assert/strict'
import test from 'node:test'

import { checkAnonymousPull } from './check-image-pull.mjs'

const digest = `sha256:${'b'.repeat(64)}`

test('classifies an anonymously readable GHCR digest', async () => {
  const responses = [
    {
      ok: true,
      status: 200,
      json: async () => ({ token: 'anonymous-token' }),
    },
    {
      ok: true,
      status: 200,
    },
  ]
  const result = await checkAnonymousPull({
    image: 'ghcr.io/example/web:build',
    digest,
    fetchImpl: async () => responses.shift(),
    sleepImpl: async () => {},
  })

  assert.equal(result.pull_access, 'anonymous')
  assert.equal(result.image_ref, `ghcr.io/example/web@${digest}`)
})

test('classifies a private GHCR package without exposing credentials', async () => {
  const result = await checkAnonymousPull({
    image: 'ghcr.io/example/web:build',
    digest,
    fetchImpl: async () => ({ ok: false, status: 403 }),
    sleepImpl: async () => {},
  })

  assert.equal(result.pull_access, 'ghcr_secret_required')
  assert.equal(result.status, 403)
})

test('returns indeterminate after bounded transient failures', async () => {
  let attempts = 0
  const result = await checkAnonymousPull({
    image: 'ghcr.io/example/web:build',
    digest,
    attempts: 2,
    fetchImpl: async () => {
      attempts += 1
      throw new Error('temporary network failure')
    },
    sleepImpl: async () => {},
  })

  assert.equal(attempts, 2)
  assert.equal(result.pull_access, 'indeterminate')
  assert.match(result.error, /temporary network failure/)
})
