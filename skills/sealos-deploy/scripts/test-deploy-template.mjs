#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const deployScript = join(scriptDir, 'deploy-template.mjs')

function withFixture(callback) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'sealos-deploy-template-test-'))
  const homeDir = join(fixtureRoot, 'home')
  const sealosDir = join(homeDir, '.sealos')
  const templatePath = join(fixtureRoot, 'index.yaml')
  const capturePath = join(fixtureRoot, 'request.json')
  const fetchMockPath = join(fixtureRoot, 'fetch-mock.cjs')

  mkdirSync(sealosDir, { recursive: true })
  writeFileSync(
    join(sealosDir, 'auth.json'),
    `${JSON.stringify({ region: 'https://usw-1.sealos.io' })}\n`,
  )
  writeFileSync(join(sealosDir, 'kubeconfig'), 'apiVersion: v1\nclusters: []\n')
  writeFileSync(templatePath, 'apiVersion: app.sealos.io/v1\nkind: Template\n')
  writeFileSync(fetchMockPath, `
const fs = require('node:fs')

global.fetch = async (url, options) => {
  fs.writeFileSync(process.env.SEALOS_DEPLOY_TEST_CAPTURE, JSON.stringify({
    url,
    method: options.method,
    headers: options.headers,
    body: JSON.parse(options.body),
  }))

  if (process.env.SEALOS_DEPLOY_TEST_MODE === 'throw') {
    throw new Error(process.env.SEALOS_DEPLOY_TEST_ERROR)
  }

  const status = Number(process.env.SEALOS_DEPLOY_TEST_STATUS || 200)
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? 'OK' : 'Bad Request',
    headers: { entries: () => [][Symbol.iterator]() },
    text: async () => process.env.SEALOS_DEPLOY_TEST_RESPONSE || '',
  }
}
`)

  try {
    callback({
      fixtureRoot,
      homeDir,
      templatePath,
      capturePath,
      fetchMockPath,
    })
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
}

function runDeploy(fixture, args = [], env = {}) {
  const nodeOptions = [
    process.env.NODE_OPTIONS,
    `--require=${fixture.fetchMockPath}`,
  ].filter(Boolean).join(' ')

  return spawnSync(process.execPath, [deployScript, fixture.templatePath, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SEALAI_DEPLOY_LABELS_JSON: undefined,
      HOME: fixture.homeDir,
      NODE_OPTIONS: nodeOptions,
      SEALOS_DEPLOY_TEST_CAPTURE: fixture.capturePath,
      ...env,
    },
  })
}

function assertSecretAbsent(result, secret) {
  assert.equal(result.stdout.includes(secret), false, result.stdout)
  assert.equal(result.stderr.includes(secret), false, result.stderr)
}

test('sends template arguments to the API without returning their values', () => {
  withFixture((fixture) => {
    const password = 'official-template-password-7qM2'
    const apiKey = 'official-template-api-key-8rN3'
    const pin = 731942
    const shortValue = 'a'
    const argsPath = join(fixture.fixtureRoot, 'args.json')
    writeFileSync(argsPath, JSON.stringify({
      ADMIN_PASSWORD: password,
      API_KEY: apiKey,
      ADMIN_PIN: pin,
      SHORT_VALUE: shortValue,
    }), { mode: 0o600 })
    const result = runDeploy(
      fixture,
      ['--args-file', argsPath],
      {
        SEALOS_DEPLOY_TEST_RESPONSE: JSON.stringify({
          ok: true,
          name: 'demo-instance',
          displayName: shortValue,
          resources: [
            { kind: 'Deployment', name: 'demo-web' },
            { kind: 'Service', name: 'demo-web' },
          ],
          echoed_password: password,
          nested: {
            echoed_api_key: apiKey,
            args: {
              ADMIN_PASSWORD: password,
              API_KEY: apiKey,
              ADMIN_PIN: pin,
              SHORT_VALUE: shortValue,
            },
          },
          message: `accepted ${password} with PIN ${pin}`,
          submitted_pin: pin,
        }),
      },
    )

    assert.equal(result.status, 0, result.stderr || result.stdout)
    assertSecretAbsent(result, password)
    assertSecretAbsent(result, apiKey)

    const output = JSON.parse(result.stdout)
    assert.equal(output.success, true)
    assert.equal(output.args_supplied, 4)
    assert.equal('args' in output, false)
    assert.equal(output.response.name, 'demo-instance')
    assert.equal(output.response.displayName, '<redacted>')
    assert.deepEqual(output.response.resources, [
      { kind: 'Deployment', name: 'demo-web' },
      { kind: 'Service', name: 'demo-web' },
    ])
    assert.equal('echoed_password' in output.response, false)
    assert.equal('nested' in output.response, false)
    assert.equal('message' in output.response, false)
    assert.equal('submitted_pin' in output.response, false)

    const request = JSON.parse(readFileSync(fixture.capturePath, 'utf8'))
    assert.equal(request.url, 'https://template.usw-1.sealos.io/api/v2alpha/templates/raw')
    assert.equal(request.method, 'POST')
    assert.deepEqual(request.body.args, {
      ADMIN_PASSWORD: password,
      API_KEY: apiKey,
      ADMIN_PIN: pin,
      SHORT_VALUE: shortValue,
    })
    assert.equal(request.body.dryRun, false)
  })
})

