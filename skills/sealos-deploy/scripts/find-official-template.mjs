#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateArtifactData } from './artifact-validator.mjs'

const officialTemplatePointer = '.sealos/phase-1/official-template.yaml'

const yamlQuery = String.raw`
import json
import sys
from pathlib import Path
import yaml

documents = list(yaml.safe_load_all(Path(sys.argv[1]).read_text(encoding="utf-8")))
for document in documents:
    if isinstance(document, dict) and document.get("kind") == "Template":
        spec = document.get("spec")
        value = spec.get("gitRepo") if isinstance(spec, dict) else None
        print(json.dumps({"git_repo": value}))
        break
else:
    print(json.dumps({"git_repo": None}))
`

function usage () {
  return [
    'Usage:',
    '  node find-official-template.mjs --analysis <analysis.json> --catalog-dir <kb-0.9-dir>',
    '  node find-official-template.mjs --analysis <analysis.json> --unavailable <reason>',
  ].join('\n')
}

function parseArgs (args) {
  const values = {}
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index]
    const value = args[index + 1]
    if (!['--analysis', '--catalog-dir', '--unavailable'].includes(option) || !value) {
      throw new Error(usage())
    }
    if (Object.hasOwn(values, option)) throw new Error(`Duplicate option: ${option}`)
    values[option] = value
  }
  if (!values['--analysis']) throw new Error(usage())
  const unavailable = values['--unavailable']
  const hasCatalog = Boolean(values['--catalog-dir'])
  if (Boolean(unavailable) === hasCatalog) throw new Error(usage())
  return {
    analysisPath: path.resolve(values['--analysis']),
    catalogDir: values['--catalog-dir'] ? path.resolve(values['--catalog-dir']) : null,
    unavailable: unavailable || null,
  }
}

export function normalizeGitHubRepository (value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\/$/, '')
  const match = trimmed.match(/^(?:https?:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i)
  if (!match) return null
  return `${match[1].toLowerCase()}/${match[2].toLowerCase()}`
}

function listTemplateFiles (catalogDir) {
  const templateDir = path.join(catalogDir, 'template')
  if (!fs.existsSync(templateDir) || !fs.statSync(templateDir).isDirectory()) return []
  return fs.readdirSync(templateDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => ({ name: entry.name, file: path.join(templateDir, entry.name, 'index.yaml') }))
    .filter(entry => fs.existsSync(entry.file))
    .sort((left, right) => left.name.localeCompare(right.name))
}

function templateRepository (filePath, execute = execFileSync) {
  let output
  try {
    output = execute('python3', ['-c', yamlQuery, filePath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const detail = String(error.stderr || error.message || '').trim()
    throw new Error(`cannot read ${filePath}: ${detail || 'Python failed'}`)
  }
  try {
    return JSON.parse(output).git_repo
  } catch {
    throw new Error(`cannot parse template metadata from ${filePath}`)
  }
}

export function findExactTemplates (catalogDir, projectRepository, options = {}) {
  const normalizedProject = normalizeGitHubRepository(projectRepository)
  if (!normalizedProject) return []
  const execute = options.execute || execFileSync
  return listTemplateFiles(catalogDir)
    .filter(entry => {
      try {
        return normalizeGitHubRepository(templateRepository(entry.file, execute)) === normalizedProject
      } catch {
        return false
      }
    })
}

function writeJsonAtomically (filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  fs.renameSync(temporary, filePath)
}

function writeTextAtomically (filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(temporary, text, 'utf8')
  fs.renameSync(temporary, filePath)
}

export function copyOfficialTemplate (templateFile, workDir) {
  const yaml = fs.readFileSync(templateFile, 'utf8')
  if (!yaml.trim()) throw new Error(`official template is empty: ${templateFile}`)
  const outputPath = path.join(workDir, officialTemplatePointer)
  writeTextAtomically(outputPath, yaml.endsWith('\n') ? yaml : `${yaml}\n`)
  return outputPath
}

export function selectOfficialTemplate ({ analysis, catalogDir, unavailable }, options = {}) {
  const matches = unavailable ? [] : findExactTemplates(catalogDir, analysis.github_url, options)
  const selected = matches.length === 1 ? matches[0] : null
  return {
    available: !unavailable,
    reason: unavailable || (selected ? 'one exact match' : `${matches.length} exact matches`),
    matches: matches.map(match => match.name),
    catalog_yaml: selected ? path.relative(catalogDir, selected.file).split(path.sep).join('/') : null,
    official_template: selected ? officialTemplatePointer : null,
    selectedFile: selected?.file || null,
  }
}

function validatePhaseZeroInput (analysis) {
  const initial = { ...analysis }
  delete initial.official_template
  const validation = validateArtifactData('analysis-phase-0', initial)
  if (!validation.valid) {
    throw new Error(`invalid Phase 0 analysis: ${validation.errors.map(error => `${error.path} ${error.message}`).join('; ')}`)
  }
}

export function run (args = process.argv.slice(2), options = {}) {
  const parsed = parseArgs(args)
  const analysis = JSON.parse(fs.readFileSync(parsed.analysisPath, 'utf8'))
  validatePhaseZeroInput(analysis)
  const selection = selectOfficialTemplate({
    analysis,
    catalogDir: parsed.catalogDir,
    unavailable: parsed.unavailable,
  }, options)
  if (selection.selectedFile) copyOfficialTemplate(selection.selectedFile, analysis.work_dir)
  const nextAnalysis = { ...analysis, official_template: selection.official_template }
  const validation = validateArtifactData('analysis-phase-1', nextAnalysis)
  if (!validation.valid) {
    throw new Error(`invalid Phase 1 analysis: ${validation.errors.map(error => `${error.path} ${error.message}`).join('; ')}`)
  }
  writeJsonAtomically(parsed.analysisPath, nextAnalysis)
  const { selectedFile, ...result } = selection
  return { analysis: parsed.analysisPath, ...result }
}

function main () {
  try {
    console.log(JSON.stringify(run(), null, 2))
  } catch (error) {
    console.log(JSON.stringify({ error: error.message }, null, 2))
    process.exitCode = 1
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain) main()
