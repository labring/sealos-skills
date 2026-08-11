/**
 * Core conversion logic for Docker Compose → Sealos template.
 * Faithful port of compose_to_template.py (minus CLI).
 */

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path'
import { parse, parseAllDocuments, stringify } from 'yaml'
import { pathToVnName } from './path-converter.ts'
import {
  ALLOWED_TEMPLATE_CATEGORIES,
  CATEGORY_ALIASES,
  COMPOSE_BRACED_VAR_RE,
  COMPOSE_DURATION_PART_RE,
  COMPOSE_REFERENCE_RE,
  COMPOSE_SIMPLE_VAR_RE,
  DB_ENV_HINTS_BY_TYPE,
  DB_FQDN_BY_TYPE,
  DB_SECRET_NAME_BY_TYPE,
  DB_TYPE_PATTERNS,
  DEFAULT_RESOURCE_LIMITS,
  DEFAULT_RESOURCE_REQUESTS,
  EDGE_GATEWAY_COMMAND_HINTS,
  EDGE_GATEWAY_IMAGE_HINTS,
  EDGE_GATEWAY_PORT_HINTS,
  EDGE_GATEWAY_SERVICE_HINTS,
  EN_DESCRIPTION_REWRITE_PATTERNS,
  EN_DESCRIPTION_TERM_REPLACEMENTS,
  EXPLICIT_VERSION_TAG_RE,
  FLOATING_ALIAS_TAGS,
  FLOATING_NUMERIC_TAG_RE,
  HTTP_INGRESS_ANNOTATIONS,
  INVALID_NAME_RE,
  MODE_SUFFIXES,
  OBJECT_STORAGE_BASE_ENV_NAMES,
  OBJECT_STORAGE_BUCKET_ENV_NAME,
  OFFICIAL_HEALTH_HTTP_PROFILES,
  OFFICIAL_HEALTH_WORKER_PROFILES,
  SPECIAL_DB_RESOURCE_TYPES,
  SVGL_API_BASE,
  SVGL_LOGO_EXT,
  SVGL_REQUEST_TIMEOUT_MS,
  TEMPLATE_README_BASE,
  TLS_CERT_DIR_NAMES,
  TLS_CERT_MOUNT_EXACT_PATHS,
  TLS_TERMINATION_PORT,
  URL_IN_COMMAND_RE,
  WEBSOCKET_FIELD_HINTS,
  WEBSOCKET_INGRESS_ANNOTATIONS,
  WEBSOCKET_VALUE_HINTS,
  ZH_CHAR_RE,
} from './compose-to-template-constants.ts'
import { buildDatabaseResources, buildObjectStorageBucket } from './compose-to-template-db.ts'

export type MetadataOptions = {
  appName: string
  title: string
  description: string
  url: string
  gitRepo: string
  author: string
  categories: readonly string[]
  repoRawBase: string
  logoExt: string
}

export type ServiceShape = {
  ports: readonly number[]
  mountPaths: readonly string[]
}

export type ConfigMount = {
  target: string
  key: string
  content: string
}

export type CliOptions = {
  compose: string
  outputDir: string
  appName: string
  title: string
  description: string
  url: string
  gitRepo: string
  author: string
  category: string[]
  repoRawBase: string
  komposeMode: 'auto' | 'always' | 'never'
  noFetchLogo: boolean
  dryRun: boolean
}

function which(binary: string): string | null {
  const pathEnv = process.env.PATH || ''
  const delimiter = process.platform === 'win32' ? ';' : ':'
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue
    const candidate = join(dir, binary)
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** POSIX-like shlex.split for compose command strings. */
export function shlexSplit(text: string): string[] {
  const result: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaped = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (escaped) {
      current += ch
      escaped = false
      continue
    }
    if (quote === "'") {
      if (ch === "'") quote = null
      else current += ch
      continue
    }
    if (quote === '"') {
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') {
        quote = null
        continue
      }
      current += ch
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      continue
    }
    if (/\s/.test(ch)) {
      if (current) {
        result.push(current)
        current = ''
      }
      continue
    }
    current += ch
  }
  if (quote || escaped) {
    throw new Error('unclosed quote or escape in command')
  }
  if (current) result.push(current)
  return result
}

export function normalizeK8sName(raw: string): string {
  const value = raw.trim().toLowerCase().replace(INVALID_NAME_RE, '-').replace(/^-+|-+$/g, '')
  if (!value) {
    throw new Error(`unable to derive a valid name from: ${JSON.stringify(raw)}`)
  }
  return value
}

function normalizeSearchText(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function logoSearchTerms(meta: MetadataOptions): string[] {
  const terms = [meta.title, meta.appName.replace(/-/g, ' ')]
  for (const url of [meta.url, meta.gitRepo]) {
    try {
      const parsed = new URL(url)
      let host = parsed.hostname.toLowerCase()
      if (host.startsWith('www.')) host = host.slice(4)
      if (host) terms.push(host.split('.')[0])
      const pathName = basename(parsed.pathname)
      const stem = pathName.includes('.') ? pathName.slice(0, pathName.lastIndexOf('.')) : pathName
      if (stem) terms.push(stem.replace(/-/g, ' '))
    } catch {
      // ignore invalid URLs
    }
  }

  const unique: string[] = []
  const seen = new Set<string>()
  for (const term of terms) {
    const normalized = term.trim().replace(/\s+/g, ' ')
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(normalized)
  }
  return unique
}

export async function readJsonUrl(
  url: string,
  timeoutMs: number = SVGL_REQUEST_TIMEOUT_MS,
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'docker-to-sealos/1.0' },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

export async function readTextUrl(
  url: string,
  timeoutMs: number = SVGL_REQUEST_TIMEOUT_MS,
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'docker-to-sealos/1.0' },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.text()
  } finally {
    clearTimeout(timer)
  }
}

function selectSvgRoute(route: unknown): string {
  if (typeof route === 'string' && route.toLowerCase().endsWith('.svg')) {
    return route
  }
  if (route && typeof route === 'object' && !Array.isArray(route)) {
    const obj = route as Record<string, unknown>
    for (const key of ['light', 'dark']) {
      const value = obj[key]
      if (typeof value === 'string' && value.toLowerCase().endsWith('.svg')) {
        return value
      }
    }
    for (const value of Object.values(obj)) {
      if (typeof value === 'string' && value.toLowerCase().endsWith('.svg')) {
        return value
      }
    }
  }
  return ''
}

function compareScore(
  a: [number, number, string],
  b: [number, number, string],
): number {
  if (a[0] !== b[0]) return a[0] - b[0]
  if (a[1] !== b[1]) return a[1] - b[1]
  return a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0
}

function scoreSvglResult(
  result: Record<string, unknown>,
  meta: MetadataOptions,
  term: string,
): [number, number, string] {
  const title = String(result.title || '')
  const url = String(result.url || result.brandUrl || '')
  const titleKey = normalizeSearchText(title)
  const termKey = normalizeSearchText(term)
  const appKey = normalizeSearchText(meta.appName)
  const metaTitleKey = normalizeSearchText(meta.title)

  let score = 0
  if (titleKey && titleKey === termKey) score += 120
  else if (titleKey && termKey && (titleKey.includes(termKey) || termKey.includes(titleKey))) {
    score += 70
  }
  if (titleKey && (titleKey === appKey || titleKey === metaTitleKey)) score += 90

  let metaHost = ''
  let resultHost = ''
  try {
    metaHost = new URL(meta.url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    /* ignore */
  }
  try {
    resultHost = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    /* ignore */
  }
  if (metaHost && resultHost) {
    const hostsMatch =
      metaHost === resultHost ||
      metaHost.endsWith(`.${resultHost}`) ||
      resultHost.endsWith(`.${metaHost}`)
    if (hostsMatch) score += 100
  }

  const route = selectSvgRoute(result.route)
  if (route) score += 20
  return [score, -titleKey.length, route]
}

export async function findSvglLogoUrl(meta: MetadataOptions): Promise<string> {
  let best: [number, number, string] = [0, 0, '']
  for (const term of logoSearchTerms(meta)) {
    const searchUrl = `${SVGL_API_BASE}?search=${encodeURIComponent(term)}`
    let payload: unknown
    try {
      payload = await readJsonUrl(searchUrl)
    } catch {
      continue
    }
    if (!Array.isArray(payload)) continue
    for (const item of payload) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const score = scoreSvglResult(item as Record<string, unknown>, meta, term)
      if (score[2] && compareScore(score, best) > 0) {
        best = score
      }
    }
  }
  return best[2]
}

export async function fetchSvglLogo(meta: MetadataOptions, outputPath: string): Promise<boolean> {
  const logoUrl = await findSvglLogoUrl(meta)
  if (!logoUrl) return false
  let svgText: string
  try {
    svgText = await readTextUrl(logoUrl)
  } catch {
    return false
  }
  if (!svgText.slice(0, 500).toLowerCase().includes('<svg')) return false
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, svgText, 'utf8')
  return true
}

export async function prepareLogoAsset(
  meta: MetadataOptions,
  appDir: string,
  enabled: boolean,
): Promise<MetadataOptions> {
  if (!enabled) return meta
  const logoPath = join(appDir, `logo.${SVGL_LOGO_EXT}`)
  if (await fetchSvglLogo(meta, logoPath)) {
    return { ...meta, logoExt: SVGL_LOGO_EXT }
  }
  let existingLogo: string | null = null
  try {
    const entries = readdirSync(appDir)
      .filter((name) => name.startsWith('logo.'))
      .sort()
    if (entries.length > 0) existingLogo = join(appDir, entries[0])
  } catch {
    /* dir may not exist */
  }
  if (existingLogo) {
    const suffix = extname(existingLogo).replace(/^\./, '')
    if (suffix) return { ...meta, logoExt: suffix }
  }
  return meta
}

