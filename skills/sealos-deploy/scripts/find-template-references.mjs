#!/usr/bin/env node

/**
 * Discover exact and structurally similar Sealos templates.
 *
 * Catalog YAML is treated as untrusted reference data. This script never
 * renders, applies, or executes a catalog template.
 */

import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { validateArtifactData } from './artifact-validator.mjs'

const DEFAULT_CATALOG = Object.freeze({
  enabled: true,
  repository: 'https://github.com/labring-actions/templates.git',
  ref: 'kb-0.9',
  template_root: 'template',
  cache_ttl_seconds: 86400,
  similar_limit: 3,
})
const MAX_TEMPLATE_BYTES = 1024 * 1024
const MAX_PROJECT_FILE_BYTES = 2 * 1024 * 1024
const DATABASES = ['postgres', 'mysql', 'mongodb', 'redis', 'kafka', 'sqlite']
const ROLE_WORDS = ['web', 'frontend', 'backend', 'api', 'gateway', 'worker', 'scheduler', 'cron', 'realtime']
const PROJECT_FILES = [
  'README.md',
  'README_zh.md',
  'compose.yaml',
  'compose.yml',
  'docker-compose.yaml',
  'docker-compose.yml',
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'go.mod',
]

function compareCodepoints(left, right) {
  return left < right ? -1 : (left > right ? 1 : 0)
}

function usage() {
  console.error(
    'Usage: node find-template-references.mjs --work-dir <dir> --skill-dir <dir> --analysis <analysis.json> [--github-url <url>] [--catalog-dir <dir>]',
  )
}

function parseArgs(argv) {
  const result = {}
  const allowed = new Set(['work-dir', 'skill-dir', 'analysis', 'github-url', 'catalog-dir'])

  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!flag?.startsWith('--') || value === undefined) {
      throw new Error(`Invalid argument near ${flag ?? '<end>'}`)
    }
    const key = flag.slice(2)
    if (!allowed.has(key)) {
      throw new Error(`Unknown option: ${flag}`)
    }
    result[key] = value
  }

  for (const required of ['work-dir', 'skill-dir', 'analysis']) {
    if (!result[required]) {
      throw new Error(`Missing required option --${required}`)
    }
  }
  return result
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort(compareCodepoints)
}

function uniqueInOrder(values) {
  return [...new Set(values.filter(Boolean))]
}

function boundedText(value, maximumLength) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .slice(0, maximumLength)
}

function safeReadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stripInlineComment(value) {
  let quote = null
  for (let index = 0; index < value.length; index++) {
    const character = value[index]
    if ((character === '"' || character === "'") && value[index - 1] !== '\\') {
      quote = quote === character ? null : (quote ?? character)
    }
    if (character === '#' && quote === null && (index === 0 || /\s/.test(value[index - 1]))) {
      return value.slice(0, index).trimEnd()
    }
  }
  return value
}

function scalar(value) {
  const clean = stripInlineComment(String(value ?? '').trim())
  if (
    clean.length >= 2
    && ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'")))
  ) {
    return clean.slice(1, -1)
  }
  if (clean === 'null' || clean === '~') {
    return ''
  }
  return clean
}

function parseMappingLine(line) {
  const match = line.match(/^(\s*)([A-Za-z0-9_.-]+):(?:\s*(.*))?$/)
  if (!match) {
    return null
  }
  return {
    indent: match[1].replaceAll('\t', '  ').length,
    key: match[2],
    value: match[3] ?? '',
  }
}

function documentLines(document) {
  return document.split(/\r?\n/).map((text, index) => ({
    text,
    index,
    mapping: parseMappingLine(text),
  }))
}

function findPathValue(document, keys) {
  const lines = documentLines(document)
  let start = 0
  let end = lines.length
  let parentIndent = -1

  for (let depth = 0; depth < keys.length; depth++) {
    let found = null
    for (let index = start; index < end; index++) {
      const mapping = lines[index].mapping
      if (!mapping || mapping.indent <= parentIndent || mapping.key !== keys[depth]) {
        continue
      }
      if (
        found === null
        || mapping.indent < found.mapping.indent
      ) {
        found = { index, mapping }
      }
    }
    if (!found) {
      return null
    }
    if (depth === keys.length - 1) {
      return {
        value: scalar(found.mapping.value),
        rawValue: found.mapping.value,
        indent: found.mapping.indent,
        index: found.index,
        lines,
      }
    }

    start = found.index + 1
    end = lines.length
    for (let index = start; index < lines.length; index++) {
      const mapping = lines[index].mapping
      if (mapping && mapping.indent <= found.mapping.indent) {
        end = index
        break
      }
    }
    parentIndent = found.mapping.indent
  }
  return null
}

