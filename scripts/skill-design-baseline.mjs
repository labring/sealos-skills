#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, '..')
const DEFAULT_FIXTURE = path.join(DEFAULT_REPO_ROOT, 'tests', 'fixtures', 'skill-design-baseline.json')

export const CANONICAL_SKILLS = [
  'cloud-native-readiness',
  'dockerfile-skill',
  'docker-to-sealos',
  'sealos-deploy',
  'sealos-database',
  'sealos-s3',
  'sealos-canvas',
  'sealos-app-builder'
]

const REQUIRED_CASE_FIELDS = [
  'caseId',
  'prompt',
  'sourceRefs',
  'expectedOwner',
  'interactionClass',
  'terminalState',
  'loadedResources',
  'toolCalls',
  'files',
  'handoff',
  'redactionChecks'
]

const INTERACTION_CLASSES = new Set([
  'read-only-observation',
  'local-artifact-mutation',
  'cloud-and-local-mutation',
  'composite-cloud-mutation'
])
const TERMINAL_STATES = new Set(['success', 'stopped', 'error'])
const SENSITIVE_PATTERNS = [
  /-----BEGIN [^-]+ PRIVATE KEY-----/i,
  /\b(?:AKIA|ASIA)[A-Z0-9]{12,}\b/,
  /\b(?:ghp|gho|github_pat|xox[baprs])-[A-Za-z0-9_-]{10,}\b/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i,
  /\b(?:postgres(?:ql)?|mysql|redis|mongodb(?:\+srv)?):\/\/[^\s<>]+/i,
  /\b(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)\s*[:=]\s*(?!<[^>]+>|\{[^}]+\}|\[[^\]]+\])[^\s,;]+/i
]

function issue(code, message, context = {}) {
  return { code, message, ...context }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isSafeRelativePath(value) {
  return typeof value === 'string' && value.length > 0 && !path.isAbsolute(value)
    && !value.includes('\\') && value !== '.' && !value.split('/').includes('..')
}

function resolveRepoPath(repoRoot, reference) {
  if (!isSafeRelativePath(reference)) return null
  const resolved = path.resolve(repoRoot, reference)
  const relative = path.relative(repoRoot, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null
  return resolved
}

function hasSensitiveValue(value, location = '$') {
  const findings = []
  if (typeof value === 'string') {
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(value)) findings.push({ location, pattern: pattern.source })
    }
    return findings
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => findings.push(...hasSensitiveValue(item, `${location}[${index}]`)))
    return findings
  }
  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      findings.push(...hasSensitiveValue(child, `${location}.${key}`))
    }
  }
  return findings
}

function validatePathReference(reference, repoRoot, field, context) {
  const resolved = resolveRepoPath(repoRoot, reference)
  if (!resolved) return issue('unsafe-path', `${field} must be a repository-relative path`, context)
  if (!fs.existsSync(resolved)) return issue('missing-path', `${field} does not resolve: ${reference}`, context)
  return null
}

function validateOwnedResource(reference, record, repoRoot, field, context) {
  const pathIssue = validatePathReference(reference, repoRoot, field, context)
  if (pathIssue) return pathIssue

  const skillRoot = path.resolve(repoRoot, 'skills', record.skill)
  const resolved = path.resolve(repoRoot, reference)
  const relative = path.relative(skillRoot, resolved)
  const segments = relative.split(path.sep)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return issue('foreign-resource', `${field} must stay owned by ${record.skill}: ${reference}`, context)
  }
  if (segments.length > 2) {
    return issue('deep-resource', `${field} must use a one-level owned resource reference: ${reference}`, context)
  }
  return null
}

