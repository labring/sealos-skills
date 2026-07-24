#!/usr/bin/env node

import assert from 'assert/strict'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  collectProjectEvidence,
  detectExistingImages,
  parseImageRef,
} from './detect-image.mjs'

const MANIFEST_TYPE = 'application/vnd.docker.distribution.manifest.v2+json'
const INDEX_TYPE = 'application/vnd.docker.distribution.manifest.list.v2+json'

function digestFor (character) {
  return `sha256:${character.repeat(64)}`
}

function contentDigest (body) {
  return `sha256:${crypto.createHash('sha256').update(body).digest('hex')}`
}

function singleManifest (configDigest) {
  return {
    schemaVersion: 2,
    mediaType: MANIFEST_TYPE,
    config: {
      digest: configDigest,
      mediaType: 'application/vnd.docker.container.image.v1+json',
    },
    layers: [],
  }
}

function manifestDigest (manifest) {
  return contentDigest(JSON.stringify(manifest))
}

function responseJson (value, options = {}) {
  const body = JSON.stringify(value)
  const headers = {
    'content-type': 'application/json',
    ...(options.headers || {}),
  }
  if (options.manifest && !options.omitDigest) {
    headers['docker-content-digest'] = options.headerDigest || contentDigest(body)
  }
  return new Response(body, {
    status: options.status || 200,
    headers,
  })
}

function createRegistryMock (images) {
  const calls = []
  const byKey = new Map(Object.entries(images))

  async function fetchImpl (input) {
    const url = new URL(String(input))
    calls.push(url.toString())

    if (url.hostname === 'auth.docker.io' || (
      url.hostname === 'ghcr.io' && url.pathname === '/token'
    )) {
      return responseJson({ token: 'test-token' })
    }

    const manifestMatch = url.pathname.match(/^\/v2\/(.+)\/manifests\/([^/]+)$/)
    if (manifestMatch) {
      const registry = url.hostname === 'registry-1.docker.io'
        ? 'docker.io'
        : url.host
      const repository = manifestMatch[1]
      const selector = decodeURIComponent(manifestMatch[2])
      const fixture = byKey.get(`${registry}/${repository}:${selector}`)
      if (!fixture) return responseJson({}, { status: 404 })

      if (fixture.platforms || fixture.indexEntries) {
        const payload = {
          schemaVersion: 2,
          mediaType: INDEX_TYPE,
          manifests: fixture.indexEntries || fixture.platforms.map((platform, index) => {
            const [osName, architecture, variant] = platform.split('/')
            return {
              digest: digestFor(String(index + 1)),
              mediaType: MANIFEST_TYPE,
              platform: {
                os: osName,
                architecture,
                ...(variant ? { variant } : {}),
              },
            }
          }),
        }
        return responseJson(payload, {
          manifest: true,
          headerDigest: fixture.headerDigest,
          omitDigest: fixture.omitDigest,
          headers: {
            'content-type': INDEX_TYPE,
          },
        })
      }

      const payload = fixture.manifest || {
        schemaVersion: 2,
        mediaType: MANIFEST_TYPE,
        config: {
          digest: fixture.configDigest,
          mediaType: 'application/vnd.docker.container.image.v1+json',
        },
        layers: [],
      }
      return responseJson(payload, {
        manifest: true,
        headerDigest: fixture.headerDigest,
        omitDigest: fixture.omitDigest,
        headers: {
          'content-type': MANIFEST_TYPE,
        },
      })
    }

    const blobMatch = url.pathname.match(/^\/v2\/(.+)\/blobs\/(sha256:[a-fA-F0-9]{64})$/)
    if (blobMatch) {
      const registry = url.hostname === 'registry-1.docker.io'
        ? 'docker.io'
        : url.host
      const fixture = [...byKey.entries()]
        .find(([key, value]) => key.startsWith(`${registry}/${blobMatch[1]}:`) &&
          value.configDigest === blobMatch[2])?.[1]
      if (!fixture) return responseJson({}, { status: 404 })
      return responseJson({
        os: fixture.os || 'linux',
        architecture: fixture.architecture || 'amd64',
      })
    }

    throw new Error(`Unexpected registry request: ${url}`)
  }

  return { calls, fetchImpl }
}

async function withFixture (files, callback) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-detect-image-'))
  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const target = path.join(workDir, relativePath)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, content)
    }
    return await callback(workDir)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
}

const tests = []

function test (name, run) {
  tests.push({ name, run })
}

