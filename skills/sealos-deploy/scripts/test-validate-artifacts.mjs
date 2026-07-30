#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { validateArtifactSet } from './validate-artifacts.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const validatorScript = path.join(__dirname, 'validate-artifacts.mjs')
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
    generated_at: '2026-07-30T00:00:00.000Z',
    project: {
      github_url: 'https://github.com/acme/web',
      work_dir: root,
      repo_name: 'web',
      branch: 'main',
    },
    score: {
      total: 12,
      raw_score: 12,
      bonus: 0,
      verdict: 'excellent',
      dimensions: {
        statelessness: 2,
        config: 2,
        scalability: 2,
        startup: 2,
        observability: 2,
        boundaries: 2,
      },
    },
    language: 'javascript',
    all_languages: ['javascript'],
    framework: 'express',
    package_manager: 'npm',
    port: 3000,
    databases: [],
    runtime_version: {
      node: '22',
      source: 'package.json',
    },
    env_vars: {},
    has_dockerfile: true,
    complexity_tier: 'L1',
    image_ref: imageRef,
    image_inventory: [],
    service_inventory: [{
      name: 'web',
      role: 'application',
      source: 'implicit-single-service',
      source_file: 'package.json',
      declared_image: null,
      build: {
        context: '.',
        dockerfile: 'Dockerfile',
        target: null,
        args: [],
        origin: 'existing',
      },
      image_status: 'built',
      image_ref: imageRef,
      digest,
      platforms: ['linux/amd64'],
    }],
  })
  write(root, '.sealos/template-references.json', {
    version: '2.0',
    generated_at: '2026-07-30T00:00:00.000Z',
    catalog: {
      available: false,
      repository: 'https://github.com/labring-actions/templates.git',
      ref: 'kb-0.9',
      commit: null,
      source: 'unavailable',
      stale: false,
      verified_for_reuse: false,
      template_count: 0,
      skipped_templates: 0,
      reason: 'catalog unavailable',
    },
    project: {
      github_url: 'https://github.com/acme/web',
      repo_reference: 'acme/web',
      repo_subdir: null,
      features: {
        app_workloads: 1,
        databases: [],
        framework: 'express',
        language: 'javascript',
        object_storage: false,
        persistent: false,
        roles: ['application'],
        websocket: false,
      },
    },
    references: [],
    summary: {
      exact_count: 0,
      similar_count: 0,
    },
    decision: {
      route: 'continue_standard_pipeline',
      reuse_requested: false,
      reference_name: null,
      template_path: null,
      reason: 'catalog unavailable',
    },
    reference_dir: '.sealos/template-references',
    reason: 'catalog unavailable',
  })
  write(root, '.sealos/build-request.json', {
    version: '2.0',
    generated_at: '2026-07-30T00:01:00.000Z',
    route: 'standard',
    source: {
      type: 'sandbox-context',
      github_url: 'https://github.com/acme/web',
      repo: 'acme/web',
      ref: '0123456789abcdef0123456789abcdef01234567',
      work_dir: root,
    },
    primary_service: 'web',
    services: [{
      name: 'web',
      artifact_key: 'web',
      role: 'application',
      mode: 'build-required',
      image: {
        image_ref: null,
        target_image: 'ghcr.io/acme/web:prepare-test',
        platforms: [],
        pull_access: null,
      },
      build: {
        context_path: '.',
        dockerfile_path: 'Dockerfile',
        target: null,
        build_arg_names: [],
      },
      runtime: { port: 3000 },
    }],
  })
  write(root, '.sealos/build-result.json', {
    version: '2.0',
    generated_at: '2026-07-30T00:02:00.000Z',
    route: 'standard',
    status: 'succeeded',
    primary_service: 'web',
    mode: 'build-required',
    image: {
      digest,
      image_ref: imageRef,
    },
    kubernetes: {
      namespace: 'ns-acme',
      job: 'kaniko-web',
      pod: 'kaniko-web-pod',
    },
    expected_services: 1,
    services: [{
      name: 'web',
      artifact_key: 'web',
      outcome: 'success',
      image: {
        remote_image: 'ghcr.io/acme/web:prepare-test',
        digest,
        image_ref: imageRef,
        platforms: ['linux/amd64'],
        pull_access: 'ghcr_secret_required',
      },
      build: {
        context: '.',
        dockerfile: 'Dockerfile',
        target: null,
        build_arg_names: [],
      },
      kubernetes: {
        namespace: 'ns-acme',
        job: 'kaniko-web',
        pod: 'kaniko-web-pod',
      },
      logs: {
        local_file: '/private/logs/web.log',
      },
      error: null,
      finished_at: '2026-07-30T00:02:00.000Z',
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
    version: '2.0',
    generated_at: '2026-07-30T00:03:00.000Z',
    route: 'standard',
    artifacts: finalArtifacts,
    analysis_path: '.sealos/analysis.json',
    template_path: '.sealos/template/index.yaml',
    build_request_path: '.sealos/build-request.json',
    build_result_path: '.sealos/build-result.json',
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

test('complete artifact CLI accepts the Brain-compatible handoff', () => {
  const root = createCompleteProject()
  const result = spawnSync(
    process.execPath,
    [validatorScript, '--dir', root, '--require-complete'],
    { encoding: 'utf8' },
  )

  assert.equal(result.status, 0, result.stdout || result.stderr)
  assert.equal(JSON.parse(result.stdout).valid, true)
})

test('accepts a repaired official delivery copy while retaining its source reference', () => {
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
    primary_service: null,
    services: [],
  })
  write(root, '.sealos/build-result.json', {
    route: 'official-template',
    status: 'skipped',
    primary_service: null,
    mode: null,
    image: null,
    kubernetes: null,
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
  assert.equal(changedValidation.valid, true, JSON.stringify(changedValidation.errors))
  assert.equal(
    fs.readFileSync(path.join(root, '.sealos/template-references/web.yaml'), 'utf8'),
    officialTemplate,
  )

  fs.unlinkSync(path.join(root, '.sealos/template-references/web.yaml'))
  const missingReferenceValidation = validateArtifactSet(root, { requireComplete: true })
  assert.equal(missingReferenceValidation.valid, false)
  assert.ok(
    missingReferenceValidation.errors.some(
      (error) => error.message.includes('selected materialized reference'),
    ),
  )
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

test('rejects a Brain compatibility projection that drifts from the primary service', () => {
  const root = createCompleteProject()
  const file = path.join(root, '.sealos/build-result.json')
  const buildResult = JSON.parse(fs.readFileSync(file, 'utf8'))
  buildResult.image.image_ref = `ghcr.io/acme/other@${digest}`
  write(root, '.sealos/build-result.json', buildResult)
  const validation = validateArtifactSet(root, { requireComplete: true })

  assert.equal(validation.valid, false)
  assert.ok(validation.errors.some((error) => error.path.endsWith('.image')))
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
