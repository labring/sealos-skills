#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(new URL('./sealos-state-bridge.mjs', import.meta.url))
const digest = `sha256:${'a'.repeat(64)}`

function validState () {
  const image = `ghcr.io/acme/web@${digest}`
  return {
    version: '1.0',
    last_deploy: {
      app_name: 'web',
      app_host: 'web.usw.sealos.io',
      namespace: 'ns-acme',
      region: 'usw.sealos.io',
      image,
      repo_name: 'web',
      url: 'https://web.usw.sealos.io',
      deployed_at: '2026-07-24T00:00:00.000Z',
      last_updated_at: '2026-07-24T00:00:00.000Z',
    },
    history: [{
      at: '2026-07-24T00:00:00.000Z',
      action: 'deploy',
      image,
      method: 'template-api',
      status: 'success',
    }],
  }
}

function runBridge (fixture, args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SEALOS_DEPLOY_STATE_ROOT: fixture.stateRoot,
    },
  })
}

test('persists and restores validated state for a GitHub checkout', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-state-bridge-test-'))
  const fixture = {
    stateRoot: path.join(fixtureRoot, 'deployments'),
    workDir: path.join(fixtureRoot, 'checkout'),
  }
  const localState = path.join(fixture.workDir, '.sealos', 'state.json')

  try {
    fs.mkdirSync(path.dirname(localState), { recursive: true })
    fs.writeFileSync(localState, `${JSON.stringify(validState())}\n`, { mode: 0o600 })

    const persisted = runBridge(fixture, [
      'persist',
      '--work-dir',
      fixture.workDir,
      '--github-url',
      'https://GitHub.com/Acme/Web.git',
    ])
    assert.equal(persisted.status, 0, persisted.stderr || persisted.stdout)
    const persistedOutput = JSON.parse(persisted.stdout)
    assert.equal(persistedOutput.action, 'persisted')
    const persistentState = path.join(
      fixture.stateRoot,
      'github.com',
      'acme',
      'web',
      'state.json',
    )
    assert.equal(fs.existsSync(persistentState), true)
    assert.equal(fs.statSync(persistentState).mode & 0o777, 0o600)

    fs.rmSync(localState)
    const restored = runBridge(fixture, [
      'restore',
      '--work-dir',
      fixture.workDir,
      '--github-url',
      'git@github.com:Acme/Web.git',
    ])
    assert.equal(restored.status, 0, restored.stderr || restored.stdout)
    assert.equal(JSON.parse(restored.stdout).action, 'restored')
    assert.deepEqual(
      JSON.parse(fs.readFileSync(localState, 'utf8')),
      validState(),
    )
    assert.equal(fs.statSync(localState).mode & 0o777, 0o600)
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test('fails closed on an invalid project state', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-state-bridge-invalid-'))
  const workDir = path.join(fixtureRoot, 'checkout')
  const localState = path.join(workDir, '.sealos', 'state.json')
  try {
    fs.mkdirSync(path.dirname(localState), { recursive: true })
    fs.writeFileSync(localState, '{"version":"1.1"}\n', { mode: 0o600 })
    const result = runBridge(
      { stateRoot: path.join(fixtureRoot, 'deployments'), workDir },
      ['persist', '--work-dir', workDir, '--github-url', 'https://github.com/acme/web'],
    )
    assert.equal(result.status, 1)
    assert.match(result.stderr, /failed state validation/)
    assert.equal(fs.existsSync(path.join(fixtureRoot, 'deployments')), false)
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})
