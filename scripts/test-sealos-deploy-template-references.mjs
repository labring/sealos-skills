#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const skillDir = path.join(repoRoot, 'skills', 'sealos-deploy')
const validatorScript = path.join(skillDir, 'scripts', 'validate-artifacts.mjs')
const repository = 'https://github.com/labring-actions/templates.git'
const catalogRef = 'kb-0.9'
const templateRoot = 'template'

function analysisFor(workDir, overrides = {}) {
  const analysis = {
    generated_at: '2026-07-24T00:00:00.000Z',
    project: {
      github_url: 'https://github.com/acme/example',
      work_dir: workDir,
      repo_name: 'example',
      branch: 'main',
    },
    score: {
      total: 12,
      verdict: 'ready',
      dimensions: {
        statelessness: 2,
        config: 2,
        scalability: 2,
        startup: 2,
        observability: 2,
        boundaries: 2,
      },
    },
    language: 'node',
    all_languages: ['node'],
    framework: 'nextjs',
    package_manager: 'npm',
    port: 3000,
    databases: ['postgres'],
    runtime_version: {
      source: 'package.json',
      node: '22',
    },
    env_vars: {},
    has_dockerfile: false,
    complexity_tier: 'L2',
    image_ref: null,
  }
  return {
    ...analysis,
    ...overrides,
    project: {
      ...analysis.project,
      ...(overrides.project ?? {}),
    },
  }
}

function writeAnalysis(workDir, overrides = {}) {
  const filePath = path.join(workDir, '.sealos', 'analysis.json')
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(analysisFor(workDir, overrides), null, 2)}\n`)
  return filePath
}

function writeTemplate(catalogDir, name, {
  gitRepo = null,
  title = name,
  description = '',
  categories = ['tool'],
  image = 'ghcr.io/acme/example:1.2.3',
  databaseKind = null,
  extraResource = '',
  quoted = false,
  indent = '  ',
} = {}) {
  const directory = path.join(catalogDir, templateRoot, name)
  fs.mkdirSync(directory, { recursive: true })
  const quote = (value) => quoted ? `"${value}"` : value
  const databaseDocument = databaseKind
    ? `---
apiVersion: apps.kubeblocks.io/v1alpha1
kind: ${databaseKind}
metadata:
  name: ${name}-database
`
    : ''
  const yaml = `apiVersion: ${quote('app.sealos.io/v1')}
kind: ${quote('Template')}
metadata:
${indent}name: ${quote(name)}
spec:
${indent}title: ${quote(title)} # display title
${indent}description: ${quote(description)}
${gitRepo ? `${indent}gitRepo: ${quote(gitRepo)} # upstream source\n` : ''}${indent}categories: [${categories.map(quote).join(', ')}] # catalog facets
${indent}defaults:
${indent}${indent}app_image:
${indent}${indent}${indent}type: string
${indent}${indent}${indent}value: ${quote(image)} # pinned by the catalog author
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
spec:
  template:
    spec:
      containers:
        - name: ${name}
          image: \${{ defaults.app_image.value }}
