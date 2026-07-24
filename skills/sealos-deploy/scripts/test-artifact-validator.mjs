#!/usr/bin/env node

import assert from 'node:assert/strict'
import test from 'node:test'

import { validateArtifactData } from './artifact-validator.mjs'

const digest = `sha256:${'a'.repeat(64)}`

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
  const result = validateArtifactData('build-result', {
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
      pushed_at: '2026-07-24T00:01:00.000Z',
    },
    finished_at: '2026-07-24T00:01:01.000Z',
  })

  assert.equal(result.valid, true, JSON.stringify(result.errors))
})

test('rejects a successful build result without a linux/amd64 target', () => {
  const result = validateArtifactData('build-result', {
    outcome: 'success',
    registry: 'ghcr',
    service: {
      name: 'web',
      artifact_key: 'web',
    },
    build: {
      image_name: 'web',
      context: '.',
      dockerfile: 'Dockerfile',
      target: null,
      build_arg_names: [],
      started_at: '2026-07-24T00:00:00.000Z',
    },
    push: {
      remote_image: 'ghcr.io/acme/web:20260724-080000',
      digest,
      image_ref: `ghcr.io/acme/web@${digest}`,
      platforms: ['linux/arm64'],
      pushed_at: '2026-07-24T00:01:00.000Z',
    },
    finished_at: '2026-07-24T00:01:01.000Z',
  })

  assert.equal(result.valid, false)
  assert.ok(result.errors.some(error => (
    error.path === '$.push.platforms'
    && error.message.includes('linux/amd64')
  )))
})
