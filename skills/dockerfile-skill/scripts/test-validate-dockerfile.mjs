#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { validate } from './validate-dockerfile.mjs'

test('accepts a compatible floating base tag', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dockerfile-validation-'))
  try {
    fs.writeFileSync(path.join(workDir, '.dockerignore'), '.git\n')
    const dockerfile = path.join(workDir, 'Dockerfile')
    fs.writeFileSync(dockerfile, [
      'FROM node:latest',
      'WORKDIR /app',
      'COPY package.json package-lock.json ./',
      'RUN npm ci',
      'COPY . .',
      'USER node',
      'CMD ["npm", "start"]',
      '',
    ].join('\n'))

    const result = validate(dockerfile)
    assert.equal(result.valid, true, JSON.stringify(result.issues))
    assert.equal(result.issues.some(issue => issue.rule === 'no-latest'), false)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})