${databaseDocument}${extraResource}`
  fs.writeFileSync(path.join(directory, 'index.yaml'), yaml)
}

function runDiscovery({
  workDir,
  analysisPath,
  selectedSkillDir = skillDir,
  catalogDir,
  githubUrl,
  env = process.env,
}) {
  const args = [
    discoveryScriptFor(selectedSkillDir),
    '--work-dir', workDir,
    '--skill-dir', selectedSkillDir,
    '--analysis', analysisPath,
  ]
  if (catalogDir) {
    args.push('--catalog-dir', catalogDir)
  }
  if (githubUrl) {
    args.push('--github-url', githubUrl)
  }
  return spawnSync(process.execPath, args, {
    encoding: 'utf8',
    env,
  })
}

function discoveryScriptFor(selectedSkillDir) {
  return path.join(selectedSkillDir, 'scripts', 'find-template-references.mjs')
}

function readArtifact(workDir) {
  return JSON.parse(fs.readFileSync(path.join(workDir, '.sealos', 'template-references.json'), 'utf8'))
}

function validateArtifact(workDir, selectedSkillDir = skillDir) {
  const artifactPath = path.join(workDir, '.sealos', 'template-references.json')
  const result = spawnSync(process.execPath, [
    path.join(selectedSkillDir, 'scripts', 'validate-artifacts.mjs'),
    'template-references',
    artifactPath,
  ], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)

  const directoryResult = spawnSync(process.execPath, [
    path.join(selectedSkillDir, 'scripts', 'validate-artifacts.mjs'),
    '--dir',
    workDir,
  ], { encoding: 'utf8' })
  assert.equal(directoryResult.status, 0, directoryResult.stderr || directoryResult.stdout)
}

function withFixture(callback) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-template-references-'))
  const workDir = path.join(fixtureRoot, 'work')
  const catalogDir = path.join(fixtureRoot, 'catalog')
  fs.mkdirSync(workDir, { recursive: true })
  try {
    callback({ fixtureRoot, workDir, catalogDir })
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
}

test('discovers every exact repository match before ranked similar references', () => {
  withFixture(({ workDir, catalogDir }) => {
    fs.writeFileSync(
      path.join(workDir, 'README.md'),
      'Next.js frontend and API backed by PostgreSQL with a persistent volume.',
    )
    writeTemplate(catalogDir, 'exact-alpha', {
      gitRepo: 'https://github.com/acme/example.git',
      databaseKind: 'Postgresql',
    })
    writeTemplate(catalogDir, 'exact-beta', {
      gitRepo: 'git@github.com:acme/example.git',
      databaseKind: 'Postgresql',
    })
    writeTemplate(catalogDir, 'similar-postgres', {
      gitRepo: 'https://github.com/other/postgres-app',
      databaseKind: 'Postgresql',
      description: 'Next.js API with PostgreSQL',
    })
    writeTemplate(catalogDir, 'less-similar', {
      gitRepo: 'https://github.com/other/static-site',
      image: 'nginx:1.27.1',
    })
    const analysisPath = writeAnalysis(workDir)

    const result = runDiscovery({ workDir, analysisPath, catalogDir })
    assert.equal(result.status, 0, result.stderr || result.stdout)

    const artifact = readArtifact(workDir)
    assert.equal(artifact.catalog.available, true)
    assert.equal(artifact.catalog.source, 'local')
    assert.equal(artifact.catalog.template_count, 4)
    assert.equal(artifact.summary.exact_count, 2)
    assert.equal(artifact.summary.similar_count, 2)
    assert.deepEqual(
      artifact.references.slice(0, 2).map((reference) => reference.name),
      ['exact-alpha', 'exact-beta'],
    )
    assert.ok(artifact.references.slice(2).every((reference) => reference.match === 'similar'))
    assert.equal(artifact.references[2].name, 'similar-postgres')
    assert.ok(artifact.references.every((reference) => fs.existsSync(path.join(workDir, reference.reference_path))))
    validateArtifact(workDir)
  })
})

test('matches monorepo templates only when the repository subtree also matches', () => {
  withFixture(({ workDir, catalogDir }) => {
    writeTemplate(catalogDir, 'repo-root', {
      gitRepo: 'https://github.com/acme/monorepo',
    })
    writeTemplate(catalogDir, 'repo-api', {
      gitRepo: 'https://github.com/acme/monorepo/tree/main/apps/api',
    })
    const analysisPath = writeAnalysis(workDir, {
      project: {
        github_url: 'https://github.com/acme/monorepo/tree/develop/apps/api',
        repo_name: 'api',
      },
      databases: [],
    })

    const result = runDiscovery({
      workDir,
      analysisPath,
      catalogDir,
      githubUrl: 'https://github.com/acme/monorepo/tree/develop/apps/api',
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)

    const artifact = readArtifact(workDir)
    assert.equal(artifact.summary.exact_count, 1)
    assert.equal(artifact.references[0].name, 'repo-api')
    assert.equal(artifact.project.repo_subdir, 'apps/api')
    assert.equal(
      artifact.references.find((reference) => reference.name === 'repo-root')?.match,
      'similar',
    )
  })
})

test('parses quoted four-space template metadata and image defaults safely', () => {
  withFixture(({ workDir, catalogDir }) => {
    writeTemplate(catalogDir, 'quoted-template', {
      gitRepo: 'https://github.com/acme/example',
      quoted: true,
      indent: '    ',
      image: 'ghcr.io/acme/example:240711',
      categories: ['ai', 'tool'],
      extraResource: `---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data
`,
    })
    const analysisPath = writeAnalysis(workDir)
    const result = runDiscovery({ workDir, analysisPath, catalogDir })
    assert.equal(result.status, 0, result.stderr || result.stdout)

    const reference = readArtifact(workDir).references[0]
    assert.equal(reference.match, 'exact')
    assert.deepEqual(reference.features.categories, ['ai', 'tool'])
    assert.ok(reference.features.images.includes('ghcr.io/acme/example:240711'))
    assert.equal(reference.features.persistent, true)
    assert.ok(!reference.warnings.some((warning) => warning.includes('240711')))
  })
})

test('records an unavailable catalog without blocking deployment', () => {
  withFixture(({ workDir, catalogDir }) => {
    const analysisPath = writeAnalysis(workDir)
    const result = runDiscovery({ workDir, analysisPath, catalogDir })
    assert.equal(result.status, 0, result.stderr || result.stdout)

    const artifact = readArtifact(workDir)
    assert.equal(artifact.catalog.available, false)
    assert.equal(artifact.catalog.source, 'unavailable')
    assert.deepEqual(artifact.references, [])
    validateArtifact(workDir)
  })
})

test('skips an invalid catalog entry while keeping valid references available', () => {
  withFixture(({ workDir, catalogDir }) => {
    writeTemplate(catalogDir, 'valid-entry', {
      gitRepo: 'https://github.com/acme/example',
    })
    const invalidDirectory = path.join(catalogDir, templateRoot, 'invalid-entry')
    fs.mkdirSync(invalidDirectory, { recursive: true })
    fs.writeFileSync(path.join(invalidDirectory, 'index.yaml'), `apiVersion: v1
