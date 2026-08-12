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
// Single source of truth: the rule list lives next to the rules registry in
// docker-to-sealos so it cannot drift from the registry it selects from.
function readDeployGateRules() {
  const rulesPath = path.resolve(
    __dirname, '..', '..', 'docker-to-sealos', 'references', 'deploy-gate-rules.txt',
  )
  const text = fs.readFileSync(rulesPath, 'utf8').trim()
  if (!/^R\d+(,R\d+)*$/.test(text)) {
    throw new Error(`invalid deploy-gate rules file: ${rulesPath}`)
  }
  return text
}

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

  let deployGateRules
  try {
    deployGateRules = readDeployGateRules()
  } catch (error) {
    fail('P4-V04', error.message)
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
      '--only', deployGateRules,
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

// Fixed refs that the converter itself emits for readiness gates and init
// Jobs. They are deterministic (explicit version tags) and are not part of
// the compose image set, so the digest table does not cover them.
const CONVERTER_GATE_IMAGE_RE = /^(?:postgres:16\.4-alpine|mysql:8\.0\.40|redis:7\.2\.7-alpine|busybox:1\.36\.1)$/

function loadPinnedImageSet(sealosDir) {
  const resolutionPath = path.join(sealosDir, 'phase-4', 'image-resolution.json')
  const digestsPath = path.join(sealosDir, 'phase-4', 'image-digests.json')

  if (fs.existsSync(resolutionPath)) {
    const doc = readJson(resolutionPath, 'P4-V00', 'image-resolution.json')
    const images = doc.images && typeof doc.images === 'object' && !Array.isArray(doc.images)
      ? doc.images
      : null
    if (!images || Object.keys(images).length === 0) {
      fail('P4-V00', 'image-resolution.json images must be a non-empty object')
    }
    const values = new Set()
    for (const [key, entry] of Object.entries(images)) {
      const resolved = entry && typeof entry === 'object' ? entry.resolved : null
      if (typeof resolved !== 'string' || !DIGEST_RE.test(resolved)) {
        fail('P4-V01', `image-resolution images[${key}].resolved must be repository[:tag]@sha256:<64-hex>`)
      }
      values.add(resolved)
    }
    return { values, source: 'image-resolution.json' }
  }

  const digestsDoc = readJson(digestsPath, 'P4-V00', 'image-digests.json or image-resolution.json')
  if (!digestsDoc.digests || typeof digestsDoc.digests !== 'object' || Array.isArray(digestsDoc.digests)) {
    fail('P4-V00', 'digests must be an object')
  }
  const digestEntries = Object.entries(digestsDoc.digests)
  if (digestEntries.length === 0) {
    fail('P4-V00', 'digests must contain at least one entry')
  }
  const values = new Set()
  for (const [key, value] of digestEntries) {
    if (typeof value !== 'string' || !DIGEST_RE.test(value)) {
      fail('P4-V01', `digests.${key} must be repository[:tag]@sha256:<64-hex>`)
    }
    values.add(value)
  }
  return { values, source: 'image-digests.json' }
}

function main() {
  const { dir } = parseArgs(process.argv.slice(2))
  const sealosDir = path.join(dir, '.sealos')
  const templatePath = path.join(sealosDir, 'template', 'index.yaml')
  const resourceMapPath = path.join(sealosDir, 'phase-4', 'resource-map.json')
  const buildResultPath = path.join(sealosDir, 'phase-3', 'build-result.json')

  if (!fs.existsSync(templatePath)) {
    fail('P4-V00', `.sealos/template/index.yaml is missing`)
  }
  if (!fs.existsSync(resourceMapPath)) {
    fail('P4-V00', `.sealos/phase-4/resource-map.json is missing`)
  }

  const pinned = loadPinnedImageSet(sealosDir)

  const templateText = fs.readFileSync(templatePath, 'utf8')
  const templateImages = collectTemplateImages(templateText)
  if (templateImages.length === 0) {
    fail('P4-V02', 'template has no container image fields to check')
  }

  // Every template image must be digest-pinned via the resolution table.
  // Converter-emitted gate/init images use fixed explicit version tags.
  // Extra table entries are expected: KubeBlocks replaces database service
  // images, so the table (from the compose) is a superset of the template.
  for (const image of templateImages) {
    if (pinned.values.has(image)) continue
    if (CONVERTER_GATE_IMAGE_RE.test(image)) continue
    fail('P4-V02', `template image ${image} is not in ${pinned.source}`)
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
    pinned_source: pinned.source,
    pinned_count: pinned.values.size,
    deploy_gate_skipped: gate.skipped,
  }, null, 2)}\n`)
}

main()