test('does not echo template arguments from an API error response', () => {
  withFixture((fixture) => {
    const secret = 'official-template-secret-error-4pK9'
    const argsPath = join(fixture.fixtureRoot, 'args.json')
    writeFileSync(argsPath, JSON.stringify({ ADMIN_PASSWORD: secret }), { mode: 0o600 })
    const result = runDeploy(
      fixture,
      ['--args-file', argsPath],
      {
        SEALOS_DEPLOY_TEST_STATUS: '400',
        SEALOS_DEPLOY_TEST_RESPONSE: JSON.stringify({
          error: {
            type: 'ValidationError',
            code: 'INVALID_INPUT',
            message: `Invalid value: ${secret}`,
            details: {
              submitted: secret,
              args: { ADMIN_PASSWORD: secret },
            },
          },
        }),
      },
    )

    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assertSecretAbsent(result, secret)

    const output = JSON.parse(result.stderr)
    assert.equal(output.success, false)
    assert.equal(output.status, 400)
    assert.equal(output.args_supplied, 1)
    assert.equal('args' in output, false)
    assert.equal(output.response.error.type, 'ValidationError')
    assert.equal(output.response.error.code, 'INVALID_INPUT')
    assert.equal(output.response.error.details_omitted, true)
    assert.equal('message' in output.response.error, false)
    assert.equal('details' in output.response.error, false)
  })
})

test('does not echo template arguments from a request exception', () => {
  withFixture((fixture) => {
    const secret = 'official-template-secret-network-5tL0'
    const argsPath = join(fixture.fixtureRoot, 'args.json')
    writeFileSync(argsPath, JSON.stringify({ ADMIN_PASSWORD: secret }), { mode: 0o600 })
    const result = runDeploy(
      fixture,
      ['--args-file', argsPath],
      {
        SEALOS_DEPLOY_TEST_MODE: 'throw',
        SEALOS_DEPLOY_TEST_ERROR: `network failure included ${secret}`,
      },
    )

    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assertSecretAbsent(result, secret)

    const output = JSON.parse(result.stderr)
    assert.equal(output.error, 'Template API request failed')
    assert.equal(output.args_supplied, 1)
    assert.equal(output.details, 'Request details omitted.')
  })
})

test('does not echo malformed args JSON in parser diagnostics', () => {
  withFixture((fixture) => {
    const secret = 'official-template-secret-json-6uM1'
    const result = runDeploy(
      fixture,
      ['--args-json', `{"ADMIN_PASSWORD":"${secret}"`],
    )

    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assertSecretAbsent(result, secret)
    assert.deepEqual(JSON.parse(result.stderr), {
      error: 'Failed to parse --args-json',
    })
    assert.equal(existsSync(fixture.capturePath), false)
  })
})

test('does not echo template arguments loaded from a file', () => {
  withFixture((fixture) => {
    const secret = 'official-template-secret-file-2wJ7'
    const argsPath = join(fixture.fixtureRoot, 'args.json')
    writeFileSync(argsPath, JSON.stringify({ ADMIN_PASSWORD: secret }))

    const result = runDeploy(
      fixture,
      ['--args-file', argsPath],
      {
        SEALOS_DEPLOY_TEST_RESPONSE: JSON.stringify({
          ok: true,
          submitted: secret,
        }),
      },
    )

    assert.equal(result.status, 0, result.stderr || result.stdout)
    assertSecretAbsent(result, secret)
    const output = JSON.parse(result.stdout)
    assert.equal(output.args_supplied, 1)
    assert.equal(output.response.ok, true)
    assert.equal('submitted' in output.response, false)

    const request = JSON.parse(readFileSync(fixture.capturePath, 'utf8'))
    assert.deepEqual(request.body.args, { ADMIN_PASSWORD: secret })
  })
})

