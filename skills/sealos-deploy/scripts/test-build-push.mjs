#!/usr/bin/env node

import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const scriptPath = resolve(fileURLToPath(new URL('.', import.meta.url)), 'build-push.mjs')

test('lowercases the Docker Hub namespace in the generated image reference', () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'sealos-build-push-'))
  const binDir = join(fixtureDir, 'bin')
  const workDir = join(fixtureDir, 'work')
  const dockerLog = join(fixtureDir, 'docker-args.txt')
  mkdirSync(binDir)
  mkdirSync(workDir)
  writeFileSync(join(workDir, 'Dockerfile'), 'FROM scratch\n')

  const dockerPath = join(binDir, 'docker')
  writeFileSync(dockerPath, `#!/bin/sh\nprintf '%s\\n' "$*" > "$DOCKER_LOG"\n`)
  chmodSync(dockerPath, 0o755)

  const result = spawnSync(
    process.execPath,
    [scriptPath, workDir, 'Demo-App', '--registry', 'dockerhub', '--user', 'Che-Zhu'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        DOCKER_LOG: dockerLog,
        PATH: `${binDir}:${process.env.PATH}`,
      },
    },
  )

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const output = JSON.parse(result.stdout)
  assert.match(output.image, /^che-zhu\/demo-app:\d{8}-\d{6}$/)
  assert.doesNotMatch(output.image, /Che-Zhu/)
  assert.match(readFileSync(dockerLog, 'utf8'), /-t che-zhu\/demo-app:/)
})
