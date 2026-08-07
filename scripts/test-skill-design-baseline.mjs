#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { CANONICAL_SKILLS, checkBaseline, checkCase } from './skill-design-baseline.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const fixturePath = path.join(repoRoot, 'tests', 'fixtures', 'skill-design-baseline.json')
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
const report = checkBaseline(fixture, { repoRoot })

test('fixture covers exactly eight canonical skills with two cases each', () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.skills.length, 8)
  assert.deepEqual(fixture.skills.map((record) => record.skill), CANONICAL_SKILLS)
  for (const record of fixture.skills) {
    assert.equal(record.cases.length, 2, `${record.skill} must have two cases`)
    assert.deepEqual(
      record.cases.map((caseData) => caseData.kind).sort(),
      ['positive', 'violating'],
      `${record.skill} must have one positive and one violating case`
    )
  }
})

test('all positive traces pass with their owner and success terminal state', () => {
  assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2))
  for (const record of fixture.skills) {
    const positive = record.cases.find((caseData) => caseData.kind === 'positive')
    const result = checkCase(record, positive, { repoRoot })
    assert.equal(result.valid, true, `${positive.caseId} should be structurally valid`)
    assert.equal(result.ok, true, `${positive.caseId} should pass`)
    assert.equal(result.summary.selectedOwner, record.skill)
    assert.equal(result.summary.terminalState, 'success')
  }
})

test('all violating traces report their declared guard and a stopped or error state', () => {
  for (const record of fixture.skills) {
    const violating = record.cases.find((caseData) => caseData.kind === 'violating')
    const result = checkCase(record, violating, { repoRoot })
    assert.equal(result.valid, true, `${violating.caseId} should be structurally valid`)
    assert.equal(result.ok, false, `${violating.caseId} must discriminate as a violating case`)
    assert.equal(result.guard, violating.guard)
    assert.ok(['stopped', 'error'].includes(result.summary.terminalState))
  }
})

test('every trace exposes observable resources, calls, artifacts, handoff, and redaction checks', () => {
  for (const record of fixture.skills) {
    for (const caseData of record.cases) {
      assert.ok(caseData.sourceRefs.length > 0, `${caseData.caseId} sourceRefs`)
      assert.ok(caseData.loadedResources.length > 0, `${caseData.caseId} loadedResources`)
      assert.ok(caseData.toolCalls.length > 0, `${caseData.caseId} toolCalls`)
      assert.ok(caseData.files.length > 0, `${caseData.caseId} files`)
      assert.ok(caseData.handoff && typeof caseData.handoff === 'object', `${caseData.caseId} handoff`)
      assert.ok(caseData.handoff.target, `${caseData.caseId} handoff target`)
      assert.ok(caseData.handoff.inputArtifact, `${caseData.caseId} handoff inputArtifact`)
      assert.ok(caseData.handoff.allowedAction, `${caseData.caseId} handoff allowedAction`)
      assert.ok(caseData.handoff.failureReturn, `${caseData.caseId} handoff failureReturn`)
      assert.ok(caseData.handoff.responseOwner, `${caseData.caseId} handoff responseOwner`)
      assert.ok(caseData.redactionChecks.length > 0, `${caseData.caseId} redactionChecks`)
      assert.ok(caseData.redactionChecks.every((check) => check.passed === true), `${caseData.caseId} redaction checks`)
    }
  }
})

test('checker keeps the fixture provider-free and secret-safe', () => {
  assert.deepEqual(report.issues, [])
  for (const caseReport of report.cases) {
    assert.equal(caseReport.result.summary.redaction.ok, true, `${caseReport.caseData.caseId} redaction result`)
    assert.equal(caseReport.result.issues.length, 0, `${caseReport.caseData.caseId} issues`)
  }
})

test('observable evidence and coverage fields are required', () => {
  const record = fixture.skills[0]
  const caseData = { ...record.cases[0], text: '', evidence: [], safeNextAction: '', coverage: ['routing'] }
  const result = checkCase(record, caseData, { repoRoot })
  const codes = new Set(result.issues.map((item) => item.code))
  assert.ok(codes.has('invalid-text'))
  assert.ok(codes.has('invalid-evidence'))
  assert.ok(codes.has('invalid-safe-next-action'))
  assert.ok(codes.has('invalid-coverage'))
})
