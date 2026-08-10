#!/usr/bin/env node

/**
 * Validate Phase 5 outputs for sealos-deploy.
 *
 * Usage:
 *   node scripts/validate-phase-5.mjs --dir <work-dir>
 */

import crypto from 'crypto'
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
    fail('P5-V00', `unknown argument: ${arg}`)
  }
  if (!dir) {
    fail('P5-V00', 'usage: node validate-phase-5.mjs --dir <work-dir>')
  }
  return { dir: path.resolve(dir) }
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

function main() {
  const { dir } = parseArgs(process.argv.slice(2))
  const templatePath = path.join(dir, '.sealos', 'template', 'index.yaml')
  const preparePath = path.join(dir, '.sealos', 'phase-5', 'prepare-result.json')

  if (!fs.existsSync(templatePath)) {
    fail('P5-V01', `.sealos/template/index.yaml is missing`)
  }

  if (!fs.existsSync(preparePath)) {
    fail('P5-V02', `.sealos/phase-5/prepare-result.json is missing`)
  }

  let prepare
  try {
    prepare = JSON.parse(fs.readFileSync(preparePath, 'utf8'))
  } catch (error) {
    fail('P5-V02', `invalid JSON in prepare-result.json: ${error.message}`)
  }

  if (!prepare || typeof prepare !== 'object' || Array.isArray(prepare)) {
    fail('P5-V02', 'prepare-result.json must be a JSON object')
  }

  if (typeof prepare.template_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(prepare.template_sha256)) {
    fail('P5-V02', 'template_sha256 must be a lowercase 64-char hex digest')
  }
  if (prepare.dry_run !== 'passed') {
    fail('P5-V04', `dry_run must be "passed", got ${JSON.stringify(prepare.dry_run)}`)
  }
  if (prepare.user_confirmed !== true) {
    fail('P5-V04', 'user_confirmed must be true')
  }

  const actual = sha256File(templatePath)
  if (actual !== prepare.template_sha256) {
    fail(
      'P5-V03',
      `template_sha256 mismatch: prepare-result has ${prepare.template_sha256}, file is ${actual}`,
    )
  }

  // P5-V05: dry_run may only be "passed" after server-side dry-run. Schema + module
  // contract enforce this; validator rejects any other dry_run value above.
  if (prepare.dry_run !== 'passed') {
    fail('P5-V05', 'dry_run: "passed" required only after server-side dry-run')
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    checks: ['P5-V01', 'P5-V02', 'P5-V03', 'P5-V04', 'P5-V05'],
    template_sha256: prepare.template_sha256,
  }, null, 2)}\n`)
}

main()
