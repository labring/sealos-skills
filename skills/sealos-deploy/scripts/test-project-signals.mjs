#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { collectProjectSignals } from './project-signals.mjs'

test('detects a source-ready index.html site without a package manager', (t) => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-signals-static-html-'))
  t.after(() => fs.rmSync(fixtureDir, { recursive: true, force: true }))
  fs.writeFileSync(path.join(fixtureDir, 'index.html'), '<!doctype html><title>Static site</title>\n')

  const signals = collectProjectSignals(fixtureDir)
  assert.equal(signals.primary_language, 'html')
  assert.deepEqual(signals.framework, ['static_html'])
  assert.equal(signals.package_manager, null)
  assert.equal(signals.port, 8080)
  assert.equal(signals.runtime_version.html, 'static')
  assert.equal(signals.runtime_version.nginx, '1.31.3')
  assert.equal(Object.hasOwn(signals, 'score'), false)
})
