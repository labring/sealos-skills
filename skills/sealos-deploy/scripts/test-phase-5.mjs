#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const validateScript = path.join(root, 'validate-phase-5.mjs')

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex')
}

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
  const tmp = mkdtempSync(path.join(tmpdir(), 'sealos-phase-5-'))
  try {
    return fn(tmp)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

withFixture((tmp) => {
  const body = 'apiVersion: app.sealos.io/v1\nkind: Template\n'
  const digest = sha256(body)
  mkdirSync(path.join(tmp, '.sealos', 'template'), { recursive: true })
  writeFileSync(path.join(tmp, '.sealos', 'template', 'index.yaml'), body)
  writeJson(path.join(tmp, '.sealos', 'phase-5', 'prepare-result.json'), {
    template_sha256: digest,
    dry_run: 'passed',
    user_confirmed: true,
  })

  const result = runValidate(tmp)
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal(JSON.parse(result.stdout).ok, true)
})

withFixture((tmp) => {
  const body = 'kind: Template\n'
  mkdirSync(path.join(tmp, '.sealos', 'template'), { recursive: true })
  writeFileSync(path.join(tmp, '.sealos', 'template', 'index.yaml'), body)
  writeJson(path.join(tmp, '.sealos', 'phase-5', 'prepare-result.json'), {
    template_sha256: sha256('other'),
    dry_run: 'passed',
    user_confirmed: true,
  })

  const result = runValidate(tmp)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /P5-V03/)
})

withFixture((tmp) => {
  const body = 'kind: Template\n'
  mkdirSync(path.join(tmp, '.sealos', 'template'), { recursive: true })
  writeFileSync(path.join(tmp, '.sealos', 'template', 'index.yaml'), body)
  writeJson(path.join(tmp, '.sealos', 'phase-5', 'prepare-result.json'), {
    template_sha256: sha256(body),
    dry_run: 'passed',
    user_confirmed: false,
  })

  const result = runValidate(tmp)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /P5-V04/)
})

withFixture((tmp) => {
  const result = runValidate(tmp)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /P5-V01/)
})

console.log('test-phase-5.mjs: ok')