export function hasPinnedImage(image: string): boolean {
  const text = image.trim()
  if (!text) return false
  if (text.includes('@sha256:')) return true
  const withoutDigest = text.includes('@') ? text.slice(0, text.indexOf('@')) : text
  const lastSegment = withoutDigest.includes('/')
    ? withoutDigest.slice(withoutDigest.lastIndexOf('/') + 1)
    : withoutDigest
  return lastSegment.includes(':')
}

export function splitImageReference(
  image: string,
): [string, string | null, string | null] {
  let text = image.trim()
  let digest: string | null = null
  if (text.includes('@')) {
    const at = text.indexOf('@')
    digest = text.slice(at + 1)
    text = text.slice(0, at)
  }
  const lastSlash = text.lastIndexOf('/')
  const lastColon = text.lastIndexOf(':')
  if (lastColon > lastSlash) {
    return [text.slice(0, lastColon), text.slice(lastColon + 1), digest]
  }
  return [text, null, digest]
}

export function isExplicitVersionTag(tag: string): boolean {
  return EXPLICIT_VERSION_TAG_RE.test(tag.trim())
}

export function isFloatingTag(tag: string): boolean {
  const normalized = tag.trim().toLowerCase()
  if (FLOATING_ALIAS_TAGS.has(normalized)) return true
  return FLOATING_NUMERIC_TAG_RE.test(normalized)
}

function versionSortKey(tag: string): [number, number, number, number, string] {
  const match = EXPLICIT_VERSION_TAG_RE.exec(tag.trim())
  if (!match || !match.groups) {
    throw new Error(`not an explicit version tag: ${tag}`)
  }
  const suffix = match.groups.suffix || ''
  const isStable = suffix ? 0 : 1
  return [
    Number(match.groups.major),
    Number(match.groups.minor),
    Number(match.groups.patch),
    isStable,
    suffix,
  ]
}

function compareVersionKey(
  a: [number, number, number, number, string],
  b: [number, number, number, number, string],
): number {
  for (let i = 0; i < 4; i++) {
    if (a[i] !== b[i]) return (a[i] as number) - (b[i] as number)
  }
  return a[4] < b[4] ? -1 : a[4] > b[4] ? 1 : 0
}

export function selectBestVersionTag(tags: readonly string[]): string {
  const explicitTags = tags.filter((tag) => isExplicitVersionTag(tag))
  if (explicitTags.length === 0) {
    throw new Error('no explicit version tags available')
  }
  return explicitTags.reduce((best, tag) =>
    compareVersionKey(versionSortKey(tag), versionSortKey(best)) > 0 ? tag : best,
  )
}

export function requireCraneBinary(): string {
  const craneBin = which('crane')
  if (!craneBin) {
    throw new Error(
      'crane is required to resolve floating image tags but was not found in PATH',
    )
  }
  return craneBin
}

