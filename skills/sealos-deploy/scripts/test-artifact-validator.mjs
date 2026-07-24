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

test('accepts a floating source selector after amd64 digest resolution', () => {
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
      platforms: ['linux/amd64', 'linux/arm64'],
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

test('rejects a verified inventory image without linux/amd64', () => {
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
    service_inventory: [],
  }))

  assert.equal(result.valid, false)
  assert.ok(result.errors.some(error => (
    error.path === '$.image_inventory[0].platforms'
    && error.message.includes('linux/amd64')
  )))
})

test('accepts a successful build result only after digest and amd64 verification', () => {
  const result = validateArtifactData('build-result', {
    outcome: 'success',
    registry: 'ghcr',
    build: {
      image_name: 'web',
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

test('rejects a successful build result without linux/amd64', () => {
  const result = validateArtifactData('build-result', {
    outcome: 'success',
    registry: 'ghcr',
    build: {
      image_name: 'web',
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