kind: ConfigMap
metadata:
  name: not-a-template
`)
    const analysisPath = writeAnalysis(workDir)

    const result = runDiscovery({ workDir, analysisPath, catalogDir })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const artifact = readArtifact(workDir)
    assert.equal(artifact.catalog.available, true)
    assert.equal(artifact.catalog.template_count, 1)
    assert.equal(artifact.catalog.skipped_templates, 1)
    assert.equal(artifact.references[0].name, 'valid-entry')
    validateArtifact(workDir)
  })
})

test('treats an unsafe catalog template root as a nonblocking parse failure', () => {
  withFixture(({ fixtureRoot, workDir, catalogDir }) => {
    const realRoot = path.join(fixtureRoot, 'real-template-root')
    fs.mkdirSync(realRoot, { recursive: true })
    fs.mkdirSync(catalogDir, { recursive: true })
    fs.symlinkSync(realRoot, path.join(catalogDir, templateRoot), 'dir')
    const analysisPath = writeAnalysis(workDir)

    const result = runDiscovery({ workDir, analysisPath, catalogDir })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.equal(readArtifact(workDir).catalog.available, false)
    validateArtifact(workDir)
  })
})

test('ignores symlinked project evidence files', () => {
  withFixture(({ fixtureRoot, workDir, catalogDir }) => {
    const outsideReadme = path.join(fixtureRoot, 'outside-readme.md')
    fs.writeFileSync(outsideReadme, 'WebSocket service backed by S3 object storage.')
    fs.symlinkSync(outsideReadme, path.join(workDir, 'README.md'))
    writeTemplate(catalogDir, 'candidate', {
      gitRepo: 'https://github.com/other/project',
    })
    const analysisPath = writeAnalysis(workDir, { databases: [] })

    const result = runDiscovery({ workDir, analysisPath, catalogDir })
    assert.equal(result.status, 0, result.stderr || result.stdout)

    const artifact = readArtifact(workDir)
    assert.equal(artifact.project.features.websocket, false)
    assert.equal(artifact.project.features.object_storage, false)
  })
})

test('records invalid catalog configuration without attempting discovery', () => {
  withFixture(({ fixtureRoot, workDir, catalogDir }) => {
    const copiedSkill = path.join(fixtureRoot, 'sealos-deploy')
    fs.cpSync(skillDir, copiedSkill, { recursive: true })
    const configPath = path.join(copiedSkill, 'config.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    config.template_catalog.repository = 'https://example.com/untrusted/catalog.git'
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
    const analysisPath = writeAnalysis(workDir)

    const result = runDiscovery({
      workDir,
      analysisPath,
      selectedSkillDir: copiedSkill,
      catalogDir,
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const artifact = readArtifact(workDir)
    assert.equal(artifact.catalog.available, false)
    assert.match(artifact.reason, /configuration is invalid/)
    validateArtifact(workDir, copiedSkill)
  })
})

test('records a disabled catalog without attempting network access', () => {
  withFixture(({ fixtureRoot, workDir }) => {
    const copiedSkill = path.join(fixtureRoot, 'sealos-deploy')
    fs.cpSync(skillDir, copiedSkill, { recursive: true })
    const configPath = path.join(copiedSkill, 'config.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    config.template_catalog.enabled = false
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
    const analysisPath = writeAnalysis(workDir)

    const result = runDiscovery({
      workDir,
      analysisPath,
      selectedSkillDir: copiedSkill,
      env: {
        ...process.env,
        PATH: '',
      },
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const artifact = readArtifact(workDir)
    assert.equal(artifact.catalog.available, false)
    assert.match(artifact.reason, /disabled/)
    validateArtifact(workDir, copiedSkill)
  })
})

test('falls back to a stale index-only cache when Git refresh fails', () => {
  withFixture(({ fixtureRoot, workDir }) => {
    const fakeHome = path.join(fixtureRoot, 'home')
    const digest = crypto
      .createHash('sha256')
      .update(`${repository}\n${catalogRef}\n${templateRoot}`)
      .digest('hex')
      .slice(0, 12)
    const cacheDir = path.join(
      fakeHome,
      '.sealos',
      'cache',
      'template-catalog',
      `labring-actions-templates-kb-0.9-${digest}`,
    )
    writeTemplate(cacheDir, 'cached-exact', {
      gitRepo: 'https://github.com/acme/example',
      databaseKind: 'Postgresql',
    })
    fs.mkdirSync(path.join(cacheDir, '.git'), { recursive: true })
    fs.writeFileSync(path.join(cacheDir, '.sealos-template-catalog-state.json'), `${JSON.stringify({
      repository,
      ref: catalogRef,
      template_root: templateRoot,
      commit: '1234567abcdef',
      refreshed_at: '2000-01-01T00:00:00.000Z',
    }, null, 2)}\n`)
    const analysisPath = writeAnalysis(workDir)

    const result = runDiscovery({
      workDir,
      analysisPath,
      githubUrl: 'https://github.com/acme/example',
      env: {
        ...process.env,
        HOME: fakeHome,
        PATH: '',
      },
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)

    const artifact = readArtifact(workDir)
    assert.equal(artifact.catalog.available, true)
    assert.equal(artifact.catalog.source, 'cache')
    assert.equal(artifact.catalog.stale, true)
    assert.equal(artifact.references[0].match, 'exact')
    validateArtifact(workDir)
  })
})

test('rejects an invalid analysis artifact instead of hiding the error', () => {
  withFixture(({ workDir, catalogDir }) => {
    const analysisPath = path.join(workDir, 'bad-analysis.json')
    fs.writeFileSync(analysisPath, '{}\n')
    const result = runDiscovery({ workDir, analysisPath, catalogDir })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Invalid analysis artifact/)
    assert.equal(fs.existsSync(path.join(workDir, '.sealos', 'template-references.json')), false)
  })
})

test('artifact semantic validation rejects similar references scored as exact', () => {
  withFixture(({ workDir, catalogDir }) => {
    writeTemplate(catalogDir, 'similar', {
      gitRepo: 'https://github.com/other/project',
    })
    const analysisPath = writeAnalysis(workDir, { databases: [] })
    const result = runDiscovery({ workDir, analysisPath, catalogDir })
    assert.equal(result.status, 0, result.stderr || result.stdout)

    const artifactPath = path.join(workDir, '.sealos', 'template-references.json')
    const artifact = readArtifact(workDir)
    artifact.references[0].score = 100
    fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`)

    const validation = spawnSync(process.execPath, [
      validatorScript,
      'template-references',
      artifactPath,
    ], { encoding: 'utf8' })
    assert.notEqual(validation.status, 0)
    assert.match(validation.stdout, /must be below 100/)
  })
})