function validateHandoff(handoff, record, context) {
  const required = ['target', 'inputArtifact', 'allowedAction', 'failureReturn', 'responseOwner']
  if (!isObject(handoff)) return [issue('missing-handoff', 'handoff must be an object', context)]
  const issues = []
  for (const key of required) {
    if (typeof handoff[key] !== 'string' || handoff[key].trim() === '') {
      issues.push(issue('missing-handoff-field', `handoff.${key} must be a non-empty string`, context))
    }
  }
  if (handoff.target !== 'none' && !CANONICAL_SKILLS.includes(handoff.target)) {
    issues.push(issue('unknown-handoff-target', `handoff.target is not a canonical skill: ${handoff.target}`, context))
  }
  if (handoff.responseOwner !== record.skill && handoff.responseOwner !== 'sealos-deploy') {
    issues.push(issue('unexpected-response-owner', `handoff.responseOwner does not identify the owning response: ${handoff.responseOwner}`, context))
  }
  return issues
}

function validateRedactionChecks(redactionChecks, context) {
  if (!Array.isArray(redactionChecks) || redactionChecks.length === 0) {
    return [issue('missing-redaction-checks', 'redactionChecks must contain at least one check', context)]
  }
  const issues = []
  redactionChecks.forEach((check, index) => {
    if (!isObject(check) || typeof check.name !== 'string' || typeof check.passed !== 'boolean') {
      issues.push(issue('invalid-redaction-check', `redactionChecks[${index}] must contain name and boolean passed`, context))
    } else if (check.passed !== true) {
      issues.push(issue('failed-redaction-check', `redactionChecks[${index}] is not passing`, context))
    }
  })
  return issues
}

