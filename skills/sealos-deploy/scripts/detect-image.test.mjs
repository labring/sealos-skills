import assert from 'assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import test from 'node:test'
import { fileURLToPath } from 'url'
import { detectExistingImage, detectWithoutGithubUrl, extractImageRefsFromText } from './detect-image.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(__dirname, 'detect-image.mjs')

function runDetect(workDir) {
  return spawnSync(process.execPath, [
    script,
    'https://github.com/AykutSarac/jsoncrack.com.git',
    workDir,
  ], {
    encoding: 'utf8',
  })
}

test('does not double-count ghcr docker run references as dockerhub images', () => {
  const images = extractImageRefsFromText([
    'docker run -d --name it-tools -p 8080:80 ghcr.io/corentinth/it-tools:latest',
  ].join('\n'))

  assert.deepEqual(images, [
    { registry: 'ghcr', owner: 'corentinth', repo: 'it-tools', tag: 'latest' },
  ])
})

test('extracts explicit and implicit dockerhub run and pull references', () => {
  const images = extractImageRefsFromText([
    'docker run --rm corentinth/it-tools:latest',
    'docker pull docker.io/corentinth/it-tools:2024.10.22-7ca5933',
  ].join('\n'))

  assert.deepEqual(images, [
    { registry: 'dockerhub', owner: 'corentinth', repo: 'it-tools', tag: 'latest' },
  ])
})

test('does not treat arbitrary registries as dockerhub references', () => {
  const images = extractImageRefsFromText([
    'docker run quay.io/example/web:1.0.0',
    'docker pull registry.example.com/team/web:2.0.0',
  ].join('\n'))

  assert.deepEqual(images, [])
})

test('prefers package version when README only documents a floating ghcr tag', async (t) => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-image-'))
  fs.writeFileSync(path.join(workDir, 'README.md'), [
    '# Example',
    '',
    '### Docker',
    '',
    '```console',
    'docker run ghcr.io/example/web:latest',
    '```',
    '',
  ].join('\n'))
  fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify({
    version: '1.2.3',
  }))

  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  globalThis.fetch = async (url) => {
    const href = String(url)
    if (href.includes('/token?')) {
      return new Response(JSON.stringify({ token: 'test-token' }), { status: 200 })
    }
    if (href.endsWith('/tags/list')) {
      return new Response(JSON.stringify({ tags: ['latest', '1.2.3'] }), { status: 200 })
    }
    if (href.endsWith('/manifests/1.2.3')) {
      return new Response(JSON.stringify({
        manifests: [
          { platform: { os: 'linux', architecture: 'amd64' } },
        ],
      }), { status: 200 })
    }
    return new Response('', { status: 404 })
  }

  const payload = await detectExistingImage('https://github.com/example/web.git', workDir)

  assert.equal(payload.mode, 'reuse-image')
  assert.equal(payload.image, 'ghcr.io/example/web')
  assert.equal(payload.tag, '1.2.3')
})

test('falls back to README floating ghcr tag when package version is absent', async (t) => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-image-'))
  fs.writeFileSync(path.join(workDir, 'README.md'), [
    '# Example',
    '',
    '### Docker',
    '',
    '```console',
    'docker run ghcr.io/example/web:latest',
    '```',
    '',
  ].join('\n'))

  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  globalThis.fetch = async (url) => {
    const href = String(url)
    if (href.includes('/token?')) {
      return new Response(JSON.stringify({ token: 'test-token' }), { status: 200 })
    }
    if (href.endsWith('/tags/list')) {
      return new Response(JSON.stringify({ tags: ['latest'] }), { status: 200 })
    }
    if (href.endsWith('/manifests/latest')) {
      return new Response(JSON.stringify({
        manifests: [
          { platform: { os: 'linux', architecture: 'amd64' } },
        ],
      }), { status: 200 })
    }
    return new Response('', { status: 404 })
  }

  const payload = await detectExistingImage('https://github.com/example/web.git', workDir)

  assert.equal(payload.mode, 'reuse-image')
  assert.equal(payload.image, 'ghcr.io/example/web')
  assert.equal(payload.tag, 'latest')
})

