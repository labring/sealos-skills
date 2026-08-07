#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const contractPath = path.join(repoRoot, 'skills/sealos-deploy/references/deploy-contract.md')
const skillPath = path.join(repoRoot, 'skills/sealos-deploy/SKILL.md')
const schemaPath = path.join(repoRoot, 'skills/sealos-deploy/schemas/deploy-handoff.schema.json')
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))

const requiredFields = [
  'source', 'owner', 'preconditions', 'inputArtifact', 'allowedAction',
  'failureReturn', 'responseOwner', 'evidence', 'redaction', 'terminalState',
  'artifactPaths', 'nextAction',
]

function assertRelative(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a string`)
  assert.equal(path.isAbsolute(value), false, `${label} must be repository-relative`)
  assert.equal(/^[A-Za-z]:[\\/]/.test(value), false, `${label} must not be a drive path`)
  assert.equal(value.split(/[\\/]+/).includes('..'), false, `${label} must not escape the repository`)
}

function validateEnvelope(envelope) {
  for (const field of schema.required) assert.ok(Object.hasOwn(envelope, field), `missing ${field}`)
  assert.equal(envelope.version, '1.0')
  assert.ok(envelope.terminalState && typeof envelope.terminalState === 'object', 'terminalState must be an object')
  assert.ok(envelope.failureReturn && typeof envelope.failureReturn === 'object', 'failureReturn must be an object')
  assert.ok(envelope.redaction && typeof envelope.redaction === 'object', 'redaction must be an object')
  assert.ok(Array.isArray(envelope.preconditions) && envelope.preconditions.length > 0)
  assertRelative(envelope.inputArtifact.path, 'inputArtifact.path')
  assert.ok(['present', 'absent', 'validated', 'mismatch'].includes(envelope.inputArtifact.status))
  assert.ok(Array.isArray(envelope.evidence) && envelope.evidence.length > 0)
  assert.ok(['complete', 'not_applicable'].includes(envelope.redaction.status))
  assert.ok(Array.isArray(envelope.redaction.sanitizedFields))
  assert.ok(['success', 'stopped', 'error'].includes(envelope.terminalState.state))
  for (const artifactPath of envelope.artifactPaths) assertRelative(artifactPath, 'artifactPaths[]')
  if (envelope.terminalState.state === 'success') {
    assert.equal(envelope.nextAction, 'none')
    assert.equal(envelope.failureReturn.state, 'stopped')
  } else {
    assert.notEqual(envelope.nextAction, 'none')
    assert.ok(envelope.failureReturn.nextAction.length > 0)
  }
  const serialized = JSON.stringify(envelope)
  assert.equal(/(password|token|cookie|kubeconfig|secret|connection_string)\s*[:=]\s*[^<\s]/i.test(serialized), false, 'envelope contains an unredacted sensitive value')
}

const base = {
  version: '1.0',
  source: 'sealos-deploy/pipeline',
  owner: 'sealos-deploy',
  preconditions: ['eligibility.status=eligible'],
  inputArtifact: { path: '.sealos/analysis.json', kind: 'analysis', status: 'validated' },
  allowedAction: 'deploy',
  failureReturn: { state: 'stopped', reasonCode: 'RUNTIME_PENDING', owner: 'sealos-deploy/runtime-truth', nextAction: 'run Runtime Truth' },
  responseOwner: 'sealos-deploy',
  evidence: [{ kind: 'artifact', status: 'pass', detail: 'analysis schema validated', artifactPath: '.sealos/analysis.json' }],
  redaction: { status: 'complete', sanitizedFields: ['resource.identity', 'runtime.url'] },
  terminalState: { state: 'success', reasonCode: 'runtime_verified', evidenceRefs: ['artifact'] },
  artifactPaths: ['.sealos/analysis.json', '.sealos/runtime-truth.json'],
  nextAction: 'none',
}

assert.equal(schema.additionalProperties, false)
assert.deepEqual(schema.required, ['version', ...requiredFields])
assert.equal(fs.existsSync(contractPath), true)
assert.equal(fs.readFileSync(skillPath, 'utf8').includes('references/deploy-contract.md'), true)

for (const trace of [
  base,
  { ...base, terminalState: { state: 'stopped', reasonCode: 'runtime_pending', evidenceRefs: ['artifact'] }, nextAction: 'run Runtime Truth' },
  { ...base, terminalState: { state: 'error', reasonCode: 'deploy_failed', evidenceRefs: ['artifact'] }, nextAction: 'inspect sanitized error evidence' },
]) validateEnvelope(trace)

const missingTerminalState = { ...base }
delete missingTerminalState.terminalState
assert.throws(() => validateEnvelope(missingTerminalState), /missing terminalState/)
assert.throws(() => validateEnvelope({ ...base, redaction: { status: 'complete', sanitizedFields: ['password=plain-text'] } }), /unredacted sensitive value/)
assert.throws(() => validateEnvelope({ ...base, inputArtifact: { ...base.inputArtifact, path: '../outside.json' } }), /repository/)

const markdown = fs.readFileSync(contractPath, 'utf8')
for (const [, target] of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
  assert.equal(/^https?:\/\//.test(target), false, `contract link must stay local: ${target}`)
  assert.equal(fs.existsSync(path.resolve(path.dirname(contractPath), target)), true, `missing contract link: ${target}`)
}

console.log('deploy entry contract: 3 traces, schema fields, redaction, and local links passed')
