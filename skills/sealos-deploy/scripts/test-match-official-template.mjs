#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const scriptPath = resolve(fileURLToPath(new URL('.', import.meta.url)), 'match-official-template.mjs')

const COMMIT_SHA = 'abc123def456abc123def456abc123def456abc1'

function startFixtureServer(routes) {
  return new Promise((resolveStart) => {
    const server = createServer((req, res) => {
      const handler = routes[req.url]
      if (!handler) {
        res.writeHead(404)
        res.end('not found')
        return
      }
      const { status = 200, body } = typeof handler === 'function' ? handler() : handler
      res.writeHead(status)
      res.end(body)
    })
    server.listen(0, '127.0.0.1', () => {
      resolveStart({ server, base: `http://127.0.0.1:${server.address().port}` })
    })
  })
}

// Async spawn: the fixture HTTP server runs in this process, so a blocking
// spawnSync would deadlock the child's requests against our event loop.
function runMatcher(base, args) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      env: {
        ...process.env,
        SEALOS_TEMPLATE_API_BASE: base,
        SEALOS_TEMPLATE_RAW_BASE: base,
        SEALOS_TEMPLATE_FETCH_TIMEOUT_MS: '3000',
      },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('close', (status) => resolveRun({ status, stdout, stderr }))
  })
}

const catalogRoutes = {
  [`/repos/labring-actions/templates/commits/kb-0.9`]: {
    body: JSON.stringify({ sha: COMMIT_SHA }),
  },
  [`/repos/labring-actions/templates/git/trees/${COMMIT_SHA}?recursive=1`]: {
    body: JSON.stringify({
      tree: [
        { path: 'template/umami/index.yaml' },
        { path: 'template/evershop/index.yaml' },
        { path: 'template/other/index.yaml' },
        { path: 'README.md' },
      ],
    }),
  },
  [`/labring-actions/templates/${COMMIT_SHA}/template/umami/index.yaml`]: {
    body: [
      'apiVersion: app.sealos.io/v1',
      'kind: Template',
      'metadata:',
      '  name: umami',
      'spec:',
      '  gitRepo: https://github.com/umami-software/umami',
    ].join('\n'),
  },
  [`/labring-actions/templates/${COMMIT_SHA}/template/evershop/index.yaml`]: {
    body: [
      'spec:',
      '  gitRepo: https://github.com/evershopcommerce/evershop',
    ].join('\n'),
  },
}

test('returns the pinned raw URL on an exact gitRepo match', async () => {
  const { server, base } = await startFixtureServer(catalogRoutes)
  try {
    const result = await runMatcher(base, ['--github-url', 'https://github.com/Umami-Software/umami.git'])
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const output = JSON.parse(result.stdout)
    assert.equal(output.reason, 'exact_match')
    assert.equal(
      output.official_template,
      `${base}/labring-actions/templates/${COMMIT_SHA}/template/umami/index.yaml`,
    )
  } finally {
    server.close()
  }
})

test('name candidate with a different gitRepo does not match', async () => {
  const { server, base } = await startFixtureServer(catalogRoutes)
  try {
    // A fork shares the repo name but not the upstream identity.
    const result = await runMatcher(base, ['--github-url', 'https://github.com/someone-else/umami'])
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const output = JSON.parse(result.stdout)
    assert.equal(output.official_template, null)
    assert.equal(output.reason, 'no_exact_match')
    assert.equal(output.checked.length, 1)
    assert.equal(output.checked[0].matched, false)
  } finally {
    server.close()
  }
})

test('catalog failure degrades to null without crashing', async () => {
  const { server, base } = await startFixtureServer({
    '/repos/labring-actions/templates/commits/kb-0.9': { status: 500, body: 'boom' },
  })
  try {
    const result = await runMatcher(base, ['--github-url', 'https://github.com/umami-software/umami'])
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const output = JSON.parse(result.stdout)
    assert.equal(output.official_template, null)
    assert.equal(output.reason, 'catalog_unreachable')
  } finally {
    server.close()
  }
})

test('missing github_url short-circuits to null without any fetch', async () => {
  const result = await runMatcher('http://127.0.0.1:1', [])
  assert.equal(result.status, 0, result.stderr || result.stdout)
  const output = JSON.parse(result.stdout)
  assert.equal(output.official_template, null)
  assert.equal(output.reason, 'no_github_url')
})
