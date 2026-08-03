#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { writeBuildResult } from './write-build-result.mjs'

const digest = `sha256:${'b'.repeat(64)}`

test('writes one aggregate result and one analysis pointer', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-write-build-result-'))
  try {
    const sealosDir = path.join(workDir, '.sealos')
    fs.mkdirSync(path.join(sealosDir, 'phase-2'), { recursive: true })
    fs.writeFileSync(path.join(sealosDir, 'phase-2', 'docker-compose.yml'), 'services: {}\n')
    fs.writeFileSync(path.join(sealosDir, 'analysis.json'), JSON.stringify({
      runtime_profile: 'local',
      work_dir: workDir,
      repo_name: 'demo',
      github_url: 'https://github.com/acme/demo',
      official_template: null,
      deployment_plan: '.sealos/phase-2/deployment-plan.json',
    }))
    fs.writeFileSync(path.join(sealosDir, 'phase-2', 'deployment-plan.json'), JSON.stringify({
      deployment_source: '.sealos/phase-2/docker-compose.yml',
    }))
    const result = writeBuildResult({
      workDir,
      digests: { web: `ghcr.io/acme/demo@${digest}` },
      pullAccess: { web: 'public' },
    }, new Date('2026-08-03T00:00:00Z'))
    const analysis = JSON.parse(fs.readFileSync(result.analysis, 'utf8'))
    const build = JSON.parse(fs.readFileSync(result.build_result, 'utf8'))
    assert.equal(analysis.build_result, '.sealos/phase-3/build-result.json')
    assert.equal(build.digests.web, `ghcr.io/acme/demo@${digest}`)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})
