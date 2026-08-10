#!/usr/bin/env node

/**
 * Validate Phase 3 outputs for sealos-deploy.
 *
 * Usage:
 *   node scripts/validate-phase-3.mjs --dir <work-dir>
 *
 * When analysis.json has no build_result pointer, exits 0 with skipped=true.
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
    fail('P3-V00', `unknown argument: ${arg}`)
  }
  if (!dir) {
    fail('P3-V00', 'usage: node validate-phase-3.mjs --dir <work-dir>')
  }
  return { dir: path.resolve(dir) }
}

function ghcrOwner(imageRef) {
  const match = /^ghcr\.io\/([^/]+)\//i.exec(imageRef)
  return match ? match[1] : null
}

function main() {
  const { dir } = parseArgs(process.argv.slice(2))
  const analysisPath = path.join(dir, '.sealos', 'analysis.json')

  if (!fs.existsSync(analysisPath)) {
    fail('P3-V00', `.sealos/analysis.json is missing under ${dir}`)
  }

  let analysis
  try {
    analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'))
  } catch (error) {
    fail('P3-V00', `invalid JSON in analysis.json: ${error.message}`)
  }

  if (!analysis.build_result) {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'no build_result pointer (Phase 3 had no build targets)',
    }, null, 2)}\n`)
    return
  }

  if (analysis.build_result !== '.sealos/phase-3/build-result.json') {
    fail(
      'P3-V00',
      `build_result must be .sealos/phase-3/build-result.json, got ${JSON.stringify(analysis.build_result)}`,
    )
  }

  const resultPath = path.join(dir, '.sealos', 'phase-3', 'build-result.json')
  if (!fs.existsSync(resultPath)) {
    fail('P3-V00', `.sealos/phase-3/build-result.json is missing`)
  }

  let data
  try {
    data = JSON.parse(fs.readFileSync(resultPath, 'utf8'))
  } catch (error) {
    fail('P3-V00', `invalid JSON in build-result.json: ${error.message}`)
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fail('P3-V00', 'build-result.json must be a JSON object')
  }
  if (!data.pushed || typeof data.pushed !== 'object' || Array.isArray(data.pushed)) {
    fail('P3-V00', 'pushed must be an object')
  }

  const keys = Object.keys(data.pushed)
  if (keys.length === 0) {
    fail('P3-V00', 'pushed must contain at least one image')
  }

  const pullAccess = data.pull_access && typeof data.pull_access === 'object' && !Array.isArray(data.pull_access)
    ? data.pull_access
    : null

  let ghcrNamespace = null
  for (const key of keys) {
    const image = data.pushed[key]
    if (typeof image !== 'string' || !image.trim()) {
      fail('P3-V03', `pushed.${key} must be a non-empty tag ref`)
    }
    if (image.includes('@')) {
      fail('P3-V03', `pushed.${key} must be a tag ref without @sha256 digest`)
    }

    const owner = ghcrOwner(image)
    if (owner) {
      if (owner !== owner.toLowerCase()) {
        fail('P3-V01', `GHCR owner must be lowercase in pushed.${key}: ${owner}`)
      }
      if (ghcrNamespace === null) {
        ghcrNamespace = owner
      } else if (ghcrNamespace !== owner) {
        fail('P3-V02', `mixed GHCR namespaces: ${ghcrNamespace} vs ${owner}`)
      }
    }

    if (!pullAccess || !Object.prototype.hasOwnProperty.call(pullAccess, key)) {
      fail('P3-V04', `pull_access missing for pushed key ${key}`)
    }
    const access = pullAccess[key]
    if (access !== 'public' && access !== 'ghcr_secret_required') {
      fail('P3-V04', `pull_access.${key} must be public|ghcr_secret_required`)
    }
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    checks: ['P3-V01', 'P3-V02', 'P3-V03', 'P3-V04'],
    build_result: analysis.build_result,
    services: keys,
  }, null, 2)}\n`)
}

main()