function findListValue(document, keys) {
  const result = findPathValue(document, keys)
  if (!result) {
    return []
  }

  if (result.value.startsWith('[') && result.value.endsWith(']')) {
    return sortedUnique(
      result.value
        .slice(1, -1)
        .split(',')
        .map((item) => scalar(item).trim())
        .filter(Boolean),
    )
  }
  if (result.value) {
    return sortedUnique([result.value])
  }

  const items = []
  for (let index = result.index + 1; index < result.lines.length; index++) {
    const line = result.lines[index]
    const indent = line.text.match(/^\s*/)?.[0].length ?? 0
    if (line.text.trim() && indent <= result.indent) {
      break
    }
    const match = line.text.match(/^\s*-\s*(.+?)\s*$/)
    if (match) {
      items.push(scalar(match[1]))
    }
  }
  return sortedUnique(items)
}

function splitYamlDocuments(raw) {
  return raw.split(/^---(?:[ \t]+#.*)?[ \t]*\r?$/m)
}

function findTemplateDocument(raw) {
  for (const document of splitYamlDocuments(raw)) {
    if (
      findPathValue(document, ['apiVersion'])?.value === 'app.sealos.io/v1'
      && findPathValue(document, ['kind'])?.value === 'Template'
    ) {
      return document
    }
  }
  return null
}

function detectKinds(raw) {
  const kinds = {}
  for (const document of splitYamlDocuments(raw)) {
    const kind = findPathValue(document, ['kind'])?.value
    if (kind && /^[A-Za-z0-9.-]{1,128}$/.test(kind)) {
      kinds[kind] = (kinds[kind] ?? 0) + 1
      if (Object.keys(kinds).length >= 64) {
        break
      }
    }
  }
  return Object.fromEntries(Object.entries(kinds).sort(([left], [right]) => compareCodepoints(left, right)))
}

function isUsableImage(value) {
  return Boolean(
    value
    && !value.includes('${{')
    && !value.includes('$(')
    && !value.includes('://')
    && !/[\s{}]/.test(value),
  )
}

function detectImages(raw) {
  const lines = documentLines(raw)
  const images = []

  for (let index = 0; index < lines.length; index++) {
    const mapping = lines[index].mapping
    if (!mapping) {
      continue
    }

    if (mapping.key === 'image' || mapping.key === 'originImageName') {
      const candidate = scalar(mapping.value)
      if (isUsableImage(candidate)) {
        images.push(candidate)
      }
      continue
    }

    if (/image$/i.test(mapping.key) && !mapping.value) {
      for (let childIndex = index + 1; childIndex < lines.length; childIndex++) {
        const child = lines[childIndex].mapping
        if (child && child.indent <= mapping.indent) {
          break
        }
        if (child && (child.key === 'value' || child.key === 'default')) {
          const candidate = scalar(child.value)
          if (isUsableImage(candidate)) {
            images.push(candidate)
          }
        }
      }
    }
  }
  return sortedUnique(images.map((image) => boundedText(image, 512)).filter(Boolean)).slice(0, 64)
}

function warningForImage(image) {
  const warnings = []
  if (image.includes('@sha256:')) {
    return warnings
  }

  const lastSegment = image.slice(image.lastIndexOf('/') + 1)
  const colon = lastSegment.lastIndexOf(':')
  if (colon === -1) {
    warnings.push(`tagless image: ${image}`)
    return warnings
  }

  const tag = lastSegment.slice(colon + 1).toLowerCase()
  if (['latest', 'stable', 'main', 'master', 'edge', 'nightly', 'dev'].includes(tag)) {
    warnings.push(`floating image tag: ${image}`)
  } else if (/^v?\d{1,2}(?:\.\d{1,2})?$/.test(tag)) {
    warnings.push(`broad image tag: ${image}`)
  }
  if (/postgresql-(?:12|13|14|15)\./i.test(image)) {
    warnings.push(`legacy PostgreSQL image: ${image}`)
  }
  return warnings
}

function detectWarnings(raw, images) {
  const warnings = images.flatMap(warningForImage)
  if (/^\s*emptyDir\s*:/m.test(raw)) {
    warnings.push('uses emptyDir storage')
  }
  return sortedUnique(warnings)
}

function normalizeDatabaseWord(value) {
  if (value === 'postgresql' || value === 'postgres') {
    return 'postgres'
  }
  if (value === 'mongo' || value === 'mongodb') {
    return 'mongodb'
  }
  return value
}

function detectDatabases(text) {
  const lower = text.toLowerCase()
  const aliases = {
    postgres: /\bpostgres(?:ql)?\b/,
    mysql: /\bmysql\b|\bmariadb\b/,
    mongodb: /\bmongo(?:db)?\b/,
    redis: /\bredis\b/,
    kafka: /\bkafka\b/,
    sqlite: /\bsqlite\b/,
  }
  return DATABASES.filter((database) => aliases[database].test(lower))
}

function detectRoles(text) {
  const lower = text.toLowerCase()
  return ROLE_WORDS.filter((role) => new RegExp(`\\b${role}\\b`).test(lower))
}

function tokenize(text) {
  const stopWords = new Set([
    'https', 'github', 'com', 'template', 'sealos', 'docker', 'image', 'app',
    'application', 'the', 'and', 'with', 'from', 'for', 'this', 'that',
  ])
  return sortedUnique(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3 && !stopWords.has(token)),
  ).slice(0, 1000)
}

function normalizeRepoUrl(input) {
  if (!input || typeof input !== 'string') {
    return null
  }
  let owner
  let repository
  let rest = []

  const scpMatch = input.trim().match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i)
  if (scpMatch) {
    owner = scpMatch[1]
    repository = scpMatch[2]
  } else {
    let url
    try {
      url = new URL(input.trim())
    } catch {
      return null
    }
    if (
      url.hostname.toLowerCase() !== 'github.com'
      || !['https:', 'http:', 'ssh:'].includes(url.protocol)
      || url.password
      || (url.username && !(url.protocol === 'ssh:' && url.username === 'git'))
    ) {
      return null
    }
    let segments
    try {
      segments = url.pathname.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment))
    } catch {
      return null
    }
    if (segments.length < 2) {
      return null
    }
    owner = segments[0]
    repository = segments[1].replace(/\.git$/i, '')
    if (segments[2] === 'tree' || segments[2] === 'blob') {
      if (
        segments.length < 4
        || !segments[3]
        || segments[3] === '.'
        || segments[3] === '..'
        || segments[3].includes('/')
      ) {
        return null
      }
      rest = segments.slice(4)
    } else if (segments.length > 2) {
      return null
    }
  }

  if (!owner || !repository) {
    return null
  }
  const safeRepoPart = (value) => (
    /^[A-Za-z0-9_.-]+$/.test(value)
    && value !== '.'
    && value !== '..'
  )
  if (
    !safeRepoPart(owner)
    || !safeRepoPart(repository)
    || rest.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('/'))
  ) {
    return null
  }
  return {
    fullName: `${owner}/${repository}`.toLowerCase(),
    subdir: rest.length > 0 ? rest.join('/').replace(/^\/+|\/+$/g, '') : null,
  }
}

