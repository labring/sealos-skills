#!/usr/bin/env node

/**
 * Docker Build & Push (GHCR + Docker Hub)
 *
 * Builds a Docker image for linux/amd64 and pushes to a container registry.
 * Automatically selects the best registry: GHCR (via gh CLI) > Docker Hub.
 *
 * Usage:
 *   node build-push.mjs <work-dir> <repo-name>              # auto-detect registry
 *   node build-push.mjs <work-dir> <repo-name> --service web --context apps/web --dockerfile Containerfile
 *   node build-push.mjs <work-dir> <repo-name> --service api --target runtime --build-arg NODE_ENV
 *   node build-push.mjs <work-dir> <repo-name> --registry dockerhub --user <docker-hub-user>
 *
 * Output (JSON):
 *   { "success": true, "image": "ghcr.io/owner/repo@sha256:...", "pushed_image": "ghcr.io/owner/repo:20260304-143022", "registry": "ghcr" }
 *   { "success": false, "error": "build failed: ..." }
 */

import { execFileSync, execSync } from 'child_process'
import { createHash } from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import { validateArtifactData } from './artifact-validator.mjs'
import { ensureGhScopesWithPrompt, hasGhCli, run } from './gh-auth-utils.mjs'

// ── Helpers ───────────────────────────────────────────────

const SHA256_DIGEST_RE = /^sha256:[a-f0-9]{64}$/i

function getDateTag () {
  const d = new Date()
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const time = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`
  return `${date}-${time}`
}

function runFile (command, args, opts = {}) {
  return execFileSync(command, args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim()
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function safeServiceKey (serviceName) {
  const normalized = String(serviceName).trim()
  const safe = normalized
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 63)

  if (safe && safe === normalized && safe !== '.' && safe !== '..') {
    return safe
  }

  const prefix = safe || 'service'
  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 8)
  return `${prefix.slice(0, 54)}-${digest}`
}

function ensureBuildDir (workDir, serviceKey) {
  const buildDir = path.join(workDir, '.sealos', 'build', serviceKey)
  fs.mkdirSync(buildDir, { recursive: true })
  return buildDir
}

function writeBuildResult (workDir, serviceKey, payload) {
  const validation = validateArtifactData('build-result', payload)
  if (!validation.valid) {
    throw new Error(`Invalid build-result artifact: ${validation.errors.map(err => `${err.path} ${err.message}`).join('; ')}`)
  }

  const buildDir = ensureBuildDir(workDir, serviceKey)
  fs.writeFileSync(
    path.join(buildDir, 'build-result.json'),
    JSON.stringify(payload, null, 2),
  )
}

function portablePath (workDir, absolutePath) {
  const relative = path.relative(workDir, absolutePath)
  if (relative === '') return '.'
  if (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join('/')
  }
  return absolutePath
}

function parseBuildArg (value) {
  const buildArg = String(value)
  const separator = buildArg.indexOf('=')
  const name = separator === -1 ? buildArg : buildArg.slice(0, separator)
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid build argument name: ${name || '(empty)'}`)
  }
  return { name, value: buildArg }
}

function redactBuildArgValues (value, buildArgs) {
  let redacted = String(value || '')
  for (const buildArg of buildArgs) {
    if (buildArg.value === buildArg.name) continue
    redacted = redacted.split(buildArg.value).join(`${buildArg.name}=<redacted>`)
  }
  return redacted
}

function resolveBuildSpec (workDir, repoName, options = {}) {
  const serviceName = String(options.serviceName || repoName).trim()
  if (!serviceName) {
    throw new Error('Service name must not be empty')
  }

  const contextInput = options.buildContext || '.'
  const dockerfileInput = options.dockerfile || 'Dockerfile'
  const contextPath = path.resolve(workDir, contextInput)
  const dockerfilePath = path.isAbsolute(dockerfileInput)
    ? path.normalize(dockerfileInput)
    : path.resolve(contextPath, dockerfileInput)
  const target = options.target === undefined || options.target === null || options.target === ''
    ? null
    : String(options.target)
  const buildArgs = (options.buildArgs || options.buildArgNames || []).map(parseBuildArg)

  return {
    serviceName,
    serviceKey: safeServiceKey(serviceName),
    contextPath,
    dockerfilePath,
    target,
    buildArgs,
    artifact: {
      context: portablePath(workDir, contextPath),
      dockerfile: portablePath(contextPath, dockerfilePath),
      target,
      build_arg_names: [...new Set(buildArgs.map(buildArg => buildArg.name))],
    },
  }
}

