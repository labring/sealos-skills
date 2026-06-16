import assert from 'assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import test from 'node:test'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(__dirname, 'check-ghcr-token.mjs')

function writeMockFetch({ login = 'Che-Zhu', scopes = 'write:packages' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ghcr-token-test-'))
  const mockFile = path.join(root, 'mock-fetch.mjs')
  fs.writeFileSync(mockFile, [
    'globalThis.fetch = async () => ({',
    '  ok: true,',
    '  status: 200,',
    `  headers: { get: (name) => name.toLowerCase() === 'x-oauth-scopes' ? ${JSON.stringify(scopes)} : null },`,
    `  json: async () => ({ login: ${JSON.stringify(login)} }),`,
    '})',
    '',
  ].join('\n'))
  return mockFile
}

function runCheck(args, options = {}) {
  const mockFetch = writeMockFetch(options.mock)
  return spawnSync(process.execPath, [
    '--import',
    mockFetch,
    script,
    '--token-env',
    'TEST_GITHUB_TOKEN',
    '--target-image',
    args.targetImage,
    '--require-scope',
    'write:packages',
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TEST_GITHUB_TOKEN: 'fake-token',
    },
  })
}

test('rejects GHCR target owners with uppercase characters', () => {
  const result = runCheck({
    targetImage: 'ghcr.io/Che-Zhu/jsoncrack.com:prepare-test',
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /GHCR target owner must be lowercase/)
})

test('accepts lowercase target owner matching authenticated login case-insensitively', () => {
  const result = runCheck({
    targetImage: 'ghcr.io/che-zhu/jsoncrack.com:prepare-test',
  })

  assert.equal(result.status, 0, result.stderr)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.login, 'Che-Zhu')
  assert.equal(payload.target_owner, 'che-zhu')
  assert.equal(payload.owner_check.owner_matches_login, true)
})
