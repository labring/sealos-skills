#!/usr/bin/env node
/**
 * Resolve every container image in a compose file to a deterministic
 * digest-pinned reference plus the image runtime config (user, exposed
 * ports) needed for template generation.
 *
 * Replaces the crane dependency: talks to registries over plain HTTPS
 * (anonymous bearer token flow; GHCR private images use GHCR_TOKEN /
 * GITHUB_TOKEN / `gh auth token`), with `docker buildx imagetools` as a
 * fallback when direct registry access fails and docker is available.
 *
 * Output (JSON):
 * {
 *   "generated_at": "...",
 *   "platform": "linux/amd64",
 *   "images": { "<original-ref>": { resolved, digest, version_tag,
 *                platforms, config: { user, exposed_ports } } },
 *   "by_service": { "<service>": "<original-ref>" },
 *   "errors": []
 * }
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { parse } from 'yaml'
import {
  detectDbType,
  isExplicitVersionTag,
  iterServices,
  normalizeImageReference,
  splitImageReference,
} from './compose-to-template-lib.ts'
import { SPECIAL_DB_RESOURCE_TYPES } from './compose-to-template-constants.ts'

const TARGET_PLATFORM = 'linux/amd64'
const REQUEST_TIMEOUT_MS = 20_000

const MANIFEST_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ')

type ImageConfig = {
  user: string
  exposed_ports: number[]
}

type ResolvedImage = {
  repository: string
  resolved: string
  digest: string
  version_tag: string | null
  platforms: string[]
  config: ImageConfig
}

type RegistryRef = {
  registryHost: string
  apiRepository: string
  displayRepository: string
  tag: string | null
  digest: string | null
}

export function parseRegistryReference(image: string): RegistryRef {
  const [repositoryRaw, tag, digest] = splitImageReference(image.trim())
  let registryHost = 'registry-1.docker.io'
  let repoPath = repositoryRaw
  const firstSegment = repositoryRaw.split('/')[0]
  if (
    repositoryRaw.includes('/') &&
    (firstSegment.includes('.') || firstSegment.includes(':') || firstSegment === 'localhost')
  ) {
    registryHost = firstSegment
    repoPath = repositoryRaw.slice(firstSegment.length + 1)
  } else if (!repositoryRaw.includes('/')) {
    repoPath = `library/${repositoryRaw}`
  }
  return {
    registryHost,
    apiRepository: repoPath,
    displayRepository: repositoryRaw,
    tag,
    digest,
  }
}

async function fetchWithTimeout(
  url: string,
  headers: Record<string, string>,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { headers, signal: controller.signal, redirect: 'follow' })
  } finally {
    clearTimeout(timer)
  }
}

function ghcrFallbackToken(): string {
  for (const name of ['GHCR_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN']) {
    const value = process.env[name]
    if (value && value.trim()) return value.trim()
  }
  try {
    const token = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (token) return token
  } catch {
    /* gh unavailable */
  }
  return ''
}

async function bearerTokenFor(ref: RegistryRef, wwwAuthenticate: string): Promise<string> {
  const realmMatch = /realm="([^"]+)"/.exec(wwwAuthenticate)
  if (!realmMatch) return ''
  const serviceMatch = /service="([^"]+)"/.exec(wwwAuthenticate)
  const params = new URLSearchParams()
  if (serviceMatch) params.set('service', serviceMatch[1])
  params.set('scope', `repository:${ref.apiRepository}:pull`)
  const url = `${realmMatch[1]}?${params.toString()}`

  const headers: Record<string, string> = {}
  if (ref.registryHost === 'ghcr.io') {
    const token = ghcrFallbackToken()
    if (token) headers.Authorization = `Basic ${Buffer.from(`x:${token}`).toString('base64')}`
  }
  const response = await fetchWithTimeout(url, headers)
  if (!response.ok) return ''
  const payload = (await response.json()) as Record<string, unknown>
  const token = payload.token ?? payload.access_token
  return typeof token === 'string' ? token : ''
}

async function registryGet(
  ref: RegistryRef,
  path: string,
  accept: string,
  token: { value: string },
): Promise<Response> {
  const url = `https://${ref.registryHost}/v2/${ref.apiRepository}/${path}`
  const headers: Record<string, string> = { Accept: accept }
  if (token.value) headers.Authorization = `Bearer ${token.value}`
  let response = await fetchWithTimeout(url, headers)
  if (response.status === 401) {
    const challenge = response.headers.get('www-authenticate') ?? ''
    const bearer = await bearerTokenFor(ref, challenge)
    if (bearer) {
      token.value = bearer
      headers.Authorization = `Bearer ${bearer}`
      response = await fetchWithTimeout(url, headers)
    }
  }
  return response
}

