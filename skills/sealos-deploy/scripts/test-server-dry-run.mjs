#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(root, 'server-dry-run.ts')
const require = createRequire(import.meta.url)
const YAML_ENTRY = pathToFileURL(require.resolve('yaml')).href

const TEMPLATE = `apiVersion: app.sealos.io/v1
kind: Template
metadata:
  name: validation-demo
spec:
  defaults:
    app_name:
      type: string
      value: validation-demo-\${{ random(8) }}
    app_host:
      type: string
      value: validation-demo-\${{ random(8) }}
  inputs:
    enable_service:
      type: boolean
      default: "false"
      required: false
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: \${{ defaults.app_name }}
spec:
  selector:
    matchLabels:
      app: \${{ defaults.app_name }}
  template:
    metadata:
      labels:
        app: \${{ defaults.app_name }}
    spec:
      serviceAccountName: \${{ SEALOS_SERVICE_ACCOUNT }}
      containers:
        - name: app
          image: example.invalid/app@sha256:\
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
          env:
            - name: TOKEN
              value: \${{ base64('validation') }}
---
\${{ if(inputs.enable_service === 'true') }}
apiVersion: v1
kind: Service
metadata:
  name: \${{ defaults.app_name }}
spec:
  selector:
    app: \${{ defaults.app_name }}
  ports:
    - port: 8080
\${{ endif() }}
`

function mockKubectlSource() {
  return `#!/usr/bin/env node
import { parse as parseYaml } from ${JSON.stringify(YAML_ENTRY)}
import { appendFileSync, readFileSync, statSync } from 'node:fs'

const args = process.argv.slice(2)
const pathIndex = args.indexOf('-f')
const filePath = args[pathIndex + 1]
const text = readFileSync(filePath, 'utf8')
const document = parseYaml(text)
if (document === null || document === undefined) {
  throw new Error('expected exactly one YAML document')
}
if (typeof document !== 'object' || Array.isArray(document)) {
  throw new Error('expected exactly one YAML document')
}
const record = {
  kind: document.kind,
  name: document.metadata.name,
  mode: statSync(filePath).mode & 0o777,
  has_expression: text.includes('\${{'),
  args,
}
const containers =
  document?.spec?.template?.spec?.containers ?? []
record.env = []
for (const container of containers) {
  for (const item of container.env ?? []) {
    record.env.push({ name: item?.name, value: item?.value })
  }
}
record.data = document.data ?? {}
appendFileSync(process.env.MOCK_KUBECTL_LOG, JSON.stringify(record) + '\\n')

const failKinds = new Set(
  (process.env.MOCK_FAIL_KINDS ?? '').split(',').filter(Boolean),
)
if (failKinds.has(document.kind)) {
  if (process.env.MOCK_FAIL_MODE === 'authorization') {
    const action = document.kind === 'Role' ? 'escalate' : 'bind'
    const status = document.kind === 'Role' ? 'BadRequest' : 'Forbidden'
    process.stderr.write(
      'Error from server (' + status + '): current identity cannot ' +
        action + ' this RBAC resource\\n',
    )
  } else if (process.env.MOCK_FAIL_MODE === 'admission') {
    process.stderr.write(
      'Error from server: admission webhook "policy.example.invalid" ' +
        'denied the request\\n',
    )
  } else {
    process.stderr.write(
      'Error from server (BadRequest): strict decoding error: ' +
        'unknown field "spec.componentSpecs[0].noCreatePDB"\\n',
    )
  }
  process.exit(1)
}

process.stdout.write(String(document.kind).toLowerCase() + '/' + document.metadata.name + '\\n')
`
}

