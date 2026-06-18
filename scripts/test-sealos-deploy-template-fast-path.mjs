#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const sourceSkillDir = path.join(repoRoot, 'skills', 'sealos-deploy')
const repoUrl = 'https://github.com/usememos/memos'

const templateYaml = `apiVersion: app.sealos.io/v1
kind: Template
metadata:
  name: memos
spec:
  title: Memos
  url: https://github.com/usememos/memos
  defaults:
    app_name:
      type: string
      value: memos
  inputs: {}
  appConfig:
    data:
      url: https://github.com/usememos/memos
`

test('/sealos-deploy materializes a configured GitHub template fast path', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-template-fast-path-'))
  const skillDir = path.join(tmpRoot, 'sealos-deploy')
  const workDir = path.join(tmpRoot, 'work')

  try {
    fs.cpSync(sourceSkillDir, skillDir, { recursive: true })
    fs.mkdirSync(workDir, { recursive: true })

    const configPath = path.join(skillDir, 'config.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    config.template_fast_path = {
      enabled: true,
      templates: [
        {
          name: 'memos',
          title: 'Memos',
          source_repos: [repoUrl],
          template_yaml: templateYaml,
          args: {
            default_app_name: 'memos',
          },
        },
      ],
    }
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)

    execFileSync(process.execPath, [
      path.join(skillDir, 'scripts', 'detect-template.mjs'),
      '--github-url',
      repoUrl,
      '--work-dir',
      workDir,
      '--skill-dir',
      skillDir,
    ], { encoding: 'utf8' })

    const matchPath = path.join(workDir, '.sealos', 'template-match.json')
    const templatePath = path.join(workDir, '.sealos', 'template', 'index.yaml')

    execFileSync(process.execPath, [
      path.join(skillDir, 'scripts', 'validate-artifacts.mjs'),
      'template-match',
      matchPath,
    ], { encoding: 'utf8' })

    const match = JSON.parse(fs.readFileSync(matchPath, 'utf8'))
    assert.equal(match.matched, true)
    assert.equal(match.materialized, true)
    assert.equal(match.repo.reference, 'usememos/memos')
    assert.equal(match.repo.github_url, repoUrl)
    assert.equal(match.template.name, 'memos')
    assert.equal(match.source, 'config')
    assert.equal(match.template_path, '.sealos/template/index.yaml')
    assert.deepEqual(match.args, { default_app_name: 'memos' })

    const materializedTemplate = fs.readFileSync(templatePath, 'utf8')
    assert.match(materializedTemplate, /^apiVersion:\s*app\.sealos\.io\/v1$/m)
    assert.match(materializedTemplate, /^kind:\s*Template$/m)

    assert.equal(fs.existsSync(path.join(workDir, '.sealos', 'analysis.json')), false)
    assert.equal(fs.existsSync(path.join(workDir, '.sealos', 'build')), false)

    const pipeline = fs.readFileSync(path.join(sourceSkillDir, 'modules', 'pipeline.md'), 'utf8')
    assert.match(
      pipeline,
      /`matched=true` and `materialized=true` → skip Phase 1 through Phase 5/,
    )
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  }
})
