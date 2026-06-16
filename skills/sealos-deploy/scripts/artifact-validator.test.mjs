import assert from 'assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import test from 'node:test'

import { validateArtifactData } from './artifact-validator.mjs'

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
