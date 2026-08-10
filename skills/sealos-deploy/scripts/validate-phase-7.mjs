#!/usr/bin/env node

/**
 * Validate Phase 7 outputs for sealos-deploy.
 *
 * Usage:
 *   node scripts/validate-phase-7.mjs --dir <work-dir>
 */

import fs from 'fs'
import path from 'path'
import { validateArtifactFile } from './artifact-validator.mjs'

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
    fail('P7-V00', `unknown argument: ${arg}`)
  }
  if (!dir) {
    fail('P7-V00', 'usage: node validate-phase-7.mjs --dir <work-dir>')
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
  const deployPath = path.join(dir, '.sealos', 'phase-6', 'deploy-result.json')
  const statePath = path.join(dir, '.sealos', 'state.json')

  if (!fs.existsSync(statePath)) {
    fail('P7-V01', `.sealos/state.json is missing`)
  }

  const schemaResult = validateArtifactFile('state', statePath)
  if (!schemaResult.valid) {
    const detail = schemaResult.errors
      .map((entry) => `${entry.path}: ${entry.message}`)
      .join('; ')
    fail('P7-V01', `state.json schema validation failed: ${detail}`)
  }

  const deploy = readJson(deployPath, 'P7-V02', '.sealos/phase-6/deploy-result.json')
  if (!deploy || typeof deploy !== 'object' || Array.isArray(deploy)) {
    fail('P7-V02', 'deploy-result.json must be a JSON object')
  }
  if (typeof deploy.app_name !== 'string' || deploy.app_name.trim() === '') {
    fail('P7-V02', 'deploy-result app_name must be a non-empty string')
  }

  const state = readJson(statePath, 'P7-V01', '.sealos/state.json')
  const stateAppName = state?.last_deploy?.app_name
  if (typeof stateAppName !== 'string' || stateAppName.trim() === '') {
    fail('P7-V02', 'state.json last_deploy.app_name must be a non-empty string')
  }

  if (stateAppName !== deploy.app_name) {
    fail(
      'P7-V02',
      `app_name mismatch: state.json has ${stateAppName}, deploy-result has ${deploy.app_name}`,
    )
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    checks: ['P7-V01', 'P7-V02'],
    app_name: stateAppName,
  }, null, 2)}\n`)
}

main()
