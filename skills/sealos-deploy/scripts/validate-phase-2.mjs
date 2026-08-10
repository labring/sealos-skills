#!/usr/bin/env node

/**
 * Validate Phase 2 outputs for sealos-deploy.
 *
 * Usage:
 *   node scripts/validate-phase-2.mjs --dir <work-dir>
 */

import fs from 'fs'
import path from 'path'

const COMPOSE_SOURCE = '.sealos/phase-2/docker-compose.yml'

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
    fail('P2-V00', `unknown argument: ${arg}`)
  }
  if (!dir) {
    fail('P2-V00', 'usage: node validate-phase-2.mjs --dir <work-dir>')
  }
  return { dir: path.resolve(dir) }
}

function resolveUnderWorkDir(workDir, relativePath) {
  const normalized = relativePath.replace(/^\.\//, '')
  const absolute = path.resolve(workDir, normalized)
  const rel = path.relative(workDir, absolute)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return null
  }
  return absolute
}

function isComposeBasename(filePath) {
  const base = path.basename(filePath).toLowerCase()
  return base === 'docker-compose.yml'
    || base === 'docker-compose.yaml'
    || base === 'compose.yml'
    || base === 'compose.yaml'
}

function main() {
  const { dir } = parseArgs(process.argv.slice(2))
  const analysisPath = path.join(dir, '.sealos', 'analysis.json')
  const planPath = path.join(dir, '.sealos', 'phase-2', 'deployment-plan.json')

  if (!fs.existsSync(analysisPath)) {
    fail('P2-V03', `.sealos/analysis.json is missing under ${dir}`)
  }

  let analysis
  try {
    analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'))
  } catch (error) {
    fail('P2-V03', `invalid JSON in analysis.json: ${error.message}`)
  }

  if (!Object.prototype.hasOwnProperty.call(analysis, 'official_template')) {
    fail('P2-V03', 'official_template missing from analysis.json (Phase 1 field not preserved)')
  }

  if (analysis.deployment_plan !== '.sealos/phase-2/deployment-plan.json') {
    fail(
      'P2-V01',
      `analysis.json deployment_plan must be .sealos/phase-2/deployment-plan.json, got ${JSON.stringify(analysis.deployment_plan)}`,
    )
  }

  if (!fs.existsSync(planPath)) {
    fail('P2-V01', `.sealos/phase-2/deployment-plan.json is missing`)
  }

  let plan
  try {
    plan = JSON.parse(fs.readFileSync(planPath, 'utf8'))
  } catch (error) {
    fail('P2-V01', `invalid JSON in deployment-plan.json: ${error.message}`)
  }

  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    fail('P2-V01', 'deployment-plan.json must be a JSON object')
  }

  const source = plan.deployment_source
  if (typeof source !== 'string' || !source.trim()) {
    fail('P2-V01', 'deployment_source must be a non-empty string')
  }

  const absoluteSource = resolveUnderWorkDir(dir, source)
  if (!absoluteSource) {
    fail('P2-V02', `deployment_source must stay under work_dir, got ${JSON.stringify(source)}`)
  }
  if (!fs.existsSync(absoluteSource)) {
    fail('P2-V02', `deployment_source path does not exist: ${source}`)
  }

  const normalizedSource = source.replace(/^\.\//, '')
  if (isComposeBasename(absoluteSource) && normalizedSource !== COMPOSE_SOURCE) {
    fail(
      'P2-V04',
      `Compose deployment_source must be ${COMPOSE_SOURCE}, got ${JSON.stringify(source)}`,
    )
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    checks: ['P2-V01', 'P2-V02', 'P2-V03', 'P2-V04'],
    analysis_path: analysisPath,
    deployment_plan: analysis.deployment_plan,
    deployment_source: source,
  }, null, 2)}\n`)
}

main()
