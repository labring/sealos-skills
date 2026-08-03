#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { inspectDeploymentSource } from './inspect-deployment-source.mjs'

function withFixture (files, run) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-source-inspection-'))
  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const filePath = path.join(workDir, relativePath)
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, content)
    }
    return run(workDir)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
}

const kubernetesOutput = JSON.stringify([{ apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: 'api' } }])
const parseKubernetes = () => kubernetesOutput

test('uses Helm before Kubernetes and Compose', () => {
  withFixture({
    'chart/Chart.yaml': 'apiVersion: v2\nname: demo\nversion: 1.0.0\n',
    'chart/templates/deployment.yaml': '{{ .Release.Name }}\n',
    'k8s/app.yaml': 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: api\n',
    'compose.yaml': 'services: {}\n',
  }, workDir => {
    const result = inspectDeploymentSource(workDir, { execute: parseKubernetes })
    assert.deepEqual(result.selected, { kind: 'helm', path: 'chart', selected_by: 'priority' })
  })
})

test('uses Kubernetes before Compose', () => {
  withFixture({
    'k8s/app.yaml': 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: api\n',
    'compose.yaml': 'services: {}\n',
  }, workDir => {
    const result = inspectDeploymentSource(workDir, { execute: parseKubernetes })
    assert.deepEqual(result.selected, { kind: 'kubernetes', path: 'k8s/app.yaml', selected_by: 'priority' })
  })
})

test('reports same-kind source ambiguity for the Agent decision', () => {
  withFixture({
    'charts/api/Chart.yaml': 'apiVersion: v2\nname: api\nversion: 1.0.0\n',
    'charts/api/templates/deployment.yaml': '{{ .Release.Name }}\n',
    'charts/web/Chart.yaml': 'apiVersion: v2\nname: web\nversion: 1.0.0\n',
    'charts/web/templates/deployment.yaml': '{{ .Release.Name }}\n',
  }, workDir => {
    const result = inspectDeploymentSource(workDir, { execute: parseKubernetes })
    assert.equal(result.selected, null)
    assert.match(result.ambiguity, /multiple helm/i)
  })
})

test('uses a valid user configuration override', () => {
  withFixture({
    'chart/Chart.yaml': 'apiVersion: v2\nname: demo\nversion: 1.0.0\n',
    'chart/templates/deployment.yaml': '{{ .Release.Name }}\n',
    'compose.yaml': 'services: {}\n',
    '.sealos/config.json': JSON.stringify({ deployment_source: { kind: 'compose', path: 'compose.yaml' } }),
  }, workDir => {
    const result = inspectDeploymentSource(workDir, { execute: parseKubernetes })
    assert.deepEqual(result.selected, { kind: 'compose', path: 'compose.yaml', selected_by: 'configuration' })
  })
})

test('selects an implicit route without explicit source evidence', () => {
  withFixture({ 'package.json': '{"name":"demo"}\n' }, workDir => {
    const result = inspectDeploymentSource(workDir, { execute: parseKubernetes })
    assert.deepEqual(result.selected, { kind: 'implicit', path: '.', selected_by: 'no-explicit-source' })
  })
})
