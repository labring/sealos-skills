#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CANONICAL_SKILLS, checkBaseline } from './skill-design-baseline.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..')
const DEFAULT_FIXTURE = path.join(DEFAULT_ROOT, 'tests/fixtures/skill-design-baseline.json')
const DEFAULT_SCENARIOS = path.join(DEFAULT_ROOT, 'tests/fixtures/skill-design-behavior.json')
const COVERAGE_DIMENSIONS = ['routing', 'boundary', 'terminal', 'progressive-loading', 'highest-risk']

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'))
}

function diagnostic(code, message, context = {}) {
  return { code, message, ...context }
}

function validateScenario(scenario, index) {
  const issues = []
  const context = { source: 'tests/fixtures/skill-design-behavior.json', scenario: scenario?.id || index }
  if (!scenario || typeof scenario !== 'object') return [diagnostic('scenario.invalid', 'scenario must be an object', context)]
  if (scenario.id && typeof scenario.id !== 'string') issues.push(diagnostic('scenario.invalid-id', 'scenario id must be a string', context))
  if (!['success', 'stopped', 'error'].includes(scenario.terminalState)) issues.push(diagnostic('scenario.invalid-terminal-state', 'scenario terminalState must use the shared vocabulary', context))
  if (!Array.isArray(scenario.toolCalls)) issues.push(diagnostic('scenario.tool-calls', 'scenario toolCalls must be an array', context))
  if (!Array.isArray(scenario.files) || scenario.files.length === 0) issues.push(diagnostic('scenario.files', 'scenario files must contain observable evidence', context))
  if (typeof scenario.handoffTarget !== 'string') issues.push(diagnostic('scenario.handoff', 'scenario handoffTarget must be explicit', context))
  return issues
}

export function gradeBehavior(fixture, options = {}) {
  const repoRoot = path.resolve(options.repoRoot || DEFAULT_ROOT)
  const baseline = checkBaseline(fixture, { repoRoot })
  const diagnostics = baseline.issues.map((item) => diagnostic(item.code, item.message, {
    skill: item.skill,
    caseId: item.caseId,
    field: item.field,
    source: 'tests/fixtures/skill-design-baseline.json'
  }))
  const cases = []
  for (const { record, caseData, result } of baseline.cases) {
    const caseDiagnostics = result.issues.map((item) => diagnostic(item.code, item.message, {
      skill: record.skill,
      caseId: caseData.caseId,
      field: item.field,
      source: 'tests/fixtures/skill-design-baseline.json'
    }))
    if (result.valid && caseData.kind === 'positive' && caseData.terminalState !== 'success') {
      caseDiagnostics.push(diagnostic('behavior.positive-terminal', 'positive trace must terminate in success', { skill: record.skill, caseId: caseData.caseId, field: 'terminalState', source: 'tests/fixtures/skill-design-baseline.json' }))
    }
    if (result.valid && caseData.kind === 'violating' && !['stopped', 'error'].includes(caseData.terminalState)) {
      caseDiagnostics.push(diagnostic('behavior.violating-terminal', 'violating trace must terminate in stopped or error', { skill: record.skill, caseId: caseData.caseId, field: 'terminalState', source: 'tests/fixtures/skill-design-baseline.json' }))
    }
    cases.push({ skill: record.skill, caseId: caseData.caseId, kind: caseData.kind, terminalState: caseData.terminalState, ok: caseDiagnostics.length === 0, diagnostics: caseDiagnostics })
    diagnostics.push(...caseDiagnostics)
  }

  let scenarios = null
  if (options.scenarios) {
    scenarios = options.scenarios
    for (const [index, scenario] of scenarios.sideEffectCases.entries()) {
      diagnostics.push(...validateScenario(scenario, index))
    }
    for (const [index, mutation] of scenarios.mutations.entries()) {
      const context = { source: 'tests/fixtures/skill-design-behavior.json', scenario: mutation?.id || index }
      if (!mutation || typeof mutation !== 'object' || !CANONICAL_SKILLS.includes(mutation.skill) || typeof mutation.caseId !== 'string' || typeof mutation.field !== 'string' || typeof mutation.expectedCode !== 'string') {
        diagnostics.push(diagnostic('mutation.invalid', 'mutation requires canonical skill, caseId, field, and expectedCode', context))
      }
    }
  }

  const skillCount = new Set(cases.map((item) => item.skill)).size
  const positiveCount = cases.filter((item) => item.kind === 'positive' && item.ok).length
  const violatingCount = cases.filter((item) => item.kind === 'violating' && item.ok).length
  return {
    schemaVersion: 1,
    ok: diagnostics.length === 0 && skillCount === CANONICAL_SKILLS.length && positiveCount === CANONICAL_SKILLS.length && violatingCount === CANONICAL_SKILLS.length,
    coverage: { skillCount, expectedSkillCount: CANONICAL_SKILLS.length, positiveCount, violatingCount, dimensions: COVERAGE_DIMENSIONS },
    cases,
    diagnostics
  }
}

function parseArgs(argv) {
  const args = { fixture: DEFAULT_FIXTURE, scenarios: DEFAULT_SCENARIOS, check: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--fixture') args.fixture = argv[++index]
    else if (argument === '--scenarios') args.scenarios = argv[++index]
    else if (argument === '--check') args.check = true
    else if (argument === '--help' || argument === '-h') args.help = true
    else throw new Error(`Unknown argument: ${argument}`)
  }
  return args
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  if (args.help) {
    console.log('Usage: node scripts/skill-design-behavior.mjs [--fixture <path>] [--scenarios <path>] [--check]')
    return 0
  }
  const fixture = readJson(args.fixture)
  const scenarios = args.scenarios ? readJson(args.scenarios) : null
  const report = gradeBehavior(fixture, { repoRoot: DEFAULT_ROOT, scenarios })
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  return args.check && !report.ok ? 1 : 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main()