test('falls back to documented floating ghcr tag when no concrete tag is usable', async (t) => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-image-'))
  fs.writeFileSync(path.join(workDir, 'README.md'), [
    '# Example',
    '',
    '### Docker',
    '',
    '```console',
    'docker run ghcr.io/example/web:stable',
    '```',
    '',
  ].join('\n'))
  fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify({
    version: '1.2.3',
  }))

  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  globalThis.fetch = async (url) => {
    const href = String(url)
    if (href.includes('/token?')) {
      return new Response(JSON.stringify({ token: 'test-token' }), { status: 200 })
    }
    if (href.endsWith('/tags/list')) {
      return new Response(JSON.stringify({ tags: ['latest', 'stable'] }), { status: 200 })
    }
    if (href.endsWith('/manifests/latest') || href.endsWith('/manifests/stable')) {
      return new Response(JSON.stringify({
        manifests: [
          { platform: { os: 'linux', architecture: 'amd64' } },
        ],
      }), { status: 200 })
    }
    return new Response('', { status: 404 })
  }

  const payload = await detectExistingImage('https://github.com/example/web.git', workDir)

  assert.equal(payload.mode, 'reuse-image')
  assert.equal(payload.image, 'ghcr.io/example/web')
  assert.equal(payload.tag, 'stable')
})

test('prefers package version when README documents numeric floating ghcr tag', async (t) => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-image-'))
  fs.writeFileSync(path.join(workDir, 'README.md'), [
    '# Example',
    '',
    '### Docker',
    '',
    '```console',
    'docker run ghcr.io/example/web:v2',
    '```',
    '',
  ].join('\n'))
  fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify({
    version: '2.2.0',
  }))

  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  globalThis.fetch = async (url) => {
    const href = String(url)
    if (href.includes('/token?')) {
      return new Response(JSON.stringify({ token: 'test-token' }), { status: 200 })
    }
    if (href.endsWith('/tags/list')) {
      return new Response(JSON.stringify({ tags: ['v2', '2.2.0'] }), { status: 200 })
    }
    if (href.endsWith('/manifests/v2') || href.endsWith('/manifests/2.2.0')) {
      return new Response(JSON.stringify({
        manifests: [
          { platform: { os: 'linux', architecture: 'amd64' } },
        ],
      }), { status: 200 })
    }
    return new Response('', { status: 404 })
  }

  const payload = await detectExistingImage('https://github.com/example/web.git', workDir)

  assert.equal(payload.mode, 'reuse-image')
  assert.equal(payload.image, 'ghcr.io/example/web')
  assert.equal(payload.tag, '2.2.0')
})

test('falls back to documented numeric floating ghcr tag when no concrete tag is usable', async (t) => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-image-'))
  fs.writeFileSync(path.join(workDir, 'README.md'), [
    '# Example',
    '',
    '### Docker',
    '',
    '```console',
    'docker run ghcr.io/example/web:v2',
    '```',
    '',
  ].join('\n'))
  fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify({
    version: '2.2.0',
  }))

  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  globalThis.fetch = async (url) => {
    const href = String(url)
    if (href.includes('/token?')) {
      return new Response(JSON.stringify({ token: 'test-token' }), { status: 200 })
    }
    if (href.endsWith('/tags/list')) {
      return new Response(JSON.stringify({ tags: ['v2'] }), { status: 200 })
    }
    if (href.endsWith('/manifests/v2')) {
      return new Response(JSON.stringify({
        manifests: [
          { platform: { os: 'linux', architecture: 'amd64' } },
        ],
      }), { status: 200 })
    }
    return new Response('', { status: 404 })
  }

  const payload = await detectExistingImage('https://github.com/example/web.git', workDir)

  assert.equal(payload.mode, 'reuse-image')
  assert.equal(payload.image, 'ghcr.io/example/web')
  assert.equal(payload.tag, 'v2')
})

test('falls back to documented floating dockerhub tag when no concrete tag is usable', async (t) => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-image-'))
  fs.writeFileSync(path.join(workDir, 'README.md'), [
    '# Example',
    '',
    '### Docker',
    '',
    '```console',
    'docker run example/web:stable',
    '```',
    '',
  ].join('\n'))
  fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify({
    version: '1.2.3',
  }))

  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  globalThis.fetch = async (url) => {
    const href = String(url)
    if (href.includes('hub.docker.com/v2/namespaces/example/repositories/web/tags')) {
      return new Response(JSON.stringify({
        results: [
          { name: 'latest', images: [{ os: 'linux', architecture: 'amd64' }] },
          { name: 'stable', images: [{ os: 'linux', architecture: 'amd64' }] },
        ],
      }), { status: 200 })
    }
    return new Response('', { status: 404 })
  }

  const payload = await detectExistingImage('https://github.com/example/web.git', workDir)

  assert.equal(payload.mode, 'reuse-image')
  assert.equal(payload.image, 'example/web')
  assert.equal(payload.tag, 'stable')
})

