#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'

const COMMAND_TIMEOUT_MS = 60_000

const PACKAGE_MANAGERS = new Set([
  'npm',
  'yarn',
  'pnpm',
  'bun',
  'pip',
  'pipenv',
  'go',
  'cargo',
  'maven',
  'gradle',
  'composer',
  'bundler',
])

const CONFIG_OVERRIDE_MAP = {
  port: 'port',
  node_version: 'runtime_versions',
  start_command: 'start_command',
  build_command: 'build_command',
  system_deps: 'system_packages',
  env_overrides: 'env_vars',
}

function parseArgs(argv) {
  const args = {
    railpackBin: 'railpack',
  }
  const positional = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case '--work-dir':
        args.workDir = argv[++index]
        break
      case '--analysis':
        args.analysis = argv[++index]
        break
      case '--config':
        args.config = argv[++index]
        break
      case '--railpack-bin':
        args.railpackBin = argv[++index]
        break
      default:
        positional.push(arg)
        break
    }
  }

  if (!args.workDir && positional.length > 0) {
    args.workDir = positional[0]
  }

  return args
}

function printAndExit(result, code = 0) {
  console.log(JSON.stringify(result, null, 2))
  process.exit(code)
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`)
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function runCommand(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: COMMAND_TIMEOUT_MS,
  })

  return {
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error || null,
  }
}

function isMissingCommand(result) {
  return result.error?.code === 'ENOENT'
}

function commandSummary(result) {
  if (result.error) return result.error.message
  const output = `${result.stderr}\n${result.stdout}`.trim()
  if (output) return output.split(/\r?\n/).slice(0, 8).join('\n')
  if (result.signal) return `terminated by signal ${result.signal}`
  return `exited with status ${result.status}`
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key)
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (value === null || value === undefined) return []
  return [value]
}

function stringList(value) {
  const result = []
  for (const item of asArray(value)) {
    if (typeof item === 'string' && item.trim()) {
      result.push(item.trim())
      continue
    }
    if (item && typeof item === 'object') {
      const name = firstString(item.name, item.id, item.provider, item.type)
      if (name) result.push(name)
    }
  }
  return [...new Set(result)]
}

function normalizePackageManager(value) {
  if (typeof value !== 'string') return null
  const lower = value.toLowerCase()
  if (PACKAGE_MANAGERS.has(lower)) return lower

  for (const manager of [...PACKAGE_MANAGERS].sort((a, b) => b.length - a.length)) {
    const pattern = new RegExp(`(^|[^a-z0-9])${manager}([^a-z0-9]|$)`)
    if (pattern.test(lower)) return manager
  }
  return null
}

function detectPackageManagerFromCommands(commands) {
  for (const command of Object.values(commands)) {
    if (typeof command !== 'string') continue
    const first = command.trim().split(/\s+/)[0]
    const normalized = normalizePackageManager(first)
    if (normalized) return normalized
  }
  return null
}

function collectRuntimeVersions(...objects) {
  const versions = {}
  const knownRuntimeKeys = new Set(['node', 'nodejs', 'python', 'go', 'java', 'rust', 'php', 'ruby'])

  function visit(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return

    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = key
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .toLowerCase()
      const runtimeName = normalizedKey
        .replace(/_?version$/, '')
        .replace(/^runtime_/, '')

      if (
        typeof child === 'string' &&
        (normalizedKey.endsWith('version') || knownRuntimeKeys.has(runtimeName))
      ) {
        const name = runtimeName === 'nodejs' ? 'node' : runtimeName
        if (knownRuntimeKeys.has(name) && !versions[name]) {
          versions[name] = child
        }
      } else if (child && typeof child === 'object') {
        visit(child)
      }
    }
  }

  for (const object of objects) visit(object)
  return versions
}

function normalizePort(value) {
  if (Number.isInteger(value) && value >= 1 && value <= 65535) return value
  if (typeof value === 'string') {
    const match = value.match(/\b([1-9][0-9]{1,4})\b/)
    if (match) {
      const port = Number.parseInt(match[1], 10)
      if (port >= 1 && port <= 65535) return port
    }
  }
  return null
}

function collectPort(info, commands, envVars) {
  const direct = normalizePort(
    info?.port ??
      info?.service_port ??
      info?.servicePort ??
      info?.deploy?.port ??
      info?.build_requirements?.port ??
      info?.buildRequirements?.port,
  )
  if (direct) return direct

  const envPort = normalizePort(envVars.PORT)
  if (envPort) return envPort

  for (const command of Object.values(commands)) {
    const commandPort = normalizePort(command)
    if (commandPort) return commandPort
  }

  return null
}

function categorizeCommand(label, command) {
  const combined = `${label || ''} ${command || ''}`.toLowerCase()
  if (combined.includes('install') || combined.includes('setup')) return 'install'
  if (combined.includes('build') || combined.includes('compile')) return 'build'
  if (
    combined.includes('start') ||
    combined.includes('serve') ||
    combined.includes('launch') ||
    combined.includes('deploy') ||
    /^node\s+\S+/.test((command || '').trim())
  ) {
    return 'start'
  }
  return null
}

function collectCommands(info, plan) {
  const commands = {
    install: firstString(info?.install_command, info?.installCommand),
    build: firstString(info?.build_command, info?.buildCommand),
    start: firstString(info?.start_command, info?.startCommand),
  }

  function visit(value, label = '') {
    if (!value || typeof value !== 'object') return

    if (!Array.isArray(value)) {
      const command = firstString(value.command, value.cmd, value.run)
      if (command) {
        const category = categorizeCommand(
          firstString(value.type, value.name, value.phase, value.stage, label),
          command,
        )
        if (category && !commands[category]) {
          commands[category] = command
        }
      }
    }

    if (Array.isArray(value)) {
      for (const child of value) visit(child, label)
      return
    }

    for (const [key, child] of Object.entries(value)) {
      visit(child, key)
    }
  }

  visit(plan)

  return Object.fromEntries(
    Object.entries(commands).filter(([, value]) => typeof value === 'string' && value.trim()),
  )
}

function collectSystemPackages(...objects) {
  const keys = new Set([
    'system_packages',
    'systemPackages',
    'apt_packages',
    'aptPackages',
    'build_apt_packages',
    'deploy_apt_packages',
  ])
  const packages = []

  function visit(value, key = '') {
    if (!value || typeof value !== 'object') return
    if (keys.has(key)) {
      packages.push(...stringList(value))
      return
    }
    if (Array.isArray(value)) {
      for (const child of value) visit(child, key)
      return
    }
    for (const [childKey, child] of Object.entries(value)) {
      visit(child, childKey)
    }
  }

  for (const object of objects) visit(object)
  return [...new Set(packages)]
}

function collectEnvVars(...objects) {
  const envVars = {}

  function addEnvObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    for (const [key, child] of Object.entries(value)) {
      if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue
      if (child === null || child === undefined) {
        envVars[key] = ''
      } else if (typeof child === 'string' || typeof child === 'number' || typeof child === 'boolean') {
        envVars[key] = String(child)
      } else {
        envVars[key] = JSON.stringify(child)
      }
    }
  }

  function visit(value, key = '') {
    if (!value || typeof value !== 'object') return
    if (['env', 'env_vars', 'envVars', 'environment', 'environmentVariables'].includes(key)) {
      addEnvObject(value)
      return
    }
    if (Array.isArray(value)) {
      for (const child of value) visit(child, key)
      return
    }
    for (const [childKey, child] of Object.entries(value)) {
      visit(child, childKey)
    }
  }

  for (const object of objects) visit(object)
  return envVars
}

function collectConfigOverrides(config) {
  if (!config || typeof config !== 'object') return []
  const overrides = []
  for (const [configKey, targetKey] of Object.entries(CONFIG_OVERRIDE_MAP)) {
    if (hasOwn(config, configKey)) overrides.push(targetKey)
  }
  return [...new Set(overrides)]
}

function normalizeRailpackData({ info, plan, evidencePaths, config }) {
  const commands = collectCommands(info, plan)
  const envVars = collectEnvVars(info, plan)
  const runtimeVersions = collectRuntimeVersions(
    info?.runtime_versions,
    info?.runtimeVersions,
    info?.build_requirements,
    info?.buildRequirements,
    info,
    plan,
  )
  const packageManager = normalizePackageManager(
    firstString(info?.package_manager, info?.packageManager, info?.manager),
  ) || detectPackageManagerFromCommands(commands)

  const providers = stringList(
    info?.detectedProviders ||
      info?.detected_providers ||
      info?.providers ||
      plan?.detectedProviders ||
      plan?.providers,
  )

  const summary = {
    source: 'railpack',
    status: 'detected',
    project_type: firstString(info?.project_type, info?.projectType, info?.type),
    providers,
    runtime_versions: runtimeVersions,
    package_manager: packageManager,
    port: collectPort(info, commands, envVars),
    install_command: commands.install || null,
    build_command: commands.build || null,
    start_command: commands.start || null,
    system_packages: collectSystemPackages(info, plan),
    env_vars: envVars,
    confidence: 'medium',
    evidence_paths: evidencePaths,
    config_overrides: collectConfigOverrides(config),
  }

  const strongSignals = [
    summary.project_type,
    summary.package_manager,
    summary.install_command,
    summary.build_command,
    summary.start_command,
    summary.providers.length > 0,
    Object.keys(summary.runtime_versions).length > 0,
  ].filter(Boolean)

  summary.confidence = strongSignals.length >= 2 ? 'high' : 'medium'

  return compactSummary(summary)
}

function compactSummary(summary) {
  const result = {}
  for (const [key, value] of Object.entries(summary)) {
    if (value === null || value === undefined) continue
    if (Array.isArray(value) && value.length === 0) continue
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    ) {
      continue
    }
    result[key] = value
  }
  return result
}

function skippedSummary(reason) {
  return {
    source: 'railpack',
    status: 'skipped',
    reason,
    confidence: 'low',
    evidence_paths: [],
  }
}

function failedSummary(reason, evidencePaths = []) {
  return {
    source: 'railpack',
    status: 'failed',
    reason,
    confidence: 'low',
    evidence_paths: evidencePaths,
  }
}

function updateAnalysis(analysisPath, buildEnvironment) {
  if (!analysisPath || !fs.existsSync(analysisPath)) return false
  const analysis = readJsonIfExists(analysisPath)
  analysis.build_environment = buildEnvironment
  writeJson(analysisPath, analysis)
  return true
}

function runRailpackProbe({ workDir, railpackBin, config }) {
  const sealosDir = path.join(workDir, '.sealos')
  const infoPath = path.join(sealosDir, 'railpack-info.json')
  const planPath = path.join(sealosDir, 'railpack-plan.json')

  fs.mkdirSync(sealosDir, { recursive: true })
  for (const outputPath of [infoPath, planPath]) {
    try {
      fs.rmSync(outputPath, { force: true })
    } catch {
      // Stale Railpack evidence should never influence a new probe.
    }
  }

  const versionResult = runCommand(railpackBin, ['--version'], workDir)
  if (isMissingCommand(versionResult)) {
    return {
      summary: skippedSummary('railpack binary is not available'),
      infoPath,
      planPath,
    }
  }

  const prepare = runCommand(railpackBin, [
    'prepare',
    '--hide-pretty-plan',
    '--plan-out',
    planPath,
    '--info-out',
    infoPath,
    workDir,
  ], workDir)

  if (!prepare.ok) {
    const info = runCommand(railpackBin, [
      'info',
      '--format',
      'json',
      '--out',
      infoPath,
      workDir,
    ], workDir)
    const plan = runCommand(railpackBin, [
      'plan',
      '--out',
      planPath,
      workDir,
    ], workDir)

    if (!info.ok && !plan.ok) {
      return {
        summary: failedSummary(
          `railpack prepare failed: ${commandSummary(prepare)}`,
          existingEvidencePaths(infoPath, planPath),
        ),
        infoPath,
        planPath,
      }
    }
  }

  let infoData = null
  let planData = null
  try {
    infoData = readJsonIfExists(infoPath)
    planData = readJsonIfExists(planPath)
  } catch (error) {
    return {
      summary: failedSummary(
        `railpack output was not valid JSON: ${error.message}`,
        existingEvidencePaths(infoPath, planPath),
      ),
      infoPath,
      planPath,
    }
  }

  if (!infoData && !planData) {
    return {
      summary: failedSummary('railpack did not produce info or plan output'),
      infoPath,
      planPath,
    }
  }

  return {
    summary: normalizeRailpackData({
      info: infoData || {},
      plan: planData || {},
      evidencePaths: existingEvidencePaths(infoPath, planPath),
      config,
    }),
    infoPath,
    planPath,
  }
}

function existingEvidencePaths(infoPath, planPath) {
  return [
    fs.existsSync(infoPath) ? '.sealos/railpack-info.json' : null,
    fs.existsSync(planPath) ? '.sealos/railpack-plan.json' : null,
  ].filter(Boolean)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2))
  if (!args.workDir) {
    printAndExit({
      valid: false,
      error: 'Usage: node run-railpack-probe.mjs --work-dir <dir> [--analysis <analysis.json>] [--config <config.json>] [--railpack-bin railpack]',
    }, 1)
  }

  const workDir = path.resolve(args.workDir)
  if (!fs.existsSync(workDir) || !fs.statSync(workDir).isDirectory()) {
    printAndExit({ valid: false, error: `Work directory not found: ${workDir}` }, 1)
  }

  let config = null
  try {
    config = readJsonIfExists(args.config || path.join(workDir, '.sealos', 'config.json'))
  } catch (error) {
    printAndExit({ valid: false, error: `Invalid config JSON: ${error.message}` }, 1)
  }

  const result = runRailpackProbe({
    workDir,
    railpackBin: args.railpackBin,
    config,
  })

  const analysisUpdated = updateAnalysis(args.analysis, result.summary)

  printAndExit({
    build_environment: result.summary,
    analysis_updated: analysisUpdated,
    artifacts: {
      railpack_info: fs.existsSync(result.infoPath) ? result.infoPath : null,
      railpack_plan: fs.existsSync(result.planPath) ? result.planPath : null,
    },
  })
}

export {
  normalizeRailpackData,
  runRailpackProbe,
}