test('does not echo malformed args files in parser diagnostics', () => {
  withFixture((fixture) => {
    const secret = 'official-template-secret-file-json-3xK8'
    const argsPath = join(fixture.fixtureRoot, 'args.json')
    writeFileSync(argsPath, `{"ADMIN_PASSWORD":"${secret}"`)

    const result = runDeploy(fixture, ['--args-file', argsPath])

    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assertSecretAbsent(result, secret)
    const output = JSON.parse(result.stderr)
    assert.equal(output.error, 'Failed to parse args file')
    assert.equal(output.path, argsPath)
    assert.equal(existsSync(fixture.capturePath), false)
  })
})

test('rejects missing template-argument option values before making a request', () => {
  withFixture((fixture) => {
    for (const option of ['--args-json', '--args-file']) {
      const result = runDeploy(fixture, [option])
      assert.equal(result.status, 1)
      assert.equal(result.stdout, '')
      assert.match(JSON.parse(result.stderr).error, /requires/)
      assert.equal(existsSync(fixture.capturePath), false)
    }
  })
})

test('allowlists response diagnostics and drops resolved defaults when no arguments are supplied', () => {
  withFixture((fixture) => {
    const generatedSecret = 'server-resolved-default-secret-9xQ4'
    const response = {
      ok: true,
      name: 'demo-instance',
      resources: [{ kind: 'Deployment', name: 'demo-web' }],
      args: { GENERATED_PASSWORD: generatedSecret },
      message: `created with ${generatedSecret}`,
    }
    const result = runDeploy(
      fixture,
      ['--dry-run'],
      {
        SEALOS_DEPLOY_TEST_RESPONSE: JSON.stringify(response),
      },
    )

    assert.equal(result.status, 0, result.stderr || result.stdout)
    assertSecretAbsent(result, generatedSecret)
    const output = JSON.parse(result.stdout)
    assert.equal(output.args_supplied, 0)
    assert.equal(output.status, 200)
    assert.equal(output.status_text, 'OK')
    assert.deepEqual(output.response, {
      ok: true,
      name: 'demo-instance',
      resources: [{ kind: 'Deployment', name: 'demo-web' }],
    })
    assert.equal('args' in output.response, false)
    assert.equal('message' in output.response, false)
    assert.equal('response_omitted' in output, false)

    const request = JSON.parse(readFileSync(fixture.capturePath, 'utf8'))
    assert.deepEqual(request.body.args, {})
    assert.equal(request.body.dryRun, true)
  })
})

test('sandbox derives region from kubeconfig API server without auth.json', () => {
  withFixture((fixture) => {
    rmSync(join(fixture.homeDir, '.sealos', 'auth.json'))
    const kubeconfigPath = join(fixture.fixtureRoot, 'sandbox-kubeconfig')
    const binDir = join(fixture.fixtureRoot, 'bin')
    const kubectlPath = join(binDir, 'kubectl')
    mkdirSync(binDir, { recursive: true })
    writeFileSync(kubeconfigPath, 'apiVersion: v1\n')
    writeFileSync(kubectlPath, `#!/bin/sh
case "$*" in
  *"-o json"*) printf '%s' '{"clusters":[{"cluster":{"server":"https://usw-1.sealos.io:6443"}}],"contexts":[{"context":{"namespace":"ns-sandbox"}}]}' ;;
  *) printf '%s' 'apiVersion: v1' ;;
esac
`, { mode: 0o755 })

    const result = runDeploy(
      fixture,
      ['--kubeconfig', kubeconfigPath],
      {
        PATH: `${binDir}:${process.env.PATH}`,
        SEALAI_DEPLOY_TASK_ID: 'task-example',
        SEALOS_DEPLOY_TEST_RESPONSE: JSON.stringify({ ok: true, name: 'sandbox-app' }),
      },
    )

    assert.equal(result.status, 0, result.stderr || result.stdout)
    const output = JSON.parse(result.stdout)
    assert.equal(output.region, 'https://usw-1.sealos.io')
    assert.equal(output.region_domain, 'usw-1.sealos.io')
    const request = JSON.parse(readFileSync(fixture.capturePath, 'utf8'))
    assert.equal(request.url, 'https://template.usw-1.sealos.io/api/v2alpha/templates/raw')
  })
})