test('local detection also prefers package version for floating ghcr tags', async (t) => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-image-'))
  fs.writeFileSync(path.join(workDir, 'README.md'), [
    '# Example',
    '',
    '### Docker',
    '',
    '```console',
    'docker run ghcr.io/example/web:latest',
    '```',
    '',
  ].join('\n'))
  fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify({
    version: '1.2.3',
  }))

  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  globalThis.fetch = async (url) => {
    const href = String(url)
    if (href.includes('/token?')) {
      return new Response(JSON.stringify({ token: 'test-token' }), { status: 200 })
    }
    if (href.endsWith('/tags/list')) {
      return new Response(JSON.stringify({ tags: ['latest', '1.2.3'] }), { status: 200 })
    }
    if (href.endsWith('/manifests/1.2.3')) {
      return new Response(JSON.stringify({
        manifests: [
          { platform: { os: 'linux', architecture: 'amd64' } },
        ],
      }), { status: 200 })
    }
    return new Response('', { status: 404 })
  }

  const payload = await detectWithoutGithubUrl(workDir)

  assert.equal(payload.mode, 'reuse-image')
  assert.equal(payload.image, 'ghcr.io/example/web')
  assert.equal(payload.tag, '1.2.3')
  assert.equal(payload.source, 'readme-local')
})

test('local detection falls back to README floating ghcr tag when package version is absent', async (t) => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-image-'))
  fs.writeFileSync(path.join(workDir, 'README.md'), [
    '# Example',
    '',
    '### Docker',
    '',
    '```console',
    'docker run ghcr.io/example/web:latest',
    '```',
    '',
  ].join('\n'))

  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  globalThis.fetch = async (url) => {
    const href = String(url)
    if (href.includes('/token?')) {
      return new Response(JSON.stringify({ token: 'test-token' }), { status: 200 })
    }
    if (href.endsWith('/tags/list')) {
      return new Response(JSON.stringify({ tags: ['latest'] }), { status: 200 })
    }
    if (href.endsWith('/manifests/latest')) {
      return new Response(JSON.stringify({
        manifests: [
          { platform: { os: 'linux', architecture: 'amd64' } },
        ],
      }), { status: 200 })
    }
    return new Response('', { status: 404 })
  }

  const payload = await detectWithoutGithubUrl(workDir)

  assert.equal(payload.mode, 'reuse-image')
  assert.equal(payload.image, 'ghcr.io/example/web')
  assert.equal(payload.tag, 'latest')
  assert.equal(payload.source, 'readme-local')
})

test('does not duplicate root README aliases on case-insensitive filesystems', async (t) => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-image-'))
  fs.writeFileSync(path.join(workDir, 'README.md'), [
    '# Example',
    '',
    '### Docker',
    '',
    '```console',
    'docker run ghcr.io/example/web:latest',
    '```',
    '',
  ].join('\n'))

  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  globalThis.fetch = async (url) => {
    const href = String(url)
    if (href.includes('/token?')) {
      return new Response(JSON.stringify({ token: 'test-token' }), { status: 200 })
    }
    if (href.endsWith('/tags/list')) {
      return new Response(JSON.stringify({ tags: ['latest'] }), { status: 200 })
    }
    if (href.endsWith('/manifests/latest')) {
      return new Response(JSON.stringify({
        manifests: [
          { platform: { os: 'linux', architecture: 'amd64' } },
        ],
      }), { status: 200 })
    }
    return new Response('', { status: 404 })
  }

  const payload = await detectExistingImage('https://github.com/example/web.git', workDir)
  const readmeSignals = payload.evidence.filter((entry) => entry.signal.includes('README'))

  assert.equal(readmeSignals.length, 1)
})

test('treats docker compose build inside fenced README blocks as build-required', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-image-'))
  fs.writeFileSync(path.join(workDir, 'README.md'), [
    '# Example',
    '',
    '### Docker',
    '',
    '```console',
    'cd apps/www',
    '',
    '# Build a Docker image with:',
    'docker compose build',
    '',
    '# Run locally with docker compose',
    'docker compose up',
    '```',
    '',
  ].join('\n'))

  const result = runDetect(workDir)

  assert.equal(result.status, 0, result.stderr)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.found, false)
  assert.equal(payload.mode, 'build-required')
  assert.equal(payload.deployment_mode, 'build')
  assert.match(payload.reason, /README documents docker build/)
})

test('does not let README build signals skip later verified local image references', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-image-'))
  fs.writeFileSync(path.join(workDir, 'README.md'), [
    '# Example',
    '',
    '### Docker',
    '',
    '```console',
    'docker compose build',
    '```',
    '',
  ].join('\n'))
  fs.writeFileSync(path.join(workDir, 'CHANGELOG.md'), [
    '# Release',
    '',
    'docker pull ghcr.io/example/web:v1.0.0',
    '',
  ].join('\n'))

  const result = spawnSync(process.execPath, [
    script,
    workDir,
  ], {
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.mode, 'build-required')
  assert.equal(payload.reason, 'README documents docker build deployment; skipping registry reuse')
  assert(payload.evidence.some((entry) => entry.source === 'release' && /CHANGELOG/.test(entry.signal)))
})