function runGate(templateText, failKinds = null, failMode = null) {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'sealos-server-dry-run-test-'))
  try {
    const template = path.join(tempDir, 'index.yaml')
    writeFileSync(template, templateText, 'utf8')
    const original = readFileSync(template)
    const mock = path.join(tempDir, 'kubectl.mjs')
    writeFileSync(mock, mockKubectlSource(), 'utf8')
    chmodSync(mock, 0o700)
    const log = path.join(tempDir, 'kubectl.jsonl')
    writeFileSync(log, '')
    const privateLog = path.join(tempDir, 'private.log')
    const repairAuthorization = path.join(
      tempDir,
      'schema-repair-authorization.json',
    )
    const environment = {
      ...process.env,
      MOCK_KUBECTL_LOG: log,
    }
    if (failKinds) {
      environment.MOCK_FAIL_KINDS = failKinds.join(',')
    }
    if (failMode) {
      environment.MOCK_FAIL_MODE = failMode
    }
    const result = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        SCRIPT,
        '--template',
        template,
        '--namespace',
        'validation-ns',
        '--context',
        'validation-context',
        '--service-account',
        'validation-sa',
        '--cloud-domain',
        'cloud.example.invalid',
        '--cert-secret-name',
        'validation-cert',
        '--kubectl',
        mock,
        '--private-log',
        privateLog,
        '--repair-authorization',
        repairAuthorization,
      ],
      {
        encoding: 'utf8',
        env: environment,
      },
    )
    const payload = JSON.parse(result.stdout)
    const records = readFileSync(log, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    assert.deepEqual(original, readFileSync(template))
    assert.equal(statSync(privateLog).mode & 0o777, 0o600)
    const authorization = existsSync(repairAuthorization)
      ? JSON.parse(readFileSync(repairAuthorization, 'utf8'))
      : null
    if (existsSync(repairAuthorization)) {
      assert.equal(statSync(repairAuthorization).mode & 0o777, 0o600)
    }
    return {
      result,
      payload,
      records,
      privateLog: readFileSync(privateLog, 'utf8'),
      authorization,
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

test('renders branches, skips Template, and checks one document at a time', () => {
  const { result, payload, records } = runGate(TEMPLATE)

  assert.equal(result.status, 0, result.stderr)
  assert.equal(payload.status, 'passed')
  assert.equal(payload.scenarios, 2)
  assert.equal(payload.documents_checked, 2)
  assert.deepEqual(
    new Set(records.map((item) => item.kind)),
    new Set(['Deployment', 'Service']),
  )
  assert.ok(records.every((item) => item.mode === 0o600))
  assert.ok(records.every((item) => !item.has_expression))
  assert.ok(records.every((item) => item.args.includes('--dry-run=server')))
  assert.ok(records.every((item) => item.args.includes('--validate=strict')))
  assert.ok(!records.some((item) => item.kind === 'Template'))
})

test('reports target schema failure without raw admission output', () => {
  const cluster =
    TEMPLATE +
    `---
apiVersion: apps.kubeblocks.io/v1alpha1
kind: Cluster
metadata:
  name: \${{ defaults.app_name }}-mysql
spec:
  componentSpecs:
    - name: mysql
      noCreatePDB: false
`
  const { result, payload, records, privateLog, authorization } = runGate(
    cluster,
    ['Cluster'],
  )

  assert.equal(result.status, 1)
  assert.equal(payload.status, 'failed')
  assert.equal(payload.failures.length, 1)
  const failure = payload.failures[0]
  assert.equal(failure.category, 'schema')
  assert.equal(failure.repairable, true)
  assert.deepEqual(failure.field_paths, ['spec.componentSpecs[0].noCreatePDB'])
  assert.ok(!result.stdout.includes('Error from server'))
  assert.ok(!privateLog.includes('Error from server'))
  assert.deepEqual(
    new Set(records.map((item) => item.kind)),
    new Set(['Deployment', 'Service', 'Cluster']),
  )
  assert.equal(authorization.version, '1.0')
  assert.equal(authorization.template_sha256, payload.template_sha256)
  assert.deepEqual(authorization.repairs[0].field_paths, [
    'spec.componentSpecs[0].noCreatePDB',
  ])
})

test('reports RBAC authorization failures as non-blocking warnings', () => {
  const rbac =
    TEMPLATE +
    `---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: \${{ defaults.app_name }}
rules:
  - apiGroups: ["*"]
    resources: ["*"]
    verbs: ["*"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: \${{ defaults.app_name }}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: \${{ defaults.app_name }}
subjects:
  - kind: ServiceAccount
    name: \${{ SEALOS_SERVICE_ACCOUNT }}
`
  const { result, payload, records, privateLog, authorization } = runGate(
    rbac,
    ['Role', 'RoleBinding'],
    'authorization',
  )

  assert.equal(result.status, 0, result.stderr)
  assert.equal(payload.status, 'passed')
  assert.deepEqual(payload.failures, [])
  const authorizationWarnings = payload.warnings.filter(
    (warning) => warning.category === 'authorization',
  )
  assert.deepEqual(
    new Set(authorizationWarnings.map((warning) => warning.kind)),
    new Set(['Role', 'RoleBinding']),
  )
  assert.ok(authorizationWarnings.every((warning) => !warning.repairable))
  assert.ok(privateLog.includes('status=warning category=authorization'))
  assert.deepEqual(
    new Set(records.map((item) => item.kind)),
    new Set(['Deployment', 'Service', 'Role', 'RoleBinding']),
  )
  assert.equal(authorization, null)
})

test('marks non-schema failures as not repairable', () => {
  const { result, payload, authorization } = runGate(
    TEMPLATE,
    ['Deployment'],
    'admission',
  )

  assert.equal(result.status, 1)
  assert.equal(payload.status, 'failed')
  assert.equal(payload.failures.length, 1)
  const failure = payload.failures[0]
  assert.equal(failure.category, 'admission')
  assert.equal(failure.repairable, false)
  assert.equal(authorization, null)
})

test('renders official mastodon expression and array condition shape', () => {
  const mastodon = `apiVersion: app.sealos.io/v1
kind: Template
metadata:
  name: mastodon
spec:
  defaults:
    app_name:
      type: string
      value: mastodon-\${{ random(8) }}
    secret_key_base:
      type: string
      value: \${{ random(128).toLowerCase().replace(/[^0-9a-f]/g, 'a') }}
  inputs:
    enable_s3_storage:
      type: boolean
      default: "false"
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: \${{ defaults.app_name }}-env
data:
  SECRET_KEY_BASE: '\${{ defaults.secret_key_base }}'
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: \${{ defaults.app_name }}
spec:
  selector:
    matchLabels:
      app: \${{ defaults.app_name }}
  template:
    metadata:
      labels:
        app: \${{ defaults.app_name }}
    spec:
      containers:
        - name: mastodon
          image: tootsuite/mastodon:v4.6.3
          env:
            - name: SERVICE_ACCOUNT
              value: \${{ SEALOS_SERVICE_ACCOUNT }}
            \${{ if(inputs.enable_s3_storage === 'true') }}
            - name: AWS_ACCESS_KEY_ID
              value: access
            \${{ endif() }}
            \${{ if(inputs.enable_s3_storage === 'false') }}
            - name: LOCAL_STORAGE
              value: enabled
            \${{ endif() }}
`
  const { result, payload, records, authorization } = runGate(mastodon)

  assert.equal(result.status, 0, result.stderr)
  assert.equal(payload.status, 'passed')
  const deploymentEnvs = records
    .filter((record) => record.kind === 'Deployment')
    .map((record) =>
      Object.fromEntries(record.env.map((item) => [item.name, item.value])),
    )
  assert.ok(
    deploymentEnvs.some((environment) => 'AWS_ACCESS_KEY_ID' in environment),
  )
  assert.ok(
    deploymentEnvs.some((environment) => 'LOCAL_STORAGE' in environment),
  )
  assert.ok(
    deploymentEnvs.every(
      (environment) => environment.SERVICE_ACCOUNT === 'validation-sa',
    ),
  )
  const secretValues = records
    .filter((record) => record.kind === 'ConfigMap')
    .map((record) => record.data?.SECRET_KEY_BASE ?? '')
  assert.ok(secretValues.length > 0)
  assert.ok(
    secretValues.every(
      (value) =>
        value.length === 128 &&
        [...value].every((character) => '0123456789abcdef'.includes(character)),
    ),
  )
  assert.equal(authorization, null)
})
