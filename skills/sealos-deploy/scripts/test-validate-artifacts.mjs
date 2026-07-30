#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { validateArtifactSet } from './validate-artifacts.mjs'

const digest = `sha256:${'c'.repeat(64)}`

function write(root, relative, content) {
  const file = path.join(root, relative)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(
    file,
    typeof content === 'string'
      ? content
      : `${JSON.stringify(content, null, 2)}\n`,
  )
}

function createCompleteProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-artifacts-'))
  const imageRef = `ghcr.io/acme/web@${digest}`
  const finalArtifacts = [
    '.sealos/analysis.json',
    '.sealos/template-references.json',
    '.sealos/build-request.json',
    '.sealos/build-result.json',
    '.sealos/template/index.yaml',
    '.sealos/delivery-manifest.json',
  ]

  write(root, '.sealos/analysis.json', {
    project: {
      repo_name: 'web',
    },
    service_inventory: [{
      name: 'web',
      image_status: 'built',
      image_ref: imageRef,
      digest,
    }],
  })
  write(root, '.sealos/template-references.json', {
    decision: {
      route: 'continue_standard_pipeline',
    },
  })
  write(root, '.sealos/build-request.json', {
    route: 'standard',
    source: {
      repo: 'acme/web',
      work_dir: root,
    },
    services: [{
      name: 'web',
      artifact_key: 'web',
      mode: 'build-required',
      image: {
        target_image: 'ghcr.io/acme/web:prepare-test',
      },
    }],
  })
  write(root, '.sealos/build-result.json', {
    route: 'standard',
    status: 'succeeded',
    services: [{
      name: 'web',
      artifact_key: 'web',
      outcome: 'success',
      image: {
        remote_image: 'ghcr.io/acme/web:prepare-test',
        digest,
        image_ref: imageRef,
        pull_access: 'ghcr_secret_required',
      },
    }],
  })
  write(root, '.sealos/template/index.yaml', `apiVersion: app.sealos.io/v1
kind: Template
---
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      imagePullSecrets:
      - name: \${{ defaults.app_name }}
      containers:
      - name: web
        image: ${imageRef}
`)
  write(root, '.sealos/delivery-manifest.json', {
    route: 'standard',
    artifacts: finalArtifacts,
    template_references_path: '.sealos/template-references.json',
  })

  return root
}

test('accepts one complete and internally aligned prepare handoff', () => {
  const root = createCompleteProject()
  const validation = validateArtifactSet(root, { requireComplete: true })

  assert.equal(validation.valid, true, JSON.stringify(validation.errors))
  assert.equal(validation.complete, true)
})

test('accepts the stable empty build contract for an official Template', () => {
  const root = createCompleteProject()
  write(root, '.sealos/template-references.json', {
    references: [{
      name: 'web',
      match: 'exact',
      reference_path: '.sealos/template-references/web.yaml',
    }],
    decision: {
      route: 'deploy_official_template',
      reference_name: 'web',
    },
  })
  write(root, '.sealos/build-request.json', {
    route: 'official-template',
    source: {
      repo: 'acme/web',
      work_dir: root,
    },
    services: [],
  })
  write(root, '.sealos/build-result.json', {
    route: 'official-template',
    status: 'skipped',
    services: [],
  })
  const deliveryFile = path.join(root, '.sealos/delivery-manifest.json')
  const delivery = JSON.parse(fs.readFileSync(deliveryFile, 'utf8'))
  delivery.route = 'official-template'
  write(root, '.sealos/delivery-manifest.json', delivery)
  const officialTemplate = 'apiVersion: app.sealos.io/v1\nkind: Template\n'
  write(root, '.sealos/template-references/web.yaml', officialTemplate)
  write(root, '.sealos/template/index.yaml', officialTemplate)

  const validation = validateArtifactSet(root, { requireComplete: true })
  assert.equal(validation.valid, true, JSON.stringify(validation.errors))

  write(root, '.sealos/template/index.yaml', `${officialTemplate}metadata:\n  name: changed\n`)
  const changedValidation = validateArtifactSet(root, { requireComplete: true })
  assert.equal(changedValidation.valid, false)
  assert.ok(changedValidation.errors.some((error) => error.message.includes('identical')))
})

test('rejects a missing final artifact', () => {
  const root = createCompleteProject()
  fs.unlinkSync(path.join(root, '.sealos/template/index.yaml'))
  const validation = validateArtifactSet(root, { requireComplete: true })

  assert.equal(validation.valid, false)
  assert.ok(validation.errors.some((error) => error.message.includes('missing')))
})

test('rejects route drift across final artifacts', () => {
  const root = createCompleteProject()
  const file = path.join(root, '.sealos/build-result.json')
  const buildResult = JSON.parse(fs.readFileSync(file, 'utf8'))
  buildResult.route = 'official-template'
  write(root, '.sealos/build-result.json', buildResult)
  const validation = validateArtifactSet(root, { requireComplete: true })

  assert.equal(validation.valid, false)
  assert.ok(validation.errors.some((error) => error.message.includes('template-reference route')))
})

test('rejects a resolved final container omitted from the aggregate request', () => {
  const root = createCompleteProject()
  const analysisFile = path.join(root, '.sealos/analysis.json')
  const currentAnalysis = JSON.parse(fs.readFileSync(analysisFile, 'utf8'))
  currentAnalysis.service_inventory.push({
    name: 'worker',
    image_status: 'verified',
    image_ref: `ghcr.io/acme/worker@${digest}`,
    digest,
  })
  write(root, '.sealos/analysis.json', currentAnalysis)

  const validation = validateArtifactSet(root, { requireComplete: true })

  assert.equal(validation.valid, false)
  assert.ok(validation.errors.some((error) => error.message.includes('every resolved final container')))
})

test('rejects an unresolved final container at delivery time', () => {
  const root = createCompleteProject()
  const analysisFile = path.join(root, '.sealos/analysis.json')
  const currentAnalysis = JSON.parse(fs.readFileSync(analysisFile, 'utf8'))
  currentAnalysis.service_inventory[0].image_status = 'build_required'
  currentAnalysis.service_inventory[0].image_ref = null
  currentAnalysis.service_inventory[0].digest = null
  write(root, '.sealos/analysis.json', currentAnalysis)

  const validation = validateArtifactSet(root, { requireComplete: true })

  assert.equal(validation.valid, false)
  assert.ok(validation.errors.some((error) => error.message.includes('must be resolved')))
})

test('rejects inline registry credential material from the Template', () => {
  const root = createCompleteProject()
  fs.appendFileSync(
    path.join(root, '.sealos/template/index.yaml'),
    '\nstringData:\n  .dockerconfigjson: forbidden\n',
  )
  const validation = validateArtifactSet(root, { requireComplete: true })

  assert.equal(validation.valid, false)
  assert.ok(validation.errors.some((error) => error.message.includes('credential payloads')))
})
