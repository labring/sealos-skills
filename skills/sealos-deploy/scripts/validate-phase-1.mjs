#!/usr/bin/env node

/**
 * Validate Phase 1 outputs for sealos-deploy.
 *
 * Usage:
 *   node scripts/validate-phase-1.mjs --dir <work-dir>
 */

import fs from 'fs'
import path from 'path'

const PHASE0_KEYS = ['runtime_profile', 'work_dir', 'repo_name', 'github_url']
const OFFICIAL_TEMPLATE_RE =
  /^https:\/\/raw\.githubusercontent\.com\/labring-actions\/templates\/[^/]+\/template\/[^/]+\/index\.yaml$/

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
    fail('P1-V00', `unknown argument: ${arg}`)
  }
  if (!dir) {
    fail('P1-V00', 'usage: node validate-phase-1.mjs --dir <work-dir>')
  }
  return { dir: path.resolve(dir) }
}

function main() {
  const { dir } = parseArgs(process.argv.slice(2))
  const analysisPath = path.join(dir, '.sealos', 'analysis.json')
  const templatePath = path.join(dir, '.sealos', 'template', 'index.yaml')

  if (!fs.existsSync(analysisPath)) {
    fail('P1-V02', `.sealos/analysis.json is missing under ${dir}`)
  }

  let data
  try {
    data = JSON.parse(fs.readFileSync(analysisPath, 'utf8'))
  } catch (error) {
    fail('P1-V02', `invalid JSON in analysis.json: ${error.message}`)
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fail('P1-V02', 'analysis.json must be a JSON object')
  }

  for (const key of PHASE0_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) {
      fail('P1-V02', `Phase 0 field missing: ${key}`)
    }
  }

  if (data.runtime_profile !== 'local' && data.runtime_profile !== 'sandbox') {
    fail('P1-V02', `runtime_profile must be local|sandbox, got ${JSON.stringify(data.runtime_profile)}`)
  }
  if (typeof data.work_dir !== 'string' || !data.work_dir.trim()) {
    fail('P1-V02', 'work_dir must be a non-empty string')
  }
  if (typeof data.repo_name !== 'string' || !data.repo_name.trim()) {
    fail('P1-V02', 'repo_name must be a non-empty string')
  }
  if (!(typeof data.github_url === 'string' || data.github_url === null)) {
    fail('P1-V02', 'github_url must be a string or null')
  }

  if (!Object.prototype.hasOwnProperty.call(data, 'official_template')) {
    fail('P1-V01', 'official_template is missing')
  }

  const official = data.official_template
  if (!(official === null || (typeof official === 'string' && OFFICIAL_TEMPLATE_RE.test(official)))) {
    fail(
      'P1-V01',
      `official_template must be null or a labring-actions raw URL, got ${JSON.stringify(official)}`,
    )
  }

  if (official !== null) {
    if (!fs.existsSync(templatePath)) {
      fail('P1-V03', `.sealos/template/index.yaml is missing while official_template is set`)
    }
    const body = fs.readFileSync(templatePath, 'utf8')
    if (!body.trim()) {
      fail('P1-V03', `.sealos/template/index.yaml is empty while official_template is set`)
    }
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    checks: ['P1-V01', 'P1-V02', 'P1-V03'],
    analysis_path: analysisPath,
    official_template: official,
  }, null, 2)}\n`)
}

main()
