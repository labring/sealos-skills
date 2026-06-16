#!/usr/bin/env node

/**
 * Container Image Detection
 *
 * Detects deployment intent and reusable container images for a GitHub project.
 *
 * Priority (conflict resolution): README > Release > CI > project files > direct naming > Docker Hub search
 *
 * Usage:
 *   node detect-image.mjs <github-url> [work-dir]
 *   node detect-image.mjs <work-dir>
 *
 * Output (JSON):
 *   { "found": true, "mode": "reuse-image", "deployment_mode": "prebuilt", ... }
 *   { "found": false, "mode": "build-required", "deployment_mode": "build", "reason": "..." }
 */

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const BUILD_SIGNAL_RES = [
  /\bdocker\s+build\b/i,
  /\bdocker\s+compose\s+build\b/i,
  /\bdocker-compose\s+build\b/i,
  /\bdocker\s+compose\s+up\b[^\n]*--build\b/i,
  /\bcompose\s+up\b[^\n]*--build\b/i,
  /\bbuildx\s+build\b/i,
]

const DEPLOY_SECTION_RES = [
  /^#+\s*(deploy(?:ment)?|install(?:ation)?|docker|quick\s*start|getting\s*started|running|usage)\b/im,
  /^#+\s*(部署|安装|运行|快速开始)\b/im,
]

// ── Infrastructure images to exclude ─────────────────────

const INFRA_IMAGES = new Set([
  'postgres', 'postgresql', 'mysql', 'mariadb', 'redis', 'mongo', 'mongodb',
  'memcached', 'elasticsearch', 'rabbitmq', 'minio', 'nats', 'zookeeper',
  'kafka', 'consul', 'vault', 'nginx', 'traefik', 'envoy', 'haproxy',
])

function isInfraImage (name) {
  const lower = name.toLowerCase()
  return INFRA_IMAGES.has(lower) || [...INFRA_IMAGES].some(inf => lower.startsWith(inf + ':') || lower === inf)
}

// ── GitHub URL Parser ──────────────────────────────────────

function parseGithubUrl (url) {
  const sshMatch = url.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/)
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] }

  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/)
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] }

  return null
}

// ── Image Reference Parser ────────────────────────────────

