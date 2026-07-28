#!/usr/bin/env node

import assert from 'node:assert/strict'
import test from 'node:test'

import { validateArtifactData } from './artifact-validator.mjs'

const digest = `sha256:${'a'.repeat(64)}`
const nextDigest = `sha256:${'b'.repeat(64)}`

function buildResult(overrides = {}) {
  return {
    outcome: 'success',
    registry: 'ghcr',
    service: {
      name: 'web',
      artifact_key: 'web',
    },
    build: {
      image_name: 'web',
      context: 'apps/web',
      dockerfile: 'apps/web/Dockerfile',
      target: 'runtime',
      build_arg_names: ['NODE_ENV'],
      started_at: '2026-07-24T00:00:00.000Z',
    },
    push: {
      remote_image: 'ghcr.io/acme/web:20260724-080000',
      digest,
      image_ref: `ghcr.io/acme/web@${digest}`,
      platforms: ['linux/amd64'],
      pull_access: 'anonymous',
      pushed_at: '2026-07-24T00:01:00.000Z',
    },
    finished_at: '2026-07-24T00:01:01.000Z',
    ...overrides,
  }
}

function state(overrides = {}) {
  const image = `ghcr.io/acme/web@${digest}`
  return {
    version: '1.0',
    last_deploy: {
      app_name: 'web',
      app_host: 'web.usw.sealos.io',
      namespace: 'ns-acme',
      region: 'usw.sealos.io',
      image,
      repo_name: 'web',
      url: 'https://web.usw.sealos.io',
      deployed_at: '2026-07-24T00:00:00.000Z',
      last_updated_at: '2026-07-24T00:00:00.000Z',
    },
    history: [{
      at: '2026-07-24T00:00:00.000Z',
      action: 'deploy',
      image,
      method: 'template-api',
      status: 'success',
    }],
    ...overrides,
  }
}

function multiServiceState () {
  const primaryImage = `ghcr.io/acme/web@${digest}`
  const previousWorkerImage = `ghcr.io/acme/worker@${digest}`
  const workerImage = `ghcr.io/acme/worker@${nextDigest}`
  return {
    version: '1.1',
    last_deploy: {
      app_name: 'web',
      app_host: 'web.usw.sealos.io',
      namespace: 'ns-acme',
      region: 'usw.sealos.io',
      image: primaryImage,
      services: [
        {
          name: 'web',
          primary: true,
          workload_kind: 'Deployment',
          workload_name: 'web',
          container_name: 'web',
          image: primaryImage,
          pull_access: 'anonymous',
          build: {
            context: 'apps/web',
            dockerfile: 'Dockerfile',
            target: null,
            build_arg_names: [],
          },
        },
        {
          name: 'worker',
          primary: false,
          workload_kind: 'Deployment',
          workload_name: 'web-worker',
          container_name: 'worker',
          image: workerImage,
          pull_access: 'ghcr_secret_required',
          build: {
            context: 'apps/worker',
            dockerfile: 'Dockerfile',
            target: 'runtime',
            build_arg_names: ['NODE_ENV'],
          },
        },
      ],
      repo_name: 'web',
      url: 'https://web.usw.sealos.io',
      deployed_at: '2026-07-24T00:00:00.000Z',
      last_updated_at: '2026-07-24T00:02:00.000Z',
    },
    history: [
      {
        at: '2026-07-24T00:00:00.000Z',
        action: 'deploy',
        image: primaryImage,
        method: 'template-api',
        status: 'success',
      },
      {
        at: '2026-07-24T00:02:00.000Z',
        action: 'set-image',
        service: 'worker',
        workload_kind: 'Deployment',
        workload_name: 'web-worker',
        container_name: 'worker',
        previous_image: previousWorkerImage,
        image: workerImage,
        method: 'kubectl-set-image',
        status: 'success',
      },
    ],
  }
}

function workerOnlyState ({ emptyServiceMap = false } = {}) {
  const current = multiServiceState()
  const worker = structuredClone(current.last_deploy.services[1])
  worker.primary = false
  current.last_deploy.app_host = null
  current.last_deploy.image = null
  current.last_deploy.services = emptyServiceMap ? [] : [worker]
  current.last_deploy.url = null
  current.last_deploy.last_updated_at = current.last_deploy.deployed_at
  current.history = [{
    at: current.last_deploy.deployed_at,
    action: 'deploy',
    image: null,
    method: 'template-api',
    status: 'success',
  }]
  return current
}

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
    language: 'node',
    all_languages: ['node'],
    framework: 'express',
    package_manager: 'npm',
    port: 3000,
    databases: ['postgres'],
    runtime_version: {
      node: '22',
      source: 'package.json',
    },
    env_vars: {},
    has_dockerfile: true,
    complexity_tier: 'L2',
    image_ref: null,
    image_inventory: [],
    service_inventory: [],
    ...overrides,
  }
}

