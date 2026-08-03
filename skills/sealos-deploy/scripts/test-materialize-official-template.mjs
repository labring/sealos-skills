#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { materializeOfficialTemplate } from './materialize-official-template.mjs'

test('writes the saved official YAML only at the Phase 4 final path', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-materialize-template-'))
  try {
    const analysisPath = path.join(workDir, '.sealos', 'analysis.json')
    fs.mkdirSync(path.dirname(analysisPath), { recursive: true })
    const officialPath = path.join(workDir, '.sealos', 'phase-1', 'official-template.yaml')
    fs.mkdirSync(path.dirname(officialPath), { recursive: true })
    fs.writeFileSync(officialPath, 'kind: Template\n')
    fs.writeFileSync(analysisPath, JSON.stringify({
      runtime_profile: 'sandbox',
      work_dir: workDir,
      repo_name: 'demo',
      github_url: 'https://github.com/acme/demo',
      official_template: '.sealos/phase-1/official-template.yaml',
    }))
    const result = materializeOfficialTemplate(analysisPath)
    assert.equal(result.output, path.join(workDir, '.sealos', 'template', 'index.yaml'))
    assert.equal(result.source, officialPath)
    assert.equal(fs.readFileSync(result.output, 'utf8'), 'kind: Template\n')
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})
