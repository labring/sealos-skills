#!/usr/bin/env node

/**
 * Phase 1 deterministic official-template matcher.
 *
 * Exact match means the catalog template declares the same source project
 * (its `gitRepo` field equals the project's github_url after normalization).
 * Name similarity alone never matches — names only shortlist which
 * `index.yaml` files are worth fetching.
 *
 * Usage:
 *   node match-official-template.mjs --github-url <url> [--repo-name <name>]
 *
 * Output (JSON on stdout, exit 0 for every non-crash outcome — an absent
 * match is a valid result, not an error):
 *   { "official_template": <raw url|null>, "reason": <string>, "checked": [...] }
 *
 * Test hooks:
 *   SEALOS_TEMPLATE_API_BASE  (default https://api.github.com)
 *   SEALOS_TEMPLATE_RAW_BASE  (default https://raw.githubusercontent.com)
 */

const CATALOG_OWNER = 'labring-actions'
const CATALOG_REPO = 'templates'
const CATALOG_REF = 'kb-0.9'
const FETCH_TIMEOUT_MS = Number(process.env.SEALOS_TEMPLATE_FETCH_TIMEOUT_MS || 20000)
const MAX_CANDIDATE_FETCHES = 10

const API_BASE = process.env.SEALOS_TEMPLATE_API_BASE || 'https://api.github.com'
const RAW_BASE = process.env.SEALOS_TEMPLATE_RAW_BASE || 'https://raw.githubusercontent.com'

function parseArgs(argv) {
  const args = { githubUrl: null, repoName: null }
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--github-url' && argv[i + 1] !== undefined) {
      args.githubUrl = argv[++i]
    } else if (argv[i] === '--repo-name' && argv[i + 1] !== undefined) {
      args.repoName = argv[++i]
    }
  }
  return args
}

function emit(result) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

/** Normalize a GitHub project URL for identity comparison. */
function normalizeGithubUrl(raw) {
  if (!raw || typeof raw !== 'string') return null
  let text = raw.trim().toLowerCase()
  if (!text || text === 'null') return null
  text = text.replace(/^git@github\.com:/, 'https://github.com/')
  text = text.replace(/^http:\/\//, 'https://')
  text = text.replace(/\.git$/, '').replace(/\/+$/, '')
  try {
    const url = new URL(text)
    if (url.hostname !== 'github.com') return null
    const segments = url.pathname.split('/').filter(Boolean)
    if (segments.length < 2) return null
    return `https://github.com/${segments[0]}/${segments[1]}`
  } catch {
    return null
  }
}

/** Loose name key: lowercase alphanumerics only, for candidate shortlisting. */
function nameKey(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

async function fetchText(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'user-agent': 'sealos-deploy-template-matcher' },
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`)
  }
  return response.text()
}

async function resolveCatalogCommit() {
  const url = `${API_BASE}/repos/${CATALOG_OWNER}/${CATALOG_REPO}/commits/${CATALOG_REF}`
  const body = JSON.parse(await fetchText(url))
  if (typeof body.sha !== 'string' || !body.sha) {
    throw new Error('commit response has no sha')
  }
  return body.sha
}

async function listTemplateNames(ref) {
  const url = `${API_BASE}/repos/${CATALOG_OWNER}/${CATALOG_REPO}/git/trees/${ref}?recursive=1`
  const body = JSON.parse(await fetchText(url))
  if (!Array.isArray(body.tree)) {
    throw new Error('tree response has no tree array')
  }
  const names = new Set()
  for (const entry of body.tree) {
    const match = /^template\/([^/]+)\/index\.yaml$/.exec(entry.path || '')
    if (match) names.add(match[1])
  }
  return [...names]
}

/** Extract the declared source-project URL from a template index.yaml body. */
function extractGitRepo(yamlText) {
  const match = /^\s*gitRepo:\s*["']?(\S+?)["']?\s*$/m.exec(yamlText)
  return match ? match[1] : null
}

async function main() {
  const args = parseArgs(process.argv)
  const target = normalizeGithubUrl(args.githubUrl)

  if (!target) {
    emit({
      official_template: null,
      reason: 'no_github_url',
      checked: [],
    })
    return
  }

  const repoLast = target.split('/').pop()
  const candidateKeys = new Set([nameKey(repoLast)])
  if (args.repoName) candidateKeys.add(nameKey(args.repoName))
  candidateKeys.delete('')

  let commitSha
  let templateNames
  try {
    commitSha = await resolveCatalogCommit()
    templateNames = await listTemplateNames(commitSha)
  } catch (error) {
    emit({
      official_template: null,
      reason: 'catalog_unreachable',
      detail: error.message,
      checked: [],
    })
    return
  }

  const candidates = templateNames
    .filter((name) => candidateKeys.has(nameKey(name)))
    .slice(0, MAX_CANDIDATE_FETCHES)

  const checked = []
  const matches = []
  for (const name of candidates) {
    const rawUrl = `${RAW_BASE}/${CATALOG_OWNER}/${CATALOG_REPO}/${commitSha}/template/${name}/index.yaml`
    let gitRepo = null
    try {
      gitRepo = extractGitRepo(await fetchText(rawUrl))
    } catch (error) {
      checked.push({ name, git_repo: null, matched: false, error: error.message })
      continue
    }
    const matched = normalizeGithubUrl(gitRepo) === target
    checked.push({ name, git_repo: gitRepo, matched })
    if (matched) matches.push(rawUrl)
  }

  if (matches.length === 1) {
    emit({ official_template: matches[0], reason: 'exact_match', checked })
    return
  }

  emit({
    official_template: null,
    reason: matches.length > 1 ? 'multiple_matches' : 'no_exact_match',
    checked,
  })
}

main().catch((error) => {
  emit({ official_template: null, reason: 'error', detail: error.message, checked: [] })
})