test('indexes the real sparse catalog fixture', {
  skip: !process.env.SEALOS_TEMPLATE_CATALOG_DIR,
}, () => {
  withFixture(({ workDir }) => {
    const analysisPath = writeAnalysis(workDir, {
      project: {
        github_url: 'https://github.com/toeverything/affine',
        repo_name: 'affine',
      },
    })
    const result = runDiscovery({
      workDir,
      analysisPath,
      catalogDir: process.env.SEALOS_TEMPLATE_CATALOG_DIR,
      githubUrl: 'https://github.com/toeverything/affine',
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)

    const artifact = readArtifact(workDir)
    assert.equal(artifact.catalog.available, true)
    assert.ok(artifact.catalog.template_count >= 240)
    assert.ok(artifact.catalog.skipped_templates < artifact.catalog.template_count)
    assert.ok(artifact.references.length >= 1)
    validateArtifact(workDir)
  })
})

test('creates and reuses the real sparse catalog cache', {
  skip: process.env.SEALOS_TEMPLATE_CATALOG_NETWORK !== '1',
}, () => {
  withFixture(({ fixtureRoot, workDir }) => {
    const analysisPath = writeAnalysis(workDir, {
      project: {
        github_url: 'https://github.com/toeverything/affine',
        repo_name: 'affine',
      },
    })
    const env = {
      ...process.env,
      HOME: path.join(fixtureRoot, 'home'),
    }
    const first = runDiscovery({
      workDir,
      analysisPath,
      githubUrl: 'https://github.com/toeverything/affine',
      env,
    })
    assert.equal(first.status, 0, first.stderr || first.stdout)
    assert.equal(readArtifact(workDir).catalog.source, 'refreshed')
    assert.ok(readArtifact(workDir).catalog.template_count >= 240)

    const second = runDiscovery({
      workDir,
      analysisPath,
      githubUrl: 'https://github.com/toeverything/affine',
      env,
    })
    assert.equal(second.status, 0, second.stderr || second.stdout)
    assert.equal(readArtifact(workDir).catalog.source, 'cache')
    assert.equal(readArtifact(workDir).catalog.stale, false)
  })
})
