#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = path.join(ROOT, 'skills', 'sealos-canvas', 'scripts', 'generate-canvas.mjs')

function makeWorkDir(withState) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-canvas-contract-'))
  if (withState) {
    fs.mkdirSync(path.join(workDir, '.sealos'), { recursive: true })
    fs.writeFileSync(path.join(workDir, '.sealos', 'state.json'), JSON.stringify({
      last_deploy: {
        app_name: 'demo-app',
        namespace: 'ns-demo',
        url: 'https://demo.example.com',
        image: 'registry.example/demo:1.0.0',
        deployed_at: '2026-08-07T00:00:00Z'
      }
    }))
  }
  return workDir
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-canvas-fixture-'))
  const fixturePath = path.join(root, 'resources.json')
  const secretValue = 'SHOULD_NOT_RENDER_SECRET'
  fs.writeFileSync(fixturePath, JSON.stringify({
    deployments: { items: [{
      metadata: { name: 'demo-app', labels: { app: 'demo-app' } },
      spec: {
        replicas: 1,
        selector: { matchLabels: { app: 'demo-app' } },
        template: {
          metadata: { labels: { app: 'demo-app' } },
          spec: {
            containers: [{
              name: 'demo-app',
              image: 'registry.example/demo:1.0.0',
              env: [{ valueFrom: { secretKeyRef: { name: 'demo-secret', key: 'TOKEN' } } }],
              volumeMounts: [{ name: 'data', mountPath: '/data' }]
            }],
            volumes: [{ name: 'data', persistentVolumeClaim: { claimName: 'demo-data' } }]
          }
        }
      },
      status: { readyReplicas: 1 }
    }] },
    pods: { items: [{
      metadata: { name: 'demo-app-0', ownerReferences: [{ name: 'demo-app' }], labels: { app: 'demo-app' } },
      spec: { containers: [{ name: 'demo-app' }] },
      status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }], containerStatuses: [{ restartCount: 0 }] }
    }] },
    services: { items: [{
      metadata: { name: 'demo-app', labels: { app: 'demo-app', 'cloud.sealos.io/app-deploy-manager': 'demo-app' } },
      spec: { selector: { app: 'demo-app' }, ports: [{ name: 'http', port: 3000, targetPort: 3000 }] }
    }] },
    ingresses: { items: [] },
    persistentvolumeclaims: { items: [{ metadata: { name: 'demo-data' }, status: { phase: 'Bound' }, spec: { resources: { requests: { storage: '1Gi' } } } }] },
    configmaps: { items: [{ metadata: { name: 'demo-config' }, dataKeyCount: 2, data: { INTERNAL: secretValue } }] },
    secrets: { items: [{ metadata: { name: 'demo-secret' }, type: 'Opaque', data: { TOKEN: secretValue } }] },
    events: { items: [{ type: 'Warning', reason: 'Auth', involvedObject: { name: 'demo-app' }, message: `password=${secretValue}`, lastTimestamp: '2026-08-07T00:00:00Z' }] }
  }))
  return { root, fixturePath, secretValue }
}

function run(workDir, fixturePath) {
  const result = spawnSync(process.execPath, [SCRIPT, '--work-dir', workDir, '--no-serve'], {
    env: { ...process.env, SEALOS_CANVAS_KUBE_FIXTURE: fixturePath },
    encoding: 'utf8'
  })
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

function testMissingStateStops() {
  const workDir = makeWorkDir(false)
  try {
    const result = run(workDir, makeFixture().fixturePath)
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'not_deployed')
    assert.equal(result.server_lifetime.status, 'not_started')
    assert.equal(fs.existsSync(path.join(workDir, '.sealos', 'canvas', 'index.html')), false)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
}

function testFixtureGeneratesSanitizedCanvas() {
  const workDir = makeWorkDir(true)
  const fixture = makeFixture()
  try {
    const result = run(workDir, fixture.fixturePath)
    const html = fs.readFileSync(path.join(workDir, '.sealos', 'canvas', 'index.html'), 'utf8')
    assert.equal(result.ok, true)
    assert.equal(result.local_url, null)
    assert.equal(result.server_lifetime.status, 'not_started')
    assert.equal(result.node_count >= 5, true)
    assert.equal(result.edge_count >= 3, true)
    assert.match(html, /demo-app/)
    assert.doesNotMatch(html, new RegExp(fixture.secretValue))
    assert.match(html, /redacted/)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
}

function testSourceHasReadOnlyCommands() {
  const source = fs.readFileSync(SCRIPT, 'utf8')
  assert.doesNotMatch(source, /\b(?:apply|patch|delete|rollout|set image)\b/i)
}

testMissingStateStops()
testFixtureGeneratesSanitizedCanvas()
testSourceHasReadOnlyCommands()
console.log('Canvas contract tests passed (3 cases).')
