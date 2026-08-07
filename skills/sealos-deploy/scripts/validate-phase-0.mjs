#!/usr/bin/env node

/**
 * Validate Phase 0 outputs for sealos-deploy.
 *
 * Usage:
 *   node scripts/validate-phase-0.mjs --dir <work-dir>
 */

import fs from 'fs'
import path from 'path'

const ALLOWED_KEYS = new Set([
  'runtime_profile',
  'work_dir',
  'repo_name',
  'github_url',
])

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
    fail('P0-V00', `unknown argument: ${arg}`)
  }
  if (!dir) {
    fail('P0-V00', 'usage: node validate-phase-0.mjs --dir <work-dir>')
  }
  return { dir: path.resolve(dir) }
}

function expectedRuntimeProfile() {
  return process.env.SEALAI_DEPLOY_TASK_ID ? 'sandbox' : 'local'
}

function main() {
  const { dir } = parseArgs(process.argv.slice(2))
  const analysisPath = path.join(dir, '.sealos', 'analysis.json')

  if (!fs.existsSync(analysisPath)) {
    fail('P0-V01', `.sealos/analysis.json is missing under ${dir}`)
  }

  let data
  try {
    data = JSON.parse(fs.readFileSync(analysisPath, 'utf8'))
  } catch (error) {
    fail('P0-V01', `invalid JSON in analysis.json: ${error.message}`)
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fail('P0-V01', 'analysis.json must be a JSON object')
  }

  const keys = Object.keys(data)
  const unexpected = keys.filter((key) => !ALLOWED_KEYS.has(key))
  const missing = [...ALLOWED_KEYS].filter((key) => !Object.prototype.hasOwnProperty.call(data, key))
  if (unexpected.length > 0 || missing.length > 0) {
    fail(
      'P0-V01',
      `analysis.json must contain only ${[...ALLOWED_KEYS].join(', ')}; missing=[${missing.join(', ')}] unexpected=[${unexpected.join(', ')}]`,
    )
  }

  const expectedProfile = expectedRuntimeProfile()
  if (data.runtime_profile !== 'local' && data.runtime_profile !== 'sandbox') {
    fail('P0-V02', `runtime_profile must be local|sandbox, got ${JSON.stringify(data.runtime_profile)}`)
  }
  if (data.runtime_profile !== expectedProfile) {
    fail(
      'P0-V02',
      `runtime_profile=${JSON.stringify(data.runtime_profile)} does not match SEALAI_DEPLOY_TASK_ID rule (expected ${expectedProfile})`,
    )
  }

  if (typeof data.work_dir !== 'string' || !data.work_dir.trim()) {
    fail('P0-V03', 'work_dir must be a non-empty string')
  }
  if (!path.isAbsolute(data.work_dir)) {
    fail('P0-V03', `work_dir must be absolute, got ${JSON.stringify(data.work_dir)}`)
  }
  if (!fs.existsSync(data.work_dir) || !fs.statSync(data.work_dir).isDirectory()) {
    fail('P0-V03', `work_dir does not exist or is not a directory: ${data.work_dir}`)
  }

  if (typeof data.repo_name !== 'string' || !data.repo_name.trim()) {
    fail('P0-V01', 'repo_name must be a non-empty string')
  }
  if (!(typeof data.github_url === 'string' || data.github_url === null)) {
    fail('P0-V01', 'github_url must be a string or null')
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    checks: ['P0-V01', 'P0-V02', 'P0-V03'],
    analysis_path: analysisPath,
    runtime_profile: data.runtime_profile,
    work_dir: data.work_dir,
  }, null, 2)}\n`)
}

main()
