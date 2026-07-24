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
    image_inventory: [],
    service_inventory: [],
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
  const templatePath = path.join(directory, 'index.yaml')
  fs.writeFileSync(templatePath, yaml)
  return templatePath
}

function runDiscovery({
  workDir,
  analysisPath,
  selectedSkillDir = skillDir,
  catalogDir,
  githubUrl,
  reuseOfficialTemplate = false,
  env = process.env,
}) {
  const args = [
    discoveryScriptFor(selectedSkillDir),
    '--work-dir', workDir,
    '--skill-dir', selectedSkillDir,
    '--analysis', analysisPath,
    '--reuse-official-template', String(reuseOfficialTemplate),
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

function createVerifiedOfficialGitEnv(
  fixtureRoot,
  catalogDir,
  reportedOrigin = repository,
) {
  const fakeBin = path.join(fixtureRoot, 'bin')
  const fakeGit = path.join(fakeBin, 'git')
  fs.mkdirSync(fakeBin, { recursive: true })
  fs.writeFileSync(fakeGit, `#!/bin/sh
set -eu

for variable in GIT_CONFIG_PARAMETERS GIT_CONFIG GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES; do
  eval "value=\\\${$variable-}"
  if [ -n "$value" ]; then
    printf '%s\\n' "unsafe inherited git environment: $variable" >&2
    exit 97
  fi
done

if [ "\${1:-}" = "clone" ]; then
  destination=''
  for argument in "$@"; do
    destination="$argument"
  done
  /bin/mkdir -p "$destination/.git"
  /bin/cp -R "$SEALOS_TEST_CATALOG_SOURCE/${templateRoot}" "$destination/${templateRoot}"
  exit 0
fi

case "\${1:-}" in
  sparse-checkout|checkout)
    exit 0
    ;;
  rev-parse)
    printf '%s\\n' '0123456789abcdef0123456789abcdef01234567'
    exit 0
    ;;
  config)
    printf '%s\\n' '${reportedOrigin}'
    exit 0
    ;;
  status)
    exit 0
    ;;
esac

printf '%s\\n' "unexpected fake git invocation: $*" >&2
exit 1
`)
  fs.chmodSync(fakeGit, 0o755)

  return {
    ...process.env,
    HOME: path.join(fixtureRoot, 'home'),
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
    SEALOS_TEST_CATALOG_SOURCE: catalogDir,
  }
}

test('records multiple exact matches without selecting one for automatic reuse', () => {
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

    const result = runDiscovery({
      workDir,
      analysisPath,
      catalogDir,
      reuseOfficialTemplate: true,
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)

    const artifact = readArtifact(workDir)
    assert.equal(artifact.catalog.available, true)
    assert.equal(artifact.catalog.source, 'local')
    assert.equal(artifact.catalog.template_count, 4)
    assert.equal(artifact.summary.exact_count, 2)
    assert.equal(artifact.summary.similar_count, 0)
    assert.deepEqual(
      artifact.references.map((reference) => reference.name),
      ['exact-alpha', 'exact-beta'],
    )
    assert.ok(artifact.references.every((reference) => fs.existsSync(path.join(workDir, reference.reference_path))))
    assert.deepEqual(artifact.decision, {
      route: 'continue_standard_pipeline',
      reuse_requested: true,
      reference_name: null,
      template_path: null,
      reason: 'found 2 exact template matches; automatic reuse requires exactly one',
    })
    assert.equal(fs.existsSync(path.join(workDir, '.sealos', 'template', 'index.yaml')), false)
    validateArtifact(workDir)
  })
})

test('does not automatically reuse an exact repository-subdirectory template', () => {
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
      reuseOfficialTemplate: true,
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)

    const artifact = readArtifact(workDir)
    assert.equal(artifact.summary.exact_count, 1)
    assert.equal(artifact.references[0].name, 'repo-api')
    assert.equal(artifact.project.repo_subdir, 'apps/api')
    assert.equal(
      artifact.references.find((reference) => reference.name === 'repo-root')?.match,
      undefined,
    )
    assert.equal(artifact.decision.route, 'continue_standard_pipeline')
    assert.equal(artifact.decision.reuse_requested, true)
    assert.match(artifact.decision.reason, /subdirectory/)
    assert.equal(fs.existsSync(path.join(workDir, '.sealos', 'template', 'index.yaml')), false)
    validateArtifact(workDir)
  })
})

