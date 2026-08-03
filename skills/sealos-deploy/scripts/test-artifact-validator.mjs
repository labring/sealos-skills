#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  validateArtifactData,
  validateProjectArtifacts,
} from './artifact-validator.mjs'
import { validateProjectDirectory } from './validate-artifacts.mjs'

const digest = `sha256:${'a'.repeat(64)}`

function phaseZeroAnalysis (overrides = {}) {
  return {
    runtime_profile: 'local',
    work_dir: '/tmp/demo',
    repo_name: 'demo',
    github_url: 'https://github.com/acme/demo',
    ...overrides,
  }
}

function phaseOneAnalysis (overrides = {}) {
  return { ...phaseZeroAnalysis(), official_template: null, ...overrides }
}

function phaseTwoAnalysis (overrides = {}) {
  return {
    ...phaseOneAnalysis(),
    deployment_plan: '.sealos/phase-2/deployment-plan.json',
    ...overrides,
  }
}

test('accepts the exact Phase 0 contract', () => {
  const result = validateArtifactData('analysis-phase-0', phaseZeroAnalysis())
  assert.equal(result.valid, true, JSON.stringify(result.errors))
})

test('rejects a relative Phase 0 work directory', () => {
  const result = validateArtifactData('analysis-phase-0', phaseZeroAnalysis({ work_dir: 'project' }))
  assert.equal(result.valid, false)
  assert.match(result.errors[0].message, /absolute/)
})

test('accepts the saved official-template path in Phase 1', () => {
  const result = validateArtifactData('analysis-phase-1', phaseOneAnalysis({
    official_template: '.sealos/phase-1/official-template.yaml',
  }))
  assert.equal(result.valid, true, JSON.stringify(result.errors))
})

test('rejects a fixed official-template URL in Phase 1', () => {
  const result = validateArtifactData('analysis-phase-1', phaseOneAnalysis({
    official_template: 'https://raw.githubusercontent.com/labring-actions/templates/abc/template/demo/index.yaml',
  }))
  assert.equal(result.valid, false)
})

test('requires the saved official YAML for a Phase 1 pointer', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-official-artifact-'))
  try {
    const analysisPath = path.join(workDir, '.sealos', 'analysis.json')
    fs.mkdirSync(path.dirname(analysisPath), { recursive: true })
    fs.writeFileSync(analysisPath, JSON.stringify(phaseOneAnalysis({
      work_dir: workDir,
      official_template: '.sealos/phase-1/official-template.yaml',
    })))
    assert.equal(validateProjectArtifacts(workDir, 'phase-1').valid, false)
    const templatePath = path.join(workDir, '.sealos', 'phase-1', 'official-template.yaml')
    fs.mkdirSync(path.dirname(templatePath), { recursive: true })
    fs.writeFileSync(templatePath, 'kind: Template\n')
    assert.equal(validateProjectArtifacts(workDir, 'phase-1').valid, true)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('accepts a full standard-route analysis after Phase 2', () => {
  const result = validateArtifactData('analysis', phaseTwoAnalysis())
  assert.equal(result.valid, true, JSON.stringify(result.errors))
})

test('rejects a deployment plan outside the work directory', () => {
  const result = validateArtifactData('deployment-plan', { deployment_source: '../outside.yaml' })
  assert.equal(result.valid, false)
})

test('requires matching digest and pull-access service keys', () => {
  const valid = validateArtifactData('build-result', {
    digests: { web: `ghcr.io/acme/web@${digest}` },
    pull_access: { web: 'public' },
  })
  const invalid = validateArtifactData('build-result', {
    digests: { web: `ghcr.io/acme/web@${digest}` },
    pull_access: { worker: 'public' },
  })
  assert.equal(valid.valid, true, JSON.stringify(valid.errors))
  assert.equal(invalid.valid, false)
})

test('validates all Phase 0 through Phase 3 artifact boundaries', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-artifact-contract-'))
  try {
    const sealosDir = path.join(workDir, '.sealos')
    const analysisPath = path.join(sealosDir, 'analysis.json')
    fs.mkdirSync(path.join(sealosDir, 'phase-2'), { recursive: true })
    fs.writeFileSync(path.join(sealosDir, 'phase-2', 'docker-compose.yml'), 'services: {}\n')
    fs.writeFileSync(analysisPath, JSON.stringify(phaseZeroAnalysis({ work_dir: workDir })))
    assert.equal(validateProjectArtifacts(workDir, 'phase-0').valid, true)

    fs.writeFileSync(analysisPath, JSON.stringify(phaseOneAnalysis({ work_dir: workDir })))
    assert.equal(validateProjectArtifacts(workDir, 'phase-1').valid, true)

    fs.writeFileSync(path.join(sealosDir, 'phase-2', 'deployment-plan.json'), JSON.stringify({
      deployment_source: '.sealos/phase-2/docker-compose.yml',
    }))
    fs.writeFileSync(analysisPath, JSON.stringify(phaseTwoAnalysis({ work_dir: workDir })))
    assert.equal(validateProjectArtifacts(workDir, 'phase-2').valid, true)

    fs.mkdirSync(path.join(sealosDir, 'phase-3'), { recursive: true })
    fs.writeFileSync(path.join(sealosDir, 'phase-3', 'build-result.json'), JSON.stringify({
      digests: { web: `ghcr.io/acme/web@${digest}` },
      pull_access: { web: 'public' },
    }))
    fs.writeFileSync(analysisPath, JSON.stringify(phaseTwoAnalysis({
      work_dir: workDir,
      build_result: '.sealos/phase-3/build-result.json',
    })))
    assert.equal(validateProjectArtifacts(workDir, 'phase-3').valid, true)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('infers the completed stage for the documented --dir command', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-artifact-dir-'))
  try {
    const sealosDir = path.join(workDir, '.sealos')
    fs.mkdirSync(sealosDir, { recursive: true })
    fs.writeFileSync(path.join(sealosDir, 'analysis.json'), JSON.stringify(phaseOneAnalysis({ work_dir: workDir })))
    const result = validateProjectDirectory(workDir)
    assert.equal(result.stage, 'phase-1')
    assert.equal(result.valid, true)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})