function parseImageRef (raw) {
  const s = raw.trim().replace(/^['"]|['"]$/g, '')
  if (!s || s.startsWith('$') || s.startsWith('{')) return null

  const ghcrMatch = s.match(/^ghcr\.io\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?::([a-zA-Z0-9_.-]+))?$/)
  if (ghcrMatch) return { registry: 'ghcr', owner: ghcrMatch[1], repo: ghcrMatch[2], tag: ghcrMatch[3] || null }

  const dockerMatch = s.match(/^(?:docker\.io\/)?([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?::([a-zA-Z0-9_.-]+))?$/)
  if (dockerMatch) {
    const owner = dockerMatch[1]
    const repo = dockerMatch[2]
    if (owner === 'library') return null
    return { registry: 'dockerhub', owner, repo, tag: dockerMatch[3] || null }
  }

  return null
}

function imageKey (img) {
  return `${img.registry}:${img.owner}/${img.repo}`
}

function dedupeImages (images) {
  const seen = new Set()
  return images.filter(img => {
    const key = imageKey(img)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function extractImageRefsFromText (text) {
  const images = []

  for (const m of text.matchAll(/ghcr\.io\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?::([a-zA-Z0-9_.-]+))?/g)) {
    images.push({ registry: 'ghcr', owner: m[1], repo: m[2], tag: m[3] || null })
  }

  for (const m of text.matchAll(/docker\s+(?:run|pull)\s+[^\n]*?(?:docker\.io\/)?([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?::([a-zA-Z0-9_.-]+))?/g)) {
    if (m[1] === 'io') continue
    images.push({ registry: 'dockerhub', owner: m[1], repo: m[2], tag: m[3] || null })
  }

  for (const m of text.matchAll(/hub\.docker\.com\/r\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/g)) {
    images.push({ registry: 'dockerhub', owner: m[1], repo: m[2], tag: null })
  }

  return dedupeImages(images.filter(img => !isInfraImage(img.repo) && !isInfraImage(img.owner)))
}

function hasBuildSignals (text) {
  return BUILD_SIGNAL_RES.some(re => re.test(text))
}

function extractDeploySections (content) {
  const lines = content.split('\n')
  const sections = []
  let current = null
  let inFence = false

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      if (current) current.push(line)
      continue
    }

    if (!inFence && /^#+\s/.test(line)) {
      const isDeploy = DEPLOY_SECTION_RES.some(re => re.test(line))
      if (isDeploy) {
        current = [line]
        sections.push(current)
      } else if (current) {
        current = null
      }
    } else if (current) {
      current.push(line)
    }
  }

  if (sections.length === 0) return [content]
  return sections.map(s => s.join('\n'))
}

function collectReadmeFiles (workDir) {
  const files = []
  const rootNames = ['README.md', 'readme.md', 'README.MD', 'Readme.md']

  for (const name of rootNames) {
    const p = path.join(workDir, name)
    if (fs.existsSync(p)) files.push(p)
  }

  const docsDir = path.join(workDir, 'docs')
  if (fs.existsSync(docsDir)) {
    walkDocs(docsDir, files)
  }

  return [...new Set(files)]
}

function walkDocs (dir, out) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkDocs(full, out)
      continue
    }
    if (!entry.name.endsWith('.md')) continue
    const lower = entry.name.toLowerCase()
    if (
      lower.includes('readme') ||
      lower.includes('install') ||
      lower.includes('deploy') ||
      lower.includes('docker')
    ) {
      out.push(full)
    }
  }
}

function analyzeReadmeDeployment (workDir) {
  const files = collectReadmeFiles(workDir)
  const evidence = []
  const images = []
  let buildSignals = false
  let deployContent = ''

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')
    const rel = path.relative(workDir, file)
    const sections = extractDeploySections(content)
    const scoped = sections.join('\n\n')
    deployContent += `\n${scoped}`

    if (hasBuildSignals(scoped)) {
      buildSignals = true
      evidence.push({ source: 'readme', signal: `build instructions in ${rel}` })
    }

    const found = extractImageRefsFromText(scoped)
    for (const img of found) {
      images.push(img)
      evidence.push({
        source: 'readme',
        signal: `${img.registry === 'ghcr' ? 'ghcr.io' : 'docker.io'}/${img.owner}/${img.repo}${img.tag ? `:${img.tag}` : ''} in ${rel}`,
      })
    }
  }

  const uniqueImages = dedupeImages(images)
  let deploymentMode = 'unclear'
  if (buildSignals) deploymentMode = 'build'
  else if (uniqueImages.length > 0) deploymentMode = 'prebuilt'

  return { deploymentMode, images: uniqueImages, buildSignals, evidence, deployContent }
}

// ── Docker Hub ─────────────────────────────────────────────

async function checkDockerHub (namespace, repoName, preferredTag = null) {
  const url = `https://hub.docker.com/v2/namespaces/${namespace}/repositories/${repoName}/tags?page_size=10`
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    const resp = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)

    if (!resp.ok) return null

    const data = await resp.json()
    if (!data.results || data.results.length === 0) return null

    const versionTagRe = /^v?\d+\.\d+/

    if (preferredTag) {
      const entry = data.results.find(e => e.name === preferredTag)
      if (entry?.images?.some(img => img.architecture === 'amd64')) {
        const platforms = entry.images
          .map(img => `${img.os}/${img.architecture}`)
          .filter((v, i, a) => a.indexOf(v) === i)
        return { source: 'dockerhub', image: `${namespace}/${repoName}`, tag: preferredTag, platforms }
      }
    }

    let bestTag = null
    for (const entry of data.results) {
      const hasAmd64 = entry.images?.some(img => img.architecture === 'amd64')
      if (!hasAmd64) continue

      const platforms = entry.images
        .map(img => `${img.os}/${img.architecture}`)
        .filter((v, i, a) => a.indexOf(v) === i)

      if (!bestTag || (versionTagRe.test(entry.name) && !versionTagRe.test(bestTag.tag))) {
        bestTag = { tag: entry.name, platforms }
      }
    }

    if (!bestTag) return null
    return { source: 'dockerhub', image: `${namespace}/${repoName}`, tag: bestTag.tag, platforms: bestTag.platforms }
  } catch {
    return null
  }
}

