#!/usr/bin/env node

/**
 * Sealos Template Deploy
 *
 * Usage:
 *   node deploy-template.mjs <template-path> [--dry-run]
 *   node deploy-template.mjs <template-path> --args-json '{"KEY":"value"}'
 *   node deploy-template.mjs <template-path> --args-file ./args.json
 *   node deploy-template.mjs <template-path> --labels-json '{"k":"v"}'
 *
 * Behavior:
 *   - Reads local auth or derives the region from the active kubeconfig API server
 *   - Reads an explicit/active kubeconfig and sends it as encodeURIComponent(kubeconfig)
 *   - Sends extra labels (CLI --labels-json or SEALAI_DEPLOY_LABELS_JSON) as the
 *     raw Template API `extraLabels` field so created resources carry task markers
 *   - Posts the template YAML to:
 *       https://template.<region-domain>/api/v2alpha/templates/raw
 *   - Prints a JSON result to stdout
 */

import { spawnSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { basename, join, resolve } from 'path'

const SEALOS_DIR = join(homedir(), '.sealos')
const AUTH_PATH = join(SEALOS_DIR, 'auth.json')
const KUBECONFIG_PATH = join(SEALOS_DIR, 'kubeconfig')

function fail(message, extra = {}, code = 1) {
  console.error(JSON.stringify({ error: message, ...extra }, null, 2))
  process.exit(code)
}

function parseArgs(argv) {
  const args = argv.slice(2)
  let templatePath = null
  let dryRun = false
  let argsJson = null
  let argsFile = null
  let labelsJson = null
  let region = null
  let kubeconfig = null

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--dry-run') {
      dryRun = true
      continue
    }
    if (arg === '--args-json' || arg === '--args-file' || arg === '--labels-json' || arg === '--region' || arg === '--kubeconfig') {
      const value = args[i + 1]
      if (!value || value.startsWith('--')) {
        fail(`${arg} requires a value`)
      }
      if (arg === '--args-json') argsJson = value
      if (arg === '--args-file') argsFile = value
      if (arg === '--labels-json') labelsJson = value
      if (arg === '--region') region = value
      if (arg === '--kubeconfig') kubeconfig = value
      i += 1
      continue
    }
    if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
    if (!templatePath) {
      templatePath = arg
      continue
    }
    fail(`Unknown argument: ${arg}`)
  }

  if (!templatePath) {
    fail('Missing template path. Run with --help for usage.')
  }

  if (argsJson && argsFile) {
    fail('Use only one of --args-json or --args-file')
  }

  return {
    templatePath: resolve(process.cwd(), templatePath),
    dryRun,
    argsJson,
    argsFile: argsFile ? resolve(process.cwd(), argsFile) : null,
    labelsJson,
    region,
    kubeconfig: kubeconfig ? resolve(process.cwd(), kubeconfig) : null,
  }
}

function printHelp() {
  console.log(`Sealos Template Deploy

Usage:
  node deploy-template.mjs <template-path> [--dry-run] [--region <url>] [--kubeconfig <path>]
  node deploy-template.mjs <template-path> --args-json '{"KEY":"value"}'
  node deploy-template.mjs <template-path> --args-file ./args.json
  node deploy-template.mjs <template-path> --labels-json '{"k":"v"}'

Examples:
  node deploy-template.mjs .sealos/template/index.yaml --dry-run
  node deploy-template.mjs .sealos/template/index.yaml --labels-json '{"brain.io/task-id":"task-123"}'
  node deploy-template.mjs template/myapp/index.yaml
`)
}

function loadDeployLabels(input) {
  const raw = input.labelsJson ?? process.env.SEALAI_DEPLOY_LABELS_JSON
  if (!raw) return {}

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    fail(input.labelsJson ? 'Failed to parse --labels-json' : 'Failed to parse SEALAI_DEPLOY_LABELS_JSON')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail('Labels must be a JSON object')
  }

  for (const [key, value] of Object.entries(parsed)) {
    if (typeof key !== 'string' || key === '') {
      fail('Label keys must be non-empty strings')
    }
    if (typeof value !== 'string') {
      fail(`Label value for "${key}" must be a string`)
    }
  }

  return parsed
}

function loadJson(filePath, label) {
  if (!existsSync(filePath)) {
    fail(`${label} not found`, { path: filePath })
  }

  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    fail(`Failed to parse ${label}`, { path: filePath, details: error.message })
  }
}

function normalizeRegion(region, source = 'region') {
  const text = String(region || '').trim()
  if (!text) {
    fail(`${source} is missing region`)
  }

  const normalized = text.replace(/\/+$/, '')
  let url
  try {
    url = new URL(normalized)
  } catch (error) {
    fail(`Invalid region URL from ${source}`, { region: text, details: error.message })
  }

  return {
    region: `${url.protocol}//${url.hostname}`,
    regionDomain: url.hostname,
    deployUrl: `https://template.${url.hostname}/api/v2alpha/templates/raw`,
  }
}

function loadTemplate(templatePath) {
  if (!existsSync(templatePath)) {
    fail('Template file not found', { path: templatePath })
  }

  if (!/\.ya?ml$/i.test(basename(templatePath))) {
    fail('Template path must point to a YAML file', { path: templatePath })
  }

  return readFileSync(templatePath, 'utf8')
}