test('parses floating tags without rewriting them', () => {
  const latest = parseImageRef('acme/web:latest')
  const stable = parseImageRef('ghcr.io/acme/web:stable')
  const major = parseImageRef('acme/web:v2')
  const semver = parseImageRef('acme/web:2.1')

  assert.equal(latest.declaredTag, 'latest')
  assert.equal(stable.declaredTag, 'stable')
  assert.equal(major.declaredTag, 'v2')
  assert.equal(semver.declaredTag, '2.1')
})

test('parses registry hosts with ports', () => {
  const parsed = parseImageRef('localhost:5000/acme/web:v2')
  assert.equal(parsed.registryHost, 'localhost:5000')
  assert.equal(parsed.repository, 'acme/web')
  assert.equal(parsed.declaredTag, 'v2')
})

test('collects README labels, backticked refs, Compose snippets, and pull options', async () => {
  await withFixture({
    'README.md': [
      '# Images',
      '',
      'Image: `acme/labeled:stable`',
      '',
      '`acme/backticked:v2`',
      '',
      'acme/bare:latest',
      '',
      '```yaml',
      'services:',
      '  web:',
      '    image: acme/snippet:2.1',
      '```',
      '',
      'docker pull --platform linux/amd64 acme/pulled:latest',
    ].join('\n'),
  }, async workDir => {
    const evidence = collectProjectEvidence(workDir)
    const refs = new Set(evidence.declarations.map(item => item.declaredRef))

    assert.deepEqual(refs, new Set([
      'acme/labeled:stable',
      'acme/backticked:v2',
      'acme/bare:latest',
      'acme/snippet:2.1',
      'acme/pulled:latest',
    ]))
    assert.ok(!refs.has('linux/amd64'))
  })
})

test('uses README before CI and Compose and resolves every declared tag to a digest', async () => {
  await withFixture({
    'README.md': [
      '# Example',
      '',
      '```sh',
      'docker pull acme/web:latest',
      '```',
    ].join('\n'),
    '.github/workflows/publish.yml': [
      'jobs:',
      '  publish:',
      '    steps:',
      '      - run: docker push ghcr.io/acme/worker:v2',
    ].join('\n'),
    'compose.yaml': [
      'services:',
      '  api:',
      '    image: acme/compose-api:stable',
      '  db:',
      '    image: postgres:16',
      '  cache:',
      '    image: redis:7',
      '  local-worker:',
      '    build: .',
    ].join('\n'),
  }, async workDir => {
    const registry = createRegistryMock({
      'docker.io/acme/web:latest': {
        digest: digestFor('a'),
        configDigest: digestFor('b'),
      },
      'ghcr.io/acme/worker:v2': {
        digest: digestFor('c'),
        platforms: ['linux/amd64', 'linux/arm64'],
      },
      'docker.io/acme/compose-api:stable': {
        digest: digestFor('d'),
        configDigest: digestFor('e'),
      },
      'docker.io/library/postgres:16': {
        digest: digestFor('f'),
        configDigest: digestFor('1'),
      },
      'docker.io/library/redis:7': {
        digest: digestFor('2'),
        configDigest: digestFor('3'),
      },
    })

    const result = await detectExistingImages(workDir, {
      fetchImpl: registry.fetchImpl,
      githubUrl: 'https://github.com/unrelated/name',
    })

    assert.equal(result.found, true)
    assert.equal(result.source, 'readme')
    assert.equal(result.image, 'acme/web')
    assert.equal(result.tag, 'latest')
    assert.equal(result.declared_ref, 'acme/web:latest')
    assert.match(result.digest, /^sha256:[a-f0-9]{64}$/)
    assert.equal(result.image_ref, `acme/web@${result.digest}`)

    assert.equal(result.image_inventory.length, 5)
    assert.ok(result.image_inventory.every(image => image.status === 'verified'))
    assert.ok(result.image_inventory.every(image => image.image_ref.includes('@sha256:')))

    const database = result.service_inventory.find(service => service.name === 'db')
    assert.equal(database.role, 'database')
    assert.equal(database.declared_image, 'postgres:16')
    assert.equal(database.image_ref, `postgres@${database.digest}`)

    const cache = result.service_inventory.find(service => service.name === 'cache')
    assert.equal(cache.role, 'infrastructure')
    assert.equal(cache.declared_image, 'redis:7')
    assert.equal(cache.image_ref, `redis@${cache.digest}`)

    const localWorker = result.service_inventory.find(service => service.name === 'local-worker')
    assert.equal(localWorker.build, '.')
    assert.equal(localWorker.image_status, 'build_required')
    assert.equal(localWorker.image_ref, null)
    assert.equal(localWorker.digest, null)

    assert.ok(registry.calls.some(url => url.endsWith('/manifests/latest')))
    assert.ok(registry.calls.some(url => url.endsWith('/manifests/v2')))
    assert.ok(registry.calls.some(url => url.endsWith('/manifests/stable')))
  })
})

