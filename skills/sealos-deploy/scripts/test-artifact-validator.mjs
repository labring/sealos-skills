#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  inferArtifactKind,
  validateArtifactData,
} from './artifact-validator.mjs'

const digest = `sha256:${'a'.repeat(64)}`
const secondDigest = `sha256:${'b'.repeat(64)}`
const templateReferenceFinder = fileURLToPath(
  new URL('./find-template-references.mjs', import.meta.url),
)

function analysis(overrides = {}) {
  return {
    generated_at: '2026-07-24T00:00:00.000Z',
    project: {
      github_url: 'https://github.com/acme/web',
      work_dir: '/tmp/web',
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
    image_ref: null,
    image_inventory: [],
    service_inventory: [],
    ...overrides,
  }
}

function request(route = 'standard') {
  return {
    version: '2.0',
    generated_at: '2026-07-24T00:00:00.000Z',
    route,
    source: {
      type: 'sandbox-context',
      github_url: 'https://github.com/acme/web',
      repo: 'acme/web',
      ref: '0123456789abcdef0123456789abcdef01234567',
      work_dir: '/tmp/web',
    },
    primary_service: route === 'official-template' ? null : 'web',
    services: route === 'official-template' ? [] : [
      {
        name: 'proxy',
        artifact_key: 'proxy',
        role: 'infrastructure',
        mode: 'reuse-image',
        image: {
          image_ref: `nginx@${digest}`,
          target_image: null,
          platforms: [],
          pull_access: 'anonymous',
        },
        build: null,
        runtime: { port: 80 },
      },
      {
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
          dockerfile_path: 'apps/web/Dockerfile',
          target: 'runtime',
          build_arg_names: ['NODE_ENV'],
        },
        runtime: { port: 3000 },
      },
    ],
  }
}

function result(route = 'standard') {
  return {
    version: '2.0',
    generated_at: '2026-07-24T00:01:00.000Z',
    route,
    status: route === 'official-template' ? 'skipped' : 'succeeded',
    primary_service: route === 'official-template' ? null : 'web',
    mode: route === 'official-template' ? null : 'build-required',
    image: route === 'official-template'
      ? null
      : {
          image_ref: `ghcr.io/acme/web@${secondDigest}`,
          digest: secondDigest,
        },
    kubernetes: route === 'official-template'
      ? null
      : {
          namespace: 'ns-acme',
          job: 'kaniko-web',
          pod: 'kaniko-web-pod',
        },
    expected_services: route === 'official-template' ? 0 : 2,
    services: route === 'official-template' ? [] : [
      {
        name: 'proxy',
        artifact_key: 'proxy',
        outcome: 'reused',
        image: {
          remote_image: null,
          digest,
          image_ref: `nginx@${digest}`,
          platforms: [],
          pull_access: 'anonymous',
        },
        build: null,
        kubernetes: null,
        logs: null,
        error: null,
        finished_at: '2026-07-24T00:00:30.000Z',
      },
      {
        name: 'web',
        artifact_key: 'web',
        outcome: 'success',
        image: {
          remote_image: 'ghcr.io/acme/web:prepare-test',
          digest: secondDigest,
          image_ref: `ghcr.io/acme/web@${secondDigest}`,
          platforms: ['linux/amd64'],
          pull_access: 'ghcr_secret_required',
        },
        build: {
          context: '.',
          dockerfile: 'apps/web/Dockerfile',
          target: 'runtime',
          build_arg_names: ['NODE_ENV'],
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
        finished_at: '2026-07-24T00:01:00.000Z',
      },
    ],
  }
}

function standardReferences() {
  return {
    version: '2.0',
    generated_at: '2026-07-24T00:00:00.000Z',
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
      reason: 'official catalog unavailable',
    },
    reference_dir: '.sealos/template-references',
    reason: 'official catalog unavailable',
  }
}

test('accepts current Phase 1 facts and open vocabulary', () => {
  const current = validateArtifactData('analysis', analysis())
  const staticProject = validateArtifactData('analysis', analysis({
    language: 'html',
    all_languages: ['html', 'css', 'javascript'],
    framework: 'nginx',
    package_manager: null,
    runtime_version: {},
  }))

  assert.equal(current.valid, true, JSON.stringify(current.errors))
  assert.equal(staticProject.valid, true, JSON.stringify(staticProject.errors))
})

test('enables automatic official-template reuse when the option is omitted', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-template-reuse-'))
  const skillDir = path.join(root, 'skill')
  const analysisPath = path.join(root, '.sealos', 'analysis.json')
  const current = analysis()
  current.project.work_dir = root
  fs.mkdirSync(path.dirname(analysisPath), { recursive: true })
  fs.mkdirSync(skillDir)
  fs.writeFileSync(analysisPath, `${JSON.stringify(current)}\n`)
  fs.writeFileSync(
    path.join(skillDir, 'config.json'),
    `${JSON.stringify({ template_catalog: { enabled: false } })}\n`,
  )

  const result = spawnSync(process.execPath, [
    templateReferenceFinder,
    '--work-dir', root,
    '--skill-dir', skillDir,
    '--analysis', analysisPath,
  ], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)

  const references = JSON.parse(
    fs.readFileSync(path.join(root, '.sealos', 'template-references.json'), 'utf8'),
  )

  assert.equal(references.decision.reuse_requested, true)
})

