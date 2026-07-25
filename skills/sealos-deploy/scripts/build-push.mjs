#!/usr/bin/env node

/**
 * Docker Build & Push (GHCR)
 *
 * Builds a Docker image for linux/amd64 and pushes it to GHCR.
 *
 * Usage:
 *   node build-push.mjs <work-dir> <repo-name>
 *   node build-push.mjs <work-dir> <repo-name> --service web --context apps/web --dockerfile Containerfile
 *   node build-push.mjs <work-dir> <repo-name> --service api --target runtime --build-arg NODE_ENV
 *
 * Output (JSON):
 *   { "success": true, "image": "ghcr.io/owner/repo@sha256:...", "pushed_image": "ghcr.io/owner/repo:20260304-143022-a1b2c3", "registry": "ghcr", "pull_access": "anonymous" }
 *   { "success": false, "error": "build failed: ..." }
 */

import { execFileSync } from 'child_process'
import { createHash, randomBytes } from 'crypto'
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
  return `${date}-${time}-${randomBytes(3).toString('hex')}`
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
  const rawValue = separator === -1
    ? process.env[name]
    : buildArg.slice(separator + 1)
  return {
    name,
    value: buildArg,
    rawValue: rawValue === undefined || rawValue === '' ? null : String(rawValue),
  }
}

function redactBuildArgValues (value, buildArgs) {
  let redacted = String(value || '')
  for (const buildArg of buildArgs) {
    if (buildArg.value !== buildArg.name) {
      redacted = redacted
        .split(buildArg.value)
        .join(`${buildArg.name}=<redacted>`)
    }
    if (buildArg.rawValue) {
      redacted = redacted
        .split(buildArg.rawValue)
        .join('<redacted>')
    }
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

function preflightLocalBuild (workDir, repoName, options = {}) {
  let buildSpec
  try {
    buildSpec = resolveBuildSpec(workDir, repoName, options)
  } catch (error) {
    return { ok: false, error: error.message }
  }

  if (!fs.existsSync(buildSpec.contextPath) || !fs.statSync(buildSpec.contextPath).isDirectory()) {
    return {
      ok: false,
      error: `Build context directory not found: ${buildSpec.artifact.context}`,
    }
  }

  if (!fs.existsSync(buildSpec.dockerfilePath) || !fs.statSync(buildSpec.dockerfilePath).isFile()) {
    return {
      ok: false,
      error: `Dockerfile not found: ${buildSpec.artifact.dockerfile}`,
    }
  }

  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10)
  if (!Number.isInteger(nodeMajor) || nodeMajor < 18) {
    return {
      ok: false,
      error: `Node.js 18 or newer is required; found ${process.versions.node}`,
    }
  }

  try {
    runFile('docker', ['--version'])
  } catch {
    return {
      ok: false,
      error: 'Docker CLI is unavailable. Install Docker before running Phase 4.',
    }
  }

  try {
    runFile('docker', ['buildx', 'version'])
  } catch {
    return {
      ok: false,
      error: 'Docker Buildx is unavailable. Install or enable Docker Buildx before running Phase 4.',
    }
  }

  try {
    runFile('docker', ['info'])
  } catch {
    return {
      ok: false,
      error: 'Docker daemon is unavailable. Start Docker before running Phase 4.',
    }
  }

  return { ok: true }
}

// ── GHCR Access ──────────────────────────────────────────

function detectGhcr () {
  try {
    run('gh auth status --active --hostname github.com')
    const user = run('gh api --hostname github.com user -q .login')
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
      error: 'gh CLI is installed but not authenticated to github.com, and interactive login is not available in this terminal. Run: gh auth login --hostname github.com',
    }
  }

  console.error('gh CLI is installed but not authenticated for github.com. Opening `gh auth login` for GHCR access...')

  try {
    execFileSync(
      'gh',
      ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web'],
      { stdio: 'inherit' },
    )
  } catch {
    return {
      ok: false,
      error: 'gh auth login for github.com was not completed. GHCR push requires a successful GitHub CLI login.',
    }
  }

  const ghcr = detectGhcr()
  if (!ghcr) {
    return {
      ok: false,
      error: 'gh auth login completed, but GitHub CLI is still not authenticated to github.com for GHCR use.',
    }
  }

  return { ok: true, registryInfo: ghcr }
}

