#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import {
  inferArtifactKind,
  validateArtifactFile,
} from './artifact-validator.mjs'

function collectBuildResults(buildDir) {
  if (!fs.existsSync(buildDir)) return []

  const results = []
  const pending = [buildDir]
  while (pending.length > 0) {
    const current = pending.pop()
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of entries) {
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        pending.push(entryPath)
      } else if (entry.isFile() && entry.name === 'build-result.json') {
        results.push(entryPath)
      }
    }
  }

  return results.sort()
}

function collectProjectArtifacts(workDir) {
  const sealosDir = path.join(workDir, '.sealos')
  const candidates = [
    path.join(sealosDir, 'config.json'),
    path.join(sealosDir, 'template-references.json'),
    path.join(sealosDir, 'analysis.json'),
    path.join(sealosDir, 'state.json'),
    ...collectBuildResults(path.join(sealosDir, 'build')),
  ]

  return candidates
    .filter((candidate) => fs.existsSync(candidate))
    .map((candidate) => ({
      file: candidate,
      kind: inferArtifactKind(candidate),
    }))
    .filter((entry) => entry.kind)
}

function printAndExit(result, code) {
  console.log(JSON.stringify(result, null, 2))
  process.exit(code)
}

function main(args = process.argv.slice(2)) {
  if (args.length === 0) {
    printAndExit({
      valid: false,
      error: 'Usage: node validate-artifacts.mjs <file> | <kind> <file> | --dir <work-dir>',
    }, 1)
  }

  if (args[0] === '--dir') {
    const workDir = args[1]
    if (!workDir) {
      printAndExit({ valid: false, error: 'Missing work directory after --dir' }, 1)
    }

    const results = collectProjectArtifacts(path.resolve(workDir)).map(({ kind, file }) => ({
      file,
      ...validateArtifactFile(kind, file),
    }))

    printAndExit({
      valid: results.every((entry) => entry.valid),
      results,
    }, results.every((entry) => entry.valid) ? 0 : 1)
  }

  let kind
  let filePath

  if (args.length === 1) {
    filePath = path.resolve(args[0])
    kind = inferArtifactKind(filePath)
    if (!kind) {
      printAndExit({
        valid: false,
        error: `Could not infer artifact kind from filename: ${path.basename(filePath)}`,
      }, 1)
    }
  } else {
    kind = args[0]
    filePath = path.resolve(args[1])
  }

  const result = validateArtifactFile(kind, filePath)
  printAndExit({
    file: filePath,
    ...result,
  }, result.valid ? 0 : 1)
}

const isMain = process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMain) main()

export {
  collectBuildResults,
  collectProjectArtifacts,
}
