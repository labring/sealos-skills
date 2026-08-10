#!/usr/bin/env node

import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

const root = path.dirname(fileURLToPath(import.meta.url))
const validateScript = path.join(root, 'validate-phase-3.mjs')

function runNode(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
}

function testSkipWhenNoBuildResult() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-phase3-'))
  writeJson(path.join(tmp, '.sealos', 'analysis.json'), {
    runtime_profile: 'local',
    work_dir: tmp,
    repo_name: 'demo',
    github_url: null,
    official_template: null,
    deployment_plan: '.sealos/phase-2/deployment-plan.json',
  })
  const ok = runNode(validateScript, ['--dir', tmp])
  assert(ok.status === 0, `skip should pass: ${ok.stderr}`)
  assert(JSON.parse(ok.stdout).skipped === true, 'expected skipped')
}

function testValidResult() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-phase3-'))
  writeJson(path.join(tmp, '.sealos', 'analysis.json'), {
    runtime_profile: 'local',
    work_dir: tmp,
    repo_name: 'demo',
    github_url: null,
    official_template: null,
    deployment_plan: '.sealos/phase-2/deployment-plan.json',
    build_result: '.sealos/phase-3/build-result.json',
  })
  writeJson(path.join(tmp, '.sealos', 'phase-3', 'build-result.json'), {
    generated_at: '2026-08-02T14:00:00Z',
    pushed: {
      web: 'ghcr.io/user/demo-web:20260802-web-abc',
    },
    pull_access: {
      web: 'ghcr_secret_required',
    },
  })
  const ok = runNode(validateScript, ['--dir', tmp])
  assert(ok.status === 0, `valid result should pass: ${ok.stderr}`)
}

function testMixedNamespaceFails() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-phase3-'))
  writeJson(path.join(tmp, '.sealos', 'analysis.json'), {
    runtime_profile: 'local',
    work_dir: tmp,
    repo_name: 'demo',
    github_url: null,
    official_template: null,
    build_result: '.sealos/phase-3/build-result.json',
  })
  writeJson(path.join(tmp, '.sealos', 'phase-3', 'build-result.json'), {
    pushed: {
      web: 'ghcr.io/user-a/demo-web:1',
      worker: 'ghcr.io/user-b/demo-worker:1',
    },
    pull_access: {
      web: 'public',
      worker: 'public',
    },
  })
  const fail = runNode(validateScript, ['--dir', tmp])
  assert(fail.status !== 0, 'mixed namespace must fail')
  assert(/P3-V02/.test(fail.stderr), `expected P3-V02, got: ${fail.stderr}`)
}

function testMissingPullAccessFails() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-phase3-'))
  writeJson(path.join(tmp, '.sealos', 'analysis.json'), {
    runtime_profile: 'local',
    work_dir: tmp,
    repo_name: 'demo',
    github_url: null,
    official_template: null,
    build_result: '.sealos/phase-3/build-result.json',
  })
  writeJson(path.join(tmp, '.sealos', 'phase-3', 'build-result.json'), {
    pushed: { web: 'ghcr.io/user/demo-web:1' },
  })
  const fail = runNode(validateScript, ['--dir', tmp])
  assert(fail.status !== 0, 'missing pull_access must fail')
  assert(/P3-V04/.test(fail.stderr), `expected P3-V04, got: ${fail.stderr}`)
}

testSkipWhenNoBuildResult()
testValidResult()
testMixedNamespaceFails()
testMissingPullAccessFails()
console.log('test-phase-3.mjs: ok')