function parsePlatform(entry: Record<string, unknown>): string {
  const platform = entry.platform
  if (!platform || typeof platform !== 'object' || Array.isArray(platform)) return 'unknown/unknown'
  const p = platform as Record<string, unknown>
  return `${String(p.os ?? 'unknown')}/${String(p.architecture ?? 'unknown')}`
}

function exposedPortsFromConfig(config: Record<string, unknown>): number[] {
  const exposed = config.ExposedPorts
  if (!exposed || typeof exposed !== 'object' || Array.isArray(exposed)) return []
  const ports: number[] = []
  for (const key of Object.keys(exposed as Record<string, unknown>)) {
    const match = /^(\d+)\//.exec(key)
    if (match) ports.push(Number(match[1]))
  }
  return [...new Set(ports)].sort((a, b) => a - b)
}

export async function resolveImageViaRegistry(image: string): Promise<ResolvedImage> {
  const ref = parseRegistryReference(image)
  const token = { value: '' }
  const reference = ref.digest ?? ref.tag ?? 'latest'

  const manifestResponse = await registryGet(
    ref,
    `manifests/${reference}`,
    MANIFEST_ACCEPT,
    token,
  )
  if (!manifestResponse.ok) {
    throw new Error(`manifest fetch failed for ${image}: HTTP ${manifestResponse.status}`)
  }
  const topDigest =
    manifestResponse.headers.get('docker-content-digest') ?? ref.digest ?? ''
  const manifest = (await manifestResponse.json()) as Record<string, unknown>

  let platforms: string[] = []
  let childManifest: Record<string, unknown> | null = null
  const mediaType = String(manifest.mediaType ?? '')
  if (Array.isArray(manifest.manifests)) {
    const entries = manifest.manifests as Record<string, unknown>[]
    platforms = entries.map(parsePlatform).filter((p) => !p.startsWith('unknown'))
    const amd64 = entries.find((entry) => parsePlatform(entry) === TARGET_PLATFORM)
    if (!amd64) {
      throw new Error(
        `image ${image} has no ${TARGET_PLATFORM} manifest (platforms: ${platforms.join(', ') || 'none'})`,
      )
    }
    const childDigest = String(amd64.digest ?? '')
    const childResponse = await registryGet(ref, `manifests/${childDigest}`, MANIFEST_ACCEPT, token)
    if (!childResponse.ok) {
      throw new Error(`child manifest fetch failed for ${image}: HTTP ${childResponse.status}`)
    }
    childManifest = (await childResponse.json()) as Record<string, unknown>
  } else if (mediaType.includes('manifest')) {
    platforms = [TARGET_PLATFORM]
    childManifest = manifest
  } else {
    throw new Error(`unsupported manifest media type for ${image}: ${mediaType || 'unknown'}`)
  }

  let config: ImageConfig = { user: '', exposed_ports: [] }
  const configDescriptor = childManifest?.config
  if (configDescriptor && typeof configDescriptor === 'object' && !Array.isArray(configDescriptor)) {
    const configDigest = String((configDescriptor as Record<string, unknown>).digest ?? '')
    if (configDigest) {
      const blobResponse = await registryGet(
        ref,
        `blobs/${configDigest}`,
        'application/octet-stream',
        token,
      )
      if (blobResponse.ok) {
        const blob = (await blobResponse.json()) as Record<string, unknown>
        const innerConfig =
          blob.config && typeof blob.config === 'object' && !Array.isArray(blob.config)
            ? (blob.config as Record<string, unknown>)
            : {}
        config = {
          user: String(innerConfig.User ?? '').trim(),
          exposed_ports: exposedPortsFromConfig(innerConfig),
        }
      }
    }
  }

  if (!topDigest) {
    throw new Error(`registry returned no content digest for ${image}`)
  }

  const versionTag = ref.tag && isExplicitVersionTag(ref.tag) ? ref.tag : null
  const resolved = versionTag
    ? `${ref.displayRepository}:${versionTag}@${topDigest}`
    : `${ref.displayRepository}@${topDigest}`

  return {
    repository: ref.displayRepository,
    resolved,
    digest: topDigest,
    version_tag: versionTag,
    platforms,
    config,
  }
}

