#!/usr/bin/env node

import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

const root = path.dirname(fileURLToPath(import.meta.url))
const checkScript = path.join(root, 'phase-0', 'check-running-environment.mjs')
const validateScript = path.join(root, 'validate-phase-0.mjs')

function runNode(script, args, env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function testCheckScript() {
  const local = runNode(checkScript, [], { SEALAI_DEPLOY_TASK_ID: '' })
  assert(local.status === 0, `check script failed: ${local.stderr}`)
  const localJson = JSON.parse(local.stdout)
  assert(localJson.runtime_profile === 'local', 'expected local without SEALAI_DEPLOY_TASK_ID')
  assert(Array.isArray(localJson.missing), 'missing must be an array')
  assert(Array.isArray(localJson.present), 'present must be an array')
  assert(Array.isArray(localJson.warnings), 'warnings must be an array')

  const sandbox = runNode(checkScript, [], { SEALAI_DEPLOY_TASK_ID: 'task-1' })
  assert(sandbox.status === 0, `sandbox check failed: ${sandbox.stderr}`)
  const sandboxJson = JSON.parse(sandbox.stdout)
  assert(sandboxJson.runtime_profile === 'sandbox', 'expected sandbox with SEALAI_DEPLOY_TASK_ID')
  assert(!sandboxJson.missing.includes('docker'), 'sandbox must not require docker')
  assert(!sandboxJson.missing.includes('gh'), 'sandbox must not require gh')
}

function testValidateScript() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-phase0-'))
  const sealosDir = path.join(tmp, '.sealos')
  fs.mkdirSync(sealosDir, { recursive: true })

  const good = {
    runtime_profile: 'local',
    work_dir: tmp,
    repo_name: 'demo',
    github_url: null,
  }
  fs.writeFileSync(path.join(sealosDir, 'analysis.json'), JSON.stringify(good))
  const ok = runNode(validateScript, ['--dir', tmp], { SEALAI_DEPLOY_TASK_ID: '' })
  assert(ok.status === 0, `validate should pass: ${ok.stderr}`)

  const badExtra = { ...good, official_template: null }
  fs.writeFileSync(path.join(sealosDir, 'analysis.json'), JSON.stringify(badExtra))
  const failExtra = runNode(validateScript, ['--dir', tmp], { SEALAI_DEPLOY_TASK_ID: '' })
  assert(failExtra.status !== 0, 'validate must reject unexpected keys')
  assert(/P0-V01/.test(failExtra.stderr), 'expected P0-V01 for unexpected keys')

  const mismatch = { ...good, runtime_profile: 'sandbox' }
  fs.writeFileSync(path.join(sealosDir, 'analysis.json'), JSON.stringify(mismatch))
  const failProfile = runNode(validateScript, ['--dir', tmp], { SEALAI_DEPLOY_TASK_ID: '' })
  assert(failProfile.status !== 0, 'validate must reject profile mismatch')
  assert(/P0-V02/.test(failProfile.stderr), 'expected P0-V02 for profile mismatch')
}

testCheckScript()
testValidateScript()
console.log('test-phase-0.mjs: ok')