function validateCase(record, caseData, repoRoot) {
  const context = { skill: record.skill, caseId: caseData?.caseId }
  const issues = []
  const ownedResources = new Set(Array.isArray(record.ownedResources) ? record.ownedResources : [])

  if (!isObject(caseData)) {
    return {
      ok: false,
      valid: false,
      issues: [issue('invalid-case', 'case must be an object', context)],
      summary: { selectedOwner: record.skill, terminalState: null, artifacts: [], handoff: null, redaction: { ok: false } }
    }
  }

  for (const field of REQUIRED_CASE_FIELDS) {
    if (!(field in caseData)) issues.push(issue('missing-field', `case is missing ${field}`, context))
  }
  if (typeof caseData.caseId !== 'string' || caseData.caseId.trim() === '') issues.push(issue('invalid-case-id', 'caseId must be a non-empty string', context))
  if (typeof caseData.prompt !== 'string' || caseData.prompt.trim() === '') issues.push(issue('invalid-prompt', 'prompt must be a non-empty string', context))
  if (!['positive', 'violating'].includes(caseData.kind)) issues.push(issue('invalid-kind', 'kind must be positive or violating', context))
  if (caseData.expectedOwner !== record.skill) issues.push(issue('owner-mismatch', `expectedOwner must be ${record.skill}`, context))
  if (!INTERACTION_CLASSES.has(caseData.interactionClass)) issues.push(issue('invalid-interaction-class', `unknown interactionClass: ${caseData.interactionClass}`, context))
  if (!TERMINAL_STATES.has(caseData.terminalState)) issues.push(issue('invalid-terminal-state', `unknown terminalState: ${caseData.terminalState}`, context))
  if (caseData.kind === 'positive' && caseData.terminalState !== 'success') issues.push(issue('positive-not-success', 'positive cases must terminate in success', context))
  if (caseData.kind === 'violating' && !['stopped', 'error'].includes(caseData.terminalState)) issues.push(issue('violating-not-stopped', 'violating cases must terminate in stopped or error', context))
  if (!Array.isArray(caseData.sourceRefs) || caseData.sourceRefs.length === 0) issues.push(issue('missing-source-refs', 'sourceRefs must be a non-empty array', context))
  if (!Array.isArray(caseData.loadedResources) || caseData.loadedResources.length === 0) issues.push(issue('missing-loaded-resources', 'loadedResources must be a non-empty array', context))
  if (!Array.isArray(caseData.toolCalls) || caseData.toolCalls.length === 0) issues.push(issue('missing-tool-calls', 'toolCalls must be a non-empty array', context))
  if (!Array.isArray(caseData.files) || caseData.files.length === 0) issues.push(issue('missing-files', 'files must be a non-empty array', context))

  if (Array.isArray(caseData.sourceRefs)) {
    if (!caseData.sourceRefs.includes(record.entry)) issues.push(issue('entry-not-sourced', `sourceRefs must include ${record.entry}`, context))
    caseData.sourceRefs.forEach((reference, index) => {
      if (typeof reference !== 'string') issues.push(issue('invalid-source-ref', `sourceRefs[${index}] must be a string`, context))
      else {
        const pathIssue = validatePathReference(reference, repoRoot, `sourceRefs[${index}]`, context)
        if (pathIssue) issues.push(pathIssue)
      }
    })
  }
  if (Array.isArray(caseData.loadedResources)) {
    caseData.loadedResources.forEach((reference, index) => {
      if (typeof reference !== 'string') issues.push(issue('invalid-loaded-resource', `loadedResources[${index}] must be a string`, context))
      else {
        const resourceIssue = validateOwnedResource(reference, record, repoRoot, `loadedResources[${index}]`, context)
        if (resourceIssue) issues.push(resourceIssue)
        if (reference !== record.entry && !ownedResources.has(reference)) {
          issues.push(issue('unlisted-resource', `loadedResources[${index}] is not declared in ownedResources: ${reference}`, context))
        }
      }
    })
  }

  issues.push(...validateHandoff(caseData.handoff, record, context))
  issues.push(...validateRedactionChecks(caseData.redactionChecks, context))

  if (caseData.kind === 'violating' && (typeof caseData.guard !== 'string' || caseData.guard.trim() === '')) {
    issues.push(issue('missing-guard', 'violating cases require a named guard', context))
  }
  if (caseData.kind === 'positive' && 'guard' in caseData && caseData.guard !== null && caseData.guard !== '') {
    issues.push(issue('unexpected-guard', 'positive cases must not declare a violating guard', context))
  }

  const sensitiveFindings = hasSensitiveValue(caseData, '$.skills[].cases[]')
  if (sensitiveFindings.length > 0) {
    issues.push(issue('sensitive-trace-value', 'trace contains a credential-shaped value', { ...context, findings: sensitiveFindings }))
  }

  const valid = issues.length === 0
  const ok = valid && caseData.kind === 'positive'
  const redaction = {
    ok: valid && caseData.redactionChecks.every((check) => check && check.passed === true),
    checks: Array.isArray(caseData.redactionChecks) ? caseData.redactionChecks : []
  }
  return {
    ok,
    valid,
    issues,
    guard: caseData.guard || null,
    summary: {
      caseId: caseData.caseId,
      kind: caseData.kind,
      selectedOwner: caseData.expectedOwner || record.skill,
      terminalState: caseData.terminalState || null,
      artifacts: Array.isArray(caseData.files) ? caseData.files : [],
      handoff: caseData.handoff || null,
      redaction
    }
  }
}

export function checkCase(record, caseData, options = {}) {
  const repoRoot = options.repoRoot ? path.resolve(options.repoRoot) : DEFAULT_REPO_ROOT
  return validateCase(record, caseData, repoRoot)
}

