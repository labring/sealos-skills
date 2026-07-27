#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(new URL('./ensure-image-pull-secret.mjs', import.meta.url))
const digest = `sha256:${'a'.repeat(64)}`

function writeExecutable (file, source) {
  fs.writeFileSync(file, source)
  fs.chmodSync(file, 0o755)
}

test('creates a GHCR pull Secret through stdin with github.com-scoped gh credentials', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-pull-secret-test-'))
  const binDir = path.join(fixtureDir, 'bin')
  const callsPath = path.join(fixtureDir, 'calls.jsonl')
  const secretPath = path.join(fixtureDir, 'secret.json')
  fs.mkdirSync(binDir)

  writeExecutable(path.join(binDir, 'gh'), `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
fs.appendFileSync(process.env.TEST_CALLS_PATH, JSON.stringify({ command: 'gh', args }) + '\\n')
if (args[0] === '--version') {
  console.log('gh version 2.70.0')
} else if (args[0] === 'auth' && args[1] === 'status') {
  console.log("Token scopes: 'repo', 'write:packages'")
} else if (args[0] === 'api') {
  console.log('MixedCaseUser')
} else if (args[0] === 'auth' && args[1] === 'token') {
  console.log('test-gh-token')
} else {
  process.exitCode = 1
}
`)

  writeExecutable(path.join(binDir, 'kubectl'), `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
fs.appendFileSync(process.env.TEST_CALLS_PATH, JSON.stringify({ command: 'kubectl', args }) + '\\n')
if (args[0] === 'version') {
  console.log('clientVersion: v1.30.0')
} else if (args.includes('apply')) {
  fs.writeFileSync(process.env.TEST_SECRET_PATH, fs.readFileSync(0, 'utf8'))
  console.log('secret/test-app configured')
} else {
  process.exitCode = 1
}
`)

  try {
    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        'ns-test',
        'test-app',
        `ghcr.io/mixedcaseuser/web@${digest}`,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: fixtureDir,
          PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
          TEST_CALLS_PATH: callsPath,
          TEST_SECRET_PATH: secretPath,
        },
      },
    )

    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.equal(result.stdout.includes('test-gh-token'), false)

    const calls = fs.readFileSync(callsPath, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    const ghCredentialCalls = calls.filter(call => (
      call.command === 'gh'
      && (
        call.args[0] === 'api'
        || (call.args[0] === 'auth' && ['status', 'token'].includes(call.args[1]))
      )
    ))
    assert.ok(ghCredentialCalls.length >= 3)
    for (const call of ghCredentialCalls) {
      assert.ok(
        call.args.includes('github.com'),
        `missing github.com hostname in ${JSON.stringify(call.args)}`,
      )
    }
    const statusCall = ghCredentialCalls.find(call => (
      call.args[0] === 'auth' && call.args[1] === 'status'
    ))
    assert.ok(statusCall?.args.includes('--active'))

    const kubectlApply = calls.find(call => (
      call.command === 'kubectl' && call.args.includes('apply')
    ))
    assert.ok(kubectlApply)
    assert.equal(JSON.stringify(kubectlApply.args).includes('test-gh-token'), false)

    const secret = JSON.parse(fs.readFileSync(secretPath, 'utf8'))
    assert.equal(secret.kind, 'Secret')
    assert.equal(secret.metadata.name, 'test-app')
    assert.equal(secret.metadata.namespace, 'ns-test')
    assert.equal(secret.type, 'kubernetes.io/dockerconfigjson')

    const dockerConfig = JSON.parse(Buffer.from(
      secret.data['.dockerconfigjson'],
      'base64',
    ).toString('utf8'))
    assert.deepEqual(dockerConfig.auths['ghcr.io'], {
      username: 'MixedCaseUser',
      password: 'test-gh-token',
      email: 'none@example.com',
      auth: Buffer.from('MixedCaseUser:test-gh-token').toString('base64'),
    })

    fs.rmSync(secretPath)
    const previousCallCount = calls.length
    const mismatch = spawnSync(
      process.execPath,
      [
        scriptPath,
        'ns-test',
        'test-app',
        `ghcr.io/another-user/web@${digest}`,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: fixtureDir,
          PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
          TEST_CALLS_PATH: callsPath,
          TEST_SECRET_PATH: secretPath,
        },
      },
    )

    assert.equal(mismatch.status, 1)
    assert.match(mismatch.stdout, /does not match GHCR image namespace another-user/)
    const mismatchCalls = fs.readFileSync(callsPath, 'utf8')
      .trim()
      .split('\n')
      .slice(previousCallCount)
      .map(line => JSON.parse(line))
    assert.equal(mismatchCalls.some(call => (
      call.command === 'gh'
      && call.args[0] === 'auth'
      && call.args[1] === 'token'
    )), false)
    assert.equal(mismatchCalls.some(call => (
      call.command === 'kubectl' && call.args.includes('apply')
    )), false)
    assert.equal(fs.existsSync(secretPath), false)

    const missingNamespace = spawnSync(
      process.execPath,
      [
        scriptPath,
        '',
        'test-app',
        `ghcr.io/mixedcaseuser/web@${digest}`,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: fixtureDir,
          PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
          TEST_CALLS_PATH: callsPath,
          TEST_SECRET_PATH: secretPath,
        },
      },
    )

    assert.equal(missingNamespace.status, 1)
    assert.match(missingNamespace.stdout, /valid Kubernetes namespace/)
    assert.equal(fs.existsSync(secretPath), false)

    const invalidSecretName = spawnSync(
      process.execPath,
      [
        scriptPath,
        'ns-test',
        'Invalid Secret Name',
        `ghcr.io/mixedcaseuser/web@${digest}`,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: fixtureDir,
          PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
          TEST_CALLS_PATH: callsPath,
          TEST_SECRET_PATH: secretPath,
        },
      },
    )

    assert.equal(invalidSecretName.status, 1)
    assert.match(invalidSecretName.stdout, /valid Kubernetes Secret name/)
    assert.equal(fs.existsSync(secretPath), false)
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true })
  }
})