test('accepts the Phase 1 artifact before image discovery', () => {
  const result = validateArtifactData('analysis', analysis())
  assert.equal(result.valid, true, JSON.stringify(result.errors))
})

test('accepts the Phase 1 score bonus contract', () => {
  const result = validateArtifactData('analysis', analysis({
    score: {
      total: 7,
      raw_score: 6,
      bonus: 1,
      verdict: 'good',
      dimensions: {
        statelessness: 1,
        config: 1,
        scalability: 1,
        startup: 1,
        observability: 1,
        boundaries: 1,
      },
    },
  }))

  assert.equal(result.valid, true, JSON.stringify(result.errors))
})

test('rejects inconsistent Phase 1 score bonus fields', () => {
  const rawScoreMismatch = validateArtifactData('analysis', analysis({
    score: {
      total: 7,
      raw_score: 5,
      bonus: 1,
      verdict: 'good',
      dimensions: {
        statelessness: 1,
        config: 1,
        scalability: 1,
        startup: 1,
        observability: 1,
        boundaries: 1,
      },
    },
  }))
  const totalMismatch = validateArtifactData('analysis', analysis({
    score: {
      total: 6,
      raw_score: 6,
      bonus: 1,
      verdict: 'good',
      dimensions: {
        statelessness: 1,
        config: 1,
        scalability: 1,
        startup: 1,
        observability: 1,
        boundaries: 1,
      },
    },
  }))

  assert.equal(rawScoreMismatch.valid, false)
  assert.ok(rawScoreMismatch.errors.some(error => error.path === '$.score.raw_score'))
  assert.equal(totalMismatch.valid, false)
  assert.ok(totalMismatch.errors.some(error => error.path === '$.score.total'))
})

test('accepts a public service project override and rejects non-string values', () => {
  const valid = validateArtifactData('config', {
    port: 3000,
    public_service: 'frontend',
    deployment_source: {
      kind: 'helm',
      path: 'charts/platform',
    },
  })
  const invalid = validateArtifactData('config', {
    public_service: 3000,
  })

  assert.equal(valid.valid, true, JSON.stringify(valid.errors))
  assert.equal(invalid.valid, false)
  assert.ok(invalid.errors.some(error => error.path === '$.public_service'))
})

test('accepts Helm deployment source and container identity evidence', () => {
  const result = validateArtifactData('analysis', analysis({
    deployment_source: {
      kind: 'helm',
      path: 'charts/platform',
      source_hash: `sha256:${'a'.repeat(64)}`,
      evidence: ['charts/platform/Chart.yaml'],
      rendered_path: '.sealos/deployment-source/rendered.yaml',
      dependency_mode: 'locked',
      resources: [{
        api_version: 'apps/v1',
        kind: 'Deployment',
        name: 'api',
        source_file: '.sealos/deployment-source/rendered.yaml',
      }],
    },
    image_inventory: [{
      image: 'ghcr.io/acme/api',
      declared_ref: 'ghcr.io/acme/api:latest',
      declared_tag: 'latest',
      resolution_tag: 'latest',
      declared_digest: null,
      registry: 'ghcr',
      role: 'application',
      sources: [{
        source: 'helm',
        file: '.sealos/deployment-source/rendered.yaml',
        service: 'api',
        declared_ref: 'ghcr.io/acme/api:latest',
      }],
      status: 'unavailable',
      digest: null,
      image_ref: null,
      error: 'private source image',
    }],
    service_inventory: [{
      name: 'api',
      role: 'application',
      source: 'helm',
      source_file: '.sealos/deployment-source/rendered.yaml',
      resource_kind: 'Deployment',
      workload_name: 'api',
      container_name: 'api',
      container_role: 'main',
      declared_image: 'ghcr.io/acme/api:latest',
      build: null,
      image_status: 'unavailable',
      image_ref: null,
      digest: null,
    }],
  }))

  assert.equal(result.valid, true, JSON.stringify(result.errors))
})

