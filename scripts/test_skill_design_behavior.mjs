#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gradeBehavior } from './skill-design-behavior.mjs'
import { checkBaseline } from './skill-design-baseline.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baselinePath = path.join(ROOT, 'tests/fixtures/skill-design-baseline.json')
const scenariosPath = path.join(ROOT, 'tests/fixtures/skill-design-behavior.json')
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
const scenarios = JSON.parse(fs.readFileSync(scenariosPath, 'utf8'))

test('grader accepts all eight skills and both terminal outcome classes', () => {
  const report = gradeBehavior(baseline, { repoRoot: ROOT, scenarios })
  assert.equal(report.ok, true, JSON.stringify(report, null, 2))
  assert.deepEqual(report.coverage, {
    skillCount: 8,
    expectedSkillCount: 8,
    positiveCount: 8,
    violatingCount: 8,
    dimensions: ['routing', 'boundary', 'terminal', 'progressive-loading', 'highest-risk']
  })
  assert.equal(report.diagnostics.length, 0)
})

test('mutation scenarios fail through the real baseline validator', () => {
  for (const mutation of scenarios.mutations) {
    const copy = structuredClone(baseline)
    const record = copy.skills.find((skill) => skill.skill === mutation.skill)
    const caseData = record.cases.find((item) => item.caseId === mutation.caseId)
    if (mutation.field === 'loadedResources') caseData[mutation.field] = []
    else if (mutation.field === 'redactionChecks') caseData[mutation.field] = []
    else if (mutation.field === 'handoff') caseData[mutation.field] = null
    else if (mutation.field === 'guard') delete caseData[mutation.field]
    else delete caseData[mutation.field]
    const result = checkBaseline(copy, { repoRoot: ROOT })
    assert.ok(result.issues.length > 0, `${mutation.id} should fail`)
    assert.ok(result.cases.some(({ caseData: checked, result: checkedResult }) => checked.caseId === mutation.caseId && checkedResult.issues.some((item) => item.code === mutation.expectedCode)), `${mutation.id} missing ${mutation.expectedCode}`)
  }
})

test('grader diagnostics remain structured and source-scoped', () => {
  const copy = structuredClone(baseline)
  copy.skills[0].cases[0].text = 'password=leaked-value'
  const report = gradeBehavior(copy, { repoRoot: ROOT })
  assert.equal(report.ok, false)
  const finding = report.diagnostics.find((item) => item.code === 'sensitive-trace-value')
  assert.equal(finding.skill, 'cloud-native-readiness')
  assert.equal(finding.caseId, 'readiness-positive-eligible')
  assert.equal(finding.source, 'tests/fixtures/skill-design-baseline.json')
})

test('temporary repository copy stays writable for mutation tests', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-skill-behavior-'))
  try {
    fs.cpSync(ROOT, temp, { recursive: true, dereference: true })
    const copiedFixture = JSON.parse(fs.readFileSync(path.join(temp, 'tests/fixtures/skill-design-baseline.json'), 'utf8'))
    delete copiedFixture.skills[0].cases[0].safeNextAction
    fs.writeFileSync(path.join(temp, 'tests/fixtures/skill-design-baseline.json'), JSON.stringify(copiedFixture))
    const report = gradeBehavior(copiedFixture, { repoRoot: temp })
    assert.equal(report.ok, false)
    assert.ok(report.diagnostics.some((item) => item.code === 'invalid-safe-next-action'))
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
})
