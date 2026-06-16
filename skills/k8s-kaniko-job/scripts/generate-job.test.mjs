import assert from 'assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import test from 'node:test'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(__dirname, 'generate-job.mjs')

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
}

test('generates a kaniko Job that reads S3 credentials from Kubernetes Secrets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kaniko-job-'))
  const requestFile = path.join(root, 'build-request.json')
  const contextFile = path.join(root, 'kaniko-context.json')

  writeJson(requestFile, {
    version: '1.0',
    generated_at: '2026-06-16T00:00:00.000Z',
    source: {
      type: 'sandbox-context',
      github_url: 'https://github.com/example/web',
      repo: 'example/web',
      ref: '0123456789abcdef0123456789abcdef01234567',
      work_dir: '/workspace',
    },
    mode: 'build-required',
    image: {
      image_ref: null,
      target_image: 'ghcr.io/example/web:prepare-test',
    },
    build: {
      context_path: '.',
      dockerfile_path: 'Dockerfile',
      build_args: {
        NODE_ENV: 'production',
      },
    },
    runtime: {
      port: 3000,
    },
  })

  writeJson(contextFile, {
    version: '1.0',
    generated_at: '2026-06-16T00:00:00.000Z',
    context: {
      bucket: 'kaniko-contexts',
      prefix: 'contexts',
      object_key: 'contexts/devbox-a/build-1/context.tar.gz',
      uri: 's3://kaniko-contexts/contexts/devbox-a/build-1/context.tar.gz',
      tar_path: '/home/devbox/workspace/.versitygw-s3/kaniko-contexts/contexts/devbox-a/build-1/context.tar.gz',
    },
    kaniko: {
      dockerfile: 'Dockerfile',
      context_sub_path: null,
    },
  })

  const result = spawnSync(process.execPath, [
    script,
    '--request',
    requestFile,
    '--context',
    contextFile,
    '--namespace',
    'team-a',
    '--job-name',
    'seakills-kaniko-web-abc123',
    '--registry-secret',
    'seakills-ghcr-auth-abc123',
    '--s3-secret',
    'seakills-kaniko-s3-abc123',
    '--s3-endpoint',
    'http://10.42.0.20:1319',
    '--aws-region',
    'sealos-internal',
    '--service-account',
    'current-sa',
  ], { encoding: 'utf8' })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /kind: Job/)
  assert.match(result.stdout, /image: gcr\.io\/kaniko-project\/executor:v1\.24\.0/)
  assert.match(result.stdout, /--context=s3:\/\/kaniko-contexts\/contexts\/devbox-a\/build-1\/context\.tar\.gz/)
  assert.match(result.stdout, /--dockerfile=Dockerfile/)
  assert.match(result.stdout, /--destination=ghcr\.io\/example\/web:prepare-test/)
  assert.match(result.stdout, /--custom-platform=linux\/amd64/)
  assert.match(result.stdout, /--build-arg=NODE_ENV=production/)
  assert.match(result.stdout, /serviceAccountName: current-sa/)
  assert.match(result.stdout, /mountPath: \/kaniko\/\.docker\/config\.json/)
  assert.match(result.stdout, /secretName: seakills-ghcr-auth-abc123/)
  assert.match(result.stdout, /secretKeyRef:\n\s+name: seakills-kaniko-s3-abc123\n\s+key: AWS_SECRET_ACCESS_KEY/)
  assert.doesNotMatch(result.stdout, /SEALOS_DEVBOX_JWT_SECRET|super-secret/)
})

test('rejects loopback S3 endpoints because kaniko runs in a separate Pod', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kaniko-job-'))
  const requestFile = path.join(root, 'build-request.json')
  const contextFile = path.join(root, 'kaniko-context.json')

  writeJson(requestFile, {
    version: '1.0',
    generated_at: '2026-06-16T00:00:00.000Z',
    source: {
      type: 'sandbox-context',
      github_url: 'https://github.com/example/web',
      repo: 'example/web',
      ref: '0123456789abcdef0123456789abcdef01234567',
      work_dir: '/workspace',
    },
    mode: 'build-required',
    image: {
      image_ref: null,
      target_image: 'ghcr.io/example/web:prepare-test',
    },
    build: {
      context_path: '.',
      dockerfile_path: 'Dockerfile',
      build_args: {},
    },
    runtime: {
      port: 3000,
    },
  })

  writeJson(contextFile, {
    version: '1.0',
    generated_at: '2026-06-16T00:00:00.000Z',
    context: {
      bucket: 'kaniko-contexts',
      prefix: 'contexts',
      object_key: 'contexts/devbox-a/build-1/context.tar.gz',
      uri: 's3://kaniko-contexts/contexts/devbox-a/build-1/context.tar.gz',
      tar_path: '/home/devbox/workspace/.versitygw-s3/kaniko-contexts/contexts/devbox-a/build-1/context.tar.gz',
    },
    kaniko: {
      dockerfile: 'Dockerfile',
      context_sub_path: null,
    },
  })

  const result = spawnSync(process.execPath, [
    script,
    '--request',
    requestFile,
    '--context',
    contextFile,
    '--namespace',
    'team-a',
    '--job-name',
    'seakills-kaniko-web-abc123',
    '--registry-secret',
    'seakills-ghcr-auth-abc123',
    '--s3-secret',
    'seakills-kaniko-s3-abc123',
    '--s3-endpoint',
    'http://127.0.0.1:1319',
  ], { encoding: 'utf8' })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /must be reachable from the kaniko Job Pod/)
})