// ── GHCR ───────────────────────────────────────────────────

async function checkGhcr (owner, repo, preferredTag = null) {
  try {
    const tokenController = new AbortController()
    const tokenTimer = setTimeout(() => tokenController.abort(), 10000)
    const tokenResp = await fetch(
      `https://ghcr.io/token?scope=repository:${owner}/${repo}:pull`,
      { signal: tokenController.signal },
    )
    clearTimeout(tokenTimer)

    if (!tokenResp.ok) return null
    const { token } = await tokenResp.json()

    const tagsController = new AbortController()
    const tagsTimer = setTimeout(() => tagsController.abort(), 10000)
    const tagsResp = await fetch(
      `https://ghcr.io/v2/${owner}/${repo}/tags/list`,
      { headers: { Authorization: `Bearer ${token}` }, signal: tagsController.signal },
    )
    clearTimeout(tagsTimer)

    if (!tagsResp.ok) return null
    const { tags } = await tagsResp.json()
    if (!tags || tags.length === 0) return null

    const versionTagRe = /^v?\d+\.\d+/
    const ordered = preferredTag && tags.includes(preferredTag)
      ? [preferredTag, ...tags.filter(t => t !== preferredTag)]
      : [...tags].sort((a, b) => {
        const aVer = versionTagRe.test(a) ? 1 : 0
        const bVer = versionTagRe.test(b) ? 1 : 0
        return bVer - aVer
      })

    for (const tag of ordered.slice(0, 5)) {
      try {
        const mfController = new AbortController()
        const mfTimer = setTimeout(() => mfController.abort(), 10000)
        const mfResp = await fetch(
          `https://ghcr.io/v2/${owner}/${repo}/manifests/${tag}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json',
            },
            signal: mfController.signal,
          },
        )
        clearTimeout(mfTimer)

        if (!mfResp.ok) continue

        const manifest = await mfResp.json()
        let platforms = []

        if (manifest.manifests) {
          platforms = manifest.manifests
            .filter(m => m.platform)
            .map(m => `${m.platform.os}/${m.platform.architecture}`)
          if (!platforms.some(p => p.includes('amd64'))) continue
        } else {
          platforms = ['linux/amd64']
        }

        return { source: 'ghcr', image: `ghcr.io/${owner}/${repo}`, tag, platforms }
      } catch {
        continue
      }
    }

    return null
  } catch {
    return null
  }
}

async function verifyImageRef (img) {
  if (img.registry === 'ghcr') {
    return checkGhcr(img.owner, img.repo, img.tag)
  }
  return checkDockerHub(img.owner, img.repo, img.tag)
}

// ── Docker Compose Image Extraction ────────────────────────

function extractImagesFromCompose (workDir) {
  const images = []
  const composeNames = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']

  for (const name of composeNames) {
    const p = path.join(workDir, name)
    if (!fs.existsSync(p)) continue

    const content = fs.readFileSync(p, 'utf-8')
    for (const m of content.matchAll(/^\s*image:\s*['"]?([^\s'"#]+)['"]?/gm)) {
      const ref = parseImageRef(m[1])
      if (!ref) continue
      if (isInfraImage(ref.repo) || isInfraImage(ref.owner)) continue
      images.push(ref)
    }
    break
  }

  return dedupeImages(images)
}

// ── CI Workflow Image Extraction ───────────────────────────

function extractImagesFromWorkflows (workDir) {
  const images = []
  const workflowDir = path.join(workDir, '.github', 'workflows')

  if (!fs.existsSync(workflowDir)) return images

  let files
  try {
    files = fs.readdirSync(workflowDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
  } catch {
    return images
  }

  for (const file of files) {
    const content = fs.readFileSync(path.join(workflowDir, file), 'utf-8')

    for (const m of content.matchAll(/docker\s+push\s+['"]?([^\s'"$]+)['"]?/g)) {
      const ref = parseImageRef(m[1])
      if (ref) images.push(ref)
    }

    for (const m of content.matchAll(/docker\s+buildx\s+[^]*?-t\s+['"]?([^\s'"$]+)['"]?/g)) {
      const ref = parseImageRef(m[1])
      if (ref) images.push(ref)
    }

    for (const m of content.matchAll(/images:\s*['"]?([^\s'"#]+)['"]?/g)) {
      const ref = parseImageRef(m[1])
      if (ref) images.push(ref)
    }

    for (const m of content.matchAll(/tags:\s*[|>]?\s*\n((?:\s+.+\n?)*)/g)) {
      const block = m[1]
      for (const line of block.split('\n')) {
        const tagMatch = line.match(/^\s*-?\s*['"]?([^\s'"#$]+)['"]?\s*$/)
        if (tagMatch) {
          const ref = parseImageRef(tagMatch[1])
          if (ref) images.push(ref)
        }
      }
    }
  }

  return dedupeImages(images)
}

// ── Release extraction ─────────────────────────────────────

async function fetchGithubReleases (owner, repo) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'sealos-deploy-detect-image',
  }
  const token = process.env.GITHUB_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`

  const texts = []
  const evidence = []

  for (const endpoint of [
    `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
    `https://api.github.com/repos/${owner}/${repo}/releases?per_page=5`,
  ]) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10000)
      const resp = await fetch(endpoint, { headers, signal: controller.signal })
      clearTimeout(timer)
      if (!resp.ok) continue

      const data = await resp.json()
      const releases = Array.isArray(data) ? data : [data]
      for (const release of releases) {
        if (release?.body) {
          texts.push(release.body)
          evidence.push({
            source: 'release',
            signal: `release ${release.tag_name || release.name || 'unknown'}`,
          })
        }
      }
      if (texts.length > 0) break
    } catch {
      continue
    }
  }

  const images = []
  for (const text of texts) {
    images.push(...extractImageRefsFromText(text))
  }

  return { images: dedupeImages(images), evidence }
}

function extractImagesFromLocalReleases (workDir) {
  const evidence = []
  const images = []
  const candidates = [
    'CHANGELOG.md',
    'RELEASES.md',
    path.join('.github', 'release.yml'),
  ]

  for (const rel of candidates) {
    const p = path.join(workDir, rel)
    if (!fs.existsSync(p)) continue
    const content = fs.readFileSync(p, 'utf-8')
    images.push(...extractImageRefsFromText(content))
    evidence.push({ source: 'release', signal: `local file ${rel}` })
  }

  return { images: dedupeImages(images), evidence }
}

// ── Package metadata ───────────────────────────────────────

function extractPackageHints (workDir) {
  const evidence = []
  const pkgPath = path.join(workDir, 'package.json')
  if (!fs.existsSync(pkgPath)) return { version: null, evidence }

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    if (pkg.version) {
      evidence.push({ source: 'ci-workflow', signal: `package.json version ${pkg.version}` })
    }
    return { version: pkg.version || null, evidence }
  } catch {
    return { version: null, evidence }
  }
}

