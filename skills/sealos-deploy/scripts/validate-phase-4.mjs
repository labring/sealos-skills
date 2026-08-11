#!/usr/bin/env node

/**
 * Validate Phase 4 outputs for sealos-deploy.
 *
 * Usage:
 *   node scripts/validate-phase-4.mjs --dir <work-dir>
 *
 * Set SEALOS_VALIDATE_PHASE_4_SKIP_GATE=1 to skip P4-V04 (unit tests).
 */

import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIGEST_RE = /^.+@sha256:[a-fA-F0-9]{64}$/
const IMAGE_LINE_RE = /^\s*(?:-\s*)?(?:image|originImageName):\s*["']?([^\s"'#]+)/gm
const DEPLOY_GATE_ONLY = [
  'R001', 'R002', 'R003', 'R004', 'R005', 'R006', 'R008', 'R009', 'R010', 'R011',
  'R012', 'R015', 'R017', 'R019', 'R020', 'R026', 'R028', 'R032', 'R033', 'R034',
  'R035', 'R039', 'R045', 'R048', 'R051', 'R052',
].join(',')

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
    fail('P4-V00', `unknown argument: ${arg}`)
  }
  if (!dir) {
    fail('P4-V00', 'usage: node validate-phase-4.mjs --dir <work-dir>')
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

function collectTemplateImages(templateText) {
  const images = []
  IMAGE_LINE_RE.lastIndex = 0
  let match
  while ((match = IMAGE_LINE_RE.exec(templateText)) !== null) {
    const value = match[1]
    if (!value || value.includes('${{')) continue
    images.push(value)
  }
  return images
}

function runDeployGate(templatePath) {
  if (process.env.SEALOS_VALIDATE_PHASE_4_SKIP_GATE === '1') {
    return { skipped: true }
  }

  const skillRoot = path.resolve(__dirname, '..', '..', 'docker-to-sealos')
  const script = path.join(skillRoot, 'scripts', 'check-consistency.ts')
  if (!fs.existsSync(script)) {
    fail('P4-V04', `deploy-gate script missing: ${script}`)
  }

  const result = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      script,
      '--skill', path.join(skillRoot, 'SKILL.md'),
      '--references', path.join(skillRoot, 'references'),
      '--rules-file', path.join(skillRoot, 'references', 'rules-registry.yaml'),
      '--artifacts', templatePath,
      '--only', DEPLOY_GATE_ONLY,
    ],
    { encoding: 'utf8' },
  )

  if (result.error) {
    fail('P4-V04', `failed to run deploy gate: ${result.error.message}`)
  }
  if (result.status !== 0) {
    const detail = (result.stdout || result.stderr || '').trim()
    fail('P4-V04', `deploy gate failed${detail ? `: ${detail.split('\n')[0]}` : ''}`)
  }
  return { skipped: false }
}

function main() {
  const { dir } = parseArgs(process.argv.slice(2))
  const sealosDir = path.join(dir, '.sealos')
  const digestsPath = path.join(sealosDir, 'phase-4', 'image-digests.json')
  const templatePath = path.join(sealosDir, 'template', 'index.yaml')
  const resourceMapPath = path.join(sealosDir, 'phase-4', 'resource-map.json')
  const buildResultPath = path.join(sealosDir, 'phase-3', 'build-result.json')

  if (!fs.existsSync(templatePath)) {
    fail('P4-V00', `.sealos/template/index.yaml is missing`)
  }
  if (!fs.existsSync(resourceMapPath)) {
    fail('P4-V00', `.sealos/phase-4/resource-map.json is missing`)
  }

  const digestsDoc = readJson(digestsPath, 'P4-V00', 'image-digests.json')
  if (!digestsDoc.digests || typeof digestsDoc.digests !== 'object' || Array.isArray(digestsDoc.digests)) {
    fail('P4-V00', 'digests must be an object')
  }

  const digestEntries = Object.entries(digestsDoc.digests)
  if (digestEntries.length === 0) {
    fail('P4-V00', 'digests must contain at least one entry')
  }

  const digestValues = new Set()
  for (const [key, value] of digestEntries) {
    if (typeof value !== 'string' || !DIGEST_RE.test(value)) {
      fail('P4-V01', `digests.${key} must be repository@sha256:<64-hex>`)
    }
    digestValues.add(value)
  }

  const templateText = fs.readFileSync(templatePath, 'utf8')
  const templateImages = collectTemplateImages(templateText)
  if (templateImages.length === 0) {
    fail('P4-V02', 'template has no container image fields to check')
  }

  for (const image of templateImages) {
    if (!digestValues.has(image)) {
      fail('P4-V02', `template image ${image} is not in image-digests.json`)
    }
  }

  for (const digest of digestValues) {
    if (!templateText.includes(digest)) {
      fail('P4-V02', `digest ${digest} from image-digests.json is missing from template`)
    }
  }

  if (fs.existsSync(buildResultPath)) {
    const buildResult = readJson(buildResultPath, 'P4-V03', 'build-result.json')
    const pushed = buildResult.pushed && typeof buildResult.pushed === 'object' ? buildResult.pushed : null
    if (pushed) {
      for (const [key, image] of Object.entries(pushed)) {
        if (typeof image === 'string' && image.includes('@sha256:')) {
          fail('P4-V03', `build-result pushed.${key} must not contain @sha256 digest`)
        }
      }
    }
  }

  const gate = runDeployGate(templatePath)

  process.stdout.write(`${JSON.stringify({
    ok: true,
    checks: ['P4-V01', 'P4-V02', 'P4-V03', 'P4-V04'],
    digests: Object.keys(digestsDoc.digests),
    deploy_gate_skipped: gate.skipped,
  }, null, 2)}\n`)
}

main()
