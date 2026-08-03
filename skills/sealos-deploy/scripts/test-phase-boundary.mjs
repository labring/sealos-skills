#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const skillDir = path.resolve(scriptDir, '..')

test('keeps the skill terminal at Phase 4', () => {
  const skill = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8')
  assert.match(skill, /Stop after Phase 4 passes its deployment gate\./)
  assert.match(skill, /Do not call the Sealos Template API\./)
  assert.match(skill, /Do not apply YAML with kubectl\./)
})

test('removes scripts that can deploy or verify a live application', () => {
  const names = new Set(fs.readdirSync(scriptDir))
  for (const name of [
    'deploy-template.mjs',
    'ensure-image-pull-secret.mjs',
    'sealos-live-smoke.mjs',
    'sealos-state-bridge.mjs',
    'sealos-footprint.mjs',
  ]) {
    assert.equal(names.has(name), false, `${name} must not exist`)
  }
})

test('keeps only Phase 0 through Phase 4 runtime scripts', () => {
  const scripts = fs.readdirSync(scriptDir)
    .filter(name => name.endsWith('.mjs') && !name.startsWith('test-'))
    .sort()
  assert.deepEqual(scripts, [
    'artifact-validator.mjs',
    'find-official-template.mjs',
    'inspect-deployment-source.mjs',
    'materialize-official-template.mjs',
    'sealos-auth.mjs',
    'validate-artifacts.mjs',
    'write-build-result.mjs',
  ])
})

test('uses only the reviewed Phase 0 through Phase 4 modules', () => {
  const modules = fs.readdirSync(path.join(skillDir, 'modules')).sort()
  assert.deepEqual(modules, [
    'phase-0-preflight.md',
    'phase-1-assess.md',
    'phase-2-discover.md',
    'phase-3-build-push.md',
    'phase-4-template.md',
  ])
})

test('uses the limited Phase 4 deployment gate from docker-to-sealos', () => {
  const phaseFour = fs.readFileSync(path.join(skillDir, 'modules', 'phase-4-template.md'), 'utf8')
  assert.match(phaseFour, /--skill <SKILL_DIR>\/\.\.\/docker-to-sealos\/SKILL\.md/)
  assert.match(phaseFour, /--only R001,R002,R003/)
  assert.match(phaseFour, /Do not run `quality_gate\.py`/)
})

test('uses the current kb-0.9 catalog YAML without a pinned commit', () => {
  const phaseOne = fs.readFileSync(path.join(skillDir, 'modules', 'phase-1-assess.md'), 'utf8')
  const finder = fs.readFileSync(path.join(scriptDir, 'find-official-template.mjs'), 'utf8')
  assert.match(phaseOne, /git clone --depth 1 --branch kb-0\.9/)
  assert.doesNotMatch(finder, /catalog-commit|catalogCommit|raw\.githubusercontent\.com/)
  assert.match(finder, /officialTemplatePointer/)
})
