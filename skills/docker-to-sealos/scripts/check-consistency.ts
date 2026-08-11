#!/usr/bin/env node
/**
 * Consistency checker CLI for docker-to-sealos skill documents.
 */

import fs from 'node:fs'
import path from 'node:path'
import { resolvePath } from './check-consistency-parser.ts'
import { REGISTERED_RULES } from './check-consistency-rule-registry.ts'
import { runChecks } from './check-consistency-runner.ts'

function parseArgs(argv: string[]) {
  const args = {
    skill: 'SKILL.md',
    references: 'references',
    rulesFile: 'references/rules-registry.yaml',
    only: '',
    artifacts: '',
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => {
      const value = argv[++i]
      if (value == null) throw new Error(`missing value for ${arg}`)
      return value
    }
    switch (arg) {
      case '--skill':
        args.skill = next()
        break
      case '--references':
        args.references = next()
        break
      case '--rules-file':
        args.rulesFile = next()
        break
      case '--only':
        args.only = next()
        break
      case '--artifacts':
        args.artifacts = next()
        break
      default:
        throw new Error(`unknown argument: ${arg}`)
    }
  }
  return args
}

export function main(argv: string[] = process.argv.slice(2)): number {
  let args: ReturnType<typeof parseArgs>
  try {
    args = parseArgs(argv)
  } catch (error) {
    console.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`)
    return 2
  }

  const skillPath = path.resolve(args.skill)
  if (!fs.existsSync(skillPath)) {
    console.log(`ERROR: skill file not found: ${skillPath}`)
    return 2
  }

  const skillRoot = path.dirname(skillPath)
  const referencesDir = resolvePath(args.references, skillRoot)
  const rulesFile = resolvePath(args.rulesFile, skillRoot)

  if (!fs.existsSync(referencesDir)) {
    console.log(`ERROR: references directory not found: ${referencesDir}`)
    return 2
  }
  if (!fs.existsSync(rulesFile)) {
    console.log(`ERROR: rules registry not found: ${rulesFile}`)
    return 2
  }

  const onlyRules = args.only
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const additionalIncludePaths = args.artifacts
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  let violations
  try {
    violations = runChecks({
      skillPath,
      referencesDir,
      registryPath: rulesFile,
      onlyRules: onlyRules.length > 0 ? onlyRules : null,
      additionalIncludePaths: additionalIncludePaths.length > 0 ? additionalIncludePaths : null,
    })
  } catch (error) {
    console.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`)
    return 2
  }

  if (violations.length > 0) {
    console.log('Consistency check failed with the following issues:')
    for (const item of violations) {
      console.log(
        `- [${item.ruleId}/${item.severity ?? 'error'}] ${item.path}:${item.line}: ${item.message}`,
      )
    }
    return 1
  }

  const total = onlyRules.length > 0 ? onlyRules.length : Object.keys(REGISTERED_RULES).length
  console.log(`Consistency check passed (${total} rules).`)
  return 0
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('check-consistency.ts') ||
    process.argv[1].endsWith('check-consistency.js'))

if (isDirectRun) {
  process.exit(main())
}
