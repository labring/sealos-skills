#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const validateScript = path.join(root, 'validate-phase-7.mjs')

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
  const tmp = mkdtempSync(path.join(tmpdir(), 'sealos-phase-7-'))
  try {
    return fn(tmp)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

function validState(appName = 'demo-app-abc12345') {
  return {
    version: '1.0',
    last_deploy: {
      app_name: appName,
      app_host: 'demo-public',
      namespace: 'ns-demo',
      region: 'usw-1.sealos.io',
      image: 'ghcr.io/example/demo@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      docker_hub_user: null,
      repo_name: 'demo',
      url: 'https://demo-public.usw-1.sealos.app',
      deployed_at: '2026-08-10T00:00:00Z',
      last_updated_at: '2026-08-10T00:00:00Z',
    },
    history: [
      {
        at: '2026-08-10T00:00:00Z',
        action: 'deploy',
        image: 'ghcr.io/example/demo@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        method: 'template-api',
        status: 'success',
        note: 'Initial deployment',
      },
    ],
  }
}

withFixture((tmp) => {
  writeJson(path.join(tmp, '.sealos', 'phase-6', 'deploy-result.json'), {
    template_sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    app_name: 'demo-app-abc12345',
  })
  writeJson(path.join(tmp, '.sealos', 'state.json'), validState())

  const result = runValidate(tmp)
  assert.equal(result.status, 0, result.stderr || result.stdout)
  const body = JSON.parse(result.stdout)
  assert.equal(body.ok, true)
  assert.equal(body.app_name, 'demo-app-abc12345')
})

withFixture((tmp) => {
  writeJson(path.join(tmp, '.sealos', 'phase-6', 'deploy-result.json'), {
    template_sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    app_name: 'demo-app-abc12345',
  })
  writeJson(path.join(tmp, '.sealos', 'state.json'), validState('other-app'))

  const result = runValidate(tmp)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /P7-V02/)
})

withFixture((tmp) => {
  writeJson(path.join(tmp, '.sealos', 'phase-6', 'deploy-result.json'), {
    template_sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    app_name: 'demo-app-abc12345',
  })
  const bad = validState()
  delete bad.last_deploy.url
  writeJson(path.join(tmp, '.sealos', 'state.json'), bad)

  const result = runValidate(tmp)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /P7-V01/)
})

withFixture((tmp) => {
  writeJson(path.join(tmp, '.sealos', 'phase-6', 'deploy-result.json'), {
    template_sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    app_name: 'demo-app-abc12345',
  })

  const result = runValidate(tmp)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /P7-V01/)
})

withFixture((tmp) => {
  writeJson(path.join(tmp, '.sealos', 'state.json'), validState())

  const result = runValidate(tmp)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /P7-V02/)
})

console.log('test-phase-7.mjs: ok')