test('atomically copies one remotely verified official template byte-for-byte', () => {
  withFixture(({ fixtureRoot, workDir, catalogDir }) => {
    const sourceTemplate = writeTemplate(catalogDir, 'official-exact', {
      gitRepo: 'https://github.com/acme/example',
      databaseKind: 'Postgresql',
      extraResource: `---
apiVersion: v1
kind: ConfigMap
metadata:
  name: exact-content
data:
  marker: "preserve comments and bytes"
`,
    })
    writeTemplate(catalogDir, 'unrelated-template', {
      gitRepo: 'https://github.com/other/project',
    })
    const expected = fs.readFileSync(sourceTemplate)
    const env = createVerifiedOfficialGitEnv(fixtureRoot, catalogDir)
    const analysisPath = writeAnalysis(workDir)

    const result = runDiscovery({
      workDir,
      analysisPath,
      reuseOfficialTemplate: true,
      env,
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)

    const artifact = readArtifact(workDir)
    const deployedTemplate = path.join(workDir, '.sealos', 'template', 'index.yaml')
    assert.equal(artifact.version, '2.0')
    assert.equal(artifact.catalog.source, 'refreshed', JSON.stringify(artifact, null, 2))
    assert.equal(artifact.catalog.verified_for_reuse, true)
    assert.match(artifact.catalog.commit, /^[0-9a-f]{40}$/)
    assert.equal(artifact.summary.exact_count, 1)
    assert.equal(artifact.summary.similar_count, 0)
    assert.deepEqual(artifact.decision, {
      route: 'deploy_official_template',
      reuse_requested: true,
      reference_name: 'official-exact',
      template_path: '.sealos/template/index.yaml',
      reason: 'one exact official template match was selected for direct deployment',
    })
    assert.deepEqual(fs.readFileSync(deployedTemplate), expected)

    const output = JSON.parse(result.stdout)
    assert.equal(output.route, 'deploy_official_template')
    assert.equal(output.template_path, '.sealos/template/index.yaml')
    validateArtifact(workDir)

    const fallback = runDiscovery({
      workDir,
      analysisPath,
      catalogDir,
      reuseOfficialTemplate: false,
    })
    assert.equal(fallback.status, 0, fallback.stderr || fallback.stdout)
    assert.equal(readArtifact(workDir).decision.route, 'continue_standard_pipeline')
    assert.equal(fs.existsSync(deployedTemplate), false)
    validateArtifact(workDir)
  })
})

test('refuses to write through a symlinked .sealos directory', () => {
  withFixture(({ fixtureRoot, workDir, catalogDir }) => {
    writeTemplate(catalogDir, 'local-exact', {
      gitRepo: 'https://github.com/acme/example',
    })
    const outsideDirectory = path.join(fixtureRoot, 'outside-sealos')
    const outsideMarker = path.join(outsideDirectory, 'keep.txt')
    const analysisPath = path.join(fixtureRoot, 'analysis.json')
    fs.mkdirSync(outsideDirectory, { recursive: true })
    fs.writeFileSync(outsideMarker, 'outside content must remain unchanged\n')
    fs.writeFileSync(
      analysisPath,
      `${JSON.stringify(analysisFor(workDir), null, 2)}\n`,
    )
    fs.symlinkSync(outsideDirectory, path.join(workDir, '.sealos'), 'dir')

    const result = runDiscovery({
      workDir,
      analysisPath,
      catalogDir,
      reuseOfficialTemplate: true,
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /must not contain symlinks/)
    assert.equal(
      fs.readFileSync(outsideMarker, 'utf8'),
      'outside content must remain unchanged\n',
    )
    assert.equal(
      fs.existsSync(path.join(outsideDirectory, 'template-references.json')),
      false,
    )
    assert.equal(fs.existsSync(path.join(outsideDirectory, 'template')), false)
  })
})

test('refuses to copy an official template through a symlinked output directory', () => {
  withFixture(({ fixtureRoot, workDir, catalogDir }) => {
    writeTemplate(catalogDir, 'official-exact', {
      gitRepo: 'https://github.com/acme/example',
    })
    const analysisPath = writeAnalysis(workDir)
    const outsideTemplateDirectory = path.join(fixtureRoot, 'outside-template')
    const outsideIndex = path.join(outsideTemplateDirectory, 'index.yaml')
    fs.mkdirSync(outsideTemplateDirectory, { recursive: true })
    fs.writeFileSync(outsideIndex, 'outside content must remain unchanged\n')
    fs.symlinkSync(
      outsideTemplateDirectory,
      path.join(workDir, '.sealos', 'template'),
      'dir',
    )

    const result = runDiscovery({
      workDir,
      analysisPath,
      reuseOfficialTemplate: true,
      env: createVerifiedOfficialGitEnv(fixtureRoot, catalogDir),
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /must not contain symlinks/)
    assert.equal(
      fs.readFileSync(outsideIndex, 'utf8'),
      'outside content must remain unchanged\n',
    )
  })
})

test('strips caller Git configuration before verifying the official checkout', () => {
  withFixture(({ fixtureRoot, workDir, catalogDir }) => {
    writeTemplate(catalogDir, 'official-exact', {
      gitRepo: 'https://github.com/acme/example',
    })
    const analysisPath = writeAnalysis(workDir)
    const env = {
      ...createVerifiedOfficialGitEnv(fixtureRoot, catalogDir),
      GIT_CONFIG_PARAMETERS: "'url.file:///tmp/attacker.insteadOf=https://github.com/labring-actions/templates.git'",
      GIT_CONFIG: path.join(fixtureRoot, 'attacker.gitconfig'),
      GIT_DIR: path.join(fixtureRoot, 'attacker.git'),
      GIT_WORK_TREE: path.join(fixtureRoot, 'attacker-worktree'),
      GIT_INDEX_FILE: path.join(fixtureRoot, 'attacker-index'),
      GIT_OBJECT_DIRECTORY: path.join(fixtureRoot, 'attacker-objects'),
      GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(fixtureRoot, 'attacker-alternates'),
    }

    const result = runDiscovery({
      workDir,
      analysisPath,
      reuseOfficialTemplate: true,
      env,
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)

    const artifact = readArtifact(workDir)
    assert.equal(artifact.catalog.verified_for_reuse, true)
    assert.equal(artifact.decision.route, 'deploy_official_template')
    validateArtifact(workDir)
  })
})

test('never resumes a forged local official template without fresh verification', () => {
  withFixture(({ fixtureRoot, workDir, catalogDir }) => {
    writeTemplate(catalogDir, 'official-exact', {
      gitRepo: 'https://github.com/acme/example',
    })
    const analysisPath = writeAnalysis(workDir)
    const initial = runDiscovery({
      workDir,
      analysisPath,
      reuseOfficialTemplate: true,
      env: createVerifiedOfficialGitEnv(fixtureRoot, catalogDir),
    })
    assert.equal(initial.status, 0, initial.stderr || initial.stdout)

    const priorArtifact = readArtifact(workDir)
    assert.equal(priorArtifact.decision.route, 'deploy_official_template')
    const forgedYaml = `apiVersion: app.sealos.io/v1
kind: Template
metadata:
  name: forged-local-template
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: forged
spec:
  template:
    spec:
      containers:
        - name: forged
          image: attacker.example/forged:1
`
    fs.writeFileSync(
      path.join(workDir, priorArtifact.references[0].reference_path),
      forgedYaml,
    )
    fs.writeFileSync(
      path.join(workDir, priorArtifact.decision.template_path),
      forgedYaml,
    )

    const retry = runDiscovery({
      workDir,
      analysisPath,
      reuseOfficialTemplate: true,
      env: {
        ...process.env,
        HOME: path.join(fixtureRoot, 'empty-home'),
        PATH: '',
      },
    })
    assert.equal(retry.status, 0, retry.stderr || retry.stdout)

    const retriedArtifact = readArtifact(workDir)
    assert.equal(retriedArtifact.catalog.verified_for_reuse, false)
    assert.equal(retriedArtifact.decision.route, 'continue_standard_pipeline')
    assert.equal(
      fs.existsSync(path.join(workDir, '.sealos', 'template', 'index.yaml')),
      false,
    )
    validateArtifact(workDir)
  })
})

test('never deploys directly from an explicit local catalog directory', () => {
  withFixture(({ workDir, catalogDir }) => {
    writeTemplate(catalogDir, 'local-exact', {
      gitRepo: 'https://github.com/acme/example',
    })
    const analysisPath = writeAnalysis(workDir)

    const result = runDiscovery({
      workDir,
      analysisPath,
      catalogDir,
      reuseOfficialTemplate: true,
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)

    const artifact = readArtifact(workDir)
    assert.equal(artifact.catalog.source, 'local')
    assert.equal(artifact.catalog.verified_for_reuse, false)
    assert.equal(artifact.decision.route, 'continue_standard_pipeline')
    assert.match(artifact.decision.reason, /not verified/)
    assert.equal(fs.existsSync(path.join(workDir, '.sealos', 'template', 'index.yaml')), false)
    validateArtifact(workDir)
  })
})

test('rejects a refreshed catalog checkout whose origin is not official', () => {
  withFixture(({ fixtureRoot, workDir, catalogDir }) => {
    writeTemplate(catalogDir, 'spoofed-exact', {
      gitRepo: 'https://github.com/acme/example',
    })
    const analysisPath = writeAnalysis(workDir)
    const env = createVerifiedOfficialGitEnv(
      fixtureRoot,
      catalogDir,
      'https://github.com/attacker/templates.git',
    )

    const result = runDiscovery({
      workDir,
      analysisPath,
      reuseOfficialTemplate: true,
      env,
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)

    const artifact = readArtifact(workDir)
    assert.equal(artifact.catalog.available, false)
    assert.equal(artifact.catalog.verified_for_reuse, false)
    assert.equal(artifact.decision.route, 'continue_standard_pipeline')
    assert.match(artifact.reason, /origin is not/)
    assert.equal(fs.existsSync(path.join(workDir, '.sealos', 'template', 'index.yaml')), false)
    validateArtifact(workDir)
  })
})

test('artifact validation rejects a standard route for an eligible requested reuse', () => {
  withFixture(({ fixtureRoot, workDir, catalogDir }) => {
    writeTemplate(catalogDir, 'official-exact', {
      gitRepo: 'https://github.com/acme/example',
    })
    const env = createVerifiedOfficialGitEnv(fixtureRoot, catalogDir)
    const analysisPath = writeAnalysis(workDir)
    const result = runDiscovery({
      workDir,
      analysisPath,
      reuseOfficialTemplate: true,
      env,
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)

    const artifactPath = path.join(workDir, '.sealos', 'template-references.json')
    const artifact = readArtifact(workDir)
    assert.equal(artifact.decision.route, 'deploy_official_template', JSON.stringify(artifact, null, 2))
    const reason = 'incorrectly continued despite eligible official-template reuse'
    artifact.decision = {
      route: 'continue_standard_pipeline',
      reuse_requested: true,
      reference_name: null,
      template_path: null,
      reason,
    }
    artifact.reason = reason
    fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`)

    const validation = spawnSync(process.execPath, [
      validatorScript,
      'template-references',
      artifactPath,
    ], { encoding: 'utf8' })
    assert.notEqual(validation.status, 0)
    assert.match(validation.stdout, /must deploy the unique exact official template/)
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
    assert.equal(readArtifact(workDir).decision.route, 'continue_standard_pipeline')
    assert.equal(readArtifact(workDir).decision.reuse_requested, false)
    assert.equal(fs.existsSync(path.join(workDir, '.sealos', 'template', 'index.yaml')), false)
    validateArtifact(workDir)
  })
})

test('records an unavailable catalog without blocking deployment', () => {
  withFixture(({ workDir, catalogDir }) => {
    const analysisPath = writeAnalysis(workDir)
    const result = runDiscovery({
      workDir,
      analysisPath,
      catalogDir,
      reuseOfficialTemplate: true,
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)

    const artifact = readArtifact(workDir)
    assert.equal(artifact.catalog.available, false)
    assert.equal(artifact.catalog.source, 'unavailable')
    assert.deepEqual(artifact.references, [])
    assert.equal(artifact.decision.route, 'continue_standard_pipeline')
    assert.equal(artifact.decision.reuse_requested, true)
    assert.equal(fs.existsSync(path.join(workDir, '.sealos', 'template', 'index.yaml')), false)
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

test('continues without materializing a similar template when no exact match exists', () => {
  withFixture(({ workDir, catalogDir }) => {
    writeTemplate(catalogDir, 'candidate', {
      gitRepo: 'https://github.com/other/project',
      description: 'Next.js API backed by PostgreSQL',
      databaseKind: 'Postgresql',
    })
    const analysisPath = writeAnalysis(workDir)

    const result = runDiscovery({
      workDir,
      analysisPath,
      catalogDir,
      reuseOfficialTemplate: true,
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)

    const artifact = readArtifact(workDir)
    assert.equal(artifact.summary.exact_count, 0)
    assert.equal(artifact.summary.similar_count, 0)
    assert.deepEqual(artifact.references, [])
    assert.equal(artifact.decision.route, 'continue_standard_pipeline')
    assert.match(artifact.decision.reason, /no exact/)
    assert.equal(fs.existsSync(path.join(workDir, '.sealos', 'template', 'index.yaml')), false)
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
    assert.equal(artifact.summary.similar_count, 0)
    validateArtifact(workDir)
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

test('does not deploy an exact match from a non-official configured catalog', () => {
  withFixture(({ fixtureRoot, workDir, catalogDir }) => {
    const copiedSkill = path.join(fixtureRoot, 'sealos-deploy')
    fs.cpSync(skillDir, copiedSkill, { recursive: true })
    const configPath = path.join(copiedSkill, 'config.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    config.template_catalog.repository = 'https://github.com/acme/templates.git'
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
    writeTemplate(catalogDir, 'exact-but-not-official', {
      gitRepo: 'https://github.com/acme/example',
    })
    const analysisPath = writeAnalysis(workDir)

    const result = runDiscovery({
      workDir,
      analysisPath,
      selectedSkillDir: copiedSkill,
      catalogDir,
      reuseOfficialTemplate: true,
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)

    const artifact = readArtifact(workDir)
    assert.equal(artifact.summary.exact_count, 1)
    assert.equal(artifact.decision.route, 'continue_standard_pipeline')
    assert.match(artifact.decision.reason, /not the supported official/)
    assert.equal(fs.existsSync(path.join(workDir, '.sealos', 'template', 'index.yaml')), false)
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
      reuseOfficialTemplate: true,
      env: {
        ...process.env,
        PATH: '',
      },
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const artifact = readArtifact(workDir)
    assert.equal(artifact.catalog.available, false)
    assert.match(artifact.reason, /disabled/)
    assert.equal(artifact.decision.route, 'continue_standard_pipeline')
    assert.equal(artifact.decision.reuse_requested, true)
    assert.equal(fs.existsSync(path.join(workDir, '.sealos', 'template', 'index.yaml')), false)
    validateArtifact(workDir, copiedSkill)
  })
})

test('uses a stale cache only for matching and never for direct deployment', () => {
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
      reuseOfficialTemplate: true,
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
    assert.equal(artifact.catalog.verified_for_reuse, false)
    assert.equal(artifact.references[0].match, 'exact')
    assert.equal(artifact.decision.route, 'continue_standard_pipeline')
    assert.match(artifact.decision.reason, /not verified/)
    assert.equal(
      fs.existsSync(path.join(workDir, '.sealos', 'template', 'index.yaml')),
      false,
    )
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

test('rejects an invalid reuse option before writing artifacts', () => {
  withFixture(({ workDir, catalogDir }) => {
    const analysisPath = writeAnalysis(workDir)
    const result = spawnSync(process.execPath, [
      discoveryScriptFor(skillDir),
      '--work-dir', workDir,
      '--skill-dir', skillDir,
      '--analysis', analysisPath,
      '--catalog-dir', catalogDir,
      '--reuse-official-template', 'yes',
    ], { encoding: 'utf8' })

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /must be true or false/)
    assert.equal(fs.existsSync(path.join(workDir, '.sealos', 'template-references.json')), false)
    assert.equal(fs.existsSync(path.join(workDir, '.sealos', 'template', 'index.yaml')), false)
  })
})

test('artifact semantic validation rejects similar references in version 2.0', () => {
  withFixture(({ workDir, catalogDir }) => {
    writeTemplate(catalogDir, 'exact', {
      gitRepo: 'https://github.com/acme/example',
    })
    const analysisPath = writeAnalysis(workDir)
    const result = runDiscovery({ workDir, analysisPath, catalogDir })
    assert.equal(result.status, 0, result.stderr || result.stdout)

    const artifactPath = path.join(workDir, '.sealos', 'template-references.json')
    const artifact = readArtifact(workDir)
    artifact.references[0].match = 'similar'
    artifact.references[0].score = 99
    artifact.summary.exact_count = 0
    artifact.summary.similar_count = 1
    fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`)

    const validation = spawnSync(process.execPath, [
      validatorScript,
      'template-references',
      artifactPath,
    ], { encoding: 'utf8' })
    assert.notEqual(validation.status, 0)
    assert.match(validation.stdout, /version 2.0 does not select similar template references/)
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