export function runCraneCommand(craneBin: string, args: readonly string[]): string {
  const command = [craneBin, ...args]
  try {
    return execFileSync(craneBin, [...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (error) {
    const err = error as { stderr?: string; stdout?: string; message?: string }
    const detail =
      (err.stderr || '').trim() || (err.stdout || '').trim() || err.message || 'unknown error'
    throw new Error(`crane command failed (${command.join(' ')}): ${detail}`)
  }
}

export function resolveImageReference(
  image: string,
  options: {
    digestCache?: Record<string, string>
    tagCache?: Record<string, string[]>
  } = {},
): string {
  const [repository, tag, digest] = splitImageReference(image)
  if (digest) return image.trim()
  if (!repository || !tag) return image.trim()
  if (isExplicitVersionTag(tag)) return image.trim()
  if (!isFloatingTag(tag)) return image.trim()

  const digestCache = options.digestCache ?? {}
  const tagCache = options.tagCache ?? {}
  const craneBin = requireCraneBinary()

  const sourceImage = `${repository}:${tag}`
  let sourceDigest = digestCache[sourceImage]
  if (sourceDigest === undefined) {
    sourceDigest = runCraneCommand(craneBin, ['digest', sourceImage])
    digestCache[sourceImage] = sourceDigest
  }

  let tags = tagCache[repository]
  if (tags === undefined) {
    const tagsOutput = runCraneCommand(craneBin, ['ls', repository])
    tags = tagsOutput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    tagCache[repository] = tags
  }

  const candidateTags = tags.filter((candidate) => isExplicitVersionTag(candidate))
  const matchedTags: string[] = []
  for (const candidateTag of candidateTags) {
    const candidateImage = `${repository}:${candidateTag}`
    let candidateDigest = digestCache[candidateImage]
    if (candidateDigest === undefined) {
      try {
        candidateDigest = runCraneCommand(craneBin, ['digest', candidateImage])
      } catch {
        continue
      }
      digestCache[candidateImage] = candidateDigest
    }
    if (candidateDigest === sourceDigest) {
      matchedTags.push(candidateTag)
    }
  }

  if (matchedTags.length > 0) {
    const bestTag = selectBestVersionTag(matchedTags)
    return `${repository}:${bestTag}`
  }

  return `${repository}@${sourceDigest}`
}

export function imageRepositoryBasename(image: string): string {
  let reference = image.trim()
  if (reference.includes('@')) {
    reference = reference.slice(0, reference.indexOf('@'))
  }
  const slashIndex = reference.lastIndexOf('/')
  const colonIndex = reference.lastIndexOf(':')
  if (colonIndex > slashIndex) {
    reference = reference.slice(0, colonIndex)
  }
  const parts = reference.split('/')
  return parts[parts.length - 1].toLowerCase()
}

export function detectDbType(image: string): string | null {
  const repositoryBasename = imageRepositoryBasename(image)
  for (const [dbType, patterns] of Object.entries(DB_TYPE_PATTERNS)) {
    if (patterns.includes(repositoryBasename)) {
      return dbType
    }
  }
  return null
}

function matchesGatewayHint(text: string, hints: readonly string[]): boolean {
  const normalized = text.trim().toLowerCase()
  if (!normalized) return false
  return hints.some((hint) => normalized.includes(hint))
}

export function isPlatformEdgeGatewayService(
  serviceName: string,
  service: Record<string, unknown>,
  image: string,
): boolean {
  if (
    !matchesGatewayHint(serviceName, EDGE_GATEWAY_SERVICE_HINTS) &&
    !matchesGatewayHint(image, EDGE_GATEWAY_IMAGE_HINTS)
  ) {
    return false
  }

  const ports = parsePorts(service)
  if (ports.some((port) => EDGE_GATEWAY_PORT_HINTS.has(port))) {
    return true
  }

  const commandArgs = parseCommandArgs(service)
  const merged = commandArgs.join(' ').toLowerCase()
  if (matchesGatewayHint(merged, EDGE_GATEWAY_COMMAND_HINTS)) {
    return true
  }
  return false
}

function resolveComposeVariableExpression(expr: string): string {
  if (expr.includes(':-')) {
    const idx = expr.indexOf(':-')
    const varName = expr.slice(0, idx)
    const defaultValue = expr.slice(idx + 2)
    const value = process.env[varName]
    return value ? value : defaultValue
  }
  if (expr.includes('-')) {
    const idx = expr.indexOf('-')
    const varName = expr.slice(0, idx)
    const defaultValue = expr.slice(idx + 1)
    const value = process.env[varName]
    return value !== undefined ? value : defaultValue
  }
  if (expr.includes(':?')) {
    const idx = expr.indexOf(':?')
    const varName = expr.slice(0, idx)
    const message = expr.slice(idx + 2)
    const value = process.env[varName]
    if (value) return value
    throw new Error(message || `${varName} is required`)
  }
  if (expr.includes('?')) {
    const idx = expr.indexOf('?')
    const varName = expr.slice(0, idx)
    const message = expr.slice(idx + 1)
    const value = process.env[varName]
    if (value !== undefined) return value
    throw new Error(message || `${varName} is required`)
  }
  if (expr.includes(':+')) {
    const idx = expr.indexOf(':+')
    const varName = expr.slice(0, idx)
    const alternate = expr.slice(idx + 2)
    const value = process.env[varName]
    return value ? alternate : ''
  }
  if (expr.includes('+')) {
    const idx = expr.indexOf('+')
    const varName = expr.slice(0, idx)
    const alternate = expr.slice(idx + 1)
    const value = process.env[varName]
    return value !== undefined ? alternate : ''
  }
  const varName = expr.trim()
  const value = process.env[varName]
  if (value === undefined) {
    throw new Error(`environment variable ${varName} is required to resolve image`)
  }
  return value
}

export function resolveComposeValue(raw: string): string {
  let result = raw.replace(COMPOSE_BRACED_VAR_RE, (_match, expr: string) =>
    resolveComposeVariableExpression(expr),
  )
  result = result.replace(COMPOSE_SIMPLE_VAR_RE, (_match, varName: string) => {
    const value = process.env[varName]
    if (value === undefined) {
      throw new Error(`environment variable ${varName} is required to resolve image`)
    }
    return value
  })
  return result
}

export function normalizeImageReference(rawImage: string, serviceName: string): string {
  const text = rawImage.trim()
  if (!text) {
    throw new Error(`service ${JSON.stringify(serviceName)} must define image`)
  }
  if (!text.includes('$')) return text
  let resolved: string
  try {
    resolved = resolveComposeValue(text).trim()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `service ${JSON.stringify(serviceName)} image interpolation cannot be resolved: ${message}`,
    )
  }
  if (!resolved) {
    throw new Error(
      `service ${JSON.stringify(serviceName)} image interpolation resolved to an empty value`,
    )
  }
  if (resolved.includes('$') || resolved.includes('${')) {
    throw new Error(
      `service ${JSON.stringify(serviceName)} image interpolation resolved incompletely: ${resolved}`,
    )
  }
  return resolved
}

export function parseCompose(composePath: string): Record<string, unknown> {
  const data = parse(readFileSync(composePath, 'utf8'))
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('compose file must be a YAML object')
  }
  const services = (data as Record<string, unknown>).services
  if (!services || typeof services !== 'object' || Array.isArray(services) || Object.keys(services).length === 0) {
    throw new Error('compose file must contain a non-empty services map')
  }
  return data as Record<string, unknown>
}

export function inferAppName(composeData: Record<string, unknown>, composePath: string): string {
  const composeName = composeData.name
  if (typeof composeName === 'string' && composeName.trim()) {
    return normalizeK8sName(composeName)
  }
  const stem = basename(composePath).replace(/\.[^.]+$/, '')
  return normalizeK8sName(stem)
}

export function normalizeCategory(raw: string): string {
  const value = raw.trim().toLowerCase().replace(INVALID_NAME_RE, '-').replace(/^-+|-+$/g, '')
  if (!value) return ''
  return CATEGORY_ALIASES[value] ?? value
}

export function normalizeCategories(values: readonly string[]): string[] {
  const categories: string[] = []
  for (const item of values) {
    if (typeof item !== 'string') continue
    const normalized = normalizeCategory(item)
    if (!ALLOWED_TEMPLATE_CATEGORIES.has(normalized)) continue
    if (categories.includes(normalized)) continue
    categories.push(normalized)
  }
  if (categories.length === 0) return ['tool']
  return categories
}

export function inferMetadata(
  opts: CliOptions,
  composeData: Record<string, unknown>,
  composePath: string,
): MetadataOptions {
  const appName = opts.appName
    ? normalizeK8sName(opts.appName)
    : inferAppName(composeData, composePath)
  const title = opts.title || appName.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  const description =
    opts.description || `Generated Sealos template for ${title} from Docker Compose.`
  const url = opts.url || `https://example.com/${appName}`
  const gitRepo = opts.gitRepo || `https://github.com/example/${appName}`
  const categories = normalizeCategories(opts.category.length > 0 ? opts.category : ['tool'])
  return {
    appName,
    title,
    description,
    url,
    gitRepo,
    author: opts.author,
    categories,
    repoRawBase: opts.repoRawBase.replace(/\/+$/, ''),
    logoExt: 'png',
  }
}

export function buildZhDescription(title: string, description: string): string {
  const raw = description.trim().replace(/\s+/g, ' ')
  if (raw && ZH_CHAR_RE.test(raw)) return raw
  const rewritten = rewriteEnglishDescriptionToZh(raw)
  if (rewritten) return rewritten
  if (raw) return `${title} 的 Sealos 模板，提供 ${title} 应用的部署能力。`
  return `${title} 的 Sealos 模板。`
}

export function rewriteEnglishDescriptionToZh(description: string): string {
  let normalized = description.trim().replace(/\.+$/, '')
  if (!normalized) return ''
  const lowered = normalized.toLowerCase()

  for (const [pattern, rewritten] of EN_DESCRIPTION_REWRITE_PATTERNS) {
    if (pattern.test(lowered)) {
      return `${rewritten}。`
    }
  }

  let translated = lowered
  for (const [source, target] of EN_DESCRIPTION_TERM_REPLACEMENTS) {
    const re = new RegExp(`\\b${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
    translated = translated.replace(re, target)
  }
  translated = translated.replace(/\s+/g, ' ').replace(/^[ ,;]+|[ ,;]+$/g, '')
  translated = translated.replace(/,/g, '，').replace(/;/g, '；').replace(/:/g, '：')
  translated = translated.replace(/\s*，\s*/g, '，')
  translated = translated.replace(/\s*；\s*/g, '；')
  translated = translated.replace(/\s*：\s*/g, '：')
  translated = translated.replace(/\s+/g, ' ').trim()
  if (!translated || !ZH_CHAR_RE.test(translated)) return ''
  if (/[。！？]$/.test(translated)) return translated
  return `${translated}。`
}

export function parseEnv(service: Record<string, unknown>): Array<[string, string]> {
  const env = service.environment
  const result: Array<[string, string]> = []
  if (env && typeof env === 'object' && !Array.isArray(env)) {
    for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
      result.push([String(key), value === null || value === undefined ? '' : String(value)])
    }
    return result
  }
  if (Array.isArray(env)) {
    for (const item of env) {
      if (typeof item === 'string') {
        if (item.includes('=')) {
          const eq = item.indexOf('=')
          result.push([item.slice(0, eq), item.slice(eq + 1)])
        } else {
          result.push([item, ''])
        }
      } else if (item && typeof item === 'object' && !Array.isArray(item)) {
        for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
          result.push([String(key), value === null || value === undefined ? '' : String(value)])
        }
      }
    }
  }
  return result
}

export function parseContainerPort(item: unknown): number | null {
  if (typeof item === 'number' && Number.isInteger(item)) return item
  if (typeof item === 'string') {
    let text = item.trim()
    if (!text) return null
    if (text.includes('/')) text = text.split('/', 1)[0]
    if (text.includes(':')) text = text.slice(text.lastIndexOf(':') + 1)
    if (text.includes('-')) text = text.split('-', 1)[0]
    return /^\d+$/.test(text) ? Number(text) : null
  }
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const target = (item as Record<string, unknown>).target
    if (typeof target === 'number' && Number.isInteger(target)) return target
    if (typeof target === 'string' && /^\d+$/.test(target)) return Number(target)
  }
  return null
}

function textHasWebsocketHint(value: unknown): boolean {
  const normalized = String(value).toLowerCase()
  return WEBSOCKET_VALUE_HINTS.some((hint) => normalized.includes(hint))
}

function fieldHasWebsocketHint(value: unknown): boolean {
  const normalized = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!normalized) return false
  const tokens = new Set(normalized.split('-'))
  const hintSet = new Set(WEBSOCKET_FIELD_HINTS)
  return (
    WEBSOCKET_FIELD_HINTS.some((hint) => normalized.includes(hint)) ||
    [...tokens].some((token) => hintSet.has(token as (typeof WEBSOCKET_FIELD_HINTS)[number]))
  )
}

function* iterComposeValues(value: unknown): Generator<unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      yield key
      yield item
      yield* iterComposeValues(item)
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      yield item
      yield* iterComposeValues(item)
    }
  } else {
    yield value
  }
}

export function parsePortName(item: unknown): string | null {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const obj = item as Record<string, unknown>
    for (const key of ['name', 'app_protocol', 'appProtocol', 'protocol']) {
      const value = obj[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }
  return null
}

export function isPortWebsocket(item: unknown): boolean {
  const name = parsePortName(item)
  if (name && (fieldHasWebsocketHint(name) || textHasWebsocketHint(name))) return true
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const obj = item as Record<string, unknown>
    for (const key of ['app_protocol', 'appProtocol', 'protocol']) {
      const value = obj[key]
      if (typeof value === 'string' && textHasWebsocketHint(value)) return true
    }
  }
  return false
}

export function parsePorts(service: Record<string, unknown>): number[] {
  const ports = service.ports
  if (!Array.isArray(ports)) return []
  const values: number[] = []
  const seen = new Set<number>()
  for (const item of ports) {
    const port = parseContainerPort(item)
    if (port === null || seen.has(port)) continue
    seen.add(port)
    values.push(port)
  }
  return values
}

export function inferWebsocketPorts(service: Record<string, unknown>): Set<number> {
  const websocketPorts = new Set<number>()
  const ports = service.ports
  if (Array.isArray(ports)) {
    for (const item of ports) {
      const port = parseContainerPort(item)
      if (port !== null && isPortWebsocket(item)) websocketPorts.add(port)
    }
  }

  const expose = service.expose
  if (Array.isArray(expose)) {
    for (const item of expose) {
      const port = parseContainerPort(item)
      if (port !== null && isPortWebsocket(item)) websocketPorts.add(port)
    }
  }

  for (const [key, value] of parseEnv(service)) {
    if ((fieldHasWebsocketHint(key) || textHasWebsocketHint(value)) && /^\d+$/.test(value)) {
      websocketPorts.add(Number(value))
    }
  }

  return websocketPorts
}

export function serviceRequiresWebsocketIngress(
  serviceName: string,
  service: Record<string, unknown>,
  selectedPort: number,
): boolean {
  const websocketPorts = inferWebsocketPorts(service)
  if (websocketPorts.has(selectedPort)) return true
  if (fieldHasWebsocketHint(serviceName)) return true
  for (const [key, value] of parseEnv(service)) {
    if (fieldHasWebsocketHint(key) || textHasWebsocketHint(value)) return true
  }
  for (const value of iterComposeValues({
    labels: service.labels,
    command: service.command,
    entrypoint: service.entrypoint,
  })) {
    if (textHasWebsocketHint(value) || fieldHasWebsocketHint(value)) return true
  }
  return false
}

export function normalizePortsForGatewayTlsTermination(ports: readonly number[]): number[] {
  let normalized = [...ports]
  if (
    normalized.includes(TLS_TERMINATION_PORT) &&
    normalized.some((port) => port !== TLS_TERMINATION_PORT)
  ) {
    normalized = normalized.filter((port) => port !== TLS_TERMINATION_PORT)
  }
  return normalized
}

export function parseMountTargetFromString(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null
  const parts = text.split(':')
  let target: string
  if (parts.length === 1) {
    return parts[0].startsWith('/') ? parts[0] : null
  }
  if (parts.length >= 3 && MODE_SUFFIXES.has(parts[parts.length - 1])) {
    target = parts[parts.length - 2]
  } else {
    target = parts[parts.length - 1]
  }
  return target.startsWith('/') ? target : null
}

export function isPersistentMountTarget(target: string): boolean {
  if (!target.startsWith('/')) return false
  return !target.toLowerCase().endsWith('.sock')
}

export function isTlsCertificateMountTarget(target: string): boolean {
  const normalized = target.trim().replace(/\/+$/, '').toLowerCase()
  if (!normalized) return false
  if (TLS_CERT_MOUNT_EXACT_PATHS.has(normalized)) return true
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0) return false
  return TLS_CERT_DIR_NAMES.has(parts[parts.length - 1])
}

export function parseMountPaths(service: Record<string, unknown>): string[] {
  const volumes = service.volumes
  if (!Array.isArray(volumes)) return []
  const paths: string[] = []
  const seen = new Set<string>()
  for (const item of volumes) {
    let target: string | null = null
    if (typeof item === 'string') {
      target = parseMountTargetFromString(item)
    } else if (item && typeof item === 'object' && !Array.isArray(item)) {
      const rawTarget = (item as Record<string, unknown>).target
      if (typeof rawTarget === 'string' && rawTarget.startsWith('/')) {
        target = rawTarget
      }
    }
    if (
      target &&
      isPersistentMountTarget(target) &&
      !isTlsCertificateMountTarget(target) &&
      !seen.has(target)
    ) {
      seen.add(target)
      paths.push(target)
    }
  }
  return paths
}

function resolveConfigFilePath(rawPath: unknown, composeDir: string): string | null {
  if (typeof rawPath !== 'string' || !rawPath.trim()) return null
  let path = rawPath.trim()
  if (!isAbsolute(path)) {
    path = join(composeDir, path)
  }
  try {
    const resolved = resolve(path)
    if (!statSync(resolved).isFile()) return null
    return resolved
  } catch {
    return null
  }
}

function rootConfigFileSources(
  composeData: Record<string, unknown>,
  composeDir: string,
): Record<string, string> {
  const configs = composeData.configs
  if (!configs || typeof configs !== 'object' || Array.isArray(configs)) return {}
  const sources: Record<string, string> = {}
  for (const [name, config] of Object.entries(configs as Record<string, unknown>)) {
    let sourcePath: string | null = null
    if (config && typeof config === 'object' && !Array.isArray(config)) {
      sourcePath = resolveConfigFilePath(
        (config as Record<string, unknown>).file,
        composeDir,
      )
    } else if (typeof config === 'string') {
      sourcePath = resolveConfigFilePath(config, composeDir)
    }
    if (sourcePath !== null) sources[name] = sourcePath
  }
  return sources
}

export function parseConfigMounts(
  service: Record<string, unknown>,
  composeData: Record<string, unknown>,
  composeDir: string,
): ConfigMount[] {
  const serviceConfigs = service.configs
  if (!Array.isArray(serviceConfigs)) return []
  const fileSources = rootConfigFileSources(composeData, composeDir)
  const mounts: ConfigMount[] = []
  const seenTargets = new Set<string>()
  for (const item of serviceConfigs) {
    let sourceName: string | null = null
    let target: string | null = null
    if (typeof item === 'string') {
      sourceName = item
    } else if (item && typeof item === 'object' && !Array.isArray(item)) {
      const obj = item as Record<string, unknown>
      const rawSource = obj.source || obj.config
      const rawTarget = obj.target
      if (typeof rawSource === 'string') sourceName = rawSource
      if (typeof rawTarget === 'string' && rawTarget.startsWith('/')) target = rawTarget
    }
    if (!sourceName) continue
    const sourceFile = fileSources[sourceName]
    if (sourceFile === undefined) continue
    if (target === null) target = `/${sourceName}`
    if (!target.startsWith('/') || seenTargets.has(target)) continue
    seenTargets.add(target)
    mounts.push({
      target,
      key: pathToVnName(target),
      content: readFileSync(sourceFile, 'utf8'),
    })
  }
  return mounts
}

export function parseCommandArgs(service: Record<string, unknown>): string[] {
  const command = service.command
  if (typeof command === 'string') {
    const text = command.trim()
    if (!text) return []
    try {
      return shlexSplit(text)
    } catch {
      return [text]
    }
  }
  if (Array.isArray(command)) {
    return command
      .filter((item) => item !== null && item !== undefined && String(item).trim())
      .map((item) => String(item))
  }
  return []
}

export function parseComposeDurationSeconds(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Math.max(1, Math.ceil(raw))
  }
  if (typeof raw !== 'string') return null
  const text = raw.trim().toLowerCase()
  if (!text) return null
  if (/^\d+$/.test(text)) return Math.max(1, Number(text))

  const unitToSeconds: Record<string, number> = {
    ns: 1e-9,
    us: 1e-6,
    ms: 1e-3,
    s: 1.0,
    m: 60.0,
    h: 3600.0,
  }
  let totalSeconds = 0.0
  let cursor = 0
  const re = new RegExp(COMPOSE_DURATION_PART_RE.source, 'g')
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index !== cursor) return null
    const value = Number(match[1])
    const unit = match[2]
    totalSeconds += value * unitToSeconds[unit]
    cursor = match.index + match[0].length
  }
  if (cursor !== text.length) return null
  return Math.max(1, Math.ceil(totalSeconds))
}

export function buildProbeTimingFields(
  healthcheck: Record<string, unknown>,
): Record<string, number> {
  const interval = parseComposeDurationSeconds(healthcheck.interval)
  const timeout = parseComposeDurationSeconds(healthcheck.timeout)
  const startPeriod = parseComposeDurationSeconds(healthcheck.start_period)

  const retriesRaw = healthcheck.retries
  let retries: number | null = null
  if (typeof retriesRaw === 'number' && Number.isInteger(retriesRaw)) {
    retries = retriesRaw
  } else if (typeof retriesRaw === 'string' && /^\d+$/.test(retriesRaw.trim())) {
    retries = Number(retriesRaw.trim())
  }

  return {
    initialDelaySeconds: Math.max(1, startPeriod || 10),
    periodSeconds: Math.max(1, interval || 10),
    timeoutSeconds: Math.max(1, timeout || 5),
    failureThreshold: Math.max(1, retries || 3),
  }
}

export function parseComposeHealthcheckCommand(
  healthcheck: Record<string, unknown>,
): string[] | null {
  const test = healthcheck.test
  if (typeof test === 'string') {
    const value = test.trim()
    if (!value) return null
    if (value.toUpperCase() === 'NONE') return []
    return ['sh', '-c', value]
  }
  if (Array.isArray(test)) {
    const tokens = test.map((item) => String(item).trim()).filter(Boolean)
    if (tokens.length === 0) return null
    const mode = tokens[0].toUpperCase()
    if (mode === 'NONE') return []
    if (mode === 'CMD') return tokens.slice(1)
    if (mode === 'CMD-SHELL') {
      const shell = tokens.slice(1).join(' ').trim()
      if (!shell) return null
      return ['sh', '-c', shell]
    }
    return tokens
  }
  return null
}

export function extractHttpGetActionFromCommand(
  command: readonly string[],
  ports: readonly number[],
): Record<string, unknown> | null {
  const merged = command.join(' ')
  const urlMatch = URL_IN_COMMAND_RE.exec(merged)
  if (!urlMatch) return null
  let parsed: URL
  try {
    parsed = new URL(urlMatch[0])
  } catch {
    return null
  }
  let scheme = (parsed.protocol.replace(':', '') || 'HTTP').toUpperCase()
  if (scheme !== 'HTTP' && scheme !== 'HTTPS') scheme = 'HTTP'
  let path = parsed.pathname || '/'
  if (parsed.search) path = `${path}${parsed.search}`
  let port = parsed.port
    ? Number(parsed.port)
    : scheme === 'HTTPS'
      ? 443
      : 80
  if (
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
    ports.length > 0
  ) {
    if (!ports.includes(port)) port = ports[0]
  }
  return {
    httpGet: {
      path,
      port,
      scheme,
    },
  }
}

export function buildProbePairFromComposeHealthcheck(
  service: Record<string, unknown>,
  ports: readonly number[],
): Record<string, unknown> {
  const healthcheck = service.healthcheck
  if (!healthcheck || typeof healthcheck !== 'object' || Array.isArray(healthcheck)) {
    return {}
  }
  const hc = healthcheck as Record<string, unknown>
  const command = parseComposeHealthcheckCommand(hc)
  if (command === null) return {}
  if (command.length === 0) return {}

  let action = extractHttpGetActionFromCommand(command, ports)
  if (action === null) {
    action = { exec: { command: [...command] } }
  }
  const timing = buildProbeTimingFields(hc)
  const liveness = { ...action, ...timing }
  const readiness = { ...action, ...timing }
  const result: Record<string, unknown> = {
    livenessProbe: liveness,
    readinessProbe: readiness,
  }
  const startPeriod = parseComposeDurationSeconds(hc.start_period)
  if (startPeriod && startPeriod > 0) {
    const period = Number(timing.periodSeconds ?? 10)
    const startup = {
      ...action,
      periodSeconds: Math.max(1, period),
      timeoutSeconds: Number(timing.timeoutSeconds ?? 5),
      failureThreshold: Math.max(1, Math.ceil(startPeriod / Math.max(1, period))),
    }
    result.startupProbe = startup
  }
  return result
}

export function isWorkerCommand(commandArgs: readonly string[]): boolean {
  if (commandArgs.length === 0) return false
  return String(commandArgs[0]).trim().toLowerCase() === 'worker'
}

export function pickProbePort(ports: readonly number[], preferredPort: number): number {
  if (ports.includes(preferredPort)) return preferredPort
  if (ports.length > 0) return ports[0]
  return preferredPort
}

export function buildProbePairFromOfficialProfile(
  image: string,
  ports: readonly number[],
  commandArgs: readonly string[],
): Record<string, unknown> {
  const imageLower = image.trim().toLowerCase()

  for (const [marker, profile] of Object.entries(OFFICIAL_HEALTH_WORKER_PROFILES)) {
    if (imageLower.includes(marker) && isWorkerCommand(commandArgs)) {
      const action = { exec: { command: [...profile.command] } }
      const startupAction = {
        exec: { command: [...(profile.startup_command ?? profile.command)] },
      }
      const timing = {
        initialDelaySeconds: profile.initialDelaySeconds,
        periodSeconds: profile.periodSeconds,
        timeoutSeconds: profile.timeoutSeconds,
        failureThreshold: profile.failureThreshold,
      }
      return {
        livenessProbe: { ...action, ...timing },
        readinessProbe: { ...action, ...timing },
        startupProbe: {
          ...startupAction,
          periodSeconds: profile.startupPeriodSeconds,
          timeoutSeconds: profile.startupTimeoutSeconds,
          failureThreshold: profile.startupFailureThreshold,
        },
      }
    }
  }

  for (const [marker, profile] of Object.entries(OFFICIAL_HEALTH_HTTP_PROFILES)) {
    if (!imageLower.includes(marker)) continue
    const port = pickProbePort(ports, profile.preferred_port)
    const timing = {
      initialDelaySeconds: profile.initialDelaySeconds,
      periodSeconds: profile.periodSeconds,
      timeoutSeconds: profile.timeoutSeconds,
      failureThreshold: profile.failureThreshold,
    }
    return {
      livenessProbe: {
        httpGet: {
          path: profile.liveness_path,
          port,
          scheme: profile.scheme,
        },
        ...timing,
      },
      readinessProbe: {
        httpGet: {
          path: profile.readiness_path,
          port,
          scheme: profile.scheme,
        },
        ...timing,
      },
      startupProbe: {
        httpGet: {
          path: profile.startup_path,
          port,
          scheme: profile.scheme,
        },
        periodSeconds: profile.startupPeriodSeconds,
        timeoutSeconds: profile.startupTimeoutSeconds,
        failureThreshold: profile.startupFailureThreshold,
      },
    }
  }

  return {}
}

export function buildProbePair(
  service: Record<string, unknown>,
  image: string,
  ports: readonly number[],
  commandArgs: readonly string[],
): Record<string, unknown> {
  const fromCompose = buildProbePairFromComposeHealthcheck(service, ports)
  if (Object.keys(fromCompose).length > 0) return fromCompose
  return buildProbePairFromOfficialProfile(image, ports, commandArgs)
}

function extractShapeFromKomposeDoc(
  doc: Record<string, unknown>,
): [string, ServiceShape] | null {
  const kind = doc.kind
  if (kind !== 'Deployment' && kind !== 'StatefulSet' && kind !== 'DaemonSet') {
    return null
  }
  const metadata = doc.metadata
  const name =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).name
      : null
  if (typeof name !== 'string' || !name.trim()) return null

  const spec = doc.spec
  const template =
    spec && typeof spec === 'object' && !Array.isArray(spec)
      ? (spec as Record<string, unknown>).template
      : null
  const templateSpec =
    template && typeof template === 'object' && !Array.isArray(template)
      ? (template as Record<string, unknown>).spec
      : null
  const containers =
    templateSpec && typeof templateSpec === 'object' && !Array.isArray(templateSpec)
      ? (templateSpec as Record<string, unknown>).containers
      : null
  if (!Array.isArray(containers) || containers.length === 0) return null
  const first =
    containers[0] && typeof containers[0] === 'object' && !Array.isArray(containers[0])
      ? (containers[0] as Record<string, unknown>)
      : null
  if (!first) return null

  const portsRaw = first.ports
  const ports: number[] = []
  const seenPorts = new Set<number>()
  if (Array.isArray(portsRaw)) {
    for (const item of portsRaw) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const containerPort = (item as Record<string, unknown>).containerPort
      if (typeof containerPort === 'number' && !seenPorts.has(containerPort)) {
        seenPorts.add(containerPort)
        ports.push(containerPort)
      }
    }
  }

  const mountsRaw = first.volumeMounts
  const mounts: string[] = []
  const seenMounts = new Set<string>()
  if (Array.isArray(mountsRaw)) {
    for (const item of mountsRaw) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const mountPath = (item as Record<string, unknown>).mountPath
      if (
        typeof mountPath === 'string' &&
        mountPath.startsWith('/') &&
        !seenMounts.has(mountPath)
      ) {
        seenMounts.add(mountPath)
        mounts.push(mountPath)
      }
    }
  }

  return [normalizeK8sName(name), { ports, mountPaths: mounts }]
}

export function loadServiceShapesWithKompose(
  composePath: string,
  required: boolean,
): Record<string, ServiceShape> | null {
  const komposeBin = which('kompose')
  if (!komposeBin) {
    if (required) throw new Error('kompose is required but not found in PATH')
    return null
  }

  const workdir = mkdtempSync(join(tmpdir(), 'compose-to-template-'))
  try {
    try {
      execFileSync(komposeBin, ['convert', '-f', composePath], {
        cwd: workdir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      if (required) {
        const err = error as { stderr?: string; stdout?: string; message?: string }
        const detail =
          (err.stderr || '').trim() ||
          (err.stdout || '').trim() ||
          err.message ||
          'unknown error'
        throw new Error(`kompose convert failed: ${detail}`)
      }
      return null
    }

    const shapes: Record<string, ServiceShape> = {}
    const files = readdirSync(workdir)
      .filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'))
      .sort()
    for (const file of files) {
      const text = readFileSync(join(workdir, file), 'utf8')
      for (const document of parseAllDocuments(text)) {
        const doc = document.toJSON()
        if (!doc || typeof doc !== 'object' || Array.isArray(doc)) continue
        const extracted = extractShapeFromKomposeDoc(doc as Record<string, unknown>)
        if (!extracted) continue
        const [key, shape] = extracted
        if (!(key in shapes)) shapes[key] = shape
      }
    }

    if (required && Object.keys(shapes).length === 0) {
      throw new Error('kompose produced no workload manifests')
    }
    return shapes
  } finally {
    rmSync(workdir, { recursive: true, force: true })
  }
}

export function resolveKomposeShapes(
  composePath: string,
  mode: string,
): Record<string, ServiceShape> | null {
  if (mode === 'never') return null
  if (mode === 'always') return loadServiceShapesWithKompose(composePath, true)
  if (mode === 'auto') return loadServiceShapesWithKompose(composePath, false)
  throw new Error(`unsupported kompose mode: ${mode}`)
}

export function buildTemplateResource(meta: MetadataOptions): Record<string, unknown> {
  const readmeBase = `${TEMPLATE_README_BASE}/${meta.appName}`
  return {
    apiVersion: 'app.sealos.io/v1',
    kind: 'Template',
    metadata: { name: meta.appName },
    spec: {
      title: meta.title,
      url: meta.url,
      gitRepo: meta.gitRepo,
      author: meta.author,
      description: meta.description,
      readme: `${readmeBase}/README.md`,
      icon: `${meta.repoRawBase}/template/${meta.appName}/logo.${meta.logoExt}`,
      templateType: 'inline',
      locale: 'en',
      i18n: {
        zh: {
          description: buildZhDescription(meta.title, meta.description),
          readme: `${readmeBase}/README_zh.md`,
        },
      },
      categories: [...meta.categories],
      defaults: {
        app_host: {
          type: 'string',
          value: `${meta.appName}-\${{ random(8) }}`,
        },
        app_name: {
          type: 'string',
          value: `${meta.appName}-\${{ random(8) }}`,
        },
      },
    },
  }
}

export function mapComposeEnvValue(
  value: string,
  dbHosts: Record<string, string>,
): string {
  if (typeof value !== 'string') return String(value)
  if (COMPOSE_REFERENCE_RE.test(value)) return value
  if (value in dbHosts) return dbHosts[value]
  let mapped = value
  for (const [serviceName, fqdn] of Object.entries(dbHosts)) {
    mapped = mapped.replaceAll(`@${serviceName}:`, `@${fqdn}:`)
    mapped = mapped.replaceAll(`//${serviceName}:`, `//${fqdn}:`)
  }
  return mapped
}

export function detectDbConnectionKey(envName: string): string | null {
  const upper = envName.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
  if (/(?:^|_)(?:PASSWORD|PASS|PWD)(?:$|_)/.test(upper)) return 'password'
  if (/(?:^|_)(?:USERNAME|USER)(?:$|_)/.test(upper)) return 'username'
  if (/(?:^|_)(?:ENDPOINT|URI|URL|DSN)(?:$|_)/.test(upper)) return 'endpoint'
  if (/(?:^|_)(?:HOST|SERVER)(?:$|_)/.test(upper)) return 'host'
  if (/(?:^|_)(?:PORT)(?:$|_)/.test(upper)) return 'port'
  return null
}

export function normalizeEnvToken(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function normalizeEndpointHelperToken(value: string): string {
  const token = normalizeEnvToken(value)
  if (!token) return ''
  const filtered = token
    .split('_')
    .filter((part) => part && !['URL', 'URI', 'DSN', 'ENDPOINT'].includes(part))
  return filtered.join('_')
}

export function buildSecretRefEnvEntry(
  envName: string,
  secretName: string,
  secretKey: string,
): Record<string, unknown> {
  return {
    name: envName,
    valueFrom: {
      secretKeyRef: {
        name: secretName,
        key: secretKey,
      },
    },
  }
}

export function inferDbTypeFromValue(
  value: string,
  dbServices: Record<string, string>,
): string | null {
  const text = value.trim().toLowerCase()
  const matched: string[] = []
  for (const [serviceName, dbType] of Object.entries(dbServices)) {
    const service = serviceName.toLowerCase()
    if (text === service) {
      matched.push(dbType)
      continue
    }
    if (
      text.includes(`//${service}`) ||
      text.includes(`@${service}`) ||
      text.includes(`${service}:`)
    ) {
      matched.push(dbType)
      continue
    }
  }
  const unique = [...new Set(matched)].sort()
  if (unique.length === 1) return unique[0]
  return null
}

export function inferDbTypeFromEnvName(
  envName: string,
  availableDbTypes: readonly string[],
): string | null {
  const upper = envName.toUpperCase()
  const candidates: string[] = []
  for (const dbType of [...new Set(availableDbTypes)].sort()) {
    const hints = DB_ENV_HINTS_BY_TYPE[dbType] || []
    if (hints.some((hint) => upper.includes(hint))) {
      candidates.push(dbType)
    }
  }
  const unique = [...new Set(candidates)].sort()
  if (unique.length === 1) return unique[0]

  const deduped = [...new Set(availableDbTypes)].sort()
  if ((upper.includes('DB') || upper.includes('DATABASE')) && deduped.length === 1) {
    return deduped[0]
  }
  return null
}

export function inferDbSecretRef(
  envName: string,
  value: string,
  dbServices: Record<string, string>,
): { name: string; key: string; db_type: string } | null {
  const connectionKey = detectDbConnectionKey(envName)
  if (connectionKey === null) return null

  const availableDbTypes = Object.values(dbServices)
  if (availableDbTypes.length === 0) return null

  const fromValue = inferDbTypeFromValue(value, dbServices)
  const fromName = inferDbTypeFromEnvName(envName, availableDbTypes)
  const dbType = fromValue || fromName
  if (dbType === null) return null

  if (dbType === 'redis' && (connectionKey === 'host' || connectionKey === 'port')) {
    return null
  }

  const secretName = DB_SECRET_NAME_BY_TYPE[dbType]
  if (typeof secretName !== 'string') return null

  return { name: secretName, key: connectionKey, db_type: dbType }
}

function parseDbUrl(text: string): {
  scheme: string
  hostname: string | null
  port: number | null
  username: string | null
  password: string | null
  pathname: string
  search: string
  hash: string
  netloc: string
} | null {
  try {
    const parsed = new URL(text)
    const scheme = parsed.protocol.replace(/:$/, '')
    let password: string | null = null
    if (parsed.password !== '') {
      password = decodeURIComponent(parsed.password)
    } else if (text.includes('@') && parsed.username) {
      // URL with empty password like user:@host — Node may omit; check netloc
      const afterScheme = text.slice(scheme.length + 3)
      const atIdx = afterScheme.lastIndexOf('@')
      if (atIdx >= 0) {
        const userinfo = afterScheme.slice(0, atIdx)
        if (userinfo.includes(':')) {
          password = decodeURIComponent(userinfo.slice(userinfo.indexOf(':') + 1))
        }
      }
    }
    return {
      scheme,
      hostname: parsed.hostname || null,
      port: parsed.port ? Number(parsed.port) : null,
      username: parsed.username ? decodeURIComponent(parsed.username) : null,
      password,
      pathname: parsed.pathname || '',
      search: parsed.search ? parsed.search.slice(1) : '',
      hash: parsed.hash ? parsed.hash.slice(1) : '',
      netloc: parsed.host
        ? parsed.username
          ? `${parsed.username}${parsed.password !== '' || text.includes('@') ? `:${parsed.password}` : ''}@${parsed.host}`
          : parsed.host
        : '',
    }
  } catch {
    return null
  }
}

export function buildDbUrlComposedEnvEntries(
  envName: string,
  rawValue: string,
  secretName: string,
  dbType: string,
  dbServices: Record<string, string>,
): Record<string, unknown>[] | null {
  const text = rawValue.trim()
  COMPOSE_REFERENCE_RE.lastIndex = 0
  if (!text || COMPOSE_REFERENCE_RE.test(text)) return null
  COMPOSE_REFERENCE_RE.lastIndex = 0

  const parsed = parseDbUrl(text)
  if (!parsed) return null
  const host = (parsed.hostname || '').trim().toLowerCase()
  if (!parsed.scheme || !host || !(host in dbServices)) return null

  // Match Python: "@" in parsed.netloc
  let hasAuth = false
  try {
    const u = new URL(text)
    hasAuth = text.slice(u.protocol.length + 2).includes('@')
  } catch {
    hasAuth = text.includes('@')
  }

  const envToken = normalizeEndpointHelperToken(envName) || 'DB_CONNECTION'
  const dbToken = normalizeEnvToken(dbType) || 'DB'

  const hostVar = `SEALOS_${envToken}_${dbToken}_HOST`
  const portVar = `SEALOS_${envToken}_${dbToken}_PORT`
  const userVar = `SEALOS_${envToken}_${dbToken}_USERNAME`
  const passwordVar = `SEALOS_${envToken}_${dbToken}_PASSWORD`

  let helperEntries: Record<string, unknown>[]
  if (dbType === 'redis') {
    helperEntries = [
      { name: hostVar, value: DB_FQDN_BY_TYPE.redis },
      { name: portVar, value: '6379' },
    ]
  } else if (dbType === 'mongodb') {
    helperEntries = [
      { name: hostVar, value: DB_FQDN_BY_TYPE.mongodb },
      { name: portVar, value: '27017' },
    ]
  } else {
    helperEntries = [
      buildSecretRefEnvEntry(hostVar, secretName, 'host'),
      buildSecretRefEnvEntry(portVar, secretName, 'port'),
    ]
  }

  const hasUsername = parsed.username !== null && parsed.username !== ''
  // Python: parsed.password is not None — empty string password still counts
  let hasPassword = false
  try {
    const u = new URL(text)
    const afterScheme = text.slice(u.protocol.length + 2)
    const atIdx = afterScheme.lastIndexOf('@')
    if (atIdx >= 0) {
      const userinfo = afterScheme.slice(0, atIdx)
      hasPassword = userinfo.includes(':')
    }
  } catch {
    hasPassword = parsed.password !== null
  }

  if (hasUsername) {
    helperEntries.push(buildSecretRefEnvEntry(userVar, secretName, 'username'))
  }
  if (hasPassword) {
    helperEntries.push(buildSecretRefEnvEntry(passwordVar, secretName, 'password'))
  }

  let authPrefix = ''
  if (hasAuth) {
    if (hasUsername && hasPassword) {
      authPrefix = `$(${userVar}):$(${passwordVar})@`
    } else if (hasUsername) {
      authPrefix = `$(${userVar})@`
    } else if (hasPassword) {
      authPrefix = `:$(${passwordVar})@`
    }
  }

  let hostPort = `$(${hostVar})`
  if (parsed.port !== null || dbType === 'redis' || dbType === 'mongodb') {
    hostPort = `${hostPort}:$(${portVar})`
  }

  let suffix = parsed.pathname || ''
  if (parsed.search) suffix = `${suffix}?${parsed.search}`
  if (parsed.hash) suffix = `${suffix}#${parsed.hash}`

  const composedUrl = `${parsed.scheme}://${authPrefix}${hostPort}${suffix}`
  helperEntries.push({ name: envName, value: composedUrl })
  return helperEntries
}

export function buildEnvEntries(
  service: Record<string, unknown>,
  dbHosts: Record<string, string>,
  dbServices: Record<string, string>,
): Record<string, unknown>[] {
  const entries: Record<string, unknown>[] = []
  for (const [key, value] of parseEnv(service)) {
    const secretRef = inferDbSecretRef(key, value, dbServices)
    if (secretRef !== null) {
      if (secretRef.key === 'endpoint') {
        const composedEntries = buildDbUrlComposedEnvEntries(
          key,
          value,
          secretRef.name,
          secretRef.db_type,
          dbServices,
        )
        if (composedEntries !== null) {
          entries.push(...composedEntries)
          continue
        }
      }
      entries.push(buildSecretRefEnvEntry(key, secretRef.name, secretRef.key))
      continue
    }
    entries.push({
      name: key,
      value: mapComposeEnvValue(value, dbHosts),
    })
  }
  return entries
}

export function parseServiceReplicas(service: Record<string, unknown>): number {
  const deploy = service.deploy
  if (deploy === undefined || deploy === null) return 1
  if (!deploy || typeof deploy !== 'object' || Array.isArray(deploy)) {
    throw new Error('service deploy must be an object when provided')
  }
  const replicas = (deploy as Record<string, unknown>).replicas ?? 1
  if (typeof replicas !== 'number' || !Number.isInteger(replicas) || replicas < 1) {
    throw new Error('service deploy.replicas must be a positive integer')
  }
  return replicas
}

export function buildWorkload(options: {
  workloadName: string
  image: string
  replicas: number
  ports: readonly number[]
  websocketPorts: Set<number>
  envEntries: readonly Record<string, unknown>[]
  commandArgs: readonly string[]
  mountPaths: readonly string[]
  configMounts: readonly ConfigMount[]
  probes: Record<string, unknown>
}): Record<string, unknown> {
  const {
    workloadName,
    image,
    replicas,
    ports,
    websocketPorts,
    envEntries,
    commandArgs,
    mountPaths,
    configMounts,
    probes,
  } = options

  const dbType = detectDbType(image)
  if (dbType && SPECIAL_DB_RESOURCE_TYPES.has(dbType)) {
    throw new Error(
      `refusing to generate an application workload for ${dbType} database image ${JSON.stringify(image)}; ` +
        'database services must use KubeBlocks Cluster resources',
    )
  }

  const isStateful = mountPaths.length > 0
  const kind = isStateful ? 'StatefulSet' : 'Deployment'
  const templateSpec: Record<string, unknown> = {
    automountServiceAccountToken: false,
    containers: [
      {
        name: workloadName,
        image,
        imagePullPolicy: 'IfNotPresent',
        resources: {
          limits: { ...DEFAULT_RESOURCE_LIMITS },
          requests: { ...DEFAULT_RESOURCE_REQUESTS },
        },
      },
    ],
  }
  const container = (templateSpec.containers as Record<string, unknown>[])[0]
  if (ports.length > 0) {
    container.ports = ports.map((p) => ({
      containerPort: p,
      name: websocketPorts.has(p) ? 'websocket' : `tcp-${p}`,
    }))
  }
  if (envEntries.length > 0) {
    container.env = [...envEntries]
  }
  if (commandArgs.length > 0) {
    container.args = [...commandArgs]
  }
  if (Object.keys(probes).length > 0) {
    for (const key of ['livenessProbe', 'readinessProbe', 'startupProbe']) {
      const value = probes[key]
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        container[key] = value
      }
    }
  }
  const volumeMounts: Record<string, unknown>[] = []
  if (mountPaths.length > 0) {
    volumeMounts.push(
      ...mountPaths.map((path) => ({
        name: pathToVnName(path),
        mountPath: path,
      })),
    )
  }
  if (configMounts.length > 0) {
    volumeMounts.push(
      ...configMounts.map((mount) => ({
        name: `${workloadName}-cm`,
        mountPath: mount.target,
        subPath: mount.key,
        readOnly: true,
      })),
    )
  }
  if (volumeMounts.length > 0) {
    container.volumeMounts = volumeMounts
  }

  const spec: Record<string, unknown> = {
    replicas,
    revisionHistoryLimit: 1,
    selector: { matchLabels: { app: workloadName } },
    template: {
      metadata: { labels: { app: workloadName } },
      spec: templateSpec,
    },
  }
  if (isStateful) {
    spec.serviceName = workloadName
    spec.volumeClaimTemplates = mountPaths.map((path) => ({
      metadata: {
        name: pathToVnName(path),
        annotations: { path, value: '1' },
      },
      spec: {
        accessModes: ['ReadWriteOnce'],
        resources: { requests: { storage: '1Gi' } },
      },
    }))
  }
  if (configMounts.length > 0) {
    if (!Array.isArray(templateSpec.volumes)) templateSpec.volumes = []
    ;(templateSpec.volumes as Record<string, unknown>[]).push({
      name: `${workloadName}-cm`,
      configMap: { name: workloadName },
    })
  }

  return {
    apiVersion: 'apps/v1',
    kind,
    metadata: {
      name: workloadName,
      annotations: {
        originImageName: image,
        'deploy.cloud.sealos.io/minReplicas': String(replicas),
        'deploy.cloud.sealos.io/maxReplicas': String(replicas),
      },
      labels: {
        'cloud.sealos.io/app-deploy-manager': workloadName,
        app: workloadName,
      },
    },
    spec,
  }
}

export function buildConfigmap(
  workloadName: string,
  configMounts: readonly ConfigMount[],
): Record<string, unknown> {
  const data: Record<string, string> = {}
  for (const mount of configMounts) {
    data[mount.key] = mount.content
  }
  return {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: workloadName,
      labels: {
        app: workloadName,
        'cloud.sealos.io/app-deploy-manager': workloadName,
      },
    },
    data,
  }
}

export function buildService(
  workloadName: string,
  ports: readonly number[],
  websocketPorts: Set<number>,
): Record<string, unknown> | null {
  if (ports.length === 0) return null
  const servicePorts = ports.map((p) => ({
    name: websocketPorts.has(p) ? 'websocket' : `tcp-${p}`,
    port: p,
    targetPort: p,
    protocol: 'TCP',
  }))
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: workloadName,
      labels: {
        app: workloadName,
        'cloud.sealos.io/app-deploy-manager': workloadName,
      },
    },
    spec: {
      ports: servicePorts,
      selector: { app: workloadName },
    },
  }
}

