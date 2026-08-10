#!/usr/bin/env node

/**
 * Validate Phase 6 outputs for sealos-deploy.
 *
 * Usage:
 *   node scripts/validate-phase-6.mjs --dir <work-dir>
 */

import fs from 'fs'
import path from 'path'

function fail(code, message) {
  process.stderr.write(`${code}: ${message}\n`)
  process.exit(1)
}

function parseArgs(argv) {
  let dir = null
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dir') {
      dir = argv[i + 1]
      i += 1
      continue
    }
    if (arg.startsWith('--dir=')) {
      dir = arg.slice('--dir='.length)
      continue
    }
    fail('P6-V00', `unknown argument: ${arg}`)
  }
  if (!dir) {
    fail('P6-V00', 'usage: node validate-phase-6.mjs --dir <work-dir>')
  }
  return { dir: path.resolve(dir) }
}

function readJson(filePath, code, label) {
  if (!fs.existsSync(filePath)) {
    fail(code, `${label} is missing`)
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    fail(code, `invalid JSON in ${label}: ${error.message}`)
  }
}

function main() {
  const { dir } = parseArgs(process.argv.slice(2))
  const preparePath = path.join(dir, '.sealos', 'phase-5', 'prepare-result.json')
  const deployPath = path.join(dir, '.sealos', 'phase-6', 'deploy-result.json')

  const prepare = readJson(preparePath, 'P6-V02', '.sealos/phase-5/prepare-result.json')
  if (!prepare || typeof prepare !== 'object' || Array.isArray(prepare)) {
    fail('P6-V02', 'prepare-result.json must be a JSON object')
  }
  if (typeof prepare.template_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(prepare.template_sha256)) {
    fail('P6-V02', 'prepare-result template_sha256 must be a lowercase 64-char hex digest')
  }

  const deploy = readJson(deployPath, 'P6-V01', '.sealos/phase-6/deploy-result.json')
  if (!deploy || typeof deploy !== 'object' || Array.isArray(deploy)) {
    fail('P6-V01', 'deploy-result.json must be a JSON object')
  }

  if (typeof deploy.template_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(deploy.template_sha256)) {
    fail('P6-V01', 'template_sha256 must be a lowercase 64-char hex digest')
  }
  if (typeof deploy.app_name !== 'string') {
    fail('P6-V01', 'app_name must be a string')
  }

  // Reject unexpected keys (schema additionalProperties: false).
  const allowed = new Set(['template_sha256', 'app_name'])
  for (const key of Object.keys(deploy)) {
    if (!allowed.has(key)) {
      fail('P6-V01', `unexpected field: ${key}`)
    }
  }

  if (deploy.template_sha256 !== prepare.template_sha256) {
    fail(
      'P6-V02',
      `template_sha256 mismatch: deploy-result has ${deploy.template_sha256}, prepare-result has ${prepare.template_sha256}`,
    )
  }

  if (deploy.app_name.trim() === '') {
    fail('P6-V03', 'app_name must be non-empty')
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    checks: ['P6-V01', 'P6-V02', 'P6-V03'],
    template_sha256: deploy.template_sha256,
    app_name: deploy.app_name,
  }, null, 2)}\n`)
}

main()
