#!/usr/bin/env node

import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { pathToFileURL } from 'url'

const COMPOSE_FILES = [
  'compose.yaml',
  'compose.yml',
  'docker-compose.yaml',
  'docker-compose.yml',
]

const KUBERNETES_DIRECTORIES = new Set([
  'deploy',
  'deployments',
  'k8s',
  'kubernetes',
  'manifest',
  'manifests',
])

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.sealos',
  '.terraform',
  'dist',
  'node_modules',
  'target',
  'vendor',
])

const WORKLOAD_KINDS = new Set([
  'Deployment',
  'StatefulSet',
  'DaemonSet',
  'Job',
  'CronJob',
])

const KUBERNETES_TOPOLOGY_KINDS = new Set([
  ...WORKLOAD_KINDS,
  'Cluster',
  'Ingress',
  'ObjectStorageBucket',
  'Service',
])

const YAML_TO_JSON = String.raw`
import json
import sys
from pathlib import Path

import yaml

documents = []
for document in yaml.safe_load_all(Path(sys.argv[1]).read_text(encoding="utf-8")):
    if isinstance(document, dict):
        documents.append(document)
print(json.dumps(documents, separators=(",", ":")))
`

function isPlainObject (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizePath (value) {
  return value.split(path.sep).join('/')
}

function isWithin (parent, candidate) {
  const relative = path.relative(parent, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function existingFile (filePath) {
  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

function existingDirectory (directoryPath) {
  try {
    return fs.statSync(directoryPath).isDirectory()
  } catch {
    return false
  }
}

function listFilesRecursive (root, predicate = () => true) {
  const files = []
  const pending = [root]

  while (pending.length > 0) {
    const current = pending.pop()
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of entries) {
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        pending.push(entryPath)
      } else if (entry.isFile() && predicate(entryPath)) {
        files.push(entryPath)
      }
    }
  }

  return files.sort()
}

function findExecutable (candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    for (const versionArgs of [['--version'], ['version']]) {
      try {
        execFileSync(candidate, versionArgs, {
          encoding: 'utf8',
          stdio: ['ignore', 'ignore', 'ignore'],
        })
        return candidate
      } catch {
        // Try the next version form or executable name.
      }
    }
  }
  return null
}

function parseYamlDocuments (filePath, options = {}) {
  const pythonPath = options.pythonPath || findExecutable([
    process.env.SEALOS_DEPLOY_PYTHON,
    'python3',
    'python',
  ])
  if (!pythonPath) {
    throw new Error('Python with PyYAML is required to inspect Kubernetes deployment sources')
  }

  let output
  try {
    output = execFileSync(pythonPath, ['-c', YAML_TO_JSON, filePath], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const detail = String(error.stderr || error.message || '').trim()
    throw new Error(`unable to parse Kubernetes YAML ${filePath}: ${detail || 'unknown error'}`)
  }

  try {
    return JSON.parse(output)
  } catch {
    throw new Error(`Python returned invalid JSON while parsing ${filePath}`)
  }
}

function documentsFromText (text, options = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-deployment-source-yaml-'))
  const tempFile = path.join(tempDir, 'resources.yaml')
  try {
    fs.writeFileSync(tempFile, text)
    return parseYamlDocuments(tempFile, options)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

function kubernetesDocumentsInFile (filePath, options = {}) {
  if (!/\.ya?ml$/i.test(filePath)) return []
  const text = fs.readFileSync(filePath, 'utf8')
  if (text.includes('{{')) return []

  let documents
  try {
    documents = parseYamlDocuments(filePath, options)
  } catch {
    return []
  }
  return documents.filter(document => (
    typeof document.apiVersion === 'string' &&
    typeof document.kind === 'string' &&
    isPlainObject(document.metadata)
  ))
}

function findComposeCandidate (workDir) {
  for (const fileName of COMPOSE_FILES) {
    const candidate = path.join(workDir, fileName)
    if (existingFile(candidate)) return candidate
  }
  return null
}

function findHelmCandidates (workDir) {
  const chartDirs = listFilesRecursive(workDir, filePath => path.basename(filePath) === 'Chart.yaml')
    .map(chartFile => path.dirname(chartFile))
    .filter(chartDir => existingDirectory(path.join(chartDir, 'templates')))
  // A vendored dependency under <chart>/charts is part of its parent release,
  // not a second deployment source. Keep the parent chart as the candidate and
  // require an explicit config override only for independent charts.
  return chartDirs.filter(chartDir => !chartDirs.some(parent => (
    parent !== chartDir &&
    isWithin(parent, chartDir) &&
    normalizePath(path.relative(parent, chartDir)).split('/')[0] === 'charts'
  )))
}

function findKubernetesCandidates (workDir, options = {}) {
  const candidates = []
  const topLevelEntries = fs.readdirSync(workDir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))

  for (const entry of topLevelEntries) {
    if (!entry.isDirectory() || !KUBERNETES_DIRECTORIES.has(entry.name.toLowerCase())) continue
    const root = path.join(workDir, entry.name)
    const files = listFilesRecursive(root, filePath => /\.ya?ml$/i.test(filePath))
      .filter(filePath => kubernetesDocumentsInFile(filePath, options).length > 0)
    if (files.length > 0) candidates.push({ path: root, files })
  }

  const rootResources = topLevelEntries
    .filter(entry => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map(entry => path.join(workDir, entry.name))
    .filter(filePath => !COMPOSE_FILES.includes(path.basename(filePath)))
    .map(filePath => ({
      filePath,
      documents: kubernetesDocumentsInFile(filePath, options),
    }))
    .filter(item => item.documents.length > 0)

  const hasRootTopology = rootResources.some(item => (
    item.documents.some(document => KUBERNETES_TOPOLOGY_KINDS.has(document.kind))
  ))
  if (hasRootTopology) {
    const rootFiles = rootResources.map(item => item.filePath)
    candidates.push({
      path: rootFiles.length === 1 ? rootFiles[0] : workDir,
      files: rootFiles,
    })
  }
  return candidates
}

function readConfigOverride (workDir) {
  const configPath = path.join(workDir, '.sealos', 'config.json')
  if (!existingFile(configPath)) return null

  let config
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch (error) {
    throw new Error(`unable to read deployment source override from .sealos/config.json: ${error.message}`)
  }
  return isPlainObject(config.deployment_source) ? config.deployment_source : null
}

function resolveOverride (workDir, override, options = {}) {
  const kind = override.kind
  const sourcePath = override.path
  if (!['compose', 'helm', 'kubernetes'].includes(kind)) {
    throw new Error('config.json deployment_source.kind must be compose, helm, or kubernetes')
  }
  if (typeof sourcePath !== 'string' || !sourcePath.trim()) {
    throw new Error('config.json deployment_source.path must be a non-empty project-relative path')
  }

  const absolutePath = path.resolve(workDir, sourcePath)
  if (!isWithin(workDir, absolutePath)) {
    throw new Error('config.json deployment_source.path must stay inside the project')
  }

  if (kind === 'compose') {
    if (!existingFile(absolutePath)) throw new Error(`configured Compose source does not exist: ${sourcePath}`)
    return { kind, path: absolutePath, files: [absolutePath] }
  }

  if (kind === 'helm') {
    const chartDir = existingFile(absolutePath) && path.basename(absolutePath) === 'Chart.yaml'
      ? path.dirname(absolutePath)
      : absolutePath
    if (!existingFile(path.join(chartDir, 'Chart.yaml')) || !existingDirectory(path.join(chartDir, 'templates'))) {
      throw new Error(`configured Helm source is not a Chart root: ${sourcePath}`)
    }
    return { kind, path: chartDir, files: chartSourceFiles(chartDir) }
  }

  const files = existingDirectory(absolutePath)
    ? listFilesRecursive(absolutePath, filePath => /\.ya?ml$/i.test(filePath))
        .filter(filePath => kubernetesDocumentsInFile(filePath, options).length > 0)
    : [absolutePath].filter(filePath => kubernetesDocumentsInFile(filePath, options).length > 0)
  if (files.length === 0) {
    throw new Error(`configured Kubernetes source contains no Kubernetes resources: ${sourcePath}`)
  }
  return { kind, path: absolutePath, files }
}

function chartSourceFiles (chartDir) {
  return listFilesRecursive(chartDir, filePath => {
    const relative = normalizePath(path.relative(chartDir, filePath))
    return (
      relative === 'Chart.yaml' ||
      relative === 'Chart.lock' ||
      relative === '.helmignore' ||
      /^values(?:[.-].*)?\.ya?ml$/i.test(relative) ||
      relative.startsWith('templates/') ||
      relative.startsWith('charts/') ||
      relative.startsWith('crds/')
    )
  })
}

function sourceHash (workDir, files, marker) {
  const hash = crypto.createHash('sha256')
  hash.update(`${marker}\0`)
  for (const filePath of files.slice().sort()) {
    hash.update(`${normalizePath(path.relative(workDir, filePath))}\0`)
    hash.update(fs.readFileSync(filePath))
    hash.update('\0')
  }
  return `sha256:${hash.digest('hex')}`
}

function combineKubernetesFiles (files) {
  return files
    .map(filePath => fs.readFileSync(filePath, 'utf8').trim())
    .filter(Boolean)
    .join('\n---\n') + '\n'
}

function chartHasDependencies (chartFile, options = {}) {
  const documents = parseYamlDocuments(chartFile, options)
  const chart = documents[0]
  return Array.isArray(chart?.dependencies) && chart.dependencies.length > 0
}

function releaseNameForChart (chartDir) {
  return path.basename(chartDir)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'app'
}

function renderHelmChart (chartDir, options = {}) {
  const helmPath = options.helmPath || findExecutable([
    process.env.SEALOS_DEPLOY_HELM,
    'helm',
  ])
  if (!helmPath) {
    throw new Error('Helm 3 or newer is required to render the selected Chart')
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-deployment-source-helm-'))
  const chartCopy = path.join(tempDir, 'chart')
  try {
    fs.cpSync(chartDir, chartCopy, { recursive: true })
    const hasLock = existingFile(path.join(chartCopy, 'Chart.lock'))
    const hasDependencies = chartHasDependencies(path.join(chartCopy, 'Chart.yaml'), options)
    if (hasLock || hasDependencies) {
      try {
        execFileSync(helmPath, ['dependency', 'build', chartCopy], {
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      } catch (error) {
        const detail = String(error.stderr || error.message || '').trim()
        throw new Error(`helm dependency build failed: ${detail || 'unknown error'}`)
      }
    }

    try {
      const rendered = execFileSync(helmPath, [
        'template',
        releaseNameForChart(chartDir),
        chartCopy,
        '--namespace',
        'default',
        '--no-hooks',
      ], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      return {
        rendered,
        dependency_mode: hasLock ? 'locked' : (hasDependencies ? 'unlocked' : 'none'),
      }
    } catch (error) {
      const detail = String(error.stderr || error.message || '').trim()
      throw new Error(`helm template failed: ${detail || 'unknown error'}`)
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

function writeRenderedSource (workDir, rendered, options = {}) {
  const outputPath = path.resolve(
    workDir,
    options.renderedPath || '.sealos/deployment-source/rendered.yaml',
  )
  if (!isWithin(workDir, outputPath)) {
    throw new Error('rendered deployment source path must stay inside the project')
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  const tempPath = `${outputPath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
  fs.writeFileSync(tempPath, rendered)
  fs.renameSync(tempPath, outputPath)
  return outputPath
}

function resourceIdentity (document, index) {
  const apiVersion = typeof document.apiVersion === 'string' ? document.apiVersion : ''
  const kind = typeof document.kind === 'string' ? document.kind : ''
  const name = typeof document.metadata?.name === 'string'
    ? document.metadata.name
    : `<unnamed-${index + 1}>`
  return {
    api_version: apiVersion,
    kind,
    name,
  }
}

function podSpecForResource (document) {
  if (document.kind === 'CronJob') {
    return document.spec?.jobTemplate?.spec?.template?.spec
  }
  if (WORKLOAD_KINDS.has(document.kind)) {
    return document.spec?.template?.spec
  }
  return null
}

function containerServiceName (workloadName, containerName, totalContainers) {
  return totalContainers === 1 ? workloadName : `${workloadName}.${containerName}`
}

function inventoryFromDocuments (documents, sourceKind, sourceFile) {
  const resources = []
  const services = []
  const images = []
  const seenServiceNames = new Set()

  documents.forEach((document, index) => {
    if (!isPlainObject(document)) return
    const identity = resourceIdentity(document, index)
    resources.push({
      ...identity,
      source_file: sourceFile,
    })

    if (
      document.kind === 'Cluster' &&
      typeof document.apiVersion === 'string' &&
      document.apiVersion.startsWith('apps.kubeblocks.io/')
    ) {
      const name = identity.name
      if (!seenServiceNames.has(name)) {
        seenServiceNames.add(name)
        services.push({
          name,
          role: 'database',
          source: sourceKind,
          source_file: sourceFile,
          resource_kind: 'Cluster',
          workload_name: name,
          container_name: null,
          container_role: null,
          declared_image: null,
          build: null,
          image_status: null,
          image_ref: null,
          digest: null,
        })
      }
      return
    }

    const podSpec = podSpecForResource(document)
    if (!isPlainObject(podSpec)) return
    const containers = [
      ...(Array.isArray(podSpec.initContainers)
        ? podSpec.initContainers.map(container => ({ container, role: 'init' }))
        : []),
      ...(Array.isArray(podSpec.containers)
        ? podSpec.containers.map(container => ({ container, role: 'main' }))
        : []),
    ].filter(item => isPlainObject(item.container) && typeof item.container.name === 'string')
    const workloadName = identity.name

    for (const { container, role } of containers) {
      const serviceName = containerServiceName(workloadName, container.name, containers.length)
      if (seenServiceNames.has(serviceName)) {
        throw new Error(`deployment topology contains duplicate container service key: ${serviceName}`)
      }
      seenServiceNames.add(serviceName)
      const declaredImage = typeof container.image === 'string' && container.image.trim()
        ? container.image.trim()
        : null
      services.push({
        name: serviceName,
        role: 'application',
        source: sourceKind,
        source_file: sourceFile,
        resource_kind: identity.kind,
        workload_name: workloadName,
        container_name: container.name,
        container_role: role,
        declared_image: declaredImage,
        build: null,
        image_status: declaredImage ? 'unavailable' : null,
        image_ref: null,
        digest: null,
      })
      if (declaredImage) {
        images.push({
          image: declaredImage,
          service: serviceName,
          workload_name: workloadName,
          container_name: container.name,
          role,
        })
      }
    }
  })

  return { resources, services, images }
}

function selectDeploymentSource (workDir, options = {}) {
  const override = options.override || readConfigOverride(workDir)
  if (override) return resolveOverride(workDir, override, options)

  const composePath = findComposeCandidate(workDir)
  if (composePath) return { kind: 'compose', path: composePath, files: [composePath] }

  const helmCandidates = findHelmCandidates(workDir)
  if (helmCandidates.length > 1) {
    const candidates = helmCandidates.map(candidate => normalizePath(path.relative(workDir, candidate)))
    throw new Error(`multiple Helm Charts found; set config.json deployment_source.path: ${candidates.join(', ')}`)
  }
  if (helmCandidates.length === 1) {
    return {
      kind: 'helm',
      path: helmCandidates[0],
      files: chartSourceFiles(helmCandidates[0]),
    }
  }

  const kubernetesCandidates = findKubernetesCandidates(workDir, options)
  if (kubernetesCandidates.length > 1) {
    const candidates = kubernetesCandidates.map(candidate => normalizePath(path.relative(workDir, candidate.path)))
    throw new Error(`multiple Kubernetes manifest roots found; set config.json deployment_source.path: ${candidates.join(', ')}`)
  }
  if (kubernetesCandidates.length === 1) {
    return {
      kind: 'kubernetes',
      path: kubernetesCandidates[0].path,
      files: kubernetesCandidates[0].files,
    }
  }

  const implicitEvidence = ['Dockerfile', 'package.json', 'pyproject.toml', 'go.mod']
    .map(fileName => path.join(workDir, fileName))
    .filter(existingFile)
  return {
    kind: 'implicit-single-service',
    path: workDir,
    files: implicitEvidence,
  }
}

function inspectDeploymentSource (workDir, options = {}) {
  const absoluteWorkDir = path.resolve(workDir)
  if (!existingDirectory(absoluteWorkDir)) {
    throw new Error(`work directory does not exist: ${absoluteWorkDir}`)
  }

  const selected = selectDeploymentSource(absoluteWorkDir, options)
  const relativePath = selected.path === absoluteWorkDir
    ? '.'
    : normalizePath(path.relative(absoluteWorkDir, selected.path))
  const evidence = selected.files.map(filePath => normalizePath(path.relative(absoluteWorkDir, filePath)))
  const deploymentSource = {
    kind: selected.kind,
    path: relativePath,
    source_hash: sourceHash(absoluteWorkDir, selected.files, selected.kind),
    evidence: evidence.length > 0 ? evidence : ['.'],
    rendered_path: null,
    dependency_mode: null,
    resources: [],
  }

  if (selected.kind === 'compose' || selected.kind === 'implicit-single-service') {
    return {
      deployment_source: deploymentSource,
      services: [],
      images: [],
      documents: [],
    }
  }

  let rendered
  if (selected.kind === 'helm') {
    const result = renderHelmChart(selected.path, options)
    rendered = result.rendered
    deploymentSource.dependency_mode = result.dependency_mode
  } else {
    rendered = combineKubernetesFiles(selected.files)
  }

  const documents = documentsFromText(rendered, options)
    .filter(document => (
      isPlainObject(document) &&
      typeof document.apiVersion === 'string' &&
      typeof document.kind === 'string'
    ))
  if (documents.length === 0) {
    throw new Error(`${selected.kind} deployment source rendered no Kubernetes resources`)
  }

  const outputPath = options.writeRendered === false
    ? null
    : writeRenderedSource(absoluteWorkDir, rendered, options)
  if (outputPath) {
    deploymentSource.rendered_path = normalizePath(path.relative(absoluteWorkDir, outputPath))
  }
  const inventory = inventoryFromDocuments(
    documents,
    selected.kind,
    deploymentSource.rendered_path || relativePath,
  )
  deploymentSource.resources = inventory.resources

  return {
    deployment_source: deploymentSource,
    services: inventory.services,
    images: inventory.images,
    documents,
  }
}

async function main () {
  const [, , workDirArg] = process.argv
  if (!workDirArg) {
    console.error('Usage: node inspect-deployment-source.mjs <work-dir>')
    process.exitCode = 1
    return
  }

  try {
    const result = inspectDeploymentSource(path.resolve(workDirArg))
    console.log(JSON.stringify({
      deployment_source: result.deployment_source,
      services: result.services,
      images: result.images,
    }, null, 2))
  } catch (error) {
    console.log(JSON.stringify({
      error: error.message,
    }, null, 2))
    process.exitCode = 1
  }
}

const isMain = process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMain) await main()

export {
  inspectDeploymentSource,
  inventoryFromDocuments,
  selectDeploymentSource,
}