test('scopes CI images and tags to publish actions and joins multiline Docker tags', async () => {
  await withFixture({
    '.github/workflows/publish.yml': [
      'jobs:',
      '  publish:',
      '    strategy:',
      '      matrix:',
      '        images:',
      '          - node:22',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '        with:',
      '          tags: acme/not-an-image:latest',
      '      - uses: docker/metadata-action@v5',
      '        id: meta',
      '        with:',
      '          images: ghcr.io/${{ github.repository }}',
      '      - uses: docker/build-push-action@v6',
      '        with:',
      '          push: true',
      '          tags: |',
      '            ${{ steps.meta.outputs.tags }}',
      '            ghcr.io/acme/action:stable',
      '      - name: shell publish',
      '        run: |',
      '          docker buildx build \\',
      '            --tag ghcr.io/acme/multiline:v2 \\',
      '            --push .',
    ].join('\n'),
  }, async workDir => {
    const evidence = collectProjectEvidence(workDir, {
      githubUrl: 'https://github.com/acme/project',
    })
    const refs = new Set(evidence.declarations.map(item => item.declaredRef))

    assert.ok(refs.has('ghcr.io/acme/project'))
    assert.ok(refs.has('ghcr.io/acme/action:stable'))
    assert.ok(refs.has('ghcr.io/acme/multiline:v2'))
    assert.ok(!refs.has('node:22'))
    assert.ok(!refs.has('acme/not-an-image:latest'))
  })
})

