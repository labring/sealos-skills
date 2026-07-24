import assert from 'assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import test from 'node:test'

import { validateArtifactData } from './artifact-validator.mjs'

function sampleAnalysis(buildEnvironment) {
  return {
    generated_at: '2026-06-17T00:00:00.000Z',
    project: {
      github_url: 'https://github.com/example/web',
      work_dir: '/workspace/web',
      repo_name: 'example/web',
      branch: 'main',
    },
    score: {
      total: 8,
      verdict: 'Good',
      dimensions: {
        statelessness: 1,
        config: 1,
        scalability: 1,
        startup: 1,
        observability: 2,
        boundaries: 2,
      },
    },
    language: 'node',
    all_languages: ['node'],
    framework: 'nextjs',
    package_manager: 'pnpm',
    port: 3000,
    databases: [],
    runtime_version: {
      source: 'default',
      node: '22',
    },
    env_vars: {},
    build_environment: buildEnvironment,
    has_dockerfile: false,
    complexity_tier: 'L3',
    image_ref: null,
  }
}

function sampleBuildRequest(workDir, build) {
  return {
    version: '1.0',
    generated_at: '2026-06-16T00:00:00.000Z',
    source: {
      type: 'sandbox-context',
      github_url: 'https://github.com/AykutSarac/jsoncrack.com',
      repo: 'AykutSarac/jsoncrack.com',
      ref: '3c9af69e23c6aaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      work_dir: workDir,
    },
    mode: 'build-required',
    image: {
      image_ref: null,
      target_image: 'ghcr.io/che-zhu/jsoncrack.com:prepare-test',
    },
    build,
    runtime: {
      port: 3000,
    },
  }
}

test('accepts detected Railpack build environment summary in analysis', () => {
  const result = validateArtifactData('analysis', sampleAnalysis({
    source: 'railpack',
    status: 'detected',
    project_type: 'nodejs',
    providers: ['node'],
    runtime_versions: {
      node: '20.x',
    },
    package_manager: 'pnpm',
    port: 4173,
    install_command: 'pnpm install --frozen-lockfile',
    build_command: 'pnpm build',
    start_command: 'pnpm start',
    system_packages: ['openssl'],
    env_vars: {
      PORT: '4173',
    },
    confidence: 'high',
    evidence_paths: [
      '.sealos/railpack-info.json',
      '.sealos/railpack-plan.json',
    ],
    config_overrides: ['build_command', 'port'],
  }))

  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2))
})

test('accepts skipped Railpack build environment summary in analysis', () => {
  const result = validateArtifactData('analysis', sampleAnalysis({
    source: 'railpack',
    status: 'skipped',
    reason: 'railpack binary is not available',
    confidence: 'low',
    evidence_paths: [],
  }))

  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2))
})

test('rejects detected Railpack summary without build signals', () => {
  const result = validateArtifactData('analysis', sampleAnalysis({
    source: 'railpack',
    status: 'detected',
    confidence: 'medium',
    evidence_paths: ['.sealos/railpack-info.json'],
  }))

  assert.equal(result.valid, false)
  assert.deepEqual(result.errors, [{
    path: '$.build_environment',
    message: 'detected Railpack output must include at least one build signal',
  }])
})

test('rejects a Dockerfile context that omits files copied from the monorepo root', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-validator-'))
  const appDir = path.join(workDir, 'apps', 'www')
  fs.mkdirSync(appDir, { recursive: true })
  fs.writeFileSync(path.join(workDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
  fs.writeFileSync(path.join(appDir, 'Dockerfile'), [
    'FROM node:22-alpine',
    'WORKDIR /app',
    'COPY pnpm-lock.yaml ./',
    '',
  ].join('\n'))

  const result = validateArtifactData('build-request', sampleBuildRequest(workDir, {
    context_path: 'apps/www',
    dockerfile_path: 'apps/www/Dockerfile',
    build_args: {},
  }))

  assert.equal(result.valid, false)
  assert.deepEqual(result.errors, [{
    path: '$.build.context_path',
    message: 'must include Dockerfile COPY source pnpm-lock.yaml',
  }])
})

test('accepts a monorepo root context with a subdirectory Dockerfile', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-validator-'))
  const appDir = path.join(workDir, 'apps', 'www')
  fs.mkdirSync(appDir, { recursive: true })
  fs.writeFileSync(path.join(workDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
  fs.writeFileSync(path.join(appDir, 'Dockerfile'), [
    'FROM node:22-alpine',
    'WORKDIR /app',
    'COPY pnpm-lock.yaml ./',
    '',
  ].join('\n'))

  const result = validateArtifactData('build-request', sampleBuildRequest(workDir, {
    context_path: '.',
    dockerfile_path: 'apps/www/Dockerfile',
    build_args: {},
  }))

  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2))
})

test('accepts a self-contained subdirectory context with local copied files', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-validator-'))
  const appDir = path.join(workDir, 'apps', 'www')
  fs.mkdirSync(appDir, { recursive: true })
  fs.writeFileSync(path.join(appDir, 'package.json'), '{"name":"www"}\n')
  fs.writeFileSync(path.join(appDir, 'Dockerfile'), [
    'FROM node:22-alpine',
    'WORKDIR /app',
    'COPY package.json ./',
    '',
  ].join('\n'))

  const result = validateArtifactData('build-request', sampleBuildRequest(workDir, {
    context_path: 'apps/www',
    dockerfile_path: 'apps/www/Dockerfile',
    build_args: {},
  }))

  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2))
})
