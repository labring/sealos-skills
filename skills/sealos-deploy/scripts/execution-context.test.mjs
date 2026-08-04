#!/usr/bin/env node

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  deriveRegionFromApiServer,
  isSandboxEnvironment,
  parseMinifiedKubeconfig,
  resolveExecutionEnvironment,
} from './execution-context.mjs'

test('sandbox detection uses presence of SEALAI_DEPLOY_TASK_ID', () => {
  assert.equal(isSandboxEnvironment({}), false)
  assert.equal(isSandboxEnvironment({ SEALAI_DEPLOY_TASK_ID: '' }), true)
  assert.deepEqual(resolveExecutionEnvironment({ SEALAI_DEPLOY_TASK_ID: 'task-123' }), {
    execution_environment: 'sandbox',
    sandbox: true,
    non_interactive: true,
    builder: 'kaniko',
    sealai_deploy_task_id_present: true,
  })
})

test('local execution keeps buildx and interactive behavior', () => {
  assert.deepEqual(resolveExecutionEnvironment({}), {
    execution_environment: 'local',
    sandbox: false,
    non_interactive: false,
    builder: 'buildx',
    sealai_deploy_task_id_present: false,
  })
})

test('region is derived from API server without its Kubernetes port', () => {
  assert.deepEqual(deriveRegionFromApiServer('https://usw-1.sealos.io:6443'), {
    api_server: 'https://usw-1.sealos.io:6443',
    region: 'https://usw-1.sealos.io',
    region_domain: 'usw-1.sealos.io',
    template_api_url: 'https://template.usw-1.sealos.io/api/v2alpha/templates/raw',
  })
})

test('namespace and region come from the minified current context', () => {
  assert.deepEqual(parseMinifiedKubeconfig({
    clusters: [{ cluster: { server: 'https://gzg.sealos.run:6443' } }],
    contexts: [{ context: { namespace: 'ns-example' } }],
  }), {
    namespace: 'ns-example',
    api_server: 'https://gzg.sealos.run:6443',
    region: 'https://gzg.sealos.run',
    region_domain: 'gzg.sealos.run',
    template_api_url: 'https://template.gzg.sealos.run/api/v2alpha/templates/raw',
  })
})

test('missing namespace is rejected', () => {
  assert.throws(
    () => parseMinifiedKubeconfig({ clusters: [{ cluster: { server: 'https://usw-1.sealos.io:6443' } }] }),
    /does not contain a namespace/,
  )
})
