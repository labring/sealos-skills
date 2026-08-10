#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const validateScript = path.join(root, 'validate-phase-6.mjs')

const DIGEST_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const DIGEST_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

function writeJson(filePath, data) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`)
}

function runValidate(dir) {
  return spawnSync(process.execPath, [validateScript, '--dir', dir], {
    encoding: 'utf8',
  })
}

function withFixture(fn) {
  const tmp = mkdtempSync(path.join(tmpdir(), 'sealos-phase-6-'))
  try {
    return fn(tmp)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

withFixture((tmp) => {
  writeJson(path.join(tmp, '.sealos', 'phase-5', 'prepare-result.json'), {
    template_sha256: DIGEST_A,
    dry_run: 'passed',
    user_confirmed: true,
  })
  writeJson(path.join(tmp, '.sealos', 'phase-6', 'deploy-result.json'), {
    template_sha256: DIGEST_A,
    app_name: 'demo-app-abc12345',
  })

  const result = runValidate(tmp)
  assert.equal(result.status, 0, result.stderr || result.stdout)
  const body = JSON.parse(result.stdout)
  assert.equal(body.ok, true)
  assert.equal(body.app_name, 'demo-app-abc12345')
})

withFixture((tmp) => {
  writeJson(path.join(tmp, '.sealos', 'phase-5', 'prepare-result.json'), {
    template_sha256: DIGEST_A,
    dry_run: 'passed',
    user_confirmed: true,
  })
  writeJson(path.join(tmp, '.sealos', 'phase-6', 'deploy-result.json'), {
    template_sha256: DIGEST_B,
    app_name: 'demo-app',
  })

  const result = runValidate(tmp)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /P6-V02/)
})

withFixture((tmp) => {
  writeJson(path.join(tmp, '.sealos', 'phase-5', 'prepare-result.json'), {
    template_sha256: DIGEST_A,
    dry_run: 'passed',
    user_confirmed: true,
  })
  writeJson(path.join(tmp, '.sealos', 'phase-6', 'deploy-result.json'), {
    template_sha256: DIGEST_A,
    app_name: '   ',
  })

  const result = runValidate(tmp)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /P6-V03/)
})

withFixture((tmp) => {
  writeJson(path.join(tmp, '.sealos', 'phase-5', 'prepare-result.json'), {
    template_sha256: DIGEST_A,
    dry_run: 'passed',
    user_confirmed: true,
  })
  writeJson(path.join(tmp, '.sealos', 'phase-6', 'deploy-result.json'), {
    template_sha256: DIGEST_A,
    app_name: 'demo',
    extra: true,
  })

  const result = runValidate(tmp)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /P6-V01/)
})

withFixture((tmp) => {
  writeJson(path.join(tmp, '.sealos', 'phase-5', 'prepare-result.json'), {
    template_sha256: DIGEST_A,
    dry_run: 'passed',
    user_confirmed: true,
  })

  const result = runValidate(tmp)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /P6-V01/)
})

console.log('test-phase-6.mjs: ok')
