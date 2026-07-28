#!/usr/bin/env node

import assert from 'assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  inspectDeploymentSource,
  selectDeploymentSource,
} from './inspect-deployment-source.mjs'

async function withFixture (files, callback) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-deployment-source-test-'))
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

function installHelmMock (workDir, rendered, options = {}) {
  const renderedPath = path.join(workDir, 'helm-rendered.yaml')
  const logPath = path.join(workDir, 'helm-calls.log')
  const failPath = path.join(workDir, 'helm-fail')
  const mockPath = path.join(workDir, 'helm-mock.mjs')
  fs.writeFileSync(renderedPath, rendered)
  if (options.fail) fs.writeFileSync(failPath, '1\n')
  fs.writeFileSync(mockPath, `#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const root = path.dirname(fileURLToPath(import.meta.url))
fs.appendFileSync(path.join(root, 'helm-calls.log'), process.argv.slice(2).join(' ') + '\\n')
if (fs.existsSync(path.join(root, 'helm-fail')) && process.argv[2] === 'template') {
  process.stderr.write('render failed for fixture\\n')
  process.exit(1)
}
if (process.argv[2] === 'template') {
  process.stdout.write(fs.readFileSync(path.join(root, 'helm-rendered.yaml'), 'utf8'))
}
`)
  fs.chmodSync(mockPath, 0o755)
  return { logPath, mockPath }
}

const renderedDeployment = [
  'apiVersion: apps/v1',
  'kind: Deployment',
  'metadata:',
  '  name: api',
  'spec:',
  '  selector:',
  '    matchLabels:',
  '      app: api',
  '  template:',
  '    metadata:',
  '      labels:',
  '        app: api',
  '    spec:',
  '      containers:',
  '        - name: api',
  '          image: ghcr.io/example/api:latest',
  '',
].join('\n')

const tests = []

function test (name, run) {
  tests.push({ name, run })
}

test('selects root Compose before other deployment sources', async () => {
  await withFixture({
    'compose.yaml': 'services:\n  app:\n    image: example/app:latest\n',
    'k8s/app.yaml': renderedDeployment,
  }, async workDir => {
    const result = inspectDeploymentSource(workDir)
    assert.equal(result.deployment_source.kind, 'compose')
    assert.equal(result.deployment_source.path, 'compose.yaml')
    assert.equal(result.deployment_source.rendered_path, null)
  })
})

test('treats vendored subcharts as part of one parent Helm source', async () => {
  await withFixture({
    'charts/platform/Chart.yaml': [
      'apiVersion: v2',
      'name: platform',
      'version: 0.1.0',
      'dependencies:',
      '  - name: dependency',
      '    version: 1.0.0',
      '    repository: https://example.invalid/charts',
      '',
    ].join('\n'),
    'charts/platform/Chart.lock': 'dependencies: []\ndigest: sha256:test\ngenerated: now\n',
    'charts/platform/templates/app.yaml': '{{ .Release.Name }}\n',
    'charts/platform/charts/dependency/Chart.yaml': 'apiVersion: v2\nname: dependency\nversion: 1.0.0\n',
    'charts/platform/charts/dependency/templates/app.yaml': '{{ .Release.Name }}\n',
  }, async workDir => {
    const helm = installHelmMock(workDir, renderedDeployment)
    const result = inspectDeploymentSource(workDir, { helmPath: helm.mockPath })

    assert.equal(result.deployment_source.kind, 'helm')
    assert.equal(result.deployment_source.path, 'charts/platform')
    assert.equal(result.deployment_source.dependency_mode, 'locked')
    assert.equal(result.services.length, 1)
    assert.equal(result.services[0].name, 'api')
    assert.equal(result.services[0].source, 'helm')
    assert.ok(fs.existsSync(path.join(workDir, result.deployment_source.rendered_path)))

    const calls = fs.readFileSync(helm.logPath, 'utf8')
    assert.match(calls, /^dependency build /m)
    assert.match(calls, /^template /m)
    assert.doesNotMatch(calls, /\binstall\b/)
  })
})

test('rejects independent Helm chart ambiguity', async () => {
  await withFixture({
    'charts/api/Chart.yaml': 'apiVersion: v2\nname: api\nversion: 0.1.0\n',
    'charts/api/templates/app.yaml': '{{ .Release.Name }}\n',
    'charts/ui/Chart.yaml': 'apiVersion: v2\nname: ui\nversion: 0.1.0\n',
    'charts/ui/templates/app.yaml': '{{ .Release.Name }}\n',
  }, async workDir => {
    assert.throws(
      () => selectDeploymentSource(workDir),
      /multiple Helm Charts found/,
    )
  })
})

test('reports Helm render failures without falling back to an implicit service', async () => {
  await withFixture({
    'chart/Chart.yaml': 'apiVersion: v2\nname: broken\nversion: 0.1.0\n',
    'chart/templates/app.yaml': '{{ .Release.Name }}\n',
    'Dockerfile': 'FROM scratch\n',
  }, async workDir => {
    const helm = installHelmMock(workDir, renderedDeployment, { fail: true })
    assert.throws(
      () => inspectDeploymentSource(workDir, { helmPath: helm.mockPath }),
      /helm template failed: render failed for fixture/,
    )
  })
})

test('combines a native Kubernetes directory and inventories every workload', async () => {
  await withFixture({
    'k8s/api.yaml': renderedDeployment,
    'k8s/worker.yaml': renderedDeployment
      .replaceAll('name: api', 'name: worker')
      .replaceAll('app: api', 'app: worker')
      .replaceAll('/api:latest', '/worker:latest'),
  }, async workDir => {
    const result = inspectDeploymentSource(workDir)
    assert.equal(result.deployment_source.kind, 'kubernetes')
    assert.equal(result.deployment_source.path, 'k8s')
    assert.deepEqual(
      result.services.map(service => service.name).sort(),
      ['api', 'worker'],
    )
    assert.equal(result.deployment_source.resources.length, 2)
    assert.ok(fs.existsSync(path.join(workDir, '.sealos/deployment-source/rendered.yaml')))
  })
})

test('combines multiple root Kubernetes manifests into one source bundle', async () => {
  await withFixture({
    'app.yaml': renderedDeployment,
    'rbac.yaml': [
      'apiVersion: rbac.authorization.k8s.io/v1',
      'kind: Role',
      'metadata:',
      '  name: api',
      'rules: []',
      '',
    ].join('\n'),
    'service.yaml': [
      'apiVersion: v1',
      'kind: Service',
      'metadata:',
      '  name: api',
      'spec:',
      '  selector:',
      '    app: api',
      '  ports:',
      '    - port: 8080',
      '      targetPort: 8080',
      '',
    ].join('\n'),
  }, async workDir => {
    const result = inspectDeploymentSource(workDir)
    assert.equal(result.deployment_source.kind, 'kubernetes')
    assert.equal(result.deployment_source.path, '.')
    assert.deepEqual(
      result.deployment_source.evidence,
      ['app.yaml', 'rbac.yaml', 'service.yaml'],
    )
    assert.equal(result.deployment_source.resources.length, 3)
    assert.deepEqual(result.services.map(service => service.name), ['api'])
  })
})

test('uses the implicit service route only when no explicit topology exists', async () => {
  await withFixture({
    'Dockerfile': 'FROM scratch\n',
    'package.json': '{"name":"single"}\n',
  }, async workDir => {
    const result = inspectDeploymentSource(workDir)
    assert.equal(result.deployment_source.kind, 'implicit-single-service')
    assert.deepEqual(result.services, [])
    assert.deepEqual(result.images, [])
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
