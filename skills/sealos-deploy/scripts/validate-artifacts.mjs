#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  inferArtifactKind,
  validateArtifactFile,
  validateProjectArtifacts,
} from './artifact-validator.mjs'

function usage () {
  return [
    'Usage:',
    '  node validate-artifacts.mjs <file>',
    '  node validate-artifacts.mjs <kind> <file>',
    '  node validate-artifacts.mjs --dir <work-dir>',
    '  node validate-artifacts.mjs --stage <phase-0|phase-1|phase-2|phase-3> --dir <work-dir>',
  ].join('\n')
}

function printResult (result, code) {
  console.log(JSON.stringify(result, null, 2))
  process.exitCode = code
}

export function parseArgs (args) {
  if (args[0] === '--dir') {
    if (!args[1] || args.length !== 2) throw new Error(usage())
    return { mode: 'project', workDir: path.resolve(args[1]) }
  }
  if (args[0] === '--stage') {
    if (args[2] !== '--dir' || !args[1] || !args[3] || args.length !== 4) {
      throw new Error(usage())
    }
    return { mode: 'stage', stage: args[1], workDir: path.resolve(args[3]) }
  }
  if (args.length === 1) return { mode: 'file', filePath: path.resolve(args[0]), kind: null }
  if (args.length === 2) return { mode: 'file', kind: args[0], filePath: path.resolve(args[1]) }
  throw new Error(usage())
}

function inferProjectStage (workDir) {
  const sealosDir = path.join(workDir, '.sealos')
  if (fs.existsSync(path.join(sealosDir, 'phase-3', 'build-result.json'))) return 'phase-3'
  if (fs.existsSync(path.join(sealosDir, 'phase-2', 'deployment-plan.json'))) return 'phase-2'
  try {
    const analysis = JSON.parse(fs.readFileSync(path.join(sealosDir, 'analysis.json'), 'utf8'))
    if (Object.hasOwn(analysis, 'official_template')) return 'phase-1'
  } catch {}
  return 'phase-0'
}

export function validateProjectDirectory (workDir, stage = null) {
  return validateProjectArtifacts(workDir, stage || inferProjectStage(workDir))
}

export function main (args = process.argv.slice(2)) {
  try {
    const parsed = parseArgs(args)
    if (parsed.mode === 'stage' || parsed.mode === 'project') {
      const result = validateProjectDirectory(
        parsed.workDir,
        parsed.mode === 'stage' ? parsed.stage : null,
      )
      printResult(result, result.valid ? 0 : 1)
      return result
    }
    const kind = parsed.kind || inferArtifactKind(parsed.filePath)
    if (!kind) throw new Error(`Cannot infer an artifact kind for ${path.basename(parsed.filePath)}`)
    const result = { file: parsed.filePath, ...validateArtifactFile(kind, parsed.filePath) }
    printResult(result, result.valid ? 0 : 1)
    return result
  } catch (error) {
    const result = { valid: false, error: error.message }
    printResult(result, 1)
    return result
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain) main()
