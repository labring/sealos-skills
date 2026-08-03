#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  normalizeGitHubRepository,
  run,
} from './find-official-template.mjs'

function writeAnalysis (root, githubUrl) {
  const analysisPath = path.join(root, '.sealos', 'analysis.json')
  fs.mkdirSync(path.dirname(analysisPath), { recursive: true })
  fs.writeFileSync(analysisPath, JSON.stringify({
    runtime_profile: 'local',
    work_dir: root,
    repo_name: 'demo',
    github_url: githubUrl,
  }))
  return analysisPath
}

function writeTemplate (catalogDir, name, gitRepo) {
  const filePath = path.join(catalogDir, 'template', name, 'index.yaml')
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, [
    'apiVersion: app.sealos.io/v1',
    'kind: Template',
    'spec:',
    `  gitRepo: ${gitRepo}`,
    '',
  ].join('\n'))
}

test('normalizes supported GitHub repository forms', () => {
  assert.equal(normalizeGitHubRepository('https://github.com/Acme/Demo.git'), 'acme/demo')
  assert.equal(normalizeGitHubRepository('git@github.com:Acme/Demo.git'), 'acme/demo')
  assert.equal(normalizeGitHubRepository('https://example.com/acme/demo'), null)
})

test('copies one exact match from the live catalog directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-official-template-'))
  try {
    const catalogDir = path.join(root, 'catalog')
    const analysisPath = writeAnalysis(root, 'https://github.com/acme/demo')
    writeTemplate(catalogDir, 'demo', 'https://github.com/acme/demo')
    writeTemplate(catalogDir, 'same-name', 'https://github.com/other/demo')
    const result = run([
      '--analysis', analysisPath,
      '--catalog-dir', catalogDir,
    ])
    const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'))
    assert.deepEqual(result.matches, ['demo'])
    assert.equal(result.catalog_yaml, 'template/demo/index.yaml')
    assert.equal(analysis.official_template, '.sealos/phase-1/official-template.yaml')
    assert.equal(
      fs.readFileSync(path.join(root, analysis.official_template), 'utf8'),
      fs.readFileSync(path.join(catalogDir, 'template', 'demo', 'index.yaml'), 'utf8'),
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('rejects a fixed catalog commit argument', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-official-template-'))
  try {
    const analysisPath = writeAnalysis(root, 'https://github.com/acme/demo')
    assert.throws(() => run([
      '--analysis', analysisPath,
      '--catalog-dir', path.join(root, 'catalog'),
      '--catalog-commit', 'a'.repeat(40),
    ]), /Usage:/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('records null when exact matching is unavailable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-official-template-'))
  try {
    const analysisPath = writeAnalysis(root, 'https://github.com/acme/demo')
    const result = run(['--analysis', analysisPath, '--unavailable', 'network unavailable'])
    const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'))
    assert.equal(result.available, false)
    assert.equal(analysis.official_template, null)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
