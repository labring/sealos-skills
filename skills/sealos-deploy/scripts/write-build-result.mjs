#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  validateArtifactData,
  validateProjectArtifacts,
} from './artifact-validator.mjs'

function usage () {
  return [
    'Usage:',
    '  node write-build-result.mjs --work-dir <dir> \\',
    '    --digest <service>=<repository@sha256:digest> \\',
    '    --pull-access <service>=<public|ghcr_secret_required>',
  ].join('\n')
}

function parsePair (value, option) {
  const index = value.indexOf('=')
  if (index < 1 || index === value.length - 1) throw new Error(`${option} must use service=value`)
  return [value.slice(0, index), value.slice(index + 1)]
}

export function parseArgs (args) {
  const parsed = { workDir: null, digests: {}, pullAccess: {} }
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index]
    if (option === '--work-dir') {
      const value = args[index + 1]
      if (!value || parsed.workDir) throw new Error(usage())
      parsed.workDir = path.resolve(value)
      index += 1
      continue
    }
    if (option === '--digest' || option === '--pull-access') {
      const value = args[index + 1]
      if (!value) throw new Error(usage())
      const [service, result] = parsePair(value, option)
      const destination = option === '--digest' ? parsed.digests : parsed.pullAccess
      if (Object.hasOwn(destination, service)) throw new Error(`duplicate ${option} for ${service}`)
      destination[service] = result
      index += 1
      continue
    }
    throw new Error(usage())
  }
  if (!parsed.workDir || Object.keys(parsed.digests).length === 0) throw new Error(usage())
  return parsed
}

function writeJsonAtomically (filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  fs.renameSync(temporary, filePath)
}

export function writeBuildResult (input, now = new Date()) {
  const phaseTwoValidation = validateProjectArtifacts(input.workDir, 'phase-2')
  if (!phaseTwoValidation.valid) {
    throw new Error('Phase 2 artifacts must validate before Phase 3 writes a result')
  }
  const analysisPath = path.join(input.workDir, '.sealos', 'analysis.json')
  const resultPath = path.join(input.workDir, '.sealos', 'phase-3', 'build-result.json')
  const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'))
  const result = {
    generated_at: now.toISOString(),
    digests: input.digests,
    pull_access: input.pullAccess,
  }
  const resultValidation = validateArtifactData('build-result', result)
  if (!resultValidation.valid) {
    throw new Error(`invalid build result: ${resultValidation.errors.map(error => `${error.path} ${error.message}`).join('; ')}`)
  }
  const nextAnalysis = { ...analysis, build_result: '.sealos/phase-3/build-result.json' }
  const analysisValidation = validateArtifactData('analysis', nextAnalysis)
  if (!analysisValidation.valid) {
    throw new Error(`invalid analysis: ${analysisValidation.errors.map(error => `${error.path} ${error.message}`).join('; ')}`)
  }
  writeJsonAtomically(resultPath, result)
  writeJsonAtomically(analysisPath, nextAnalysis)
  return { analysis: analysisPath, build_result: resultPath, services: Object.keys(input.digests).sort() }
}

function main () {
  try {
    console.log(JSON.stringify(writeBuildResult(parseArgs(process.argv.slice(2))), null, 2))
  } catch (error) {
    console.log(JSON.stringify({ error: error.message }, null, 2))
    process.exitCode = 1
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain) main()