// ── Docker Hub Search + Verify ─────────────────────────────

async function searchAndVerifyDockerHub (query, githubOwner, githubRepo) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    const resp = await fetch(
      `https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(query)}&page_size=5`,
      { signal: controller.signal },
    )
    clearTimeout(timer)

    if (!resp.ok) return null
    const data = await resp.json()
    if (!data.results || data.results.length === 0) return null

    const githubUrlPattern = new RegExp(`github\\.com[/:]${githubOwner}/${githubRepo}`, 'i')

    for (const result of data.results) {
      const ns = result.repo_owner || result.repo_name?.split('/')[0]
      const repo = result.repo_name?.includes('/') ? result.repo_name.split('/')[1] : result.repo_name
      if (!ns || !repo) continue

      try {
        const detailController = new AbortController()
        const detailTimer = setTimeout(() => detailController.abort(), 10000)
        const detailResp = await fetch(
          `https://hub.docker.com/v2/repositories/${ns}/${repo}/`,
          { signal: detailController.signal },
        )
        clearTimeout(detailTimer)

        if (!detailResp.ok) continue
        const detail = await detailResp.json()

        const desc = (detail.full_description || '') + ' ' + (detail.description || '')
        if (!githubUrlPattern.test(desc)) continue

        const tagResult = await checkDockerHub(ns, repo)
        if (tagResult) {
          return { ...tagResult, source: 'dockerhub-search' }
        }
      } catch {
        continue
      }
    }

    return null
  } catch {
    return null
  }
}