test('sends extra labels to the API via --labels-json', () => {
  withFixture((fixture) => {
    const result = runDeploy(
      fixture,
      ['--labels-json', '{"brain.io/managed-by":"brain","brain.io/task-id":"task-123"}'],
      {
        SEALOS_DEPLOY_TEST_RESPONSE: JSON.stringify({ ok: true, name: 'demo-instance' }),
      },
    )

    assert.equal(result.status, 0, result.stderr || result.stdout)
    const output = JSON.parse(result.stdout)
    assert.equal(output.success, true)
    assert.equal(output.labels_supplied, 2)

    const request = JSON.parse(readFileSync(fixture.capturePath, 'utf8'))
    assert.deepEqual(request.body.extraLabels, {
      'brain.io/managed-by': 'brain',
      'brain.io/task-id': 'task-123',
    })
  })
})

test('reads extra labels from SEALAI_DEPLOY_LABELS_JSON', () => {
  withFixture((fixture) => {
    const result = runDeploy(
      fixture,
      [],
      {
        SEALAI_DEPLOY_LABELS_JSON: '{"brain.io/task-id":"task-env-42"}',
        SEALOS_DEPLOY_TEST_RESPONSE: JSON.stringify({ ok: true, name: 'demo-instance' }),
      },
    )

    assert.equal(result.status, 0, result.stderr || result.stdout)
    const output = JSON.parse(result.stdout)
    assert.equal(output.labels_supplied, 1)

    const request = JSON.parse(readFileSync(fixture.capturePath, 'utf8'))
    assert.deepEqual(request.body.extraLabels, { 'brain.io/task-id': 'task-env-42' })
  })
})

test('prefers --labels-json over SEALAI_DEPLOY_LABELS_JSON', () => {
  withFixture((fixture) => {
    const result = runDeploy(
      fixture,
      ['--labels-json', '{"brain.io/task-id":"task-cli-7"}'],
      {
        SEALAI_DEPLOY_LABELS_JSON: '{"brain.io/task-id":"task-env-7"}',
        SEALOS_DEPLOY_TEST_RESPONSE: JSON.stringify({ ok: true, name: 'demo-instance' }),
      },
    )

    assert.equal(result.status, 0, result.stderr || result.stdout)
    const request = JSON.parse(readFileSync(fixture.capturePath, 'utf8'))
    assert.deepEqual(request.body.extraLabels, { 'brain.io/task-id': 'task-cli-7' })
  })
})

test('omits extraLabels from the request when no labels are supplied', () => {
  withFixture((fixture) => {
    const result = runDeploy(
      fixture,
      [],
      {
        SEALOS_DEPLOY_TEST_RESPONSE: JSON.stringify({ ok: true, name: 'demo-instance' }),
      },
    )

    assert.equal(result.status, 0, result.stderr || result.stdout)
    const output = JSON.parse(result.stdout)
    assert.equal(output.labels_supplied, 0)

    const request = JSON.parse(readFileSync(fixture.capturePath, 'utf8'))
    assert.equal('extraLabels' in request.body, false)
  })
})

test('rejects malformed labels before making a request', () => {
  withFixture((fixture) => {
    const malformedJson = runDeploy(fixture, ['--labels-json', '{"brain.io/task-id":'])
    assert.equal(malformedJson.status, 1)
    assert.equal(malformedJson.stdout, '')
    assert.equal(JSON.parse(malformedJson.stderr).error, 'Failed to parse --labels-json')

    const nonObject = runDeploy(fixture, ['--labels-json', '["a","b"]'])
    assert.equal(nonObject.status, 1)
    assert.equal(JSON.parse(nonObject.stderr).error, 'Labels must be a JSON object')

    const nonStringValue = runDeploy(fixture, ['--labels-json', '{"brain.io/task-id":123}'])
    assert.equal(nonStringValue.status, 1)
    assert.equal(
      JSON.parse(nonStringValue.stderr).error,
      'Label value for "brain.io/task-id" must be a string',
    )

    const malformedEnv = runDeploy(fixture, [], {
      SEALAI_DEPLOY_LABELS_JSON: '{"brain.io/task-id":',
    })
    assert.equal(malformedEnv.status, 1)
    assert.equal(JSON.parse(malformedEnv.stderr).error, 'Failed to parse SEALAI_DEPLOY_LABELS_JSON')

    assert.equal(existsSync(fixture.capturePath), false)
  })
})

test('rejects missing --labels-json option value before making a request', () => {
  withFixture((fixture) => {
    const result = runDeploy(fixture, ['--labels-json'])
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assert.match(JSON.parse(result.stderr).error, /requires/)
    assert.equal(existsSync(fixture.capturePath), false)
  })
})