function validateCatalogConfig(rawConfig) {
  const errors = []
  if (rawConfig !== undefined && !isPlainObject(rawConfig)) {
    errors.push('template_catalog must be an object')
  }
  const catalog = {
    ...DEFAULT_CATALOG,
    ...(isPlainObject(rawConfig) ? rawConfig : {}),
  }

  let repositoryUrl
  try {
    repositoryUrl = new URL(catalog.repository)
    const segments = repositoryUrl.pathname.split('/').filter(Boolean)
    if (
      repositoryUrl.protocol !== 'https:'
      || repositoryUrl.hostname.toLowerCase() !== 'github.com'
      || repositoryUrl.username
      || repositoryUrl.password
      || repositoryUrl.search
      || repositoryUrl.hash
      || segments.length !== 2
      || !segments[1].replace(/\.git$/i, '')
      || catalog.repository.length > 512
      || segments.some((segment) => segment.length > 120 || !/^[A-Za-z0-9_.-]+$/.test(segment))
    ) {
      throw new Error('must be a credential-free HTTPS GitHub repository URL')
    }
  } catch (error) {
    errors.push(`repository ${error.message}`)
  }

  if (typeof catalog.enabled !== 'boolean') {
    errors.push('enabled must be boolean')
  }
  if (
    typeof catalog.ref !== 'string'
    || catalog.ref.length > 255
    || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(catalog.ref)
    || catalog.ref.includes('..')
    || catalog.ref.includes('//')
    || catalog.ref.endsWith('/')
  ) {
    errors.push('ref contains unsafe characters')
  }
  if (
    typeof catalog.template_root !== 'string'
    || catalog.template_root.length > 255
    || path.isAbsolute(catalog.template_root)
    || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(catalog.template_root)
    || catalog.template_root.split(/[\\/]/).some((segment) => !segment || segment === '..')
  ) {
    errors.push('template_root must be a safe relative path')
  }
  if (
    !Number.isSafeInteger(catalog.cache_ttl_seconds)
    || catalog.cache_ttl_seconds < 0
    || catalog.cache_ttl_seconds > 31536000
  ) {
    errors.push('cache_ttl_seconds must be an integer from 0 to 31536000')
  }
  if (!Number.isInteger(catalog.similar_limit) || catalog.similar_limit < 1 || catalog.similar_limit > 5) {
    errors.push('similar_limit must be an integer from 1 to 5')
  }
  return { catalog, errors }
}

function runGit(args, cwd = undefined) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: 120000,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
    },
  })
  return {
    ok: result.status === 0,
    stdout: result.stdout?.trim() ?? '',
    error: result.error?.message || result.stderr?.trim() || `git exited ${result.status}`,
  }
}

function cacheIdentity(catalog) {
  const parsed = new URL(catalog.repository)
  const segments = parsed.pathname.split('/').filter(Boolean)
  const base = `${segments[0]}-${segments[1].replace(/\.git$/i, '')}-${catalog.ref}`
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .slice(0, 120)
  const digest = crypto
    .createHash('sha256')
    .update(`${catalog.repository}\n${catalog.ref}\n${catalog.template_root}`)
    .digest('hex')
    .slice(0, 12)
  return `${base}-${digest}`
}