test('retains unresolved CI image variables as unavailable evidence', async () => {
  await withFixture({
    '.github/workflows/publish.yml': [
      'jobs:',
      '  publish:',
      '    steps:',
      '      - uses: docker/metadata-action@v5',
      '        id: meta',
      '        with:',
      '          images: ghcr.io/${{ env.IMAGE_PATH }}',
      '      - uses: docker/build-push-action@v6',
      '        with:',
      '          push: true',
      '          tags: ${{ steps.meta.outputs.tags }}',
    ].join('\n'),
  }, async workDir => {
    let fetchCount = 0
    const result = await detectExistingImages(workDir, {
      fetchImpl: async () => {
        fetchCount += 1
        throw new Error('Unresolved references must not reach a registry')
      },
    })

    assert.equal(result.found, false)
    assert.equal(fetchCount, 0)
    assert.equal(result.image_inventory.length, 1)
    assert.equal(result.image_inventory[0].status, 'unavailable')
    assert.match(result.image_inventory[0].declared_ref, /\$\{\{/)
  })
})

test('ignores CI tags that are never published', async () => {
  await withFixture({
    '.github/workflows/test.yml': [
      'jobs:',
      '  test:',
      '    steps:',
      '      - uses: docker/metadata-action@v5',
      '        id: local-meta',
      '        with:',
      '          images: ghcr.io/acme/metadata-only:latest',
      '      - uses: docker/build-push-action@v6',
      '        with:',
      '          tags: ghcr.io/acme/action-local:latest',
      '      - run: |',
      '          docker build -t ghcr.io/acme/classic-local:latest .',
      '          docker buildx build --tag ghcr.io/acme/buildx-local:latest .',
      '          docker tag local:test ghcr.io/acme/retagged-local:latest',
    ].join('\n'),
  }, async workDir => {
    const evidence = collectProjectEvidence(workDir)
    assert.deepEqual(evidence.declarations, [])
  })
})

test('does not query name-guessed images when the project declares none', async () => {
  await withFixture({}, async workDir => {
    let fetchCount = 0
    const result = await detectExistingImages(workDir, {
      githubUrl: 'https://github.com/acme/guess-me',
      fetchImpl: async () => {
        fetchCount += 1
        throw new Error('Registry must not be queried')
      },
    })

    assert.equal(result.found, false)
    assert.equal(result.reason, 'no_explicit_image_declarations')
    assert.equal(fetchCount, 0)
    assert.deepEqual(result.image_inventory, [])
  })
})

test('does not treat Dockerfile FROM as a reusable project image', async () => {
  await withFixture({
    'Dockerfile': [
      'FROM node:22 AS build',
      'WORKDIR /app',
      'COPY . .',
      'RUN npm run build',
      'FROM nginx:stable',
      'COPY --from=build /app/dist /usr/share/nginx/html',
    ].join('\n'),
  }, async workDir => {
    let fetchCount = 0
    const evidence = collectProjectEvidence(workDir)
    const result = await detectExistingImages(workDir, {
      fetchImpl: async () => {
        fetchCount += 1
        throw new Error('Registry must not be queried')
      },
    })

    assert.deepEqual(evidence.declarations, [])
    assert.equal(result.found, false)
    assert.equal(fetchCount, 0)
  })
})

test('treats role keywords as advisory when README declares the product image', async () => {
  await withFixture({
    'README.md': 'Image: acme/nginx:stable',
  }, async workDir => {
    const registry = createRegistryMock({
      'docker.io/acme/nginx:stable': {
        configDigest: digestFor('9'),
      },
    })

    const result = await detectExistingImages(workDir, { fetchImpl: registry.fetchImpl })
    assert.equal(result.found, true)
    assert.equal(result.image, 'acme/nginx')
    assert.equal(result.image_inventory[0].role, 'infrastructure')
    assert.equal(result.image_ref, `acme/nginx@${result.digest}`)
  })
})

test('uses Compose topology rather than role keywords for primary intent', async () => {
  await withFixture({
    'compose.yaml': [
      'services:',
      '  cache-product:',
      '    image: acme/cache:latest',
      '    depends_on:',
      '      database:',
      '        condition: service_healthy',
      '    ports:',
      '      - "8080:8080"',
      '  database:',
      '    image: postgres:16',
    ].join('\n'),
  }, async workDir => {
    const registry = createRegistryMock({
      'docker.io/acme/cache:latest': {
        configDigest: digestFor('a'),
      },
      'docker.io/library/postgres:16': {
        configDigest: digestFor('b'),
      },
    })

    const result = await detectExistingImages(workDir, { fetchImpl: registry.fetchImpl })
    assert.equal(result.found, true)
    assert.equal(result.image, 'acme/cache')
    assert.equal(result.image_inventory.find(item => item.image === 'acme/cache').role, 'infrastructure')
    assert.equal(result.service_inventory.length, 2)
  })
})

test('returns uniform service fields for quoted keys, defaulted images, and build-only services', async () => {
  await withFixture({
    'compose.yaml': [
      'services:',
      '  "web":',
      '    image: "${APP_IMAGE:-localhost:5000/acme/web:latest}"',
      "  'worker':",
      '    build:',
      '      context: ./worker',
    ].join('\n'),
  }, async workDir => {
    const registry = createRegistryMock({
      'localhost:5000/acme/web:latest': {
        configDigest: digestFor('c'),
      },
    })

    const result = await detectExistingImages(workDir, { fetchImpl: registry.fetchImpl })
    const web = result.service_inventory.find(service => service.name === 'web')
    const worker = result.service_inventory.find(service => service.name === 'worker')

    assert.equal(web.declared_image, 'localhost:5000/acme/web:latest')
    assert.equal(web.image_status, 'verified')
    assert.match(web.image_ref, /^localhost:5000\/acme\/web@sha256:/)
    assert.match(web.digest, /^sha256:/)

    assert.equal(worker.build, './worker')
    assert.equal(worker.image_status, 'build_required')
    assert.equal(worker.image_ref, null)
    assert.equal(worker.digest, null)

    for (const service of result.service_inventory) {
      assert.deepEqual(
        Object.keys(service).sort(),
        [
          'build',
          'declared_image',
          'digest',
          'image_ref',
          'image_status',
          'name',
          'role',
          'source',
          'source_file',
        ].sort(),
      )
    }
  })
})

test('uses the same root Compose filename precedence as template generation', async () => {
  await withFixture({
    'compose.yaml': [
      'services:',
      '  canonical:',
      '    image: acme/canonical:v1',
    ].join('\n'),
    'docker-compose.yml': [
      'services:',
      '  legacy:',
      '    image: acme/legacy:v1',
    ].join('\n'),
  }, async workDir => {
    const evidence = collectProjectEvidence(workDir)
    assert.deepEqual(evidence.services.map(service => service.name), ['canonical'])
    assert.equal(evidence.declarations[0].sourceFile, 'compose.yaml')
  })
})

test('resolves an architecture-specific image without pre-screening its platform', async () => {
  await withFixture({
    'README.md': 'Run `docker pull ghcr.io/acme/arm-only:stable`.',
  }, async workDir => {
    const registry = createRegistryMock({
      'ghcr.io/acme/arm-only:stable': {
        digest: digestFor('4'),
        platforms: ['linux/arm64'],
      },
    })

    const result = await detectExistingImages(workDir, { fetchImpl: registry.fetchImpl })
    assert.equal(result.found, true)
    assert.equal(result.image_inventory[0].status, 'verified')
    assert.match(result.image_inventory[0].image_ref, /^ghcr\.io\/acme\/arm-only@sha256:/)
  })
})

test('requires manifest body, response header, and requested digest to agree', async () => {
  const configDigest = digestFor('d')
  const manifest = singleManifest(configDigest)
  const requestedDigest = manifestDigest(manifest)

  await withFixture({
    'README.md': `Image: acme/integrity@${requestedDigest}`,
  }, async workDir => {
    const registry = createRegistryMock({
      [`docker.io/acme/integrity:${requestedDigest}`]: {
        manifest,
        configDigest,
      },
    })
    const result = await detectExistingImages(workDir, { fetchImpl: registry.fetchImpl })

    assert.equal(result.found, true)
    assert.equal(result.digest, requestedDigest)
    assert.equal(result.image_ref, `acme/integrity@${requestedDigest}`)
  })

  await withFixture({
    'README.md': 'Image: acme/tampered:stable',
  }, async workDir => {
    const registry = createRegistryMock({
      'docker.io/acme/tampered:stable': {
        manifest,
        configDigest,
        headerDigest: digestFor('e'),
      },
    })
    const result = await detectExistingImages(workDir, { fetchImpl: registry.fetchImpl })

    assert.equal(result.found, false)
    assert.equal(result.image_inventory[0].status, 'unavailable')
    assert.match(result.image_inventory[0].error, /does not match/)
  })

  const wrongRequestedDigest = digestFor('f')
  await withFixture({
    'README.md': `Image: acme/wrong-request@${wrongRequestedDigest}`,
  }, async workDir => {
    const registry = createRegistryMock({
      [`docker.io/acme/wrong-request:${wrongRequestedDigest}`]: {
        manifest,
        configDigest,
      },
    })
    const result = await detectExistingImages(workDir, { fetchImpl: registry.fetchImpl })

    assert.equal(result.found, false)
    assert.equal(result.image_inventory[0].status, 'unavailable')
    assert.match(result.image_inventory[0].error, /requested digest/)
  })
})

test('does not inspect platformless OCI index children after resolving the index digest', async () => {
  const configDigest = digestFor('a')
  const childManifest = singleManifest(configDigest)
  const childDigest = manifestDigest(childManifest)

  await withFixture({
    'README.md': 'Image: ghcr.io/acme/platformless:stable',
  }, async workDir => {
    const registry = createRegistryMock({
      'ghcr.io/acme/platformless:stable': {
        indexEntries: [{
          digest: childDigest,
          mediaType: MANIFEST_TYPE,
          platform: {
            os: 'unknown',
            architecture: 'unknown',
          },
        }],
      },
      [`ghcr.io/acme/platformless:${childDigest}`]: {
        manifest: childManifest,
        configDigest,
      },
    })
    const result = await detectExistingImages(workDir, { fetchImpl: registry.fetchImpl })

    assert.equal(result.found, true)
    assert.equal(result.image_ref, `ghcr.io/acme/platformless@${result.digest}`)
    assert.ok(!registry.calls.some(url => url.endsWith(`/manifests/${childDigest}`)))
  })
})

test('does not choose between two equally preferred README primary images', async () => {
  await withFixture({
    'README.md': [
      'docker pull acme/frontend:latest',
      'docker pull acme/backend:stable',
    ].join('\n'),
  }, async workDir => {
    const registry = createRegistryMock({
      'docker.io/acme/frontend:latest': {
        digest: digestFor('5'),
        configDigest: digestFor('6'),
      },
      'docker.io/acme/backend:stable': {
        digest: digestFor('7'),
        configDigest: digestFor('8'),
      },
    })

    const result = await detectExistingImages(workDir, { fetchImpl: registry.fetchImpl })
    assert.equal(result.found, false)
    assert.equal(result.reason, 'ambiguous_primary_images')
    assert.equal(result.image_inventory.length, 2)
    assert.ok(result.image_inventory.every(image => image.status === 'verified'))
  })
})

let failures = 0
for (const { name, run } of tests) {
  try {
    await run()
    console.log(`ok - ${name}`)
  } catch (error) {
    failures += 1
    console.error(`not ok - ${name}`)
    console.error(error.stack || error.message)
  }
}

console.log(`\n${tests.length - failures} passed, ${failures} failed`)
if (failures > 0) process.exitCode = 1