function confidenceForSource (source) {
  if (source === 'readme' || source === 'release') return 'high'
  if (source === 'ci-workflow' || source === 'compose' || source === 'ghcr' || source === 'dockerhub') return 'medium'
  return 'low'
}

function buildReuseResult (verified, source, evidence) {
  return {
    found: true,
    mode: 'reuse-image',
    deployment_mode: 'prebuilt',
    image: verified.image,
    tag: verified.tag,
    source,
    confidence: confidenceForSource(source),
    platforms: verified.platforms,
    evidence,
  }
}

function buildBuildRequiredResult (reason, evidence = [], deploymentMode = 'build') {
  return {
    found: false,
    mode: 'build-required',
    deployment_mode: deploymentMode,
    reason,
    evidence,
  }
}

async function verifyCandidateList (candidates, source, evidence) {
  for (const img of candidates) {
    const verified = await verifyImageRef(img)
    if (verified) {
      return buildReuseResult(verified, source, evidence)
    }
  }
  return null
}

// ── Orchestrator ───────────────────────────────────────────

async function detectExistingImage (githubUrl, workDir) {
  const parsed = parseGithubUrl(githubUrl)
  if (!parsed) {
    return { found: false, mode: 'build-required', deployment_mode: 'unclear', error: 'Cannot parse GitHub URL' }
  }
  const { owner, repo } = parsed
  const evidence = []

  if (!workDir) {
    workDir = '.'
  }

  // Stage A — README intent (local, no network)
  const readme = analyzeReadmeDeployment(workDir)
  evidence.push(...readme.evidence)

  // Stage B — evidence tiers: README > Release > CI > compose
  if (readme.images.length > 0) {
    const result = await verifyCandidateList(readme.images, 'readme', evidence)
    if (result) return result
  }

  if (readme.deploymentMode === 'build') {
    return buildBuildRequiredResult(
      'README documents docker build deployment; skipping registry reuse',
      evidence,
      'build',
    )
  }

  const releaseRemote = await fetchGithubReleases(owner, repo)
  evidence.push(...releaseRemote.evidence)
  if (releaseRemote.images.length > 0) {
    const result = await verifyCandidateList(releaseRemote.images, 'release', evidence)
    if (result) return result
  }

  const releaseLocal = extractImagesFromLocalReleases(workDir)
  evidence.push(...releaseLocal.evidence)
  if (releaseLocal.images.length > 0) {
    const result = await verifyCandidateList(releaseLocal.images, 'release', evidence)
    if (result) return result
  }

  const workflowImages = extractImagesFromWorkflows(workDir)
  if (workflowImages.length > 0) {
    evidence.push({ source: 'ci-workflow', signal: `${workflowImages.length} workflow image reference(s)` })
    const result = await verifyCandidateList(workflowImages, 'ci-workflow', evidence)
    if (result) return result
  }

  extractPackageHints(workDir).evidence.forEach(e => evidence.push(e))

  const composeImages = extractImagesFromCompose(workDir)
  if (composeImages.length > 0) {
    evidence.push({ source: 'compose', signal: `${composeImages.length} compose image reference(s)` })
    const result = await verifyCandidateList(composeImages, 'compose', evidence)
    if (result) return result
  }

  // Stage D — direct naming match
  const dockerhub = await checkDockerHub(owner, repo)
  if (dockerhub) {
    return buildReuseResult(dockerhub, 'dockerhub', [
      ...evidence,
      { source: 'dockerhub', signal: `direct match ${owner}/${repo}` },
    ])
  }

  if (repo !== owner) {
    const dockerhubFallback = await checkDockerHub(repo, repo)
    if (dockerhubFallback) {
      return buildReuseResult(dockerhubFallback, 'dockerhub', [
        ...evidence,
        { source: 'dockerhub', signal: `direct match ${repo}/${repo}` },
      ])
    }
  }

  const ghcr = await checkGhcr(owner, repo)
  if (ghcr) {
    return buildReuseResult(ghcr, 'ghcr', [
      ...evidence,
      { source: 'ghcr', signal: `direct match ghcr.io/${owner}/${repo}` },
    ])
  }

  // Stage E — Docker Hub search
  const searchResult = await searchAndVerifyDockerHub(repo, owner, repo)
  if (searchResult) {
    return buildReuseResult(searchResult, 'dockerhub-search', [
      ...evidence,
      { source: 'dockerhub-search', signal: `search match for ${repo}` },
    ])
  }

  return buildBuildRequiredResult(
    'No reusable amd64 image found',
    evidence,
    readme.deploymentMode === 'prebuilt' ? 'prebuilt' : 'unclear',
  )
}