function catalogStatePath(catalogDir) {
  return path.join(catalogDir, '.sealos-template-catalog-state.json')
}

function readCatalogState(catalogDir) {
  try {
    return safeReadJson(catalogStatePath(catalogDir))
  } catch {
    return null
  }
}

function catalogRootExists(catalogDir, catalog) {
  try {
    return fs.statSync(path.join(catalogDir, catalog.template_root)).isDirectory()
  } catch {
    return false
  }
}

function stateMatches(state, catalog) {
  return Boolean(
    state
    && state.repository === catalog.repository
    && state.ref === catalog.ref
    && state.template_root === catalog.template_root
  )
}

function stateIsFresh(state, catalog) {
  if (!stateMatches(state, catalog)) {
    return false
  }
  const refreshedAt = Date.parse(state.refreshed_at)
  const age = Date.now() - refreshedAt
  return (
    !Number.isNaN(refreshedAt)
    && age >= -300000
    && age <= catalog.cache_ttl_seconds * 1000
  )
}

function normalizeCommit(value) {
  return typeof value === 'string' && /^[0-9a-f]{7,64}$/i.test(value)
    ? value.toLowerCase()
    : null
}

function writeCatalogState(catalogDir, catalog, commit) {
  const statePath = catalogStatePath(catalogDir)
  const temporaryPath = `${statePath}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(temporaryPath, `${JSON.stringify({
    repository: catalog.repository,
    ref: catalog.ref,
    template_root: catalog.template_root,
    commit: normalizeCommit(commit),
    refreshed_at: new Date().toISOString(),
  }, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  fs.renameSync(temporaryPath, statePath)
}

function configureSparseCheckout(catalogDir, catalog) {
  const init = runGit(['sparse-checkout', 'init', '--no-cone'], catalogDir)
  if (!init.ok) {
    return init
  }
  return runGit(
    ['sparse-checkout', 'set', `/${catalog.template_root}/*/index.yaml`],
    catalogDir,
  )
}

function cloneCatalog(cacheDir, catalog) {
  const parent = path.dirname(cacheDir)
  fs.mkdirSync(parent, { recursive: true })
  const temporary = path.join(parent, `.${path.basename(cacheDir)}.tmp-${process.pid}-${Date.now()}`)

  const cloneArgs = [
    'clone',
    '--depth', '1',
    '--branch', catalog.ref,
    '--filter=blob:none',
    '--no-checkout',
    catalog.repository,
    temporary,
  ]
  let cloned = runGit(cloneArgs)
  if (!cloned.ok) {
    fs.rmSync(temporary, { recursive: true, force: true })
    cloned = runGit(cloneArgs.filter((argument) => argument !== '--filter=blob:none'))
  }
  if (!cloned.ok) {
    fs.rmSync(temporary, { recursive: true, force: true })
    return { ok: false, error: cloned.error }
  }

  const sparse = configureSparseCheckout(temporary, catalog)
  const checkout = sparse.ok ? runGit(['checkout', '--detach'], temporary) : sparse
  const revision = checkout.ok ? runGit(['rev-parse', 'HEAD'], temporary) : checkout
  if (!revision.ok || !catalogRootExists(temporary, catalog)) {
    fs.rmSync(temporary, { recursive: true, force: true })
    return { ok: false, error: revision.error || 'catalog root was not checked out' }
  }

  writeCatalogState(temporary, catalog, revision.stdout)
  fs.rmSync(cacheDir, { recursive: true, force: true })
  fs.renameSync(temporary, cacheDir)
  return { ok: true, commit: normalizeCommit(revision.stdout) }
}

function refreshCatalog(cacheDir, catalog) {
  const sparse = configureSparseCheckout(cacheDir, catalog)
  if (!sparse.ok) {
    return sparse
  }
  const fetch = runGit(['fetch', '--depth', '1', 'origin', catalog.ref], cacheDir)
  const checkout = fetch.ok ? runGit(['checkout', '--detach', 'FETCH_HEAD'], cacheDir) : fetch
  const revision = checkout.ok ? runGit(['rev-parse', 'HEAD'], cacheDir) : checkout
  if (!revision.ok || !catalogRootExists(cacheDir, catalog)) {
    return { ok: false, error: revision.error || 'catalog root was not refreshed' }
  }
  writeCatalogState(cacheDir, catalog, revision.stdout)
  return { ok: true, commit: normalizeCommit(revision.stdout) }
}

function resolveCatalog(catalog, explicitDirectory) {
  if (explicitDirectory) {
    const directory = path.resolve(explicitDirectory)
    if (!catalogRootExists(directory, catalog)) {
      return { available: false, reason: 'explicit catalog directory does not contain the configured template root' }
    }
    const revision = runGit(['rev-parse', 'HEAD'], directory)
    return {
      available: true,
      directory,
      commit: revision.ok ? normalizeCommit(revision.stdout) : null,
      source: 'local',
      stale: false,
      reason: 'using explicit local catalog',
    }
  }

  const cacheDir = path.join(
    path.resolve(process.env.HOME || os.homedir()),
    '.sealos',
    'cache',
    'template-catalog',
    cacheIdentity(catalog),
  )
  const state = readCatalogState(cacheDir)
  const hasCache = catalogRootExists(cacheDir, catalog)

  if (hasCache && stateIsFresh(state, catalog)) {
    return {
      available: true,
      directory: cacheDir,
      commit: normalizeCommit(state.commit),
      source: 'cache',
      stale: false,
      reason: 'using fresh catalog cache',
    }
  }

  const refresh = hasCache ? refreshCatalog(cacheDir, catalog) : cloneCatalog(cacheDir, catalog)
  if (refresh.ok) {
    return {
      available: true,
      directory: cacheDir,
      commit: refresh.commit,
      source: 'refreshed',
      stale: false,
      reason: hasCache ? 'catalog cache refreshed' : 'catalog cache created',
    }
  }

  if (hasCache) {
    return {
      available: true,
      directory: cacheDir,
      commit: stateMatches(state, catalog) ? normalizeCommit(state.commit) : null,
      source: 'cache',
      stale: true,
      reason: `catalog refresh failed; using stale cache: ${refresh.error}`,
    }
  }
  return {
    available: false,
    reason: `catalog unavailable: ${refresh.error}`,
  }
}

function parseTemplate(filePath, directoryName, catalogRoot) {
  const stat = fs.lstatSync(filePath)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_TEMPLATE_BYTES) {
    throw new Error('template index is not a safe regular file within the size limit')
  }
  const realRoot = fs.realpathSync(catalogRoot)
  const realFile = fs.realpathSync(filePath)
  if (!realFile.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error('template index resolves outside the catalog root')
  }

  const raw = fs.readFileSync(realFile, 'utf8')
  const templateDocument = findTemplateDocument(raw)
  if (!templateDocument) {
    throw new Error('no app.sealos.io/v1 Template document')
  }

  const name = boundedText(
    findPathValue(templateDocument, ['metadata', 'name'])?.value || directoryName,
    128,
  ) || directoryName
  const title = boundedText(findPathValue(templateDocument, ['spec', 'title'])?.value || name, 256) || name
  const description = boundedText(findPathValue(templateDocument, ['spec', 'description'])?.value || '', 2048)
  const rawGitRepo = findPathValue(templateDocument, ['spec', 'gitRepo'])?.value || null
  const boundedGitRepo = rawGitRepo ? boundedText(rawGitRepo, 2048) : ''
  const normalizedRepo = normalizeRepoUrl(boundedGitRepo)
  const gitRepo = normalizedRepo ? `https://github.com/${normalizedRepo.fullName}` : null
  const categories = sortedUnique(
    findListValue(templateDocument, ['spec', 'categories'])
      .map((category) => boundedText(category, 64))
      .filter(Boolean),
  ).slice(0, 32)
  const kinds = detectKinds(raw)
  const images = detectImages(raw)
  const databases = detectDatabases(`${raw}\n${images.join('\n')}`)
  const metadata = `${name} ${title} ${description} ${gitRepo ?? ''} ${categories.join(' ')} ${images.join(' ')}`
  const roles = detectRoles(`${metadata}\n${raw.slice(0, 100000)}`)

  return {
    name,
    title,
    gitRepo,
    normalizedRepo,
    categories,
    kinds,
    images,
    databases,
    appWorkloads: (kinds.Deployment ?? 0) + (kinds.StatefulSet ?? 0),
    objectStorage: (kinds.ObjectStorageBucket ?? 0) > 0,
    persistent: databases.length > 0 || /volumeClaimTemplates\s*:|\bPersistentVolumeClaim\b/.test(raw),
    websocket: /nginx\.ingress\.kubernetes\.io\/backend-protocol\s*:\s*["']?WS/i.test(raw),
    roles,
    tokens: tokenize(metadata),
    warnings: detectWarnings(raw, images),
    catalogPath: `${directoryName}/index.yaml`,
    filePath: realFile,
  }
}

function loadCatalogEntries(catalogDirectory, catalog) {
  const catalogRoot = path.join(catalogDirectory, catalog.template_root)
  const rootStat = fs.lstatSync(catalogRoot)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error('catalog template root is not a safe directory')
  }

  const entries = []
  let skipped = 0
  const dirents = fs.readdirSync(catalogRoot, { withFileTypes: true })
  for (const dirent of dirents.slice(0, 5000)) {
    if (dirent.isSymbolicLink() || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(dirent.name)) {
      skipped += 1
      continue
    }
    if (!dirent.isDirectory()) {
      continue
    }
    const indexPath = path.join(catalogRoot, dirent.name, 'index.yaml')
    try {
      if (!fs.existsSync(indexPath)) {
        continue
      }
      entries.push(parseTemplate(indexPath, dirent.name, catalogRoot))
    } catch (error) {
      skipped += 1
      console.error(`Skipping catalog template ${dirent.name}: ${error.message}`)
    }
  }
  if (dirents.length > 5000) {
    skipped += dirents.length - 5000
  }
  entries.sort((left, right) => (
    compareCodepoints(left.name, right.name)
    || compareCodepoints(left.catalogPath, right.catalogPath)
  ))
  return { entries, skipped }
}

function readProjectSources(workDir) {
  const content = []
  for (const relativePath of PROJECT_FILES) {
    const filePath = path.join(workDir, relativePath)
    try {
      const stat = fs.lstatSync(filePath)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_PROJECT_FILE_BYTES) {
        continue
      }
      content.push(`\n# ${relativePath}\n${fs.readFileSync(filePath, 'utf8')}`)
    } catch {
      // Optional project evidence is best effort.
    }
  }
  return content.join('\n')
}