function loginGhcr (user, {
  getToken = () => run('gh auth token --hostname github.com'),
  execute = execFileSync,
} = {}) {
  try {
    const token = getToken()
    execute(
      'docker',
      ['login', 'ghcr.io', '-u', user, '--password-stdin'],
      {
        encoding: 'utf8',
        input: `${token}\n`,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
    return true
  } catch {
    return false
  }
}

async function ensureGhcrRegistry ({
  triggerLogin = false,
  hasGhCliImpl = hasGhCli,
  detectGhcrImpl = detectGhcr,
  promptGhLoginImpl = promptGhLogin,
  ensureScopesImpl = ensureGhScopesWithPrompt,
  loginGhcrImpl = loginGhcr,
} = {}) {
  const requiredScopes = ['write:packages']

  if (!hasGhCliImpl()) {
    return {
      ok: false,
      error: 'gh CLI is not installed. Install it with: brew install gh && gh auth login --hostname github.com',
    }
  }

  let ghcr = detectGhcrImpl()
  if (!ghcr && triggerLogin) {
    const loginResult = promptGhLoginImpl()
    if (!loginResult.ok) return loginResult
    ghcr = loginResult.registryInfo
  }

  if (!ghcr) {
    return {
      ok: false,
      error: 'gh CLI not authenticated to github.com. Run: gh auth login --hostname github.com',
    }
  }

  const scopeCheck = await ensureScopesImpl(
    requiredScopes,
    'GHCR push and later private-image deploy',
  )
  if (!scopeCheck.ok) {
    return scopeCheck
  }

  ghcr = detectGhcrImpl()
  if (!ghcr) {
    return {
      ok: false,
      error: 'GitHub authentication changed while preparing GHCR, but no active github.com account is available.',
    }
  }

  if (!loginGhcrImpl(ghcr.user)) {
    return {
      ok: false,
      error: 'Failed to login to ghcr.io via gh CLI',
    }
  }

  return { ok: true, registryInfo: ghcr }
}

function getGhcrPackageVisibility (packageName) {
  try {
    return runFile('gh', [
      'api',
      '--hostname',
      'github.com',
      `/user/packages/container/${packageName}`,
      '-q',
      '.visibility',
    ])
  } catch {
    return null
  }
}

async function verifyGhcrPublicPull ({
  namespace,
  packageName,
  digest,
}, {
  fetchImpl = globalThis.fetch,
  getVisibility = getGhcrPackageVisibility,
  sleepImpl = sleep,
} = {}) {
  const visibility = getVisibility(packageName)
  const manifestUrl = `https://ghcr.io/v2/${namespace}/${packageName}/manifests/${digest}`
  const acceptHeader = [
    'application/vnd.oci.image.manifest.v1+json',
    'application/vnd.oci.image.index.v1+json',
    'application/vnd.docker.distribution.manifest.v2+json',
    'application/vnd.docker.distribution.manifest.list.v2+json',
  ].join(', ')

  let lastStatus = null
  let lastError = null

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const tokenResponse = await fetchImpl(`https://ghcr.io/token?scope=repository:${namespace}/${packageName}:pull`)
      lastStatus = tokenResponse.status

      if (tokenResponse.status === 401 || tokenResponse.status === 403) {
        return {
          pullAccess: 'ghcr_secret_required',
          visibility,
          status: tokenResponse.status,
        }
      }

      if (tokenResponse.ok) {
        const tokenPayload = await tokenResponse.json()
        if (tokenPayload.token) {
          const manifestResponse = await fetchImpl(manifestUrl, {
            headers: {
              Authorization: `Bearer ${tokenPayload.token}`,
              Accept: acceptHeader,
            },
          })

          lastStatus = manifestResponse.status
          if (manifestResponse.ok) {
            return {
              pullAccess: 'anonymous',
              visibility,
              status: manifestResponse.status,
            }
          }

          if (manifestResponse.status === 401 || manifestResponse.status === 403) {
            return {
              pullAccess: 'ghcr_secret_required',
              visibility,
              status: manifestResponse.status,
            }
          }
        } else {
          lastError = 'GHCR anonymous token response did not include a token'
        }
      }
    } catch (error) {
      lastError = error.message
    }

    if (attempt < 4) {
      await sleepImpl(2000)
    }
  }

  return {
    pullAccess: 'indeterminate',
    visibility,
    status: lastStatus,
    error: lastError,
  }
}