function imageRepository (image) {
  const withoutDigest = image.split('@', 1)[0]
  const lastSlash = withoutDigest.lastIndexOf('/')
  const lastColon = withoutDigest.lastIndexOf(':')
  return lastColon > lastSlash ? withoutDigest.slice(0, lastColon) : withoutDigest
}

function resolveBuildxMetadata (remoteImage, metadataPath) {
  let metadata
  try {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
    if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
      throw new Error('document is not an object')
    }
  } catch (error) {
    throw new Error(`Buildx returned invalid metadata for ${remoteImage}: ${error.message}`)
  }

  const digest = String(metadata['containerimage.digest'] || '').toLowerCase()
  if (!SHA256_DIGEST_RE.test(digest)) {
    throw new Error(`Buildx metadata contains an invalid containerimage.digest for ${remoteImage}`)
  }

  return {
    digest,
    imageRef: `${imageRepository(remoteImage)}@${digest}`,
    platforms: ['linux/amd64'],
  }
}

function buildxArgs (remoteImage, metadataPath, {
  buildContext = '.',
  dockerfile = 'Dockerfile',
  target = null,
  buildArgs = [],
} = {}) {
  const args = [
    'buildx',
    'build',
    '--platform',
    'linux/amd64',
    '-f',
    dockerfile,
  ]

  if (target) {
    args.push('--target', target)
  }
  for (const buildArg of buildArgs) {
    args.push('--build-arg', typeof buildArg === 'string' ? buildArg : buildArg.value)
  }

  args.push(
    '--tag',
    remoteImage,
    '--push',
    '--metadata-file',
    metadataPath,
    buildContext,
  )
  return args
}

function runDockerBuildx ({
  workDir,
  remoteImage,
  metadataPath,
  buildContext = '.',
  dockerfile = 'Dockerfile',
  target = null,
  buildArgs = [],
}) {
  execFileSync(
    'docker',
    buildxArgs(remoteImage, metadataPath, {
      buildContext,
      dockerfile,
      target,
      buildArgs,
    }),
    {
      cwd: workDir,
      stdio: 'pipe',
      timeout: 600000,
    },
  )
}

// ── Registry Detection ───────────────────────────────────

function detectGhcr () {
  try {
    run('gh auth status')
    const user = run('gh api user -q .login')
    if (!user) return null
    return { registry: 'ghcr', user }
  } catch {
    return null
  }
}

function promptGhLogin () {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return {
      ok: false,
      error: 'gh CLI is installed but not authenticated, and interactive login is not available in this terminal. Run: gh auth login',
    }
  }

  console.error('gh CLI is installed but not authenticated. Opening `gh auth login` for GHCR access...')

  try {
    execSync('gh auth login', { stdio: 'inherit' })
  } catch {
    return {
      ok: false,
      error: 'gh auth login was not completed. GHCR push requires a successful GitHub CLI login.',
    }
  }

  const ghcr = detectGhcr()
  if (!ghcr) {
    return {
      ok: false,
      error: 'gh auth login completed, but GitHub CLI is still not authenticated for GHCR use.',
    }
  }

  return { ok: true, registryInfo: ghcr }
}

function loginGhcr (user) {
  try {
    const token = run('gh auth token')
    execSync(`echo "${token}" | docker login ghcr.io -u ${user} --password-stdin`, { stdio: 'pipe' })
    return true
  } catch (e) {
    return false
  }
}