test('accepts a structured per-service build plan with arg names only', () => {
  const result = validateArtifactData('analysis', analysis({
    service_inventory: [{
      name: 'web',
      role: 'application',
      source: 'project',
      source_file: '.',
      declared_image: null,
      build: {
        context: '.',
        dockerfile: 'Dockerfile',
        target: 'runtime',
        args: ['PUBLIC_MODE', 'PRIVATE_TOKEN'],
        origin: 'existing',
      },
      image_status: 'build_required',
      image_ref: null,
      digest: null,
    }],
  }))

  assert.equal(result.valid, true, JSON.stringify(result.errors))
})

test('rejects legacy build strings and persisted build arg values', () => {
  const service = {
    name: 'web',
    role: 'application',
    source: 'compose',
    source_file: 'compose.yaml',
    declared_image: null,
    image_status: 'build_required',
    image_ref: null,
    digest: null,
  }
  const legacy = validateArtifactData('analysis', analysis({
    service_inventory: [{
      ...service,
      build: './services/web',
    }],
  }))
  const leakedValue = validateArtifactData('analysis', analysis({
    service_inventory: [{
      ...service,
      build: {
        context: './services/web',
        dockerfile: 'Dockerfile',
        target: null,
        args: ['PRIVATE_TOKEN=secret'],
        origin: null,
      },
    }],
  }))

  assert.equal(legacy.valid, false)
  assert.ok(legacy.errors.some(error => error.path === '$.service_inventory[0].build'))
  assert.equal(leakedValue.valid, false)
  assert.ok(leakedValue.errors.some(error => (
    error.path === '$.service_inventory[0].build'
  )))
})

test('requires build-required and built services to retain their build plan', () => {
  const buildRequired = validateArtifactData('analysis', analysis({
    service_inventory: [{
      name: 'worker',
      role: 'application',
      source: 'project',
      source_file: '.',
      declared_image: null,
      build: null,
      image_status: 'build_required',
      image_ref: null,
      digest: null,
    }],
  }))
  const builtWithoutOrigin = validateArtifactData('analysis', analysis({
    service_inventory: [{
      name: 'worker',
      role: 'application',
      source: 'project',
      source_file: '.',
      declared_image: null,
      build: {
        context: '.',
        dockerfile: 'Dockerfile',
        target: null,
        args: [],
        origin: null,
      },
      image_status: 'built',
      image_ref: `acme/worker@${digest}`,
      digest,
      platforms: ['linux/amd64'],
    }],
  }))

  assert.equal(buildRequired.valid, false)
  assert.ok(buildRequired.errors.some(error => (
    error.path === '$.service_inventory[0].build'
    && error.message.includes('per-service build plan')
  )))
  assert.equal(builtWithoutOrigin.valid, false)
  assert.ok(builtWithoutOrigin.errors.some(error => (
    error.path === '$.service_inventory[0].build'
    && error.message.includes('origin')
  )))
})

test('accepts a floating source selector after immutable digest resolution', () => {
  const imageRef = `acme/web@${digest}`
  const result = validateArtifactData('analysis', analysis({
    image_ref: imageRef,
    image_inventory: [{
      image: 'acme/web',
      declared_ref: 'acme/web:latest',
      declared_tag: 'latest',
      resolution_tag: 'latest',
      declared_digest: null,
      registry: 'dockerhub',
      role: 'application',
      sources: [{
        source: 'readme',
        file: 'README.md',
        service: null,
        declared_ref: 'acme/web:latest',
      }],
      status: 'verified',
      digest,
      image_ref: imageRef,
      error: null,
    }],
    service_inventory: [{
      name: 'db',
      role: 'database',
      source: 'compose',
      source_file: 'compose.yaml',
      declared_image: 'postgres:16',
      build: null,
    }],
  }))

  assert.equal(result.valid, true, JSON.stringify(result.errors))
})

