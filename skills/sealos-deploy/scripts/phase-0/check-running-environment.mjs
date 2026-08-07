#!/usr/bin/env node

/**
 * Phase 0 environment probe. Detect only — never install.
 *
 * Usage:
 *   node scripts/phase-0/check-running-environment.mjs
 *
 * Prints JSON:
 *   {
 *     "runtime_profile": "local" | "sandbox",
 *     "present": ["git", ...],
 *     "missing": ["helm", ...],
 *     "warnings": [{ "id": "gh-auth", "message": "..." }],
 *     "details": { "git": { "ok": true, "version": "..." }, ... }
 *   }
 */

import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  })
}

function commandExists(name) {
  const result = run(process.platform === 'win32' ? 'where' : 'which', [name])
  return result.status === 0
}

function firstLine(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || null
}

function parseSemverMajorMinor(versionText) {
  const match = String(versionText || '').match(/(\d+)\.(\d+)/)
  if (!match) return null
  return { major: Number(match[1]), minor: Number(match[2]) }
}

function checkBinary(id, command, args, { minMajor = null, minMinor = 0 } = {}) {
  if (!commandExists(command)) {
    return { id, ok: false, reason: 'missing' }
  }
  const result = run(command, args)
  if (result.status !== 0) {
    return { id, ok: false, reason: 'failed', stderr: firstLine(result.stderr) }
  }
  const version = firstLine(result.stdout) || firstLine(result.stderr)
  if (minMajor != null) {
    const parsed = parseSemverMajorMinor(version)
    if (!parsed || parsed.major < minMajor || (parsed.major === minMajor && parsed.minor < minMinor)) {
      return { id, ok: false, reason: 'version_too_low', version, required: `${minMajor}.${minMinor}+` }
    }
  }
  return { id, ok: true, version }
}

function checkPython() {
  const candidates = ['python3', 'python']
  for (const command of candidates) {
    if (!commandExists(command)) continue
    const versionResult = run(command, ['--version'])
    if (versionResult.status !== 0) continue
    const version = firstLine(versionResult.stdout) || firstLine(versionResult.stderr)
    const parsed = parseSemverMajorMinor(version)
    if (!parsed || parsed.major < 3 || (parsed.major === 3 && parsed.minor < 8)) {
      return { id: 'python', ok: false, reason: 'version_too_low', version, required: '3.8+', command }
    }

    const yamlResult = run(command, ['-c', 'import yaml'])
    if (yamlResult.status !== 0) {
      return { id: 'python', ok: true, version, command, pyyaml: false }
    }
    return { id: 'python', ok: true, version, command, pyyaml: true }
  }
  return { id: 'python', ok: false, reason: 'missing' }
}

function checkGitingest() {
  if (commandExists('gitingest')) {
    const result = run('gitingest', ['--help'])
    return {
      id: 'gitingest',
      ok: result.status === 0,
      reason: result.status === 0 ? undefined : 'failed',
    }
  }
  const py = checkPython()
  if (!py.ok || !py.command) {
    return { id: 'gitingest', ok: false, reason: 'missing' }
  }
  const result = run(py.command, ['-c', 'import gitingest'])
  return {
    id: 'gitingest',
    ok: result.status === 0,
    reason: result.status === 0 ? undefined : 'missing',
  }
}

function checkDockerDaemon() {
  if (!commandExists('docker')) {
    return { id: 'docker_daemon', ok: false, reason: 'docker_missing' }
  }
  const result = run('docker', ['info'])
  return {
    id: 'docker_daemon',
    ok: result.status === 0,
    reason: result.status === 0 ? undefined : 'daemon_not_running',
  }
}

function checkKubectl() {
  const pathHit = checkBinary('kubectl', 'kubectl', ['version', '--client'])
  if (pathHit.ok) return pathHit
  const fallback = path.join(os.homedir(), '.agents', 'bin', 'kubectl')
  if (!fs.existsSync(fallback)) {
    return pathHit
  }
  const result = run(fallback, ['version', '--client'])
  if (result.status !== 0) {
    return { id: 'kubectl', ok: false, reason: 'failed', path: fallback }
  }
  return {
    id: 'kubectl',
    ok: true,
    version: firstLine(result.stdout) || firstLine(result.stderr),
    path: fallback,
  }
}

function checkGhAuthWarning() {
  if (!commandExists('gh')) {
    return null
  }
  const status = run('gh', ['auth', 'status'])
  if (status.status !== 0) {
    return {
      id: 'gh-auth',
      message: 'gh is installed but not logged in. Required only when this run pushes to GHCR.',
    }
  }
  const token = run('gh', ['auth', 'token'], { env: process.env })
  if (token.status !== 0 || !String(token.stdout || '').trim()) {
    return {
      id: 'gh-auth',
      message: 'gh has no usable token. Required only when this run pushes to GHCR.',
    }
  }
  // Scope probe is best-effort; missing write:packages is a warning until GHCR push.
  const scopes = run('gh', ['auth', 'status'], { env: { ...process.env, GH_PROMPT_DISABLED: '1' } })
  const text = `${scopes.stdout || ''}\n${scopes.stderr || ''}`
  if (/write:packages/i.test(text) === false && /Token scopes/i.test(text)) {
    return {
      id: 'gh-write-packages',
      message: 'gh may lack write:packages. Required only when this run pushes to GHCR.',
    }
  }
  return null
}

function resolveRuntimeProfile() {
  return process.env.SEALAI_DEPLOY_TASK_ID ? 'sandbox' : 'local'
}

function main() {
  const runtime_profile = resolveRuntimeProfile()
  const sharedChecks = [
    checkBinary('git', 'git', ['--version']),
    checkBinary('node', 'node', ['--version'], { minMajor: 18 }),
    checkPython(),
    checkGitingest(),
    checkBinary('kompose', 'kompose', ['version']),
    checkBinary('helm', 'helm', ['version', '--short'], { minMajor: 3 }),
    checkKubectl(),
    checkBinary('curl', 'curl', ['--version']),
    checkBinary('jq', 'jq', ['--version']),
  ]

  const localOnlyChecks = [
    checkBinary('gh', 'gh', ['--version']),
    checkBinary('docker', 'docker', ['--version']),
    checkDockerDaemon(),
    checkBinary('docker_buildx', 'docker', ['buildx', 'version']),
    checkBinary('railpack', 'railpack', ['--help']),
  ]

  const checks = runtime_profile === 'local'
    ? [...sharedChecks, ...localOnlyChecks]
    : sharedChecks

  // PyYAML is required alongside Python.
  const python = checks.find((item) => item.id === 'python')
  if (python?.ok && python.pyyaml === false) {
    checks.push({ id: 'pyyaml', ok: false, reason: 'missing' })
  } else if (python?.ok && python.pyyaml === true) {
    checks.push({ id: 'pyyaml', ok: true })
  } else {
    checks.push({ id: 'pyyaml', ok: false, reason: python?.ok === false ? python.reason : 'python_missing' })
  }

  const details = {}
  const present = []
  const missing = []
  for (const check of checks) {
    details[check.id] = check
    if (check.ok) present.push(check.id)
    else missing.push(check.id)
  }

  const warnings = []
  if (runtime_profile === 'local') {
    const ghWarning = checkGhAuthWarning()
    if (ghWarning) warnings.push(ghWarning)
  }

  const result = {
    runtime_profile,
    present,
    missing,
    warnings,
    details,
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  process.exit(0)
}

main()
