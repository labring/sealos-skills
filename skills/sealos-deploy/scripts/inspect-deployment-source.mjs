#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const composeNames = new Set(['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml'])
const kubernetesRoots = new Set(['deploy', 'deployments', 'k8s', 'kubernetes', 'manifest', 'manifests'])
const ignoredDirectories = new Set(['.git', '.sealos', '.terraform', 'dist', 'node_modules', 'target', 'vendor'])

const yamlQuery = String.raw`
import json
import sys
from pathlib import Path
import yaml

documents = []
for document in yaml.safe_load_all(Path(sys.argv[1]).read_text(encoding="utf-8")):
    if isinstance(document, dict):
        documents.append(document)
print(json.dumps(documents))
`

function isDirectory (filePath) {
  try {
    return fs.statSync(filePath).isDirectory()
  } catch {
    return false
  }
}

function isFile (filePath) {
  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

function toRelative (workDir, filePath) {
  const relative = path.relative(workDir, filePath)
  return relative ? relative.split(path.sep).join('/') : '.'
}

function isWithin (workDir, filePath) {
  const relative = path.relative(workDir, filePath)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function listFiles (root) {
  const files = []
  const pending = [root]
  while (pending.length > 0) {
    const current = pending.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) pending.push(entryPath)
      } else if (entry.isFile()) {
        files.push(entryPath)
      }
    }
  }
  return files.sort()
}

function parseYaml (filePath, execute = execFileSync) {
  try {
    const output = execute('python3', ['-c', yamlQuery, filePath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return JSON.parse(output)
  } catch {
    return []
  }
}

function isKubernetesManifest (filePath, execute) {
  if (!/\.ya?ml$/i.test(filePath)) return false
  return parseYaml(filePath, execute).some(document => (
    typeof document.apiVersion === 'string'
    && typeof document.kind === 'string'
    && document.metadata !== null
    && typeof document.metadata === 'object'
  ))
}

function findHelmCharts (workDir) {
  const charts = listFiles(workDir)
    .filter(filePath => path.basename(filePath) === 'Chart.yaml')
    .map(filePath => path.dirname(filePath))
    .filter(chartDir => isDirectory(path.join(chartDir, 'templates')))
    .sort()
  return charts.filter(chartDir => !charts.some(parent => (
    parent !== chartDir
    && isWithin(parent, chartDir)
    && toRelative(parent, chartDir).startsWith('charts/')
  )))
}

function beneathChart (filePath, charts) {
  return charts.some(chartDir => isWithin(chartDir, filePath))
}

function findKubernetesManifests (workDir, charts, execute) {
  const rootEntries = fs.readdirSync(workDir, { withFileTypes: true })
  const allowedRoots = new Set(
    rootEntries
      .filter(entry => entry.isDirectory() && kubernetesRoots.has(entry.name.toLowerCase()))
      .map(entry => path.join(workDir, entry.name)),
  )
  return listFiles(workDir)
    .filter(filePath => /\.ya?ml$/i.test(filePath))
    .filter(filePath => !composeNames.has(path.basename(filePath)))
    .filter(filePath => !beneathChart(filePath, charts))
    .filter(filePath => {
      const topLevel = path.dirname(filePath) === workDir
      const underKnownRoot = [...allowedRoots].some(root => isWithin(root, filePath))
      return topLevel || underKnownRoot
    })
    .filter(filePath => isKubernetesManifest(filePath, execute))
    .sort()
}

function findComposeFiles (workDir) {
  return [...composeNames]
    .map(name => path.join(workDir, name))
    .filter(isFile)
    .sort()
}

function readOverride (workDir) {
  const configPath = path.join(workDir, '.sealos', 'config.json')
  if (!isFile(configPath)) return null
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  return config.deployment_source || null
}

function resolveOverride (workDir, override) {
  if (!override || typeof override !== 'object') return null
  if (!['helm', 'kubernetes', 'compose'].includes(override.kind) || typeof override.path !== 'string') {
    throw new Error('configuration deployment_source must define a supported kind and path')
  }
  const target = path.resolve(workDir, override.path)
  if (!isWithin(workDir, target)) throw new Error('configuration deployment_source.path must stay inside work_dir')
  if (override.kind === 'helm' && !isFile(path.join(target, 'Chart.yaml'))) {
    throw new Error('configuration Helm path must contain Chart.yaml')
  }
  if (override.kind !== 'helm' && !isFile(target)) {
    throw new Error('configuration source path must be a file')
  }
  return { kind: override.kind, path: toRelative(workDir, target), selected_by: 'configuration' }
}

export function inspectDeploymentSource (workDir, options = {}) {
  const absoluteWorkDir = path.resolve(workDir)
  if (!isDirectory(absoluteWorkDir)) throw new Error(`work directory does not exist: ${absoluteWorkDir}`)
  const execute = options.execute || execFileSync
  const charts = findHelmCharts(absoluteWorkDir)
  const manifests = findKubernetesManifests(absoluteWorkDir, charts, execute)
  const compose = findComposeFiles(absoluteWorkDir)
  const candidates = {
    helm: charts.map(filePath => toRelative(absoluteWorkDir, filePath)),
    kubernetes: manifests.map(filePath => toRelative(absoluteWorkDir, filePath)),
    compose: compose.map(filePath => toRelative(absoluteWorkDir, filePath)),
  }

  const override = options.override || readOverride(absoluteWorkDir)
  const configured = resolveOverride(absoluteWorkDir, override)
  if (configured) return { work_dir: absoluteWorkDir, candidates, selected: configured, ambiguity: null }

  const sourceGroups = [
    ['helm', candidates.helm],
    ['kubernetes', candidates.kubernetes],
    ['compose', candidates.compose],
  ]
  for (const [kind, values] of sourceGroups) {
    if (values.length === 1) {
      return {
        work_dir: absoluteWorkDir,
        candidates,
        selected: { kind, path: values[0], selected_by: 'priority' },
        ambiguity: null,
      }
    }
    if (values.length > 1) {
      return {
        work_dir: absoluteWorkDir,
        candidates,
        selected: null,
        ambiguity: `multiple ${kind} sources need a README or CI decision`,
      }
    }
  }

  return {
    work_dir: absoluteWorkDir,
    candidates,
    selected: { kind: 'implicit', path: '.', selected_by: 'no-explicit-source' },
    ambiguity: null,
  }
}

function main () {
  const workDir = process.argv[2]
  if (!workDir || process.argv.length !== 3) {
    console.log(JSON.stringify({ error: 'Usage: node inspect-deployment-source.mjs <work-dir>' }, null, 2))
    process.exitCode = 1
    return
  }
  try {
    console.log(JSON.stringify(inspectDeploymentSource(workDir), null, 2))
  } catch (error) {
    console.log(JSON.stringify({ error: error.message }, null, 2))
    process.exitCode = 1
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain) main()