test('accepts a third-party digest without pre-screening its platform', () => {
  const imageRef = `acme/web@${digest}`
  const result = validateArtifactData('analysis', analysis({
    image_ref: imageRef,
    image_inventory: [{
      image: 'acme/web',
      declared_ref: 'acme/web:stable',
      declared_tag: 'stable',
      resolution_tag: 'stable',
      declared_digest: null,
      registry: 'dockerhub',
      role: 'application',
      sources: [{
        source: 'ci',
        file: '.github/workflows/publish.yml',
        service: null,
        declared_ref: 'acme/web:stable',
      }],
      status: 'verified',
      platforms: ['linux/arm64'],
      digest,
      image_ref: imageRef,
      error: null,
    }],
    service_inventory: [{
      name: 'web',
      role: 'application',
      source: 'compose',
      source_file: 'compose.yaml',
      declared_image: 'acme/web:stable',
      build: null,
      image_status: 'verified',
      image_ref: imageRef,
      digest,
    }],
  }))

  assert.equal(result.valid, true, JSON.stringify(result.errors))
})

test('accepts a successful build result with a Buildx digest and amd64 target', () => {
  const result = validateArtifactData('build-result', buildResult())

  assert.equal(result.valid, true, JSON.stringify(result.errors))
})

test('rejects a successful build result without a linux/amd64 target', () => {
  const result = validateArtifactData('build-result', buildResult({
    push: {
      remote_image: 'ghcr.io/acme/web:20260724-080000',
      digest,
      image_ref: `ghcr.io/acme/web@${digest}`,
      platforms: ['linux/arm64'],
      pull_access: 'anonymous',
      pushed_at: '2026-07-24T00:01:00.000Z',
    },
  }))

  assert.equal(result.valid, false)
  assert.ok(result.errors.some(error => (
    error.path === '$.push.platforms'
    && error.message.includes('linux/amd64')
  )))
})

test('rejects Docker Hub as a Phase 4 registry', () => {
  const result = validateArtifactData('build-result', buildResult({
    registry: 'dockerhub',
    push: {
      ...buildResult().push,
      remote_image: 'acme/web:20260724-080000',
      image_ref: `acme/web@${digest}`,
    },
  }))

  assert.equal(result.valid, false)
})

test('requires every Phase 4 remote image to use GHCR', () => {
  const result = validateArtifactData('build-result', buildResult({
    push: {
      ...buildResult().push,
      remote_image: 'acme/web:20260724-080000',
      image_ref: `acme/web@${digest}`,
    },
  }))

  assert.equal(result.valid, false)
  assert.ok(result.errors.some(error => (
    error.path === '$.push.remote_image'
    && error.message.includes('GHCR')
  )))
})

test('requires failed Phase 4 attempts to target GHCR too', () => {
  const result = validateArtifactData('build-result', {
    outcome: 'failed',
    registry: 'ghcr',
    service: {
      name: 'web',
      artifact_key: 'web',
    },
    build: {
      image_name: 'web',
      context: 'apps/web',
      dockerfile: 'apps/web/Dockerfile',
      target: 'runtime',
      build_arg_names: ['NODE_ENV'],
      started_at: '2026-07-24T00:00:00.000Z',
    },
    push: {
      remote_image: 'acme/web:20260724-080000',
    },
    error: 'push failed',
    finished_at: '2026-07-24T00:01:01.000Z',
  })

  assert.equal(result.valid, false)
  assert.ok(result.errors.some(error => (
    error.path === '$.push.remote_image'
    && error.message.includes('GHCR')
  )))
})

test('accepts each supported GHCR pull access result', () => {
  for (const pullAccess of ['anonymous', 'ghcr_secret_required', 'indeterminate']) {
    const result = validateArtifactData('build-result', buildResult({
      push: {
        ...buildResult().push,
        pull_access: pullAccess,
      },
    }))

    assert.equal(result.valid, true, `${pullAccess}: ${JSON.stringify(result.errors)}`)
  }
})

test('rejects a successful build result without a valid pull access result', () => {
  const missing = buildResult()
  delete missing.push.pull_access
  const missingResult = validateArtifactData('build-result', missing)
  const invalidResult = validateArtifactData('build-result', buildResult({
    push: {
      ...buildResult().push,
      pull_access: 'public',
    },
  }))

  assert.equal(missingResult.valid, false)
  assert.equal(invalidResult.valid, false)
})

test('accepts current state without Docker Hub identity', () => {
  const result = validateArtifactData('state', state())

  assert.equal(result.valid, true, JSON.stringify(result.errors))
  assert.equal(
    Object.prototype.hasOwnProperty.call(state().last_deploy, 'docker_hub_user'),
    false,
  )
})

test('accepts legacy state with a deprecated Docker Hub identity', () => {
  const legacyState = state()
  legacyState.last_deploy.docker_hub_user = 'acme'
  const result = validateArtifactData('state', legacyState)

  assert.equal(result.valid, true, JSON.stringify(result.errors))
})

