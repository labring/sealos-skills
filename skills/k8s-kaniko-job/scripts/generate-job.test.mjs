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

function sampleRequest(workDir = '/workspace') {
  return {
    version: '2.0',
    generated_at: '2026-06-16T00:00:00.000Z',
    route: 'standard',
    source: {
      type: 'sandbox-context',
      github_url: 'https://github.com/example/web',
      repo: 'example/web',
      ref: '0123456789abcdef0123456789abcdef01234567',
      work_dir: workDir,
    },
    services: [{
      name: 'web',
      artifact_key: 'web',
      role: 'frontend',
      mode: 'build-required',
      image: {
        image_ref: null,
        target_image: 'ghcr.io/example/web:prepare-test',
        platforms: [],
        pull_access: null,
      },
      build: {
        context_path: '.',
        dockerfile_path: 'Dockerfile',
        target: 'runner',
        build_arg_names: ['NODE_ENV'],
      },
      runtime: { port: 3000 },
    }],
  }
}

function sampleContext() {
  return {
    version: '1.0',
    generated_at: '2026-06-16T00:00:00.000Z',
    service: {
      name: 'web',
      artifact_key: 'web',
    },
    context: {
      bucket: 'kaniko-contexts',
      prefix: 'contexts',
      object_key: 'contexts/devbox-a/build-1/context.tar.gz',
      uri: 's3://kaniko-contexts/contexts/devbox-a/build-1/context.tar.gz',
      tar_path: '/workspace/.versitygw-s3/kaniko-contexts/contexts/devbox-a/build-1/context.tar.gz',
    },
    kaniko: {
      dockerfile: 'Dockerfile',
      context_sub_path: null,
    },
  }
}

function runJob(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kaniko-job-'))
  const workDir = path.join(root, 'workspace')
  const requestFile = path.join(root, 'build-request.json')
  const contextFile = path.join(root, 'kaniko-context.json')
  fs.mkdirSync(workDir, { recursive: true })
  writeJson(requestFile, overrides.request || sampleRequest(workDir))
  writeJson(contextFile, overrides.context || sampleContext())

  const args = [
    script,
    '--request', requestFile,
    '--service', 'web',
    '--context', contextFile,
    '--namespace', 'team-a',
    '--job-name', 'seakills-kaniko-web-abc123',
    '--registry-secret', 'seakills-ghcr-auth-abc123',
    '--s3-secret', 'seakills-kaniko-s3-abc123',
    '--s3-endpoint', overrides.s3Endpoint || 'http://10.42.0.20:1319',
    '--aws-region', 'sealos-internal',
  ]
  if (!overrides.omitServiceAccount) {
    args.push('--service-account', 'current-sa')
  }
  if (!overrides.omitBuildArgsSecret) {
    args.push('--build-args-secret', 'seakills-build-args-abc123')
  }
  return spawnSync(process.execPath, args, { encoding: 'utf8' })
}

test('generates a per-service kaniko Job from the aggregate request', () => {
  const result = runJob()

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /kind: Job/)
  assert.match(result.stdout, /image: gcr\.io\/kaniko-project\/executor:v1\.24\.0/)
  assert.match(result.stdout, /--context=s3:\/\/kaniko-contexts\/contexts\/devbox-a\/build-1\/context\.tar\.gz/)
  assert.match(result.stdout, /--dockerfile=Dockerfile/)
  assert.match(result.stdout, /--destination=ghcr\.io\/example\/web:prepare-test/)
  assert.match(result.stdout, /--custom-platform=linux\/amd64/)
  assert.match(result.stdout, /--digest-file=\/dev\/termination-log/)
  assert.match(result.stdout, /--target=runner/)
  assert.match(result.stdout, /--build-arg=NODE_ENV=\$\(SEALOS_BUILD_ARG_NODE_ENV\)/)
  assert.match(result.stdout, /name: SEALOS_BUILD_ARG_NODE_ENV/)
  assert.match(result.stdout, /name: seakills-build-args-abc123\n\s+key: NODE_ENV/)
  assert.doesNotMatch(result.stdout, /production/)
  assert.match(result.stdout, /serviceAccountName: current-sa/)
  assert.match(result.stdout, /mountPath: \/kaniko\/\.docker\/config\.json/)
  assert.match(result.stdout, /secretName: seakills-ghcr-auth-abc123/)
  assert.match(result.stdout, /secretKeyRef:\n\s+name: seakills-kaniko-s3-abc123\n\s+key: AWS_SECRET_ACCESS_KEY/)
})

test('rejects loopback S3 endpoints because kaniko runs in a separate Pod', () => {
  const result = runJob({ s3Endpoint: 'http://127.0.0.1:1319' })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /must be reachable from the kaniko Job Pod/)
})

test('requires a Secret reference when build arg names are declared', () => {
  const result = runJob({ omitBuildArgsSecret: true })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /--build-args-secret is required/)
})

test('requires the current sandbox service account', () => {
  const result = runJob({ omitServiceAccount: true })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Missing required argument --service-account/)
})

test('rejects context metadata for another service', () => {
  const context = sampleContext()
  context.service.name = 'api'
  const result = runJob({ context })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /context metadata service does not match/)
})

test('rejects an unnecessary build args Secret', () => {
  const request = sampleRequest()
  request.services[0].build.build_arg_names = []
  const result = runJob({ request })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /is not allowed when no build_arg_names are declared/)
})
