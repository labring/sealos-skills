#!/usr/bin/env node

import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

const root = path.dirname(fileURLToPath(import.meta.url))
const validateScript = path.join(root, 'validate-phase-1.mjs')

function runNode(script, args) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
  })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function writeAnalysis(dir, data) {
  const sealosDir = path.join(dir, '.sealos')
  fs.mkdirSync(sealosDir, { recursive: true })
  fs.writeFileSync(path.join(sealosDir, 'analysis.json'), JSON.stringify(data))
}

function baseAnalysis(dir) {
  return {
    runtime_profile: 'local',
    work_dir: dir,
    repo_name: 'demo',
    github_url: 'https://github.com/example/demo',
    official_template: null,
  }
}

function testNullOfficialTemplate() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-phase1-'))
  writeAnalysis(tmp, baseAnalysis(tmp))
  const ok = runNode(validateScript, ['--dir', tmp])
  assert(ok.status === 0, `null official_template should pass: ${ok.stderr}`)
}

function testValidOfficialTemplateWithFile() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-phase1-'))
  const url =
    'https://raw.githubusercontent.com/labring-actions/templates/abc123/template/uptime-kuma/index.yaml'
  writeAnalysis(tmp, { ...baseAnalysis(tmp), official_template: url })
  const templateDir = path.join(tmp, '.sealos', 'template')
  fs.mkdirSync(templateDir, { recursive: true })
  fs.writeFileSync(path.join(templateDir, 'index.yaml'), 'apiVersion: app.sealos.io/v1\nkind: Template\n')
  const ok = runNode(validateScript, ['--dir', tmp])
  assert(ok.status === 0, `valid official_template should pass: ${ok.stderr}`)
}

function testInvalidOfficialTemplateUrl() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-phase1-'))
  writeAnalysis(tmp, {
    ...baseAnalysis(tmp),
    official_template: 'https://example.com/not-official.yaml',
  })
  const fail = runNode(validateScript, ['--dir', tmp])
  assert(fail.status !== 0, 'invalid URL must fail')
  assert(/P1-V01/.test(fail.stderr), `expected P1-V01, got: ${fail.stderr}`)
}

function testMissingTemplateFile() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-phase1-'))
  const url =
    'https://raw.githubusercontent.com/labring-actions/templates/abc123/template/uptime-kuma/index.yaml'
  writeAnalysis(tmp, { ...baseAnalysis(tmp), official_template: url })
  const fail = runNode(validateScript, ['--dir', tmp])
  assert(fail.status !== 0, 'missing template file must fail')
  assert(/P1-V03/.test(fail.stderr), `expected P1-V03, got: ${fail.stderr}`)
}

function testMissingPhase0Field() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-phase1-'))
  const data = baseAnalysis(tmp)
  delete data.repo_name
  writeAnalysis(tmp, data)
  const fail = runNode(validateScript, ['--dir', tmp])
  assert(fail.status !== 0, 'missing Phase 0 field must fail')
  assert(/P1-V02/.test(fail.stderr), `expected P1-V02, got: ${fail.stderr}`)
}

testNullOfficialTemplate()
testValidOfficialTemplateWithFile()
testInvalidOfficialTemplateUrl()
testMissingTemplateFile()
testMissingPhase0Field()
console.log('test-phase-1.mjs: ok')