test('keeps version 1.0 public endpoint and image fields non-null', () => {
  for (const field of ['app_host', 'image', 'url']) {
    const legacyState = state()
    legacyState.last_deploy[field] = null
    const result = validateArtifactData('state', legacyState)

    assert.equal(result.valid, false)
    assert.ok(result.errors.some(error => (
      error.path === `$.last_deploy.${field}`
      && error.message.includes('version 1.0')
    )))
  }
})

test('accepts version 1.1 state with per-service workload targets', () => {
  const result = validateArtifactData('state', multiServiceState())

  assert.equal(result.valid, true, JSON.stringify(result.errors))
})

test('requires the version 1.1 service map and allows at most one primary', () => {
  const missingServices = multiServiceState()
  delete missingServices.last_deploy.services
  const twoPrimary = multiServiceState()
  for (const service of twoPrimary.last_deploy.services) service.primary = true
  const currentWithLegacyField = multiServiceState()
  currentWithLegacyField.last_deploy.docker_hub_user = 'acme'

  const missingResult = validateArtifactData('state', missingServices)
  const primaryResult = validateArtifactData('state', twoPrimary)
  const legacyFieldResult = validateArtifactData('state', currentWithLegacyField)

  assert.equal(missingResult.valid, false)
  assert.ok(missingResult.errors.some(error => (
    error.path === '$.last_deploy.services'
    && error.message.includes('version 1.1')
  )))
  assert.equal(primaryResult.valid, false)
  assert.ok(primaryResult.errors.some(error => (
    error.path === '$.last_deploy.services'
    && error.message.includes('at most one primary')
  )))
  assert.equal(legacyFieldResult.valid, false)
})

test('accepts worker-only and Job-only version 1.1 state without a primary or public URL', () => {
  const workerOnly = validateArtifactData('state', workerOnlyState())
  const noUpdateTargets = validateArtifactData('state', workerOnlyState({
    emptyServiceMap: true,
  }))

  assert.equal(workerOnly.valid, true, JSON.stringify(workerOnly.errors))
  assert.equal(noUpdateTargets.valid, true, JSON.stringify(noUpdateTargets.errors))
})

test('requires a null top-level image when version 1.1 has no primary target', () => {
  const noPrimary = workerOnlyState()
  noPrimary.last_deploy.image = noPrimary.last_deploy.services[0].image
  const result = validateArtifactData('state', noPrimary)

  assert.equal(result.valid, false)
  assert.ok(result.errors.some(error => (
    error.path === '$.last_deploy.image'
    && error.message.includes('no primary')
  )))
})

test('preserves an explicit legacy history prefix when migrating state to version 1.1', () => {
  const legacy = state()
  legacy.last_deploy.image = 'acme/web:second'
  legacy.last_deploy.last_updated_at = '2026-07-24T00:01:00.000Z'
  legacy.history[0].image = 'acme/web:first'
  legacy.history.push({
    at: '2026-07-24T00:01:00.000Z',
    action: 'set-image',
    previous_image: 'acme/web:first',
    image: 'acme/web:second',
    method: 'kubectl-set-image',
    status: 'success',
  })
  const preservedHistory = structuredClone(legacy.history)

  const migrated = structuredClone(legacy)
  migrated.version = '1.1'
  migrated.legacy_history_count = migrated.history.length
  migrated.last_deploy.image = `ghcr.io/acme/web@${digest}`
  migrated.last_deploy.services = [{
    name: 'web',
    primary: true,
    workload_kind: 'Deployment',
    workload_name: 'web',
    container_name: 'web',
    image: migrated.last_deploy.image,
    pull_access: 'anonymous',
    build: null,
  }]

  const migratedResult = validateArtifactData('state', migrated)
  assert.equal(migratedResult.valid, true, JSON.stringify(migratedResult.errors))
  assert.deepEqual(migrated.history, preservedHistory)

  migrated.history.push({
    at: '2026-07-24T00:02:00.000Z',
    action: 'set-image',
    service: 'web',
    workload_kind: 'Deployment',
    workload_name: 'web',
    container_name: 'web',
    previous_image: `ghcr.io/acme/web@${digest}`,
    image: `ghcr.io/acme/web@${nextDigest}`,
    method: 'kubectl-set-image',
    status: 'success',
  })
  migrated.last_deploy.image = `ghcr.io/acme/web@${nextDigest}`
  migrated.last_deploy.services[0].image = migrated.last_deploy.image
  migrated.last_deploy.last_updated_at = '2026-07-24T00:02:00.000Z'

  const updatedResult = validateArtifactData('state', migrated)
  assert.equal(updatedResult.valid, true, JSON.stringify(updatedResult.errors))
  assert.deepEqual(migrated.history.slice(0, preservedHistory.length), preservedHistory)
})