export function buildIngress(
  primaryWorkloadName: string,
  port: number,
  protocol: string = 'HTTP',
): Record<string, unknown> {
  const annotations =
    protocol.toUpperCase() === 'WS'
      ? { ...WEBSOCKET_INGRESS_ANNOTATIONS }
      : { ...HTTP_INGRESS_ANNOTATIONS }
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name: primaryWorkloadName,
      labels: {
        'cloud.sealos.io/app-deploy-manager': primaryWorkloadName,
        'cloud.sealos.io/app-deploy-manager-domain': '${{ defaults.app_host }}',
      },
      annotations,
    },
    spec: {
      rules: [
        {
          host: '${{ defaults.app_host }}.${{ SEALOS_CLOUD_DOMAIN }}',
          http: {
            paths: [
              {
                pathType: 'Prefix',
                path: '/',
                backend: {
                  service: {
                    name: primaryWorkloadName,
                    port: { number: port },
                  },
                },
              },
            ],
          },
        },
      ],
      tls: [
        {
          hosts: ['${{ defaults.app_host }}.${{ SEALOS_CLOUD_DOMAIN }}'],
          secretName: '${{ SEALOS_CERT_SECRET_NAME }}',
        },
      ],
    },
  }
}

export function buildAppResource(meta: MetadataOptions): Record<string, unknown> {
  return {
    apiVersion: 'app.sealos.io/v1',
    kind: 'App',
    metadata: {
      name: '${{ defaults.app_name }}',
      labels: {
        'cloud.sealos.io/app-deploy-manager': '${{ defaults.app_name }}',
      },
    },
    spec: {
      data: {
        url: 'https://${{ defaults.app_host }}.${{ SEALOS_CLOUD_DOMAIN }}',
      },
      displayType: 'normal',
      icon: `${meta.repoRawBase}/template/${meta.appName}/logo.${meta.logoExt}`,
      name: meta.title,
      type: 'link',
    },
  }
}