async function ensureGhcrRegistry ({ triggerLogin = false } = {}) {
  const requiredScopes = ['write:packages']

  if (!hasGhCli()) {
    return {
      ok: false,
      error: 'gh CLI is not installed. Install it with: brew install gh && gh auth login',
    }
  }

  let ghcr = detectGhcr()
  if (!ghcr && triggerLogin) {
    const loginResult = promptGhLogin()
    if (!loginResult.ok) return loginResult
    ghcr = loginResult.registryInfo
  }

  if (!ghcr) {
    return {
      ok: false,
      error: 'gh CLI not authenticated. Run: gh auth login',
    }
  }

  const scopeCheck = await ensureGhScopesWithPrompt(
    requiredScopes,
    'GHCR push and later private-image deploy',
  )
  if (!scopeCheck.ok) {
    return scopeCheck
  }

  if (!loginGhcr(ghcr.user)) {
    return {
      ok: false,
      error: 'Failed to login to ghcr.io via gh CLI',
    }
  }

  return { ok: true, registryInfo: ghcr }
}

function getGhcrPackageVisibility (packageName) {
  try {
    return runFile('gh', ['api', `/user/packages/container/${packageName}`, '-q', '.visibility'])
  } catch {
    return null
  }
}

async function verifyGhcrPublicPull (user, packageName, tag) {
  const visibility = getGhcrPackageVisibility(packageName)
  const manifestUrl = `https://ghcr.io/v2/${user}/${packageName}/manifests/${tag}`
  const acceptHeader = 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json'

  let lastStatus = null
  let lastError = null

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const tokenResponse = await fetch(`https://ghcr.io/token?scope=repository:${user}/${packageName}:pull`)
      lastStatus = tokenResponse.status

      if (tokenResponse.ok) {
        const tokenPayload = await tokenResponse.json()
        if (tokenPayload.token) {
          const manifestResponse = await fetch(manifestUrl, {
            headers: {
              Authorization: `Bearer ${tokenPayload.token}`,
              Accept: acceptHeader,
            },
          })

          lastStatus = manifestResponse.status
          if (manifestResponse.ok) {
            return { ok: true, visibility }
          }

          if (manifestResponse.status === 401 || manifestResponse.status === 403) {
            break
          }
        }
      }
    } catch (error) {
      lastError = error.message
    }

    if (attempt < 4) {
      await sleep(2000)
    }
  }

  return { ok: false, visibility, status: lastStatus, error: lastError }
}

function formatGhcrPullabilityWarning (user, packageName, tag, verification) {
  const settingsUrl = `https://github.com/users/${user}/packages/container/package/${packageName}/settings`
  const visibility = verification.visibility || 'unknown'
  const status = verification.status ? ` GHCR manifest check status: ${verification.status}.` : ''
  const detail = verification.error ? ` Last check error: ${verification.error}.` : ''
  return [
    `Built and pushed ${`ghcr.io/${user}/${packageName}:${tag}`}, but the image is not anonymously pullable from GHCR.`,
    `Current package visibility: ${visibility}.${status}${detail}`,
    `This is acceptable when the deploy step creates an image pull secret from local gh CLI credentials.`,
    `If you want a public image instead, change the package visibility in GitHub Packages: ${settingsUrl}`,
  ].join(' ')
}

function detectDockerHub () {
  try {
    const info = run('docker info 2>/dev/null')
    const match = info.match(/Username:\s*(\S+)/)
    if (match) return { registry: 'dockerhub', user: match[1] }
    return null
  } catch {
    return null
  }
}

/**
 * Auto-detect the best available registry.
 * Priority: GHCR (via gh CLI) > Docker Hub (already logged in)
 */
async function autoDetectRegistry () {
  // 1. Try GHCR via gh CLI
  if (hasGhCli()) {
    const ghcrResult = await ensureGhcrRegistry({ triggerLogin: true })
    if (ghcrResult.ok) return ghcrResult.registryInfo
    throw ghcrResult
  }

  // 2. Try Docker Hub (already logged in)
  const dockerhub = detectDockerHub()
  if (dockerhub) return dockerhub

  // 3. Nothing available
  return null
}

// ── Build & Push ─────────────────────────────────────────

