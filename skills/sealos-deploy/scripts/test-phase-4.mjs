#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const validateScript = path.join(root, 'validate-phase-4.mjs')

function writeJson(filePath, data) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`)
}

function writeTemplate(dir, body) {
  const templatePath = path.join(dir, '.sealos', 'template', 'index.yaml')
  mkdirSync(path.dirname(templatePath), { recursive: true })
  writeFileSync(templatePath, body)
}

function runValidate(dir) {
  return spawnSync(process.execPath, [validateScript, '--dir', dir], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SEALOS_VALIDATE_PHASE_4_SKIP_GATE: '1',
    },
  })
}

function withFixture(fn) {
  const tmp = mkdtempSync(path.join(tmpdir(), 'sealos-phase-4-'))
  try {
    return fn(tmp)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

withFixture((tmp) => {
  const digest = 'ghcr.io/user/web@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  writeJson(path.join(tmp, '.sealos', 'phase-4', 'image-digests.json'), {
    digests: { web: digest },
  })
  writeJson(path.join(tmp, '.sealos', 'phase-4', 'resource-map.json'), {
    web: { kind: 'Deployment', name: 'web' },
  })
  writeTemplate(
    tmp,
    [
      'apiVersion: apps/v1',
      'kind: Deployment',
      'metadata:',
      '  name: web',
      'spec:',
      '  template:',
      '    spec:',
      '      containers:',
      '        - name: web',
      `          image: ${digest}`,
      `          originImageName: ${digest}`,
      '',
    ].join('\n'),
  )

  const result = runValidate(tmp)
  assert.equal(result.status, 0, result.stderr || result.stdout)
  const output = JSON.parse(result.stdout)
  assert.equal(output.ok, true)
  assert.equal(output.deploy_gate_skipped, true)
})

withFixture((tmp) => {
  writeJson(path.join(tmp, '.sealos', 'phase-4', 'image-digests.json'), {
    digests: {
      web: 'ghcr.io/user/web:not-a-digest',
    },
  })
  writeJson(path.join(tmp, '.sealos', 'phase-4', 'resource-map.json'), { web: {} })
  writeTemplate(tmp, 'image: ghcr.io/user/web:not-a-digest\n')

  const result = runValidate(tmp)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /P4-V01/)
})

withFixture((tmp) => {
  const digest = 'ghcr.io/user/web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  writeJson(path.join(tmp, '.sealos', 'phase-4', 'image-digests.json'), {
    digests: { web: digest },
  })
  writeJson(path.join(tmp, '.sealos', 'phase-4', 'resource-map.json'), { web: {} })
  writeTemplate(tmp, 'image: nginx:1.27\n')

  const result = runValidate(tmp)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /P4-V02/)
})

withFixture((tmp) => {
  const digest = 'ghcr.io/user/web@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
  writeJson(path.join(tmp, '.sealos', 'phase-4', 'image-digests.json'), {
    digests: { web: digest },
  })
  writeJson(path.join(tmp, '.sealos', 'phase-4', 'resource-map.json'), { web: {} })
  writeJson(path.join(tmp, '.sealos', 'phase-3', 'build-result.json'), {
    pushed: {
      web: 'ghcr.io/user/web@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    },
    pull_access: { web: 'public' },
  })
  writeTemplate(tmp, `image: ${digest}\noriginImageName: ${digest}\n`)

  const result = runValidate(tmp)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /P4-V03/)
})

console.log('test-phase-4.mjs: ok')