test('applies the strict version 1.1 contract after the legacy history boundary', () => {
  const migrated = workerOnlyState()
  migrated.legacy_history_count = 1
  migrated.history.push({
    at: '2026-07-24T00:01:00.000Z',
    action: 'restart',
    method: 'kubectl-rollout-restart',
    status: 'success',
  })
  migrated.last_deploy.last_updated_at = '2026-07-24T00:01:00.000Z'
  const result = validateArtifactData('state', migrated)

  assert.equal(result.valid, false)
  assert.ok(result.errors.some(error => (
    error.path === '$.history[1].service'
    && error.message.includes('version 1.1')
  )))
})

test('rejects invalid or misplaced legacy history boundaries', () => {
  const pastEnd = multiServiceState()
  pastEnd.legacy_history_count = pastEnd.history.length + 1
  const legacyVersion = state()
  legacyVersion.legacy_history_count = 1

  const pastEndResult = validateArtifactData('state', pastEnd)
  const legacyVersionResult = validateArtifactData('state', legacyVersion)

  assert.equal(pastEndResult.valid, false)
  assert.ok(pastEndResult.errors.some(error => (
    error.path === '$.legacy_history_count'
    && error.message.includes('must not exceed')
  )))
  assert.equal(legacyVersionResult.valid, false)
  assert.ok(legacyVersionResult.errors.some(error => (
    error.path === '$.legacy_history_count'
    && error.message.includes('version 1.1')
  )))
})

test('requires one normalized GHCR namespace for authenticated service images', () => {
  const normalized = multiServiceState()
  normalized.last_deploy.services[0].pull_access = 'indeterminate'
  normalized.last_deploy.services[1].image = `ghcr.io/ACME/worker@${nextDigest}`
  normalized.history[1].image = normalized.last_deploy.services[1].image

  const conflicting = structuredClone(normalized)
  conflicting.last_deploy.services[1].image = `ghcr.io/other/worker@${nextDigest}`
  conflicting.history[1].image = conflicting.last_deploy.services[1].image

  const normalizedResult = validateArtifactData('state', normalized)
  const conflictingResult = validateArtifactData('state', conflicting)

  assert.equal(normalizedResult.valid, true, JSON.stringify(normalizedResult.errors))
  assert.equal(conflictingResult.valid, false)
  assert.ok(conflictingResult.errors.some(error => (
    error.path === '$.last_deploy.services'
    && error.message.includes('one normalized namespace')
  )))
})

test('binds version 1.1 set-image history to its exact workload container', () => {
  const wrongImage = multiServiceState()
  wrongImage.last_deploy.services[1].image = `ghcr.io/acme/worker@${digest}`
  const missingTarget = multiServiceState()
  delete missingTarget.history[1].container_name

  const wrongImageResult = validateArtifactData('state', wrongImage)
  const missingTargetResult = validateArtifactData('state', missingTarget)

  assert.equal(wrongImageResult.valid, false)
  assert.ok(wrongImageResult.errors.some(error => (
    error.path === '$.last_deploy.services[1].image'
    && error.message.includes('latest successful set-image')
  )))
  assert.equal(missingTargetResult.valid, false)
})

test('binds version 1.1 restart history to its exact workload container', () => {
  const valid = multiServiceState()
  valid.history.push({
    at: '2026-07-24T00:03:00.000Z',
    action: 'restart',
    service: 'web',
    workload_kind: 'Deployment',
    workload_name: 'web',
    container_name: 'web',
    method: 'kubectl-rollout-restart',
    status: 'success',
  })
  valid.last_deploy.last_updated_at = '2026-07-24T00:03:00.000Z'
  const missingTarget = structuredClone(valid)
  delete missingTarget.history[2].service

  const validResult = validateArtifactData('state', valid)
  const missingResult = validateArtifactData('state', missingTarget)

  assert.equal(validResult.valid, true, JSON.stringify(validResult.errors))
  assert.equal(missingResult.valid, false)
})