function loadDeployArgs({ argsJson, argsFile }) {
  if (argsJson) {
    try {
      const parsed = JSON.parse(argsJson)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        fail('--args-json must be a JSON object')
      }
      return parsed
    } catch (error) {
      fail('Failed to parse --args-json')
    }
  }

  if (argsFile) {
    const parsed = loadJson(argsFile, 'args file')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      fail('Args file must contain a JSON object', { path: argsFile })
    }
    return parsed
  }

  return {}
}

function runKubectlConfig(kubeconfigPath, format) {
  const env = { ...process.env }
  if (kubeconfigPath) env.KUBECONFIG = kubeconfigPath
  const result = spawnSync(
    'kubectl',
    ['config', 'view', '--minify', '--raw', '--flatten', '-o', format],
    { encoding: 'utf8', env },
  )
  if (result.error || result.status !== 0) {
    return null
  }
  return result.stdout
}

function resolveKubeconfigPath(input) {
  return input.kubeconfig || process.env.KUBECONFIG || KUBECONFIG_PATH
}

function loadKubeconfig(input) {
  const kubeconfigPath = resolveKubeconfigPath(input)
  if (existsSync(kubeconfigPath)) {
    return readFileSync(kubeconfigPath, 'utf8')
  }

  const flattened = runKubectlConfig(input.kubeconfig || process.env.KUBECONFIG || null, 'yaml')
  if (flattened) return flattened
  fail('Kubeconfig not found or unreadable', { path: kubeconfigPath })
}

function resolveRegion(input) {
  if (input.region) return normalizeRegion(input.region, '--region')

  if (existsSync(AUTH_PATH)) {
    const auth = loadJson(AUTH_PATH, 'auth file')
    if (auth.region) return normalizeRegion(auth.region, 'auth file')
  }

  const raw = runKubectlConfig(input.kubeconfig || process.env.KUBECONFIG || null, 'json')
  if (!raw) {
    fail('Unable to derive region from the active kubeconfig API server')
  }

  let config
  try {
    config = JSON.parse(raw)
  } catch {
    fail('kubectl returned invalid kubeconfig JSON while deriving region')
  }
  const server = config?.clusters?.[0]?.cluster?.server
  return normalizeRegion(server, 'kubeconfig API server')
}

function redactValue(value, suppliedValues) {
  if (suppliedValues.some((candidate) => String(candidate) === String(value))) {
    return '<redacted>'
  }
  return value
}

function sanitizeResponse(response, deployArgs) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return null
  const suppliedValues = Object.values(deployArgs)
  const output = {}
  for (const key of ['ok', 'name', 'uid', 'resourceType', 'displayName', 'createdAt', 'resources']) {
    if (Object.prototype.hasOwnProperty.call(response, key)) {
      output[key] = key === 'displayName'
        ? redactValue(response[key], suppliedValues)
        : response[key]
    }
  }

  if (response.error && typeof response.error === 'object') {
    output.error = {}
    for (const key of ['type', 'code']) {
      if (Object.prototype.hasOwnProperty.call(response.error, key)) {
        output.error[key] = response.error[key]
      }
    }
    if (Object.prototype.hasOwnProperty.call(response.error, 'details')) {
      output.error.details_omitted = true
    }
  }
  return output
}

async function postTemplate({ deployUrl, kubeconfig, yaml, args, dryRun, extraLabels }) {
  const response = await fetch(deployUrl, {
    method: 'POST',
    headers: {
      Authorization: encodeURIComponent(kubeconfig),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      yaml,
      args,
      dryRun,
      ...(extraLabels && Object.keys(extraLabels).length > 0 ? { extraLabels } : {}),
    }),
  })

  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    json,
    text,
  }
}

const input = parseArgs(process.argv)
const { region, regionDomain, deployUrl } = resolveRegion(input)
const yaml = loadTemplate(input.templatePath)
const deployArgs = loadDeployArgs(input)
const deployLabels = loadDeployLabels(input)
const kubeconfig = loadKubeconfig(input)

try {
  const result = await postTemplate({
    deployUrl,
    kubeconfig,
    yaml,
    args: deployArgs,
    dryRun: input.dryRun,
    extraLabels: deployLabels,
  })

  const payload = {
    success: result.ok,
    dry_run: input.dryRun,
    region,
    region_domain: regionDomain,
    deploy_url: deployUrl,
    template_path: input.templatePath,
    args_supplied: Object.keys(deployArgs).length,
    labels_supplied: Object.keys(deployLabels).length,
    status: result.status,
    status_text: result.statusText,
    response: sanitizeResponse(result.json, deployArgs),
  }

  if (!result.ok) {
    console.error(JSON.stringify(payload, null, 2))
    process.exit(1)
  }

  console.log(JSON.stringify(payload, null, 2))
} catch (error) {
  fail('Template API request failed', {
    region,
    region_domain: regionDomain,
    deploy_url: deployUrl,
    template_path: input.templatePath,
    args_supplied: Object.keys(deployArgs).length,
    labels_supplied: Object.keys(deployLabels).length,
    details: Object.keys(deployArgs).length > 0 ? 'Request details omitted.' : error.message,
  })
}