function countComposeWorkloads(source) {
  const databaseService = /postgres|mysql|mariadb|mongo|redis|kafka|zookeeper|sqlite/i
  let insideServices = false
  let servicesIndent = -1
  let serviceIndent = null
  const services = []

  for (const line of source.split(/\r?\n/)) {
    const mapping = parseMappingLine(line)
    if (!mapping) {
      continue
    }
    if (mapping.key === 'services' && mapping.indent === 0) {
      insideServices = true
      servicesIndent = mapping.indent
      serviceIndent = null
      continue
    }
    if (insideServices && mapping.indent <= servicesIndent) {
      insideServices = false
    }
    if (insideServices && serviceIndent === null) {
      serviceIndent = mapping.indent
    }
    if (insideServices && mapping.indent === serviceIndent && !databaseService.test(mapping.key)) {
      services.push(mapping.key)
    }
  }
  return new Set(services).size
}

function inferProjectFeatures(analysis, workDir) {
  const sources = readProjectSources(workDir)
  const analysisDatabases = (analysis.databases ?? []).map(normalizeDatabaseWord)
  const databases = sortedUnique([...analysisDatabases, ...detectDatabases(sources)])
  const composeWorkloads = countComposeWorkloads(sources)
  const appWorkloads = composeWorkloads || (analysis.complexity_tier === 'L3' ? 2 : 1)
  const descriptive = [
    analysis.project?.repo_name,
    analysis.framework,
    analysis.language,
    sources.slice(0, 200000),
  ].filter(Boolean).join('\n')

  return {
    app_workloads: Math.max(1, appWorkloads),
    databases,
    framework: String(analysis.framework ?? ''),
    language: String(analysis.language ?? 'unknown'),
    object_storage: /\b(?:s3|object storage|object-storage|minio|r2)\b/i.test(descriptive),
    persistent: databases.length > 0 || /\bvolumes?\s*:|\bsqlite\b/i.test(sources),
    roles: detectRoles(descriptive),
    websocket: /\bwebsockets?\b|\bsocket\.io\b|\bws:\/\//i.test(descriptive),
    tokens: tokenize(descriptive),
  }
}