export function* iterServices(
  composeData: Record<string, unknown>,
): Generator<[string, Record<string, unknown>]> {
  const services = composeData.services
  if (!services || typeof services !== 'object' || Array.isArray(services)) {
    throw new Error('compose services must be a map')
  }
  for (const [name, service] of Object.entries(services as Record<string, unknown>)) {
    if (service && typeof service === 'object' && !Array.isArray(service)) {
      yield [String(name), service as Record<string, unknown>]
    }
  }
}

export function validateImages(composeData: Record<string, unknown>): Record<string, string> {
  const normalizedImages: Record<string, string> = {}
  for (const [serviceName, service] of iterServices(composeData)) {
    const image = service.image
    if (typeof image !== 'string' || !image.trim()) {
      throw new Error(`service ${JSON.stringify(serviceName)} must define image`)
    }
    const normalized = normalizeImageReference(image, serviceName)
    normalizedImages[serviceName] = normalized
    if (!hasPinnedImage(normalized)) {
      throw new Error(
        `service ${JSON.stringify(serviceName)} uses unpinned image ${JSON.stringify(normalized)}; provide a fixed tag or digest`,
      )
    }
  }
  return normalizedImages
}

export function renderIndexYaml(documents: readonly Record<string, unknown>[]): string {
  const parts = documents.map((doc) =>
    stringify(doc, { lineWidth: 0, defaultKeyType: null, defaultStringType: 'PLAIN' }).trimEnd(),
  )
  return `${parts.join('\n---\n')}\n`
}