async function detectWithoutGithubUrl (workDir) {
  const evidence = []
  const readme = analyzeReadmeDeployment(workDir)
  evidence.push(...readme.evidence)

  const releaseLocal = extractImagesFromLocalReleases(workDir)
  evidence.push(...releaseLocal.evidence)

  const tiers = [
    { images: readme.images, source: 'readme' },
    { images: releaseLocal.images, source: 'release' },
    { images: extractImagesFromWorkflows(workDir), source: 'ci-workflow' },
    { images: extractImagesFromCompose(workDir), source: 'compose' },
  ]

  for (const tier of tiers) {
    if (tier.images.length === 0) continue
    const result = await verifyCandidateList(tier.images, tier.source, evidence)
    if (result) {
      result.source = `${result.source}-local`
      return result
    }
  }

  if (readme.deploymentMode === 'build') {
    return buildBuildRequiredResult(
      'README documents docker build deployment; skipping registry reuse',
      evidence,
      'build',
    )
  }

  return buildBuildRequiredResult('No reusable amd64 image found', evidence, 'unclear')
}

// ── Git Remote Helper ─────────────────────────────────────

function getGithubUrlFromGitRemote (dir) {
  try {
    const remote = execSync('git remote get-url origin', { cwd: dir, encoding: 'utf-8' }).trim()
    if (remote.includes('github.com')) return remote
  } catch {}
  return null
}

// ── CLI ────────────────────────────────────────────────────

const [, , arg1, arg2] = process.argv

if (!arg1) {
  console.error('Usage: node detect-image.mjs <github-url> [work-dir]')
  console.error('       node detect-image.mjs <work-dir>')
  process.exit(1)
}

let githubUrl, workDir
if (/^https?:\/\//.test(arg1) || arg1.startsWith('git@')) {
  githubUrl = arg1
  workDir = arg2 || '.'
} else {
  workDir = arg1
  githubUrl = getGithubUrlFromGitRemote(workDir)
}

const result = githubUrl
  ? await detectExistingImage(githubUrl, workDir)
  : await detectWithoutGithubUrl(workDir)

console.log(JSON.stringify(result, null, 2))