function formatGhcrPullabilityWarning (namespace, packageName, digest, verification) {
  const settingsUrl = `https://github.com/users/${namespace}/packages/container/package/${packageName}/settings`
  const visibility = verification.visibility || 'unknown'
  const status = verification.status ? ` GHCR manifest check status: ${verification.status}.` : ''
  const detail = verification.error ? ` Last check error: ${verification.error}.` : ''
  const summary = verification.pullAccess === 'ghcr_secret_required'
    ? 'the immutable image is not anonymously pullable from GHCR'
    : 'anonymous pullability for the immutable image could not be determined'
  return [
    `Built and pushed ${`ghcr.io/${namespace}/${packageName}@${digest}`}, but ${summary}.`,
    `Current package visibility: ${visibility}.${status}${detail}`,
    `The deploy step must conservatively create an image pull secret from local gh CLI credentials.`,
    `If you want a public image instead, change the package visibility in GitHub Packages: ${settingsUrl}`,
  ].join(' ')
}

// ── Build & Push ─────────────────────────────────────────

async function buildAndPush (workDir, repoName, registryInfo, options = {}) {
  if (registryInfo?.registry !== 'ghcr') {
    return {
      success: false,
      error: 'Phase 4 only supports pushing newly built images to GHCR.',
    }
  }

  const loginIdentity = String(registryInfo.user || '').trim()
  if (!loginIdentity) {
    return {
      success: false,
      error: 'GHCR registry information is missing the authenticated GitHub user.',
    }
  }

  const ghcrNamespace = loginIdentity.toLowerCase()
  const executeBuildx = options.executeBuildx || runDockerBuildx
  const verifyPublicPull = options.verifyPublicPull || verifyGhcrPublicPull
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
  const remoteImage = `ghcr.io/${ghcrNamespace}/${sanitized}:${tag}`

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
      registry: 'ghcr',
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
    let pullVerification
    try {
      pullVerification = await verifyPublicPull({
        namespace: ghcrNamespace,
        packageName: sanitized,
        digest: resolvedImage.digest,
        imageRef: resolvedImage.imageRef,
      })
    } catch (error) {
      pullVerification = {
        pullAccess: 'indeterminate',
        visibility: null,
        error: error.message,
      }
    }

    const allowedPullAccess = new Set([
      'anonymous',
      'ghcr_secret_required',
      'indeterminate',
    ])
    if (!allowedPullAccess.has(pullVerification?.pullAccess)) {
      pullVerification = {
        ...pullVerification,
        pullAccess: 'indeterminate',
        error: pullVerification?.error || 'GHCR pullability verifier returned an invalid result',
      }
    }

    const pullAccess = pullVerification.pullAccess
    const requiresImagePullSecret = pullAccess !== 'anonymous'
    if (requiresImagePullSecret) {
      warning = formatGhcrPullabilityWarning(
        ghcrNamespace,
        sanitized,
        resolvedImage.digest,
        pullVerification,
      )
    }

    writeBuildResult(workDir, buildSpec.serviceKey, {
      outcome: 'success',
      registry: 'ghcr',
      service,
      build,
      push: {
        remote_image: remoteImage,
        digest: resolvedImage.digest,
        image_ref: resolvedImage.imageRef,
        platforms: resolvedImage.platforms,
        pushed_at: new Date().toISOString(),
        pull_access: pullAccess,
      },
      finished_at: new Date().toISOString(),
    })

    const result = {
      success: true,
      image: resolvedImage.imageRef,
      pushed_image: remoteImage,
      digest: resolvedImage.digest,
      platforms: resolvedImage.platforms,
      registry: 'ghcr',
      pull_access: pullAccess,
      requires_image_pull_secret: requiresImagePullSecret,
      service: buildSpec.serviceName,
      artifact: artifactPath,
    }
    if (warning) {
      result.warning = warning
    }
    return result
  } catch (e) {
    const error = redactBuildArgValues(
      e.stderr?.toString() || e.message,
      buildSpec.buildArgs,
    )
    writeBuildResult(workDir, buildSpec.serviceKey, {
      outcome: 'failed',
      registry: 'ghcr',
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
    serviceName: null,
    buildContext: '.',
    dockerfile: 'Dockerfile',
    target: null,
    buildArgs: [],
  }

  const readValue = (index, option) => {
    const value = args[index + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${option}`)
    }
    return value
  }

  const positional = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--registry' || arg === '--user') {
      throw new Error(`${arg} is no longer supported; Phase 4 always pushes newly built images to GHCR`)
    } else if (arg === '--service') {
      parsed.serviceName = readValue(i, arg)
      i++
    } else if (arg === '--context') {
      parsed.buildContext = readValue(i, arg)
      i++
    } else if (arg === '--dockerfile') {
      parsed.dockerfile = readValue(i, arg)
      i++
    } else if (arg === '--target') {
      parsed.target = readValue(i, arg)
      i++
    } else if (arg === '--build-arg') {
      parsed.buildArgs.push(readValue(i, arg))
      i++
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`)
    } else {
      positional.push(arg)
    }
  }

  if (positional.length > 2) {
    throw new Error(`Unexpected positional argument: ${positional[2]}`)
  }

  parsed.workDir = positional[0] || null
  parsed.repoName = positional[1] || null
  return parsed
}