export function clusterDatabaseType(document: Record<string, unknown>): string | null {
  if (document.kind !== 'Cluster') return null
  const apiVersion = document.apiVersion
  if (typeof apiVersion !== 'string' || !apiVersion.startsWith('apps.kubeblocks.io/')) {
    return null
  }

  const metadata = document.metadata
  const labels =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).labels
      : null
  const candidates: string[] = []
  if (labels && typeof labels === 'object' && !Array.isArray(labels)) {
    for (const key of ['clusterdefinition.kubeblocks.io/name', 'kb.io/database']) {
      const value = (labels as Record<string, unknown>)[key]
      if (typeof value === 'string') candidates.push(value.trim().toLowerCase())
    }
  }

  const spec = document.spec
  const componentSpecs =
    spec && typeof spec === 'object' && !Array.isArray(spec)
      ? (spec as Record<string, unknown>).componentSpecs
      : null
  if (Array.isArray(componentSpecs)) {
    for (const component of componentSpecs) {
      if (!component || typeof component !== 'object' || Array.isArray(component)) continue
      for (const key of ['componentDef', 'componentDefRef', 'name']) {
        const value = (component as Record<string, unknown>)[key]
        if (typeof value === 'string') candidates.push(value.trim().toLowerCase())
      }
    }
  }

  for (const [dbType, patterns] of Object.entries(DB_TYPE_PATTERNS)) {
    for (const candidate of candidates) {
      if (
        patterns.some(
          (pattern) => candidate === pattern || candidate.startsWith(`${pattern}-`),
        )
      ) {
        return dbType
      }
    }
  }
  return null
}

