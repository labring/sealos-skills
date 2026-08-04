import assert from 'assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import test from 'node:test'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(__dirname, 'prepare-context.mjs')

function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, {
    encoding: 'utf8',
    ...options,
  })
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
}

function sampleRequest(workDir, overrides = {}) {
  return {
    version: '1.0',
    generated_at: '2026-06-16T00:00:00.000Z',
    source: {
      type: 'sandbox-context',
      github_url: 'https://github.com/example/web',
      repo: 'example/web',
      ref: '0123456789abcdef0123456789abcdef01234567',
      work_dir: workDir,
    },
    mode: 'build-required',
    image: {
      image_ref: null,
      target_image: 'ghcr.io/example/web:prepare-test',
    },
    build: {
      context_path: 'apps/web',
      dockerfile_path: 'apps/web/Dockerfile',
      build_args: {},
    },
    runtime: {
      port: 3000,
    },
    ...overrides,
  }
}

test('packs the requested Docker context and reports kaniko dockerfile path inside the tar root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kaniko-context-'))
  const workDir = path.join(root, 'repo')
  const appDir = path.join(workDir, 'apps', 'web')
  const contextRoot = path.join(root, '.versitygw-s3', 'kaniko-contexts', 'contexts')
  const requestFile = path.join(workDir, '.sealos', 'build-request.json')
  const metadataFile = path.join(workDir, '.sealos', 'kaniko-context.json')

  fs.mkdirSync(path.join(appDir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(appDir, '.sealos'), { recursive: true })
  fs.mkdirSync(path.join(appDir, '.git'), { recursive: true })
  fs.writeFileSync(path.join(appDir, 'Dockerfile'), 'FROM alpine:3.20\nCOPY src /app/src\n')
  fs.writeFileSync(path.join(appDir, 'package.json'), '{"scripts":{"build":"true"}}\n')
  fs.writeFileSync(path.join(appDir, 'src', 'index.js'), 'console.log("hello")\n')
  fs.writeFileSync(path.join(appDir, '.sealos', 'secret.txt'), 'skip me\n')
  fs.writeFileSync(path.join(appDir, '.git', 'HEAD'), 'skip me\n')
  writeJson(requestFile, sampleRequest(workDir))

  const result = runNode([
    script,
    '--request',
    requestFile,
    '--context-root',
    contextRoot,
    '--bucket',
    'kaniko-contexts',
    '--prefix',
    'contexts',
    '--devbox',
    'devbox-a',
    '--build-id',
    'build-1',
    '--out',
    metadataFile,
  ])

  assert.equal(result.status, 0, result.stderr)
  const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'))
  assert.equal(metadata.context.bucket, 'kaniko-contexts')
  assert.equal(metadata.context.prefix, 'contexts')
  assert.equal(metadata.context.object_key, 'contexts/devbox-a/build-1/context.tar.gz')
  assert.equal(metadata.context.uri, 's3://kaniko-contexts/contexts/devbox-a/build-1/context.tar.gz')
  assert.equal(metadata.context.tar_path, path.join(contextRoot, 'devbox-a', 'build-1', 'context.tar.gz'))
  assert.equal(metadata.kaniko.dockerfile, 'Dockerfile')
  assert.equal(metadata.kaniko.context_sub_path, null)

  const list = spawnSync('tar', ['-tzf', metadata.context.tar_path], { encoding: 'utf8' })
  assert.equal(list.status, 0, list.stderr)
  const entries = list.stdout.trim().split('\n').sort()
  assert(entries.includes('./Dockerfile'))
  assert(entries.includes('./package.json'))
  assert(entries.includes('./src/index.js'))
  assert(!entries.some((entry) => entry.includes('.git/')))
  assert(!entries.some((entry) => entry.includes('.sealos/')))
})

test('excludes runtime S3 store when context root is inside the build context', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kaniko-context-'))
  const workDir = path.join(root, 'repo')
  const contextRoot = path.join(workDir, '.versitygw-s3', 'kaniko-contexts', 'contexts')
  const requestFile = path.join(workDir, '.sealos', 'build-request.json')
  const metadataFile = path.join(workDir, '.sealos', 'kaniko-context.json')

  fs.mkdirSync(path.join(workDir, 'apps', 'web'), { recursive: true })
  fs.mkdirSync(path.join(workDir, '.versitygw-s3', 'kaniko-contexts', 'contexts', 'old-build'), { recursive: true })
  fs.mkdirSync(path.join(workDir, '.versitygw-iam'), { recursive: true })
  fs.mkdirSync(path.join(workDir, '.versitygw-versioning'), { recursive: true })
  fs.writeFileSync(path.join(workDir, 'apps', 'web', 'index.js'), 'console.log("hello")\n')
  fs.writeFileSync(path.join(workDir, 'Dockerfile'), 'FROM alpine:3.20\nCOPY apps/web /app\n')
  fs.writeFileSync(path.join(workDir, '.versitygw-s3', 'kaniko-contexts', 'contexts', 'old-build', 'context.tar.gz'), 'skip me\n')
  fs.writeFileSync(path.join(workDir, '.versitygw-iam', 'users.json'), 'skip me\n')
  fs.writeFileSync(path.join(workDir, '.versitygw-versioning', 'meta.json'), 'skip me\n')
  writeJson(requestFile, sampleRequest(workDir, {
    build: {
      context_path: '.',
      dockerfile_path: 'Dockerfile',
      build_args: {},
    },
  }))

  const result = runNode([
    script,
    '--request',
    requestFile,
    '--context-root',
    contextRoot,
    '--bucket',
    'kaniko-contexts',
    '--prefix',
    'contexts',
    '--devbox',
    'devbox-a',
    '--build-id',
    'build-1',
    '--out',
    metadataFile,
  ])

  assert.equal(result.status, 0, result.stderr)
  const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'))
  const list = spawnSync('tar', ['-tzf', metadata.context.tar_path], { encoding: 'utf8' })
  assert.equal(list.status, 0, list.stderr)
  const entries = list.stdout.trim().split('\n')
  assert(entries.includes('./Dockerfile'))
  assert(entries.includes('./apps/web/index.js'))
  assert(!entries.some((entry) => entry.includes('.versitygw-s3/')))
  assert(!entries.some((entry) => entry.includes('.versitygw-iam/')))
  assert(!entries.some((entry) => entry.includes('.versitygw-versioning/')))
})

test('rejects dockerfiles outside the selected context', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kaniko-context-'))
  const workDir = path.join(root, 'repo')
  const requestFile = path.join(workDir, '.sealos', 'build-request.json')

  fs.mkdirSync(path.join(workDir, 'apps', 'web'), { recursive: true })
  fs.writeFileSync(path.join(workDir, 'Dockerfile'), 'FROM alpine:3.20\n')
  writeJson(requestFile, sampleRequest(workDir, {
    build: {
      context_path: 'apps/web',
      dockerfile_path: 'Dockerfile',
      build_args: {},
    },
  }))

  const result = runNode([
    script,
    '--request',
    requestFile,
    '--context-root',
    path.join(root, '.versitygw-s3', 'kaniko-contexts', 'contexts'),
    '--bucket',
    'kaniko-contexts',
    '--prefix',
    'contexts',
    '--devbox',
    'devbox-a',
    '--build-id',
    'build-1',
    '--out',
    path.join(workDir, '.sealos', 'kaniko-context.json'),
  ])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /build\.dockerfile_path must be inside build\.context_path/)
})
