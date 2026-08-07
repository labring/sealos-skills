#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

import {
  validateArtifactData,
  validateStateLiveIdentity,
} from '../skills/sealos-deploy/scripts/artifact-validator.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixturePath = path.join(root, 'tests/fixtures/deploy-pipeline-contract.json')
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
const validatorScript = path.join(root, 'skills/sealos-deploy/scripts/validate-artifacts.mjs')

const state = {
  version: '1.0',
  last_deploy: {
    app_name: 'demo-app',
    app_host: 'demo-app-abc123',
    namespace: 'ns-demo',
    region: 'gzg.sealos.run',
    image: 'ghcr.io/example/demo:20260807',
    docker_hub_user: null,
    repo_name: 'demo',
    url: 'https://demo-app-abc123.gzg.sealos.run',
    deployed_at: '2026-08-07T00:00:00Z',
    last_updated_at: '2026-08-07T00:01:00Z',
  },
  history: [{
    at: '2026-08-07T00:00:00Z',
    action: 'deploy',
    image: 'ghcr.io/example/demo:20260807',
    method: 'template-api',
    status: 'success',
    note: 'Initial deployment',
  }],
  runtime_truth: {
    status: 'verified',
    captured_at: '2026-08-07T00:03:00Z',
    identity: {
      app_name: 'demo-app',
      namespace: 'ns-demo',
      image: 'ghcr.io/example/demo:20260807',
      url: 'https://demo-app-abc123.gzg.sealos.run',
    },
    evidence_paths: ['.sealos/runtime-truth.json'],
    redaction_status: 'complete',
    stability_window_seconds: 60,
    checks: ['network', 'app-url', 'auth', 'logs', 'events', 'footprint'],
  },
  provenance: {
    source: 'sealos-deploy/runtime-truth',
    owner: 'sealos-deploy',
    artifact_paths: ['.sealos/analysis.json', '.sealos/template/index.yaml', '.sealos/runtime-truth.json'],
    redaction_status: 'complete',
  },
}

const handoff = {
  version: '1.0',
  source: 'sealos-deploy/pipeline',
  owner: 'sealos-deploy',
  preconditions: ['analysis.valid=true'],
  inputArtifact: { path: '.sealos/analysis.json', kind: 'analysis', status: 'validated' },
  allowedAction: 'render',
  failureReturn: { state: 'stopped', reasonCode: 'HANDOFF_INVALID', owner: 'readiness', nextAction: 'repair analysis artifact' },
  responseOwner: 'sealos-deploy',
  evidence: [{ kind: 'schema', status: 'pass', detail: 'analysis schema validated', artifactPath: '.sealos/analysis.json' }],
  redaction: { status: 'complete', sanitizedFields: ['score', 'framework'] },
  terminalState: { state: 'success', reasonCode: 'handoff_verified', evidenceRefs: ['schema'] },
  artifactPaths: ['.sealos/analysis.json'],
  nextAction: 'none',
}

assert.deepEqual(fixture.phaseOrder, [
  'preflight', 'eligibility', 'template-fast-path', 'mode-detection', 'assess-detect',
  'dockerfile-build-or-reuse', 'template-configure', 'deploy-or-update', 'runtime-truth', 'state-handoff',
])
assert.equal(fixture.traces.length, 5)
assert.equal(validateArtifactData('state', state).valid, true)
assert.equal(validateArtifactData('deploy-handoff', handoff).valid, true)

const mismatchState = structuredClone(state)
mismatchState.runtime_truth.identity.image = 'ghcr.io/example/demo:stale'
const mismatchResult = validateArtifactData('state', mismatchState)
assert.equal(mismatchResult.valid, false)
assert.ok(mismatchResult.errors.some((error) => error.path.includes('runtime_truth.identity.image')))

const liveIdentity = {
  app_name: 'demo-app',
  app_host: 'demo-app-abc123',
  namespace: 'ns-demo',
  image: 'ghcr.io/example/demo:20260807',
  url: 'https://demo-app-abc123.gzg.sealos.run',
}
assert.equal(validateStateLiveIdentity(state, liveIdentity).valid, true)
assert.equal(validateStateLiveIdentity(state, { ...liveIdentity, image: 'ghcr.io/example/demo:other' }).valid, false)

const malformedHandoff = structuredClone(handoff)
delete malformedHandoff.responseOwner
assert.equal(validateArtifactData('deploy-handoff', malformedHandoff).valid, false)

const secretHandoff = structuredClone(handoff)
secretHandoff.evidence[0].detail = 'token: plain-value'
assert.equal(validateArtifactData('deploy-handoff', secretHandoff).valid, false)

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-pipeline-contract-'))
try {
  fs.mkdirSync(path.join(workDir, '.sealos'), { recursive: true })
  fs.writeFileSync(path.join(workDir, '.sealos', 'state.json'), JSON.stringify(state, null, 2))
  fs.writeFileSync(path.join(workDir, 'live-identity.json'), JSON.stringify(liveIdentity, null, 2))
  const run = spawnSync(process.execPath, [validatorScript, '--dir', workDir], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  const report = JSON.parse(run.stdout)
  assert.equal(report.valid, true)
  assert.equal(report.results.some((entry) => entry.file.endsWith('/build/build-result.json')), false)
  const reconciliation = spawnSync(process.execPath, [
    validatorScript,
    '--state-live',
    path.join(workDir, '.sealos', 'state.json'),
    path.join(workDir, 'live-identity.json'),
  ], { encoding: 'utf8' })
  assert.equal(reconciliation.status, 0, reconciliation.stderr)
  assert.equal(JSON.parse(reconciliation.stdout).valid, true)
} finally {
  fs.rmSync(workDir, { recursive: true, force: true })
}

for (const trace of fixture.traces) {
  assert.equal(trace.redaction, 'complete', `${trace.id} redaction`)
  for (const artifactPath of trace.artifactPaths) {
    assert.equal(path.isAbsolute(artifactPath), false, `${trace.id} path must be relative`)
    assert.equal(artifactPath.split('/').includes('..'), false, `${trace.id} path must stay in repository`)
  }
  if (trace.terminalState === 'stopped') assert.ok(trace.nextAction)
}

if (process.argv.includes('--artifacts')) {
  const schemaPath = path.join(root, 'skills/sealos-deploy/schemas/state.schema.json')
  assert.equal(JSON.parse(fs.readFileSync(schemaPath, 'utf8')).properties.runtime_truth.type, 'object')
}

console.log('deploy pipeline contract: order, typed handoffs, state/live reconciliation, lazy build, and Canvas traces passed')