export function validateGeneratedDatabaseContract(
  documents: readonly Record<string, unknown>[],
  dbServices: Record<string, string>,
): void {
  const expectedTypes = new Set(Object.values(dbServices))
  const actualTypes = new Set<string>()
  for (const document of documents) {
    const dbType = clusterDatabaseType(document)
    if (dbType && SPECIAL_DB_RESOURCE_TYPES.has(dbType)) actualTypes.add(dbType)
  }
  const missingTypes = [...expectedTypes].filter((t) => !actualTypes.has(t)).sort()
  if (missingTypes.length > 0) {
    throw new Error(
      'database conversion did not emit the required KubeBlocks Cluster resources for: ' +
        missingTypes.join(', '),
    )
  }

  for (const document of documents) {
    const kind = document.kind
    if (
      kind !== 'Deployment' &&
      kind !== 'StatefulSet' &&
      kind !== 'DaemonSet' &&
      kind !== 'Job' &&
      kind !== 'CronJob'
    ) {
      continue
    }
    const spec = document.spec
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) continue
    let template: unknown
    if (kind === 'CronJob') {
      const jobTemplate = (spec as Record<string, unknown>).jobTemplate
      const jobSpec =
        jobTemplate && typeof jobTemplate === 'object' && !Array.isArray(jobTemplate)
          ? (jobTemplate as Record<string, unknown>).spec
          : null
      template =
        jobSpec && typeof jobSpec === 'object' && !Array.isArray(jobSpec)
          ? (jobSpec as Record<string, unknown>).template
          : null
    } else {
      template = (spec as Record<string, unknown>).template
    }
    const templateSpec =
      template && typeof template === 'object' && !Array.isArray(template)
        ? (template as Record<string, unknown>).spec
        : null
    const containers =
      templateSpec && typeof templateSpec === 'object' && !Array.isArray(templateSpec)
        ? (templateSpec as Record<string, unknown>).containers
        : null
    if (!Array.isArray(containers)) continue
    for (const container of containers) {
      const image =
        container && typeof container === 'object' && !Array.isArray(container)
          ? (container as Record<string, unknown>).image
          : null
      const dbType = typeof image === 'string' ? detectDbType(image) : null
      if (dbType && SPECIAL_DB_RESOURCE_TYPES.has(dbType)) {
        throw new Error(
          `generated ${document.kind} contains ${dbType} database image ${JSON.stringify(image)}; ` +
            'database services must remain KubeBlocks Cluster resources',
        )
      }
    }
  }
}

