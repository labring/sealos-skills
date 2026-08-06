#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const files = {
  preflight: fs.readFileSync(path.join(root, 'skills/sealos-deploy/modules/preflight.md'), 'utf8'),
  pipeline: fs.readFileSync(path.join(root, 'skills/sealos-deploy/modules/pipeline.md'), 'utf8'),
  playbooks: fs.readFileSync(path.join(root, 'skills/sealos-deploy/references/live-smoke-playbooks.md'), 'utf8'),
  entry: fs.readFileSync(path.join(root, 'skills/sealos-deploy/SKILL.md'), 'utf8'),
}

const markers = [
  ['preflight', 'Safety Contract: Immediate and Conditional Capabilities'],
  ['preflight', 'confirmation_required'],
  ['preflight', 'Preflight itself performs no provider mutation.'],
  ['pipeline', 'Safety Contract: Full-Footprint Cleanup'],
  ['pipeline', '`collectionOk: true`'],
  ['pipeline', '`ObjectStorageBucket` resources'],
  ['pipeline', 'Safety Contract: Rollback and Branch Boundary'],
  ['pipeline', '`brain-deploy-preview` stays prepare-only'],
  ['pipeline', 'sandbox Kaniko'],
  ['pipeline', 'deployment eligibility gate'],
  ['pipeline', 'KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify'],
  ['playbooks', 'Safety Contract: Confirmation and Evidence'],
  ['playbooks', 'rotation findings'],
  ['entry', 'Redact passwords, tokens, cookies, env values, kubeconfig, Secret data'],
]

function contractPasses(snapshot) {
  return markers.every(([file, marker]) => snapshot[file].includes(marker))
}

assert.equal(contractPasses(files), true)

for (const [file, marker] of markers) {
  const mutation = { ...files, [file]: files[file].split(marker).join('') }
  assert.equal(contractPasses(mutation), false, `removing ${marker} must fail the safety contract`)
}

assert.match(files.preflight, /immediate_blockers[\s\S]*conditional_warnings[\s\S]*blocked_phases/)
assert.match(files.preflight, /auth\/workspace[\s\S]*eligibility gate[\s\S]*public exposure[\s\S]*rollback/)
assert.match(files.pipeline, /Instance[\s\S]*apps\.app\.sealos\.io[\s\S]*Deployments[\s\S]*Jobs[\s\S]*PVCs[\s\S]*KubeBlocks[\s\S]*ObjectStorageBucket/)
assert.match(files.pipeline, /previous image[\s\S]*validated state[\s\S]*Runtime Truth report/)
assert.match(files.playbooks, /credentials[\s\S]*cookies[\s\S]*tokens[\s\S]*Secret data[\s\S]*kubeconfig[\s\S]*redacted/)

const forbiddenSecretPatterns = [
  /password[ \t]*[:=][ \t]*[^<\s"]/i,
  /bearer\s+[A-Za-z0-9._-]{8,}/i,
]
for (const content of Object.values(files)) {
  for (const pattern of forbiddenSecretPatterns) assert.equal(pattern.test(content), false, `safety docs contain a secret-like value: ${pattern}`)
}

console.log(`deploy safety contract: ${markers.length} load-bearing markers and mutation guards passed`)