function dockerFallback(image: string): ResolvedImage {
  const manifestRaw = execFileSync(
    'docker',
    ['buildx', 'imagetools', 'inspect', image, '--raw'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const manifest = JSON.parse(manifestRaw) as Record<string, unknown>
  const digestOut = execFileSync(
    'docker',
    ['buildx', 'imagetools', 'inspect', image, '--format', '{{json .Manifest}}'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const digest = String((JSON.parse(digestOut) as Record<string, unknown>).digest ?? '')
  let platforms: string[] = []
  if (Array.isArray(manifest.manifests)) {
    platforms = (manifest.manifests as Record<string, unknown>[])
      .map(parsePlatform)
      .filter((p) => !p.startsWith('unknown'))
    if (!platforms.includes(TARGET_PLATFORM)) {
      throw new Error(`image ${image} has no ${TARGET_PLATFORM} manifest`)
    }
  } else {
    platforms = [TARGET_PLATFORM]
  }
  let user = ''
  let exposedPorts: number[] = []
  try {
    const imageOut = execFileSync(
      'docker',
      ['buildx', 'imagetools', 'inspect', image, '--format', '{{json .Image}}'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const parsed = JSON.parse(imageOut) as Record<string, unknown>
    const byPlatform = (parsed[TARGET_PLATFORM] ?? parsed) as Record<string, unknown>
    const innerConfig =
      byPlatform.config && typeof byPlatform.config === 'object'
        ? (byPlatform.config as Record<string, unknown>)
        : {}
    user = String(innerConfig.User ?? '').trim()
    exposedPorts = exposedPortsFromConfig(innerConfig)
  } catch {
    /* config unavailable via docker; leave empty */
  }
  const [, tag] = splitImageReference(image)
  const versionTag = tag && isExplicitVersionTag(tag) ? tag : null
  const repository = splitImageReference(image)[0]
  const resolved = versionTag
    ? `${repository}:${versionTag}@${digest}`
    : `${repository}@${digest}`
  return { repository, resolved, digest, version_tag: versionTag, platforms, config: { user, exposed_ports: exposedPorts } }
}

export async function resolveOneImage(image: string): Promise<ResolvedImage> {
  try {
    return await resolveImageViaRegistry(image)
  } catch (registryError) {
    try {
      return dockerFallback(image)
    } catch {
      throw registryError
    }
  }
}

type CliArgs = {
  compose: string
  extra: string[]
  output: string
  excludeDb: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { compose: '', extra: [], output: '', excludeDb: true }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--compose') args.compose = argv[++i] ?? ''
    else if (arg === '--extra') args.extra.push(...(argv[++i] ?? '').split(',').filter(Boolean))
    else if (arg === '--output') args.output = argv[++i] ?? ''
    else if (arg === '--include-db') args.excludeDb = false
    else if (arg === '-h' || arg === '--help') {
      console.error(
        'usage: resolve-images.ts --compose <file> [--extra ref1,ref2] [--output <file>] [--include-db]',
      )
      process.exit(0)
    } else {
      console.error(`resolve-images.ts: unrecognized argument: ${arg}`)
      process.exit(2)
    }
  }
  if (!args.compose && args.extra.length === 0) {
    console.error('resolve-images.ts: error: --compose or --extra is required')
    process.exit(2)
  }
  return args
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv)
  const byService: Record<string, string> = {}
  const targets = new Map<string, null>()

  if (args.compose) {
    const composePath = resolvePath(args.compose)
    if (!existsSync(composePath)) {
      console.error(`ERROR: compose file not found: ${composePath}`)
      return 1
    }
    const composeData = parse(readFileSync(composePath, 'utf8')) as Record<string, unknown>
    for (const [serviceName, service] of iterServices(composeData)) {
      const rawImage = service.image
      if (typeof rawImage !== 'string' || !rawImage.trim()) continue
      const normalized = normalizeImageReference(rawImage, serviceName)
      const dbType = detectDbType(normalized)
      if (args.excludeDb && dbType && SPECIAL_DB_RESOURCE_TYPES.has(dbType)) {
        continue
      }
      byService[serviceName] = normalized
      targets.set(normalized, null)
    }
  }
  for (const extra of args.extra) {
    targets.set(extra.trim(), null)
  }

  const images: Record<string, ResolvedImage> = {}
  const errors: string[] = []
  await Promise.all(
    [...targets.keys()].map(async (image) => {
      try {
        images[image] = await resolveOneImage(image)
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error))
      }
    }),
  )

  const payload = {
    generated_at: new Date().toISOString(),
    platform: TARGET_PLATFORM,
    images,
    by_service: byService,
    errors,
  }
  const rendered = `${JSON.stringify(payload, null, 2)}\n`
  if (args.output) {
    const outputPath = resolvePath(args.output)
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, rendered, 'utf8')
  }
  console.log(rendered)
  return errors.length > 0 ? 1 : 0
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('resolve-images.ts') || process.argv[1].endsWith('resolve-images.js'))

if (isDirectRun) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    })
}
