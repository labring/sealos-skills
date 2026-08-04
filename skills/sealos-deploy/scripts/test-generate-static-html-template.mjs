#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('./generate-static-html-template.mjs', import.meta.url))

test('generates a zero-build Sealos template for source-ready HTML, CSS, and JavaScript', (t) => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-static-template-'))
  t.after(() => fs.rmSync(fixtureDir, { recursive: true, force: true }))
  fs.writeFileSync(path.join(fixtureDir, 'index.html'), '<!doctype html>\n<title>Fast path</title>\n')
  fs.writeFileSync(path.join(fixtureDir, 'site.css'), 'body { color: rebeccapurple; }\n')
  fs.mkdirSync(path.join(fixtureDir, 'assets', 'js'), { recursive: true })
  fs.writeFileSync(path.join(fixtureDir, 'assets', 'js', 'site.js'), 'document.documentElement.dataset.ready = "true"\n')

  const run = spawnSync(process.execPath, [SCRIPT, fixtureDir, '--app-name', 'static-fixture'], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  const result = JSON.parse(run.stdout)
  assert.equal(result.strategy, 'static-html-configmap')
  assert.equal(result.asset_count, 3)
  assert.deepEqual(result.skipped_phases, ['detect-image', 'dockerfile', 'build-push'])

  const template = fs.readFileSync(path.join(fixtureDir, '.sealos/template/index.yaml'), 'utf8')
  assert.match(template, /nginxinc\/nginx-unprivileged:1\.31\.3-alpine3\.24/)
  assert.match(template, /mountPath: \/usr\/share\/nginx\/html\/index\.html/)
  assert.match(template, /mountPath: \/usr\/share\/nginx\/html\/site\.css/)
  assert.match(template, /mountPath: \/usr\/share\/nginx\/html\/assets\/js\/site\.js/)
  assert.match(template, /binaryData:/)
  assert.match(template, /automountServiceAccountToken: false/)
  assert.doesNotMatch(template, /imagePullSecrets:/)
})
