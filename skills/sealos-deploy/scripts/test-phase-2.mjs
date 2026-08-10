#!/usr/bin/env node

import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

const root = path.dirname(fileURLToPath(import.meta.url))
const validateScript = path.join(root, 'validate-phase-2.mjs')

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

function baseAnalysis(dir) {
  return {
    runtime_profile: 'local',
    work_dir: dir,
    repo_name: 'demo',
    github_url: null,
    official_template: null,
    deployment_plan: '.sealos/phase-2/deployment-plan.json',
  }
}

function testComposePathOk() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-phase2-'))
  writeJson(path.join(tmp, '.sealos', 'analysis.json'), baseAnalysis(tmp))
  const compose = path.join(tmp, '.sealos', 'phase-2', 'docker-compose.yml')
  fs.mkdirSync(path.dirname(compose), { recursive: true })
  fs.writeFileSync(compose, 'services:\n  web:\n    image: nginx\n')
  writeJson(path.join(tmp, '.sealos', 'phase-2', 'deployment-plan.json'), {
    deployment_source: '.sealos/phase-2/docker-compose.yml',
  })
  const ok = runNode(validateScript, ['--dir', tmp])
  assert(ok.status === 0, `compose path should pass: ${ok.stderr}`)
}

function testRawComposePathFails() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-phase2-'))
  writeJson(path.join(tmp, '.sealos', 'analysis.json'), baseAnalysis(tmp))
  fs.writeFileSync(path.join(tmp, 'docker-compose.yml'), 'services:\n  web:\n    image: nginx\n')
  writeJson(path.join(tmp, '.sealos', 'phase-2', 'deployment-plan.json'), {
    deployment_source: 'docker-compose.yml',
  })
  const fail = runNode(validateScript, ['--dir', tmp])
  assert(fail.status !== 0, 'raw compose path must fail')
  assert(/P2-V04/.test(fail.stderr), `expected P2-V04, got: ${fail.stderr}`)
}

function testMissingOfficialTemplate() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-phase2-'))
  const analysis = baseAnalysis(tmp)
  delete analysis.official_template
  writeJson(path.join(tmp, '.sealos', 'analysis.json'), analysis)
  const compose = path.join(tmp, '.sealos', 'phase-2', 'docker-compose.yml')
  fs.mkdirSync(path.dirname(compose), { recursive: true })
  fs.writeFileSync(compose, 'services: {}\n')
  writeJson(path.join(tmp, '.sealos', 'phase-2', 'deployment-plan.json'), {
    deployment_source: '.sealos/phase-2/docker-compose.yml',
  })
  const fail = runNode(validateScript, ['--dir', tmp])
  assert(fail.status !== 0, 'missing official_template must fail')
  assert(/P2-V03/.test(fail.stderr), `expected P2-V03, got: ${fail.stderr}`)
}

function testMissingSourceFile() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-phase2-'))
  writeJson(path.join(tmp, '.sealos', 'analysis.json'), baseAnalysis(tmp))
  writeJson(path.join(tmp, '.sealos', 'phase-2', 'deployment-plan.json'), {
    deployment_source: '.sealos/phase-2/docker-compose.yml',
  })
  const fail = runNode(validateScript, ['--dir', tmp])
  assert(fail.status !== 0, 'missing source file must fail')
  assert(/P2-V02/.test(fail.stderr), `expected P2-V02, got: ${fail.stderr}`)
}

testComposePathOk()
testRawComposePathFails()
testMissingOfficialTemplate()
testMissingSourceFile()
console.log('test-phase-2.mjs: ok')