async function main () {
  let args
  try {
    args = parseArgs(process.argv)
  } catch (error) {
    console.error(`Error: ${error.message}`)
    console.error('Usage: node build-push.mjs <work-dir> <repo-name> [--service <name>] [--context <path>] [--dockerfile <path>] [--target <stage>] [--build-arg <NAME[=value]>]...')
    process.exitCode = 1
    return
  }

  if (!args.workDir || !args.repoName) {
    console.error('Usage: node build-push.mjs <work-dir> <repo-name> [--service <name>] [--context <path>] [--dockerfile <path>] [--target <stage>] [--build-arg <NAME[=value]>]...')
    process.exitCode = 1
    return
  }

  const workDir = path.resolve(args.workDir)
  const buildOptions = {
    serviceName: args.serviceName,
    buildContext: args.buildContext,
    dockerfile: args.dockerfile,
    target: args.target,
    buildArgs: args.buildArgs,
  }
  const localPreflight = preflightLocalBuild(workDir, args.repoName, buildOptions)
  if (!localPreflight.ok) {
    console.log(JSON.stringify({
      success: false,
      stage: 'local_preflight',
      error: localPreflight.error,
    }))
    process.exitCode = 1
    return
  }

  const ghcrResult = await ensureGhcrRegistry({ triggerLogin: true })
  if (!ghcrResult.ok) {
    console.log(JSON.stringify({
      success: false,
      ...(ghcrResult.error
        ? ghcrResult
        : { error: 'Failed to prepare GHCR registry access' }),
    }))
    process.exitCode = 1
    return
  }

  const result = await buildAndPush(
    workDir,
    args.repoName,
    ghcrResult.registryInfo,
    buildOptions,
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
  ensureGhcrRegistry,
  getDateTag,
  loginGhcr,
  parseArgs,
  preflightLocalBuild,
  resolveBuildxMetadata,
  safeServiceKey,
  runDockerBuildx,
  verifyGhcrPublicPull,
}