async function buildAndPush (workDir, repoName, registryInfo, options = {}) {
  const executeBuildx = options.executeBuildx || runDockerBuildx
  const tag = options.tag || getDateTag()
  const startedAt = new Date().toISOString()
  let buildSpec

  try {
    buildSpec = resolveBuildSpec(workDir, repoName, options)
  } catch (error) {
    return { success: false, error: error.message }
  }
  const imageName = buildSpec.serviceName === repoName
    ? repoName
    : `${repoName}-${buildSpec.serviceKey}`
  const sanitized = imageName.toLowerCase().replace(/[^a-z0-9_.-]/g, '-')

  let remoteImage
  if (registryInfo.registry === 'ghcr') {
    remoteImage = `ghcr.io/${registryInfo.user}/${sanitized}:${tag}`
  } else {
    remoteImage = `${registryInfo.user}/${sanitized}:${tag}`
  }

  const service = {
    name: buildSpec.serviceName,
    artifact_key: buildSpec.serviceKey,
  }
  const build = {
    image_name: sanitized,
    ...buildSpec.artifact,
    started_at: startedAt,
  }
  const artifactPath = path.join(
    workDir,
    '.sealos',
    'build',
    buildSpec.serviceKey,
    'build-result.json',
  )

  let preflightError = null
  if (!fs.existsSync(buildSpec.contextPath) || !fs.statSync(buildSpec.contextPath).isDirectory()) {
    preflightError = `Build context directory not found: ${buildSpec.artifact.context}`
  } else if (!fs.existsSync(buildSpec.dockerfilePath) || !fs.statSync(buildSpec.dockerfilePath).isFile()) {
    preflightError = `Dockerfile not found: ${buildSpec.artifact.dockerfile}`
  }

  if (preflightError) {
    writeBuildResult(workDir, buildSpec.serviceKey, {
      outcome: 'failed',
      registry: registryInfo.registry,
      service,
      build,
      push: { remote_image: remoteImage },
      error: preflightError,
      finished_at: new Date().toISOString(),
    })
    return {
      success: false,
      service: buildSpec.serviceName,
      artifact: artifactPath,
      error: preflightError,
    }
  }

  let metadataDir = null
  try {
    metadataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sealos-buildx-metadata-'))
    const metadataPath = path.join(metadataDir, 'metadata.json')
    executeBuildx({
      workDir,
      remoteImage,
      metadataPath,
      buildContext: buildSpec.contextPath,
      dockerfile: buildSpec.dockerfilePath,
      target: buildSpec.target,
      buildArgs: buildSpec.buildArgs,
      serviceName: buildSpec.serviceName,
    })

    const resolvedImage = resolveBuildxMetadata(remoteImage, metadataPath)
    let warning = null
    let requiresImagePullSecret = false
    if (registryInfo.registry === 'ghcr') {
      const pullVerification = await verifyGhcrPublicPull(registryInfo.user, sanitized, tag)
      if (!pullVerification.ok) {
        warning = formatGhcrPullabilityWarning(registryInfo.user, sanitized, tag, pullVerification)
        requiresImagePullSecret = true
      }
    }

    writeBuildResult(workDir, buildSpec.serviceKey, {
      outcome: 'success',
      registry: registryInfo.registry,
      service,
      build,
      push: {
        remote_image: remoteImage,
        digest: resolvedImage.digest,
        image_ref: resolvedImage.imageRef,
        platforms: resolvedImage.platforms,
        pushed_at: new Date().toISOString(),
      },
      finished_at: new Date().toISOString(),
    })

    const result = {
      success: true,
      image: resolvedImage.imageRef,
      pushed_image: remoteImage,
      digest: resolvedImage.digest,
      platforms: resolvedImage.platforms,
      registry: registryInfo.registry,
      service: buildSpec.serviceName,
      artifact: artifactPath,
    }
    if (warning) {
      result.warning = warning
      result.requires_image_pull_secret = requiresImagePullSecret
    }
    return result
  } catch (e) {
    const error = redactBuildArgValues(
      e.stderr?.toString() || e.message,
      buildSpec.buildArgs,
    )
    writeBuildResult(workDir, buildSpec.serviceKey, {
      outcome: 'failed',
      registry: registryInfo.registry,
      service,
      build,
      push: { remote_image: remoteImage },
      error,
      finished_at: new Date().toISOString(),
    })
    return {
      success: false,
      service: buildSpec.serviceName,
      artifact: artifactPath,
      error,
    }
  } finally {
    if (metadataDir) {
      fs.rmSync(metadataDir, { recursive: true, force: true })
    }
  }
}

