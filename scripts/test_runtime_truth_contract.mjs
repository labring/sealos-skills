#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimePath = path.join(root, 'skills/sealos-deploy/modules/runtime-truth.md')
const playbookPath = path.join(root, 'skills/sealos-deploy/references/live-smoke-playbooks.md')
const fixturePath = path.join(root, 'tests/fixtures/deploy-runtime-truth.json')
const runtimeText = fs.readFileSync(runtimePath, 'utf8')
const playbookText = fs.readFileSync(playbookPath, 'utf8')
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))

const requiredMarkers = [
  'Runtime Truth Acceptance Contract',
  'runtimeReady: true',
  'collectionOk: true',
  'minimum 60-second stability window',
  '`stopped` with `runtime_pending`',
  'read-only Canvas observation tuple',
  'Public web',
  'Private web',
  'Worker',
  'Scheduled job',
  'Database-backed',
  'S3-backed',
]
for (const marker of requiredMarkers) assert.ok(runtimeText.includes(marker), `runtime contract marker: ${marker}`)
for (const marker of ['Runtime Truth Workload Matrix', 'Launchpad', 'baseline/final', 'ObjectStorageBucket', 'redacted']) {
  assert.ok(playbookText.includes(marker), `playbook marker: ${marker}`)
}

assert.equal(fixture.minimumStabilityWindowSeconds, 60)
assert.equal(fixture.traces.length, 9)

const successTraces = fixture.traces.filter((trace) => trace.terminalState === 'success')
for (const trace of successTraces) {
  assert.equal(trace.runtimeReady, true, `${trace.id} runtime readiness`)
  assert.equal(trace.collectionOk, true, `${trace.id} footprint collection`)
  assert.equal(trace.redaction, 'complete', `${trace.id} redaction`)
  assert.ok(trace.stabilityWindowSeconds >= fixture.minimumStabilityWindowSeconds, `${trace.id} stability window`)
  assert.ok(trace.required.includes('baselineFinal'), `${trace.id} baseline/final evidence`)
  assert.ok(trace.required.includes('footprint'), `${trace.id} footprint evidence`)
  assert.ok(trace.required.includes('logs'), `${trace.id} logs evidence`)
  assert.ok(trace.required.includes('events'), `${trace.id} event evidence`)
}

const publicWeb = fixture.traces.find((trace) => trace.id === 'public-web-accepted')
assert.ok(publicWeb.required.includes('launchpad'))
assert.ok(publicWeb.required.includes('portMatch'))
assert.ok(publicWeb.required.includes('auth'))

const privateWeb = fixture.traces.find((trace) => trace.id === 'private-web-accepted')
assert.ok(privateWeb.skipped.includes('launchpad'))
assert.ok(privateWeb.required.includes('businessAction'))

const worker = fixture.traces.find((trace) => trace.id === 'worker-accepted')
assert.ok(worker.required.includes('workSignal'))
assert.ok(worker.skipped.includes('http-auth'))

const scheduled = fixture.traces.find((trace) => trace.id === 'scheduled-job-accepted')
assert.ok(scheduled.required.includes('schedule'))
assert.ok(scheduled.required.includes('jobCompletion'))
assert.ok(scheduled.stabilityWindowSeconds >= 60)

const databaseS3 = fixture.traces.find((trace) => trace.id === 'database-s3-accepted')
assert.ok(databaseS3.required.includes('databaseFinalState'))
assert.ok(databaseS3.required.includes('migrationMarkers'))
assert.ok(databaseS3.required.includes('s3BusinessFlow'))
assert.ok(databaseS3.required.includes('rawObjectRestricted'))

const pending = fixture.traces.find((trace) => trace.id === 'runtime-pending')
assert.equal(pending.terminalState, 'stopped')
assert.equal(pending.reason, 'runtime_pending')
assert.equal(pending.nextAction, 'run Runtime Truth')

const convergenceFailure = fixture.traces.find((trace) => trace.id === 'warning-advance-and-restart')
assert.equal(convergenceFailure.terminalState, 'error')
assert.ok(convergenceFailure.activeFailures.includes('warning_advance'))
assert.ok(convergenceFailure.activeFailures.includes('restart_delta'))

const footprintFailure = fixture.traces.find((trace) => trace.id === 'footprint-listing-error')
assert.equal(footprintFailure.collectionOk, false)
assert.equal(footprintFailure.terminalState, 'error')

const canvas = fixture.traces.find((trace) => trace.id === 'canvas-sanitized-handoff')
assert.equal(canvas.canvasHandoff.target, 'sealos-canvas')
assert.equal(canvas.canvasHandoff.allowedAction, 'read-only topology inspection')
assert.equal(canvas.canvasHandoff.redaction, 'complete')
for (const artifactPath of canvas.canvasHandoff.artifactPaths) {
  assert.equal(path.isAbsolute(artifactPath), false)
  assert.equal(artifactPath.split('/').includes('..'), false)
}

for (const trace of fixture.traces) {
  const serialized = JSON.stringify(trace)
  assert.equal(/(password|token|cookie|secret|kubeconfig)\s*[:=]\s*[^<\s]/i.test(serialized), false, `${trace.id} contains secret material`)
}

function withMissingEvidence(trace, field) {
  return { ...trace, required: trace.required.filter((entry) => entry !== field) }
}

const publicWithoutAuth = withMissingEvidence(publicWeb, 'auth')
assert.equal(publicWithoutAuth.required.includes('auth'), false)
assert.equal(publicWithoutAuth.required.includes('baselineFinal'), true)
assert.equal(publicWithoutAuth.terminalState, 'success')
assert.notEqual(publicWithoutAuth.required.includes('auth'), publicWeb.required.includes('auth'), 'mutation must change the acceptance evidence')

const s3WithoutRestriction = withMissingEvidence(databaseS3, 'rawObjectRestricted')
assert.equal(s3WithoutRestriction.required.includes('rawObjectRestricted'), false)
assert.equal(databaseS3.required.includes('rawObjectRestricted'), true)

console.log(`runtime truth contract: ${fixture.traces.length} workload traces, conditional probes, convergence, redaction, and Canvas handoff passed`)