function inferProjectRepo(workDir, requestedUrl) {
  let parsed = normalizeRepoUrl(requestedUrl)
  const topLevel = runGit(['-C', workDir, 'rev-parse', '--show-toplevel'])
  const remote = runGit(['-C', workDir, 'config', '--get', 'remote.origin.url'])
  const remoteParsed = remote.ok ? normalizeRepoUrl(remote.stdout) : null

  if (!parsed) {
    parsed = remoteParsed
  }
  if (parsed && !parsed.subdir && remoteParsed?.fullName === parsed.fullName && topLevel.ok) {
    const relative = path.relative(topLevel.stdout, workDir)
    if (relative && relative !== '.' && !relative.startsWith('..')) {
      parsed = { ...parsed, subdir: relative.split(path.sep).join('/') }
    }
  }
  return parsed
}

function jaccard(left, right) {
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  const union = new Set([...leftSet, ...rightSet])
  if (union.size === 0) {
    return 0
  }
  let intersection = 0
  for (const value of leftSet) {
    if (rightSet.has(value)) {
      intersection += 1
    }
  }
  return intersection / union.size
}

function sameSet(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value))
}

function scoreSimilarity(project, entry) {
  let score = 0
  const reasons = []

  if (project.databases.length === 0 && entry.databases.length === 0) {
    score += 10
    reasons.push('both are database-free')
  } else if (sameSet(project.databases, entry.databases)) {
    score += 30
    reasons.push('same database set')
  } else {
    const overlap = project.databases.filter((database) => entry.databases.includes(database))
    if (overlap.length > 0) {
      score += 20
      reasons.push(`shared database: ${overlap.join(', ')}`)
    }
  }

  const workloadDifference = Math.abs(project.app_workloads - Math.max(1, entry.appWorkloads))
  score += workloadDifference === 0 ? 20 : (workloadDifference === 1 ? 12 : 4)
  reasons.push(`similar workload count (${Math.max(1, entry.appWorkloads)})`)

  if (project.persistent === entry.persistent) {
    score += 12
    reasons.push(`matching ${project.persistent ? 'persistent' : 'ephemeral'} storage shape`)
  }
  if (project.object_storage === entry.objectStorage) {
    score += 8
    if (project.object_storage) {
      reasons.push('both use object storage')
    }
  }
  if (project.websocket === entry.websocket) {
    score += 5
    if (project.websocket) {
      reasons.push('both use WebSocket traffic')
    }
  }

  const roleSimilarity = jaccard(project.roles, entry.roles)
  score += Math.round(roleSimilarity * 15)
  if (roleSimilarity > 0) {
    reasons.push('overlapping service roles')
  }

  const tokenSimilarity = jaccard(project.tokens, entry.tokens)
  score += Math.round(tokenSimilarity * 10)
  if (tokenSimilarity > 0) {
    reasons.push('overlapping project signals')
  }

  if (
    project.framework
    && entry.tokens.some((token) => project.framework.toLowerCase().includes(token))
  ) {
    score += 5
    reasons.push('framework signal overlap')
  }

  score -= Math.min(15, entry.warnings.length * 3)
  return {
    score: Math.max(0, Math.min(99, score)),
    reasons: uniqueInOrder(reasons).slice(0, 6),
  }
}