// ── CLI ────────────────────────────────────────────────────

function parseArgs (argv) {
  const args = argv.slice(2)
  const parsed = {
    workDir: null,
    repoName: null,
    registry: null,
    user: null,
    serviceName: null,
    buildContext: '.',
    dockerfile: 'Dockerfile',
    target: null,
    buildArgs: [],
  }

  const positional = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--registry' && args[i + 1]) {
      parsed.registry = args[++i]
    } else if (args[i] === '--user' && args[i + 1]) {
      parsed.user = args[++i]
    } else if (args[i] === '--service' && args[i + 1]) {
      parsed.serviceName = args[++i]
    } else if (args[i] === '--context' && args[i + 1]) {
      parsed.buildContext = args[++i]
    } else if (args[i] === '--dockerfile' && args[i + 1]) {
      parsed.dockerfile = args[++i]
    } else if (args[i] === '--target' && args[i + 1]) {
      parsed.target = args[++i]
    } else if (args[i] === '--build-arg' && args[i + 1]) {
      parsed.buildArgs.push(args[++i])
    } else {
      positional.push(args[i])
    }
  }

  parsed.workDir = positional[0] || null
  parsed.repoName = positional[1] || null
  return parsed
}

async function main () {
  const args = parseArgs(process.argv)

  if (!args.workDir || !args.repoName) {
    console.error('Usage: node build-push.mjs <work-dir> <repo-name> [--service <name>] [--context <path>] [--dockerfile <path>] [--target <stage>] [--build-arg <NAME[=value]>]... [--registry ghcr|dockerhub] [--user <user>]')
    process.exitCode = 1
    return
  }

  // Determine registry
  let registryInfo

  if (args.registry === 'ghcr') {
    // Explicit GHCR
    const ghcrResult = await ensureGhcrRegistry({ triggerLogin: true })
    if (!ghcrResult.ok) {
      console.log(JSON.stringify({ success: false, ...(ghcrResult.error ? ghcrResult : { error: 'Failed to prepare GHCR registry access' }) }))
      process.exitCode = 1
      return
    }
    registryInfo = ghcrResult.registryInfo
  } else if (args.registry === 'dockerhub') {
    // Explicit Docker Hub
    if (!args.user) {
      const dh = detectDockerHub()
      if (!dh) {
        console.log(JSON.stringify({ success: false, error: 'Not logged in to Docker Hub. Run: docker login' }))
        process.exitCode = 1
        return
      }
      registryInfo = dh
    } else {
      registryInfo = { registry: 'dockerhub', user: args.user }
    }
  } else {
    // Auto-detect
    try {
      registryInfo = await autoDetectRegistry()
    } catch (error) {
      const structured = error && typeof error === 'object' && 'error' in error
      console.log(JSON.stringify({
        success: false,
        ...(structured ? error : { error: error.message }),
      }))
      process.exitCode = 1
      return
    }
    if (!registryInfo) {
      console.log(JSON.stringify({
        success: false,
        error: 'No container registry available. Install gh CLI (brew install gh && gh auth login) or run docker login.',
      }))
      process.exitCode = 1
      return
    }
  }

  const result = await buildAndPush(
    path.resolve(args.workDir),
    args.repoName,
    registryInfo,
    {
      serviceName: args.serviceName,
      buildContext: args.buildContext,
      dockerfile: args.dockerfile,
      target: args.target,
      buildArgs: args.buildArgs,
    },
  )
  console.log(JSON.stringify(result, null, 2))

  if (!result.success) process.exitCode = 1
}

const isMain = process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMain) await main()

export {
  buildAndPush,
  buildxArgs,
  parseArgs,
  resolveBuildxMetadata,
  safeServiceKey,
  runDockerBuildx,
}