test('enforces the score arithmetic contract', () => {
  const invalid = analysis()
  invalid.score.total = 11
  const validation = validateArtifactData('analysis', invalid)

  assert.equal(validation.valid, false)
  assert.ok(validation.errors.some((error) => error.path === '$.score.total'))
})

test('keeps project config prepare-only', () => {
  const valid = validateArtifactData('config', {
    public_service: 'frontend',
    deployment_source: {
      kind: 'helm',
      path: 'charts/platform',
    },
    skip_phases: ['assess'],
  })
  const invalid = validateArtifactData('config', {
    skip_phases: ['deploy'],
  })

  assert.equal(valid.valid, true, JSON.stringify(valid.errors))
  assert.equal(invalid.valid, false)
})

test('accepts aggregate standard and official build requests', () => {
  for (const route of ['standard', 'official-template']) {
    const validation = validateArtifactData('build-request', request(route))
    assert.equal(validation.valid, true, JSON.stringify(validation.errors))
  }
})

test('rejects escaped Dockerfile paths and persisted build values', () => {
  const escaped = request()
  escaped.services[1].build.dockerfile_path = '../Dockerfile'
  const secretValue = request()
  secretValue.services[1].build.build_args = { TOKEN: 'secret' }

  assert.equal(validateArtifactData('build-request', escaped).valid, false)
  assert.equal(validateArtifactData('build-request', secretValue).valid, false)
})

test('rejects service-bearing official-template requests', () => {
  const invalid = request('official-template')
  invalid.services = request().services
  const validation = validateArtifactData('build-request', invalid)

  assert.equal(validation.valid, false)
  assert.ok(validation.errors.some((error) => error.path === '$.services'))
})

test('requires a standard request to identify one primary service', () => {
  const invalid = request()
  invalid.primary_service = 'missing'
  const validation = validateArtifactData('build-request', invalid)

  assert.equal(validation.valid, false)
  assert.ok(validation.errors.some((error) => error.path === '$.primary_service'))
})

test('accepts aggregate standard and official build results', () => {
  for (const route of ['standard', 'official-template']) {
    const validation = validateArtifactData('build-result', result(route))
    assert.equal(validation.valid, true, JSON.stringify(validation.errors))
  }
})

test('requires successful Kaniko results to be immutable amd64 images', () => {
  const invalid = result()
  invalid.services[1].image.platforms = ['linux/arm64']
  const validation = validateArtifactData('build-result', invalid)

  assert.equal(validation.valid, false)
  assert.ok(validation.errors.some((error) => error.path.includes('platforms')))
})

test('requires the Brain compatibility image to match the primary service', () => {
  const invalid = result()
  invalid.image.image_ref = `ghcr.io/acme/other@${secondDigest}`
  const validation = validateArtifactData('build-result', invalid)

  assert.equal(validation.valid, false)
  assert.ok(validation.errors.some((error) => error.path === '$.image'))
})

test('requires failed services to omit deployable image claims', () => {
  const invalid = result()
  invalid.status = 'failed'
  invalid.services[1].outcome = 'failed'
  invalid.services[1].error = {
    phase: 'kaniko',
    message: 'build failed',
  }
  const validation = validateArtifactData('build-result', invalid)

  assert.equal(validation.valid, false)
  assert.ok(validation.errors.some((error) => error.message.includes('must not expose')))
})

test('accepts the standard unavailable-catalog decision', () => {
  const validation = validateArtifactData(
    'template-references',
    standardReferences(),
  )
  assert.equal(validation.valid, true, JSON.stringify(validation.errors))
})

test('delivery manifest requires canonical final paths and rejects private evidence', () => {
  const manifest = {
    version: '2.0',
    generated_at: '2026-07-24T00:02:00.000Z',
    route: 'standard',
    artifacts: [
      '.sealos/analysis.json',
      '.sealos/template-references.json',
      '.sealos/build-request.json',
      '.sealos/build-result.json',
      '.sealos/template/index.yaml',
      '.sealos/delivery-manifest.json',
    ],
    analysis_path: '.sealos/analysis.json',
    template_path: '.sealos/template/index.yaml',
    build_request_path: '.sealos/build-request.json',
    build_result_path: '.sealos/build-result.json',
    template_references_path: '.sealos/template-references.json',
  }
  const valid = validateArtifactData('delivery-manifest', manifest)
  const privateManifest = structuredClone(manifest)
  privateManifest.artifacts.push('.sealos/kaniko/web/job.yaml')
  const invalid = validateArtifactData('delivery-manifest', privateManifest)

  assert.equal(valid.valid, true, JSON.stringify(valid.errors))
  assert.equal(invalid.valid, false)
  assert.ok(invalid.errors.some((error) => error.message.includes('private build')))
})

test('does not recognize deployment state as a prepare artifact', () => {
  assert.equal(inferArtifactKind('/tmp/project/.sealos/state.json'), null)
})