function isExactRepoMatch(projectRepo, entryRepo) {
  if (!projectRepo || !entryRepo || projectRepo.fullName !== entryRepo.fullName) {
    return false
  }
  return (projectRepo.subdir ?? null) === (entryRepo.subdir ?? null)
}

function sourceUrl(catalog, commit, catalogPath) {
  if (!commit) {
    return null
  }
  const parsed = new URL(catalog.repository)
  const [owner, repoWithGit] = parsed.pathname.split('/').filter(Boolean)
  const repository = repoWithGit.replace(/\.git$/i, '')
  const encodedPath = `${catalog.template_root}/${catalogPath}`
    .split('/')
    .map(encodeURIComponent)
    .join('/')
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/${commit}/${encodedPath}`
}

function selectReferences(entries, project, projectRepo, limit) {
  const exact = []
  const similar = []

  for (const entry of entries) {
    if (isExactRepoMatch(projectRepo, entry.normalizedRepo)) {
      exact.push({
        entry,
        match: 'exact',
        score: 100,
        reasons: [
          'same GitHub repository',
          projectRepo.subdir ? `same repository subtree: ${projectRepo.subdir}` : 'same repository root',
        ],
      })
    } else {
      similar.push({ entry, match: 'similar', ...scoreSimilarity(project, entry) })
    }
  }

  exact.sort((left, right) => (
    compareCodepoints(left.entry.name, right.entry.name)
    || compareCodepoints(left.entry.catalogPath, right.entry.catalogPath)
  ))
  similar.sort((left, right) => (
    right.score - left.score
    || compareCodepoints(left.entry.name, right.entry.name)
    || compareCodepoints(left.entry.catalogPath, right.entry.catalogPath)
  ))
  return [...exact, ...similar.slice(0, limit)].slice(0, 15)
}

function materializeReferences(workDir, selected, catalog, commit, isLocal) {
  const sealosDir = path.join(workDir, '.sealos')
  const destination = path.join(sealosDir, 'template-references')
  fs.mkdirSync(sealosDir, { recursive: true })
  fs.rmSync(destination, { recursive: true, force: true })
  fs.mkdirSync(destination, { recursive: true })

  const names = new Set()
  return selected.map(({ entry, match, score, reasons }) => {
    let baseName = entry.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'template'
    let suffix = 2
    const original = baseName
    while (names.has(baseName)) {
      baseName = `${original}-${suffix}`
      suffix += 1
    }
    names.add(baseName)
    const relativePath = `.sealos/template-references/${baseName}.yaml`
    fs.copyFileSync(entry.filePath, path.join(destination, `${baseName}.yaml`))

    return {
      name: entry.name,
      title: entry.title,
      git_repo: entry.gitRepo,
      match,
      score,
      reasons: reasons.length > 0 ? reasons : ['structurally similar template'],
      warnings: entry.warnings,
      catalog_path: entry.catalogPath,
      reference_path: relativePath,
      source_url: isLocal ? null : sourceUrl(catalog, commit, entry.catalogPath),
      features: {
        categories: entry.categories,
        databases: entry.databases,
        kinds: entry.kinds,
        images: entry.images,
        object_storage: entry.objectStorage,
        persistent: entry.persistent,
        roles: entry.roles,
        websocket: entry.websocket,
      },
    }
  })
}

function publicProjectFeatures(features) {
  const { tokens: _tokens, ...publicFeatures } = features
  return publicFeatures
}

function writeArtifact(workDir, artifact) {
  const validation = validateArtifactData('template-references', artifact)
  if (!validation.valid) {
    const details = validation.errors.map((error) => `${error.path}: ${error.message}`).join('; ')
    throw new Error(`refusing to write invalid template reference artifact: ${details}`)
  }

  const sealosDir = path.join(workDir, '.sealos')
  const outputPath = path.join(sealosDir, 'template-references.json')
  const temporaryPath = `${outputPath}.tmp-${process.pid}-${Date.now()}`
  fs.mkdirSync(sealosDir, { recursive: true })
  fs.writeFileSync(temporaryPath, `${JSON.stringify(artifact, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  })
  fs.renameSync(temporaryPath, outputPath)
  console.log(JSON.stringify({
    artifact: outputPath,
    catalog_available: artifact.catalog.available,
    exact_references: artifact.summary.exact_count,
    similar_references: artifact.summary.similar_count,
    reason: artifact.reason,
  }))
}