export function buildDocuments(
  composeData: Record<string, unknown>,
  meta: MetadataOptions,
  komposeShapes: Record<string, ServiceShape> | null = null,
  composePath: string | null = null,
): Record<string, unknown>[] {
  const normalizedImages = validateImages(composeData)
  const serviceItems = [...iterServices(composeData)]
  if (serviceItems.length === 0) {
    throw new Error('compose file has no services')
  }

  const digestCache: Record<string, string> = {}
  const tagCache: Record<string, string[]> = {}
  const resolvedImages: Record<string, string> = {}
  for (const [serviceName, service] of serviceItems) {
    const sourceImage =
      normalizedImages[serviceName] || String(service.image || '').trim()
    if (!sourceImage) continue
    if (detectDbType(sourceImage) && SPECIAL_DB_RESOURCE_TYPES.has(detectDbType(sourceImage)!)) {
      resolvedImages[serviceName] = sourceImage
      continue
    }
    resolvedImages[serviceName] = resolveImageReference(sourceImage, {
      digestCache,
      tagCache,
    })
  }

  const dbServices: Record<string, string> = {}
  let appServices: Array<[string, Record<string, unknown>]> = []
  const gatewayServices: Array<[string, Record<string, unknown>]> = []
  for (const [name, service] of serviceItems) {
    const image = resolvedImages[name] || String(service.image || '')
    const dbType = detectDbType(image)
    if (dbType && SPECIAL_DB_RESOURCE_TYPES.has(dbType)) {
      dbServices[name] = dbType
    } else if (isPlatformEdgeGatewayService(name, service, image)) {
      gatewayServices.push([name, service])
    } else {
      appServices.push([name, service])
    }
  }

  if (appServices.length === 0) {
    if (gatewayServices.length > 0) {
      appServices = gatewayServices.slice(0, 1)
    } else if (Object.keys(dbServices).length > 0) {
      throw new Error(
        'compose contains database services but no application service; ' +
          'refusing to convert a database into an application workload',
      )
    } else {
      appServices = serviceItems.slice(0, 1)
    }
  }

  const dbHosts: Record<string, string> = {}
  for (const [name, dbType] of Object.entries(dbServices)) {
    if (dbType in DB_FQDN_BY_TYPE) dbHosts[name] = DB_FQDN_BY_TYPE[dbType]
  }

  const docs: Record<string, unknown>[] = []
  docs.push(buildTemplateResource(meta))

  const allEnvKeys = new Set<string>()
  for (const [, service] of appServices) {
    for (const [key] of parseEnv(service)) allEnvKeys.add(key)
  }
  if (
    allEnvKeys.has(OBJECT_STORAGE_BUCKET_ENV_NAME) ||
    [...OBJECT_STORAGE_BASE_ENV_NAMES].some((k) => allEnvKeys.has(k))
  ) {
    docs.push(buildObjectStorageBucket())
  }

  const orderedDbTypes: string[] = []
  for (const [serviceName] of serviceItems) {
    const dbType = dbServices[serviceName]
    if (typeof dbType !== 'string') continue
    if (orderedDbTypes.includes(dbType)) continue
    orderedDbTypes.push(dbType)
  }

  for (const dbType of orderedDbTypes) {
    docs.push(...buildDatabaseResources(dbType))
  }

  const workloadDocs: Record<string, unknown>[] = []
  const serviceDocs: Record<string, unknown>[] = []
  let primaryPort: number | null = null
  let primaryIngressProtocol = 'HTTP'
  const primaryWorkloadName = '${{ defaults.app_name }}'
  const composeDir = composePath ? dirname(composePath) : process.cwd()

  appServices.forEach(([serviceName, service], index) => {
    const workloadName =
      index === 0
        ? primaryWorkloadName
        : `\${{ defaults.app_name }}-${normalizeK8sName(serviceName)}`
    const image = resolvedImages[serviceName] || String(service.image).trim()
    let ports = parsePorts(service)
    const envEntries = buildEnvEntries(service, dbHosts, dbServices)
    const commandArgs = parseCommandArgs(service)
    let mountPaths = parseMountPaths(service)
    const configMounts = parseConfigMounts(service, composeData, composeDir)
    if (komposeShapes) {
      const shape = komposeShapes[normalizeK8sName(serviceName)]
      if (shape) {
        if (ports.length === 0) ports = [...shape.ports]
        if (mountPaths.length === 0) mountPaths = [...shape.mountPaths]
      }
    }
    ports = normalizePortsForGatewayTlsTermination(ports)
    const websocketPorts = inferWebsocketPorts(service)
    const probes = buildProbePair(service, image, ports, commandArgs)
    const workload = buildWorkload({
      workloadName,
      image,
      replicas: parseServiceReplicas(service),
      ports,
      websocketPorts,
      envEntries,
      commandArgs,
      mountPaths,
      configMounts,
      probes,
    })
    if (configMounts.length > 0) {
      workloadDocs.push(buildConfigmap(workloadName, configMounts))
    }
    workloadDocs.push(workload)
    const serviceDoc = buildService(workloadName, ports, websocketPorts)
    if (serviceDoc !== null) {
      serviceDocs.push(serviceDoc)
      if (index === 0 && ports.length > 0) {
        primaryPort = ports[0]
        if (serviceRequiresWebsocketIngress(serviceName, service, primaryPort)) {
          primaryIngressProtocol = 'WS'
        }
      }
    }
  })

  docs.push(...workloadDocs)
  docs.push(...serviceDocs)
  if (primaryPort !== null) {
    docs.push(buildIngress(primaryWorkloadName, primaryPort, primaryIngressProtocol))
  }
  docs.push(buildAppResource(meta))
  validateGeneratedDatabaseContract(docs, dbServices)
  return docs
}

export async function convertComposeToTemplate(options: {
  composePath: string
  outputRoot: string
  meta: MetadataOptions
  komposeShapes?: Record<string, ServiceShape> | null
  writeFiles?: boolean
  fetchLogo?: boolean
}): Promise<[string, string]> {
  const {
    composePath,
    outputRoot,
    komposeShapes = null,
    writeFiles = true,
    fetchLogo = true,
  } = options
  let meta = options.meta
  const composeData = parseCompose(composePath)
  const appDir = join(outputRoot, meta.appName)
  if (writeFiles) {
    meta = await prepareLogoAsset(meta, appDir, fetchLogo)
  }
  const documents = buildDocuments(composeData, meta, komposeShapes, composePath)
  const indexPath = join(appDir, 'index.yaml')
  const rendered = renderIndexYaml(documents)
  if (writeFiles) {
    mkdirSync(appDir, { recursive: true })
    writeFileSync(indexPath, rendered, 'utf8')
  }
  return [indexPath, rendered]
}
