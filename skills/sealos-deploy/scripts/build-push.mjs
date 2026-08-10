#!/usr/bin/env node

/**
 * Local Docker build / push helper (linux/amd64).
 *
 * Phase 3 local path:
 *   --mode build  → build only (no push)
 *   --mode push   → push an existing local tag
 *   --mode all    → build and push (default; UPDATE / simple paths)
 *
 * Sandbox builds use k8s-kaniko-job instead of this script.
 *
 * Usage:
 *   node build-push.mjs <work-dir> <image-name> --mode build [--context <dir>] [--dockerfile <path>]
 *   node build-push.mjs <work-dir> <image-name> --mode push --registry ghcr|dockerhub [--user <user>] [--image <ref>] [--local-tag <ref>]
 *   node build-push.mjs <work-dir> <image-name> [--mode all] --registry ghcr|dockerhub [--user <user>]
 *
 * Output (JSON on stdout). Does not write phase-3/build-result.json — the Phase 3
 * agent aggregates pushed + pull_access after all services complete.
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { ensureGhScopesWithPrompt, hasGhCli, run } from './gh-auth-utils.mjs'

function getDateTag () {
  const d = new Date()
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const time = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`
  return `${date}-${time}`
}

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
  } catch {
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

async function autoDetectRegistry () {
  if (hasGhCli()) {
    const ghcrResult = await ensureGhcrRegistry({ triggerLogin: true })
    if (ghcrResult.ok) return ghcrResult.registryInfo
    throw ghcrResult
  }

  const dockerhub = detectDockerHub()
  if (dockerhub) return dockerhub
  return null
}

function sanitizeName (name) {
  return name.toLowerCase().replace(/[^a-z0-9_.-]/g, '-')
}

function buildRemoteImage (registryInfo, imageName, tag) {
  const sanitized = sanitizeName(imageName)
  const registryNamespace = registryInfo.user.toLowerCase()
  if (registryInfo.registry === 'ghcr') {
    return `ghcr.io/${registryNamespace}/${sanitized}:${tag}`
  }
  return `${registryNamespace}/${sanitized}:${tag}`
}

function resolveDockerfile (workDir, contextDir, dockerfileArg) {
  if (dockerfileArg) {
    const candidate = path.isAbsolute(dockerfileArg)
      ? dockerfileArg
      : path.resolve(workDir, dockerfileArg)
    return candidate
  }
  return path.join(contextDir, 'Dockerfile')
}

function buildOnly (workDir, imageName, { context = '.', dockerfile = null, tag = null } = {}) {
  const contextDir = path.resolve(workDir, context)
  const dockerfilePath = resolveDockerfile(workDir, contextDir, dockerfile)
  const localTag = tag || `${sanitizeName(imageName)}:local-build`

  if (!fs.existsSync(dockerfilePath)) {
    return { success: false, error: `No Dockerfile found at ${dockerfilePath}` }
  }
  if (!fs.existsSync(contextDir) || !fs.statSync(contextDir).isDirectory()) {
    return { success: false, error: `Build context is not a directory: ${contextDir}` }
  }

  try {
    const dockerfileFlag = path.relative(contextDir, dockerfilePath) === 'Dockerfile'
      && path.dirname(dockerfilePath) === contextDir
      ? ''
      : `-f ${JSON.stringify(dockerfilePath)} `
    execSync(
      `docker buildx build --platform linux/amd64 ${dockerfileFlag}-t ${localTag} --load .`,
      { cwd: contextDir, stdio: 'pipe', timeout: 600000 },
    )
    return { success: true, mode: 'build', image: localTag, local_tag: localTag }
  } catch (e) {
    return { success: false, error: e.stderr?.toString() || e.message }
  }
}

function pushOnly (imageRef, registryInfo, { localTag = null } = {}) {
  try {
    if (localTag && localTag !== imageRef) {
      execSync(`docker tag ${localTag} ${imageRef}`, { stdio: 'pipe', timeout: 60000 })
    }
    execSync(`docker push ${imageRef}`, { stdio: 'pipe', timeout: 600000 })
    const result = {
      success: true,
      mode: 'push',
      image: imageRef,
      registry: registryInfo.registry,
    }
    if (registryInfo.registry === 'ghcr') {
      result.requires_image_pull_secret = true
      result.warning = 'Treat locally built GHCR images as private by default until Phase 3 records pull_access.'
    }
    return result
  } catch (e) {
    return { success: false, error: e.stderr?.toString() || e.message }
  }
}

function buildAndPush (workDir, imageName, registryInfo, { context = '.', dockerfile = null } = {}) {
  const tag = getDateTag()
  const remoteImage = buildRemoteImage(registryInfo, imageName, tag)
  const contextDir = path.resolve(workDir, context)
  const dockerfilePath = resolveDockerfile(workDir, contextDir, dockerfile)

  if (!fs.existsSync(dockerfilePath)) {
    return { success: false, error: `No Dockerfile found at ${dockerfilePath}` }
  }

  try {
    const dockerfileFlag = path.relative(contextDir, dockerfilePath) === 'Dockerfile'
      && path.dirname(dockerfilePath) === contextDir
      ? ''
      : `-f ${JSON.stringify(dockerfilePath)} `
    execSync(
      `docker buildx build --platform linux/amd64 ${dockerfileFlag}-t ${remoteImage} --push .`,
      { cwd: contextDir, stdio: 'pipe', timeout: 600000 },
    )

    const result = { success: true, mode: 'all', image: remoteImage, registry: registryInfo.registry }
    if (registryInfo.registry === 'ghcr') {
      result.requires_image_pull_secret = true
      result.warning = 'Treat locally built GHCR images as private by default until Phase 3 records pull_access.'
    }
    return result
  } catch (e) {
    return { success: false, error: e.stderr?.toString() || e.message }
  }
}

function parseArgs (argv) {
  const args = argv.slice(2)
  const parsed = {
    workDir: null,
    imageName: null,
    registry: null,
    user: null,
    mode: 'all',
    context: '.',
    dockerfile: null,
    image: null,
    localTag: null,
  }

  const positional = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--registry' && args[i + 1]) {
      parsed.registry = args[++i]
    } else if (args[i] === '--user' && args[i + 1]) {
      parsed.user = args[++i]
    } else if (args[i] === '--mode' && args[i + 1]) {
      parsed.mode = args[++i]
    } else if (args[i] === '--context' && args[i + 1]) {
      parsed.context = args[++i]
    } else if (args[i] === '--dockerfile' && args[i + 1]) {
      parsed.dockerfile = args[++i]
    } else if (args[i] === '--image' && args[i + 1]) {
      parsed.image = args[++i]
    } else if (args[i] === '--local-tag' && args[i + 1]) {
      parsed.localTag = args[++i]
    } else {
      positional.push(args[i])
    }
  }

  parsed.workDir = positional[0] || null
  parsed.imageName = positional[1] || null
  return parsed
}

async function resolveRegistry (args) {
  if (args.registry === 'ghcr') {
    const ghcrResult = await ensureGhcrRegistry({ triggerLogin: true })
    if (!ghcrResult.ok) {
      return { ok: false, error: ghcrResult }
    }
    return { ok: true, registryInfo: ghcrResult.registryInfo }
  }

  if (args.registry === 'dockerhub') {
    if (!args.user) {
      const dh = detectDockerHub()
      if (!dh) {
        return { ok: false, error: { error: 'Not logged in to Docker Hub. Run: docker login' } }
      }
      return { ok: true, registryInfo: dh }
    }
    return { ok: true, registryInfo: { registry: 'dockerhub', user: args.user } }
  }

  try {
    const registryInfo = await autoDetectRegistry()
    if (!registryInfo) {
      return {
        ok: false,
        error: {
          error: 'No container registry available. Install gh CLI (brew install gh && gh auth login) or run docker login.',
        },
      }
    }
    return { ok: true, registryInfo }
  } catch (error) {
    const structured = error && typeof error === 'object' && 'error' in error
    return { ok: false, error: structured ? error : { error: error.message } }
  }
}

const args = parseArgs(process.argv)

if (!args.workDir || !args.imageName) {
  console.error('Usage: node build-push.mjs <work-dir> <image-name> [--mode build|push|all] [--registry ghcr|dockerhub] [--user <user>] [--context <dir>] [--dockerfile <path>] [--image <ref>] [--local-tag <ref>]')
  process.exit(1)
}

if (!['build', 'push', 'all'].includes(args.mode)) {
  console.log(JSON.stringify({ success: false, error: `Invalid --mode ${args.mode}` }))
  process.exit(1)
}

const workDir = path.resolve(args.workDir)
let result

if (args.mode === 'build') {
  result = buildOnly(workDir, args.imageName, {
    context: args.context,
    dockerfile: args.dockerfile,
  })
} else {
  const registryResult = await resolveRegistry(args)
  if (!registryResult.ok) {
    console.log(JSON.stringify({ success: false, ...(registryResult.error.error ? registryResult.error : { error: 'Failed to prepare registry access' }) }))
    process.exit(1)
  }

  if (args.mode === 'push') {
    const imageRef = args.image || buildRemoteImage(registryResult.registryInfo, args.imageName, getDateTag())
    const localTag = args.localTag || `${sanitizeName(args.imageName)}:local-build`
    result = pushOnly(imageRef, registryResult.registryInfo, { localTag })
  } else {
    result = buildAndPush(workDir, args.imageName, registryResult.registryInfo, {
      context: args.context,
      dockerfile: args.dockerfile,
    })
  }
}

console.log(JSON.stringify(result, null, 2))
if (!result.success) process.exit(1)