function baseArtifact(catalog, project, reason) {
  return {
    version: '1.0',
    generated_at: new Date().toISOString(),
    catalog: {
      available: false,
      repository: typeof catalog.repository === 'string' && catalog.repository
        ? catalog.repository
        : DEFAULT_CATALOG.repository,
      ref: typeof catalog.ref === 'string' && catalog.ref ? catalog.ref : DEFAULT_CATALOG.ref,
      commit: null,
      source: 'unavailable',
      stale: false,
      template_count: 0,
      skipped_templates: 0,
      reason,
    },
    project,
    references: [],
    summary: {
      exact_count: 0,
      similar_count: 0,
    },
    reference_dir: '.sealos/template-references',
    reason,
  }
}

let args
try {
  args = parseArgs(process.argv.slice(2))
} catch (error) {
  usage()
  console.error(error.message)
  process.exit(1)
}

const workDir = path.resolve(args['work-dir'])
const skillDir = path.resolve(args['skill-dir'])
const analysisPath = path.resolve(args.analysis)

let analysis
try {
  analysis = safeReadJson(analysisPath)
  const validation = validateArtifactData('analysis', analysis)
  if (!validation.valid) {
    const details = validation.errors.map((error) => `${error.path}: ${error.message}`).join('; ')
    throw new Error(details)
  }
} catch (error) {
  console.error(`Invalid analysis artifact: ${error.message}`)
  process.exit(1)
}

let rawConfig
let configReadError = null
try {
  rawConfig = safeReadJson(path.join(skillDir, 'config.json'))
  if (!isPlainObject(rawConfig)) {
    configReadError = 'config root must be an object'
    rawConfig = {}
  }
} catch (error) {
  rawConfig = {}
  configReadError = error.message
}

const { catalog, errors: configErrors } = validateCatalogConfig(rawConfig.template_catalog)
const requestedGithubUrl = args['github-url'] || analysis.project.github_url || null
const projectRepo = inferProjectRepo(workDir, requestedGithubUrl)
const projectFeatures = inferProjectFeatures(analysis, workDir)
const publicProject = {
  github_url: projectRepo ? `https://github.com/${projectRepo.fullName}` : null,
  repo_reference: projectRepo?.fullName ?? null,
  repo_subdir: projectRepo?.subdir ?? null,
  features: publicProjectFeatures(projectFeatures),
}

function writeUnavailable(reason) {
  const destination = path.join(workDir, '.sealos', 'template-references')
  fs.rmSync(destination, { recursive: true, force: true })
  fs.mkdirSync(destination, { recursive: true })
  writeArtifact(workDir, baseArtifact(catalog, publicProject, reason))
}

if (configReadError || configErrors.length > 0) {
  writeUnavailable(`template catalog configuration is invalid: ${[configReadError, ...configErrors].filter(Boolean).join('; ')}`)
  process.exit(0)
}
if (!catalog.enabled) {
  writeUnavailable('template catalog discovery is disabled')
  process.exit(0)
}

let resolved
try {
  resolved = resolveCatalog(catalog, args['catalog-dir'])
} catch (error) {
  writeUnavailable(`template catalog could not be prepared: ${error.message}`)
  process.exit(0)
}
if (!resolved.available) {
  writeUnavailable(resolved.reason)
  process.exit(0)
}

let parsed
try {
  parsed = loadCatalogEntries(resolved.directory, catalog)
} catch (error) {
  writeUnavailable(`template catalog could not be parsed: ${error.message}`)
  process.exit(0)
}

const selected = selectReferences(
  parsed.entries,
  projectFeatures,
  projectRepo,
  catalog.similar_limit,
)
let references
try {
  references = materializeReferences(
    workDir,
    selected,
    catalog,
    resolved.commit,
    resolved.source === 'local',
  )
} catch (error) {
  writeUnavailable(`template references could not be materialized: ${error.message}`)
  process.exit(0)
}
const exactCount = references.filter((reference) => reference.match === 'exact').length
const similarCount = references.filter((reference) => reference.match === 'similar').length
const reason = exactCount > 0
  ? `found ${exactCount} exact and ${similarCount} similar template reference(s)`
  : `found ${similarCount} structurally similar template reference(s); no exact repository match`

writeArtifact(workDir, {
  version: '1.0',
  generated_at: new Date().toISOString(),
  catalog: {
    available: true,
    repository: catalog.repository,
    ref: catalog.ref,
    commit: resolved.commit,
    source: resolved.source,
    stale: resolved.stale,
    template_count: parsed.entries.length,
    skipped_templates: parsed.skipped,
    reason: resolved.reason,
  },
  project: publicProject,
  references,
  summary: {
    exact_count: exactCount,
    similar_count: similarCount,
  },
  reference_dir: '.sealos/template-references',
  reason,
})