export function checkBaseline(fixture, options = {}) {
  const repoRoot = options.repoRoot ? path.resolve(options.repoRoot) : DEFAULT_REPO_ROOT
  const issues = []
  const cases = []

  if (!isObject(fixture)) {
    return { ok: false, issues: [issue('invalid-fixture', 'fixture must be a JSON object')], cases: [], summary: null }
  }
  if (fixture.schemaVersion !== 1) issues.push(issue('unsupported-schema', 'schemaVersion must equal 1'))
  if (!Array.isArray(fixture.skills)) {
    issues.push(issue('missing-skills', 'skills must be an array'))
    return { ok: false, issues, cases, summary: null }
  }
  if (fixture.skills.length !== CANONICAL_SKILLS.length) issues.push(issue('skill-count', `fixture must contain exactly ${CANONICAL_SKILLS.length} skill records`))

  const seen = new Set()
  for (const record of fixture.skills) {
    if (!isObject(record)) {
      issues.push(issue('invalid-skill-record', 'skill record must be an object'))
      continue
    }
    const skill = record.skill
    const recordContext = { skill }
    if (!CANONICAL_SKILLS.includes(skill)) issues.push(issue('unknown-skill', `unknown canonical skill: ${skill}`, recordContext))
    if (seen.has(skill)) issues.push(issue('duplicate-skill', `duplicate skill record: ${skill}`, recordContext))
    seen.add(skill)
    const expectedEntry = `skills/${skill}/SKILL.md`
    if (record.entry !== expectedEntry) issues.push(issue('entry-mismatch', `entry must be ${expectedEntry}`, recordContext))
    if (record.behaviorOwner !== record.entry) issues.push(issue('behavior-owner-mismatch', 'behaviorOwner must equal entry', recordContext))
    const entryIssue = validatePathReference(record.entry, repoRoot, 'entry', recordContext)
    if (entryIssue) issues.push(entryIssue)
    if (!Array.isArray(record.ownedResources) || record.ownedResources.length === 0) {
      issues.push(issue('missing-owned-resources', 'ownedResources must be a non-empty array', recordContext))
    } else {
      record.ownedResources.forEach((resource, index) => {
        if (typeof resource !== 'string') issues.push(issue('invalid-owned-resource', `ownedResources[${index}] must be a string`, recordContext))
        else {
          const resourceIssue = validateOwnedResource(resource, record, repoRoot, `ownedResources[${index}]`, recordContext)
          if (resourceIssue) issues.push(resourceIssue)
        }
      })
    }
    if (!Array.isArray(record.cases) || record.cases.length !== 2) {
      issues.push(issue('case-count', `${skill} must contain exactly two cases`, recordContext))
      continue
    }
    const kinds = record.cases.map((caseData) => caseData && caseData.kind)
    if (kinds.filter((kind) => kind === 'positive').length !== 1 || kinds.filter((kind) => kind === 'violating').length !== 1) {
      issues.push(issue('case-kinds', `${skill} must contain one positive and one violating case`, recordContext))
    }
    for (const caseData of record.cases) {
      const result = validateCase(record, caseData, repoRoot)
      cases.push({ record, caseData, result })
      if (!result.valid) issues.push(...result.issues)
    }
  }

  const missing = CANONICAL_SKILLS.filter((skill) => !seen.has(skill))
  if (missing.length > 0) issues.push(issue('missing-skills', `missing canonical skill records: ${missing.join(', ')}`))

  const summaryCases = cases.map(({ result }) => result.summary)
  return {
    ok: issues.length === 0,
    issues,
    cases,
    summary: {
      schemaVersion: fixture.schemaVersion,
      skillCount: fixture.skills.length,
      caseCount: cases.length,
      selectedOwners: [...new Set(summaryCases.map((item) => item.selectedOwner).filter(Boolean))],
      cases: summaryCases
    }
  }
}

export const validateBaseline = checkBaseline

function parseArgs(argv) {
  const args = { fixture: DEFAULT_FIXTURE, check: false, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--fixture') args.fixture = argv[++index]
    else if (argument === '--check') args.check = true
    else if (argument === '--help' || argument === '-h') args.help = true
    else throw new Error(`Unknown argument: ${argument}`)
  }
  return args
}

function printUsage() {
  process.stdout.write('Usage: node scripts/skill-design-baseline.mjs [--fixture <path>] [--check]\n')
}

function main(argv = process.argv.slice(2)) {
  let args
  try {
    args = parseArgs(argv)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    printUsage()
    return 2
  }
  if (args.help) {
    printUsage()
    return 0
  }

  let fixture
  try {
    fixture = JSON.parse(fs.readFileSync(path.resolve(args.fixture), 'utf8'))
  } catch (error) {
    const report = { ok: false, issues: [issue('fixture-read', `Unable to read fixture: ${error.message}`)], summary: null }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return 1
  }

  const result = checkBaseline(fixture)
  const report = {
    ok: result.ok,
    issues: result.issues,
    summary: result.summary
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  return args.check && !result.ok ? 1 : 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}
