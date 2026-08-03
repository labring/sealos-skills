#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateArtifactData } from './artifact-validator.mjs'

const officialTemplatePointer = '.sealos/phase-1/official-template.yaml'

function usage () {
  return 'Usage: node materialize-official-template.mjs --analysis <analysis.json>'
}

export function parseArgs (args) {
  if (args.length !== 2 || args[0] !== '--analysis') throw new Error(usage())
  return { analysisPath: path.resolve(args[1]) }
}

function isWithin (root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function pathsFor (analysis) {
  if (!path.isAbsolute(analysis.work_dir)) throw new Error('analysis work_dir must be absolute')
  if (analysis.official_template !== officialTemplatePointer) {
    throw new Error('analysis does not point to the saved official template')
  }
  const source = path.resolve(analysis.work_dir, analysis.official_template)
  if (!isWithin(analysis.work_dir, source)) throw new Error('official template must stay inside work_dir')
  return {
    source,
    output: path.join(analysis.work_dir, '.sealos', 'template', 'index.yaml'),
  }
}

function writeTextAtomically (filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(temporary, text, 'utf8')
  fs.renameSync(temporary, filePath)
}

export function materializeOfficialTemplate (analysisPath) {
  const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'))
  const validation = validateArtifactData('analysis-phase-1', analysis)
  if (!validation.valid) {
    throw new Error(`invalid Phase 1 analysis: ${validation.errors.map(error => `${error.path} ${error.message}`).join('; ')}`)
  }
  const { source, output } = pathsFor(analysis)
  const yaml = fs.readFileSync(source, 'utf8')
  if (!yaml.trim()) throw new Error('saved official template is empty')
  writeTextAtomically(output, yaml.endsWith('\n') ? yaml : `${yaml}\n`)
  return { source, output, bytes: Buffer.byteLength(yaml) }
}

function main () {
  try {
    const { analysisPath } = parseArgs(process.argv.slice(2))
    console.log(JSON.stringify(materializeOfficialTemplate(analysisPath), null, 2))
  } catch (error) {
    console.log(JSON.stringify({ error: error.message }, null, 2))
    process.exitCode = 1
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain) main()
