#!/usr/bin/env node

/**
 * Container image discovery for Phase 2.
 *
 * Only images explicitly declared by the project are eligible. Declarations
 * are collected in this order:
 *
 *   README > CI workflows > Compose
 *
 * Every parseable declaration is retained in the image inventory, including
 * database and infrastructure images. Registry names inferred from the GitHub
 * owner/repository are intentionally never queried. A selected primary image
 * is returned as an immutable digest reference while preserving the exact
 * declared tag used for resolution. CPU architecture is not pre-screened;
 * rare incompatibilities are diagnosed from the deployed runtime.
 *
 * Usage:
 *   node detect-image.mjs <github-url> [work-dir]
 *   node detect-image.mjs <work-dir>
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { pathToFileURL } from 'url'

const SOURCE_PRIORITY = Object.freeze({
  readme: 0,
  ci: 1,
  compose: 2,
})

const DATABASE_NAMES = new Set([
  'cockroachdb',
  'couchdb',
  'database',
  'db',
  'mariadb',
  'mongo',
  'mongodb',
  'mysql',
  'neo4j',
  'postgres',
  'postgresql',
  'questdb',
  'timescaledb',
])

const INFRASTRUCTURE_NAMES = new Set([
  'broker',
  'cache',
  'consul',
  'elasticsearch',
  'envoy',
  'etcd',
  'haproxy',
  'kafka',
  'keycloak',
  'memcached',
  'minio',
  'nats',
  'nginx',
  'opensearch',
  'proxy',
  'queue',
  'rabbitmq',
  'redis',
  'traefik',
  'vault',
  'zookeeper',
])

const MANIFEST_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ')

function stripQuotes (value) {
  return value.trim().replace(/^(['"`])(.*)\1$/, '$2')
}

function stripYamlComment (value) {
  let quote = null
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if ((character === '"' || character === "'") && value[index - 1] !== '\\') {
      quote = quote === character ? null : (quote || character)
    } else if (character === '#' && quote === null) {
      return value.slice(0, index).trim()
    }
  }
  return value.trim()
}

function imageBasename (image) {
  const parts = image.repository.split('/')
  return parts[parts.length - 1].toLowerCase()
}

function classifyImageRole (image, serviceName = '') {
  const names = [
    imageBasename(image),
    serviceName.toLowerCase(),
  ].filter(Boolean)
  const tokens = names.flatMap(name => name.split(/[^a-z0-9]+/).filter(Boolean))

  if (tokens.some(name => DATABASE_NAMES.has(name))) return 'database'
  if (tokens.some(name => INFRASTRUCTURE_NAMES.has(name))) return 'infrastructure'
  return 'application'
}

/**
 * Parse a registry reference without changing its tag or digest.
 *
 * Docker Hub's implicit `library/` namespace is used only for registry calls;
 * `displayImage` retains the familiar declaration form for compatibility.
 */
function parseImageRef (raw) {
  const declaredRef = stripQuotes(stripYamlComment(String(raw || '')))
    .replace(/[),;]+$/, '')

  if (!declaredRef || /\s/.test(declaredRef) || declaredRef.includes('$')) return null
  if (/^(?:https?|git):\/\//i.test(declaredRef)) return null

  const digestParts = declaredRef.split('@')
  if (digestParts.length > 2) return null

  const nameAndTag = digestParts[0]
  const declaredDigest = digestParts[1] || null
  if (declaredDigest && !/^sha256:[a-fA-F0-9]{64}$/.test(declaredDigest)) return null

  const lastSlash = nameAndTag.lastIndexOf('/')
  const lastColon = nameAndTag.lastIndexOf(':')
  const hasTag = lastColon > lastSlash
  const declaredTag = hasTag ? nameAndTag.slice(lastColon + 1) : null
  const imageName = hasTag ? nameAndTag.slice(0, lastColon) : nameAndTag

  if (!imageName || (hasTag && !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(declaredTag))) return null

  const parts = imageName.split('/')
  const first = parts[0]
  const hasExplicitRegistry = parts.length > 1 &&
    (first.includes('.') || first.includes(':') || first === 'localhost')
  const validParts = parts.every((part, index) => {
    if (!part) return false
    if (index === 0 && hasExplicitRegistry) {
      return /^(?:localhost|[A-Za-z0-9.-]+)(?::[0-9]{1,5})?$/.test(part)
    }
    return /^[A-Za-z0-9_.-]+$/.test(part)
  })
  if (!validParts) return null

  let registryHost
  let repository
  let displayImage
  let registry

  if (hasExplicitRegistry) {
    registryHost = first.toLowerCase()
    repository = parts.slice(1).join('/').toLowerCase()
    if (registryHost === 'docker.io' || registryHost === 'index.docker.io') {
      registryHost = 'registry-1.docker.io'
      registry = 'dockerhub'
      repository = repository.includes('/') ? repository : `library/${repository}`
      displayImage = repository.startsWith('library/')
        ? repository.slice('library/'.length)
        : repository
    } else {
      registry = registryHost === 'ghcr.io' ? 'ghcr' : registryHost
      displayImage = `${first}/${parts.slice(1).join('/')}`
    }
  } else {
    registryHost = 'registry-1.docker.io'
    registry = 'dockerhub'
    repository = parts.length === 1
      ? `library/${parts[0].toLowerCase()}`
      : parts.join('/').toLowerCase()
    displayImage = imageName
  }

  if (!repository) return null

  const selector = declaredDigest || declaredTag || 'latest'
  return {
    registry,
    registryHost,
    repository,
    displayImage,
    declaredRef,
    declaredTag,
    declaredDigest,
    selector,
    key: `${registryHost}/${repository}@${selector}`,
  }
}

function addDeclaration (declarations, raw, evidence) {
  const image = parseImageRef(raw)
  if (!image) {
    const declaredRef = stripQuotes(stripYamlComment(String(raw || '')))
    if (!evidence.retainUnresolved || !declaredRef || !declaredRef.includes('$')) return null
    const literalRegistry = declaredRef.match(/^([A-Za-z0-9.-]+(?::[0-9]{1,5})?)\//)?.[1]
    const unresolved = {
      registry: literalRegistry || 'unresolved',
      registryHost: literalRegistry || 'unresolved',
      repository: declaredRef,
      displayImage: declaredRef,
      declaredRef,
      declaredTag: null,
      declaredDigest: null,
      selector: null,
      key: `unresolved:${evidence.source}:${evidence.sourceFile}:${evidence.service || ''}:${declaredRef}`,
      unresolved: true,
    }
    const declaration = {
      ...unresolved,
      source: evidence.source,
      sourceFile: evidence.sourceFile,
      service: evidence.service || null,
      role: evidence.role || 'application',
      selectionRank: evidence.selectionRank ?? 0,
    }
    declarations.push(declaration)
    return declaration
  }

  const declaration = {
    ...image,
    source: evidence.source,
    sourceFile: evidence.sourceFile,
    service: evidence.service || null,
    role: evidence.role || classifyImageRole(image, evidence.service),
    selectionRank: evidence.selectionRank ?? 0,
  }
  declarations.push(declaration)
  return declaration
}

function resolveComposeImageExpression (raw) {
  const value = stripQuotes(stripYamlComment(String(raw || '')))
  const defaultMatch = value.match(/^\$\{[A-Za-z_][A-Za-z0-9_]*(?::-|-)([^}]+)\}$/)
  return defaultMatch ? defaultMatch[1] : value
}

function parseGithubRepository (url) {
  if (!url) return null
  const match = String(url).match(
    /github\.com(?::|\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/,
  )
  return match ? { owner: match[1], repo: match[2] } : null
}

function getGitHead (workDir) {
  try {
    const head = execFileSync(
      'git',
      ['rev-parse', 'HEAD'],
      { cwd: workDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    return /^[a-fA-F0-9]{40,64}$/.test(head) ? head : null
  } catch {
    return null
  }
}

function resolveCiExpressions (value, context) {
  let resolved = String(value || '')
  const replacements = new Map([
    ['github.repository', context.githubRepository
      ? `${context.githubRepository.owner}/${context.githubRepository.repo}`
      : null],
    ['github.repository_owner', context.githubRepository?.owner || null],
    ['github.event.repository.name', context.githubRepository?.repo || null],
    ['github.sha', context.githubSha || null],
  ])

  for (const [expression, replacement] of replacements) {
    if (!replacement) continue
    const escaped = expression.replace(/\./g, '\\.')
    resolved = resolved.replace(
      new RegExp(`\\$\\{\\{\\s*${escaped}\\s*\\}\\}`, 'g'),
      replacement,
    )
  }
  return resolved
}

function findReadmePath (workDir) {
  const preferred = ['README.md', 'readme.md', 'README.MD', 'Readme.md']
  return preferred
    .map(name => path.join(workDir, name))
    .find(file => fs.existsSync(file)) || null
}

function dockerCommandImage (command, argsText) {
  const tokens = argsText
    .replace(/\\\r?\n/g, ' ')
    .split(/\s+/)
    .map(token => token.replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)

  const runOptionsWithValues = new Set([
    '--add-host', '--annotation', '--attach', '--blkio-weight', '--cap-add',
    '--cap-drop', '--cgroup-parent', '--cidfile', '--cpus', '--device',
    '--dns', '--dns-option', '--dns-search', '--entrypoint', '--env',
    '--env-file', '--expose', '--gpus', '--group-add', '--hostname',
    '--ip', '--ip6', '--label', '--label-file', '--link', '--log-driver',
    '--log-opt', '--memory', '--mount', '--name', '--network',
    '--network-alias', '--pid', '--platform', '--publish', '--restart',
    '--runtime', '--security-opt', '--shm-size', '--stop-signal',
    '--stop-timeout', '--tmpfs', '--ulimit', '--user', '--userns',
    '--volume', '--volume-driver', '--workdir',
    '-a', '-c', '-e', '-h', '-l', '-m', '-p', '-u', '-v', '-w',
  ])
  const pullOptionsWithValues = new Set(['--platform'])
  const optionsWithValues = command === 'run'
    ? runOptionsWithValues
    : pullOptionsWithValues

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === '--') return tokens[index + 1] || null
    if (token.startsWith('-')) {
      const option = token.split('=')[0]
      if (!token.includes('=') && optionsWithValues.has(option)) index += 1
      continue
    }
    if (parseImageRef(token) || token.includes('$')) return token
  }

  return null
}

function extractReadmeDeclarations (workDir) {
  const declarations = []
  const readmePath = findReadmePath(workDir)
  if (!readmePath) return declarations

  const content = fs.readFileSync(readmePath, 'utf8')
  const sourceFile = path.relative(workDir, readmePath)

  for (const match of content.matchAll(/\bghcr\.io\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+(?::[A-Za-z0-9_.-]+|@sha256:[a-fA-F0-9]{64})?/g)) {
    addDeclaration(declarations, match[0], { source: 'readme', sourceFile })
  }

  for (const match of content.matchAll(/\b(?:docker\.io|index\.docker\.io)\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_./-]+)?(?::[A-Za-z0-9_.-]+|@sha256:[a-fA-F0-9]{64})?/g)) {
    addDeclaration(declarations, match[0], { source: 'readme', sourceFile })
  }

  for (const match of content.matchAll(/hub\.docker\.com\/r\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/g)) {
    addDeclaration(declarations, match[1], { source: 'readme', sourceFile })
  }

  for (const match of content.matchAll(/\bdocker\s+(pull|run)\s+([^\n]+)/gi)) {
    const raw = dockerCommandImage(match[1].toLowerCase(), match[2])
    if (raw) addDeclaration(declarations, raw, { source: 'readme', sourceFile })
  }

  // Explicit image labels and Compose snippets in deployment documentation.
  for (const match of content.matchAll(/^\s*(?:[-*>]\s*)?image\s*:\s*(.+?)\s*$/gim)) {
    const raw = resolveComposeImageExpression(match[1])
    if (parseImageRef(raw)) {
      addDeclaration(declarations, raw, { source: 'readme', sourceFile })
    }
  }

  // A backticked image reference is an explicit project declaration. Command
  // snippets are ignored here and handled by the docker command parser above.
  for (const match of content.matchAll(/`([^`\r\n]+)`/g)) {
    const raw = stripQuotes(match[1])
    if (parseImageRef(raw)) {
      addDeclaration(declarations, raw, { source: 'readme', sourceFile })
    }
  }

  // Also accept a reference on its own Markdown line. Requiring a tag, digest,
  // or explicit registry avoids treating ordinary paths such as docs/setup as
  // Docker Hub repositories.
  for (const line of content.split(/\r?\n/)) {
    const raw = stripQuotes(
      line
        .replace(/^\s*(?:[-*+>]\s+|\d+\.\s+)/, '')
        .replace(/[.;]\s*$/, '')
        .trim(),
    )
    const parsed = parseImageRef(raw)
    if (parsed && (
      parsed.declaredTag ||
      parsed.declaredDigest ||
      parsed.registry !== 'dockerhub'
    )) {
      addDeclaration(declarations, raw, { source: 'readme', sourceFile })
    }
  }

  return declarations
}

function extractRefsFromYamlValue (value, context) {
  const refs = []
  const cleaned = resolveCiExpressions(stripYamlComment(value), context)
    .replace(/^[|>]\s*/, '')
    .replace(/^\s*-\s*/, '')
    .replace(/^\[/, '')
    .replace(/\]$/, '')

  if (cleaned.includes('$') && cleaned.trim()) return [stripQuotes(cleaned.trim())]

  for (const token of cleaned.split(/[\s,]+/)) {
    const candidate = token.replace(/^[-'"]+|['"]+$/g, '')
    if (parseImageRef(candidate)) refs.push(candidate)
  }
  return refs
}

function isMetadataTagsOutput (value) {
  return /^\$\{\{\s*steps\.[A-Za-z0-9_-]+\.outputs\.tags\s*}}$/.test(value)
}

function dockerActionForField (lines, fieldIndex, fieldIndent) {
  let stepStart = -1
  let stepIndent = -1

  for (let index = fieldIndex - 1; index >= 0; index -= 1) {
    const step = lines[index].match(/^(\s*)-\s+(?:name|uses|run):/)
    if (step && step[1].length < fieldIndent) {
      stepStart = index
      stepIndent = step[1].length
      break
    }
  }
  if (stepStart < 0) return null

  let stepEnd = lines.length
  for (let index = stepStart + 1; index < lines.length; index += 1) {
    const nextStep = lines[index].match(/^(\s*)-\s+(?:name|uses|run):/)
    if (nextStep && nextStep[1].length === stepIndent) {
      stepEnd = index
      break
    }
  }

  const block = lines.slice(stepStart, stepEnd).join('\n')
  const action = block.match(/\buses:\s*['"]?(docker\/(?:metadata-action|build-push-action))@/i)
  if (!action) return null

  return {
    action: action[1].toLowerCase(),
    block,
    id: block.match(/^\s*id:\s*['"]?([A-Za-z0-9_-]+)/mi)?.[1] || null,
  }
}

function actionStepPublishes (block) {
  const push = block.match(/^\s*push:\s*(.+)$/mi)
  if (push) {
    const value = stripQuotes(stripYamlComment(push[1])).trim()
    if (value === 'true' || /^\$\{\{[\s\S]+}}$/.test(value)) return true
  }
  return /(?:^|[\s,])type\s*=\s*registry(?:[\s,]|$)/i.test(block)
}

function publishedMetadataIds (lines) {
  const ids = new Set()

  for (let index = 0; index < lines.length; index += 1) {
    const step = lines[index].match(/^(\s*)-\s+(?:name|uses|run):/)
    if (!step) continue

    const stepIndent = step[1].length
    let stepEnd = lines.length
    for (let next = index + 1; next < lines.length; next += 1) {
      const nextStep = lines[next].match(/^(\s*)-\s+(?:name|uses|run):/)
      if (nextStep && nextStep[1].length === stepIndent) {
        stepEnd = next
        break
      }
    }

    const block = lines.slice(index, stepEnd).join('\n')
    if (!/\buses:\s*['"]?docker\/build-push-action@/i.test(block)) continue
    if (!actionStepPublishes(block)) continue

    for (const match of block.matchAll(/\$\{\{\s*steps\.([A-Za-z0-9_-]+)\.outputs\.tags\s*}}/g)) {
      ids.add(match[1])
    }
  }

  return ids
}

function dockerBuildCommandPublishes (command) {
  return /(?:^|\s)--push(?:=true)?(?=\s|$)/.test(command) ||
    /(?:^|\s)(?:--output|-o)(?:=|\s+)['"]?type\s*=\s*registry\b/i.test(command)
}

function extractWorkflowDeclarations (workDir, context) {
  const declarations = []
  const workflowDir = path.join(workDir, '.github', 'workflows')
  if (!fs.existsSync(workflowDir)) return declarations

  let files
  try {
    files = fs.readdirSync(workflowDir)
      .filter(file => /\.ya?ml$/i.test(file))
      .sort()
  } catch {
    return declarations
  }

  for (const file of files) {
    const filePath = path.join(workflowDir, file)
    const sourceFile = path.relative(workDir, filePath)
    const content = fs.readFileSync(filePath, 'utf8')
    const uncommented = content
      .split(/\r?\n/)
      .filter(line => !line.trimStart().startsWith('#'))
      .join('\n')
    const shellContent = resolveCiExpressions(
      uncommented.replace(/\\\r?\n\s*/g, ' '),
      context,
    )

    for (const match of shellContent.matchAll(/\bdocker\s+push\s+([^\n;&|]+)/g)) {
      const raw = dockerCommandImage('push', match[1])
      if (raw) {
        addDeclaration(declarations, raw, {
          source: 'ci',
          sourceFile,
          retainUnresolved: true,
        })
      }
    }

    for (const match of shellContent.matchAll(/\bdocker\s+(?:buildx\s+build|build)\b[^\n;&|]*/g)) {
      if (!dockerBuildCommandPublishes(match[0])) continue
      for (const tag of match[0].matchAll(/(?:^|\s)(?:-t|--tag)(?:=|\s+)['"]?([^\s'"]+)/g)) {
        addDeclaration(declarations, tag[1], {
          source: 'ci',
          sourceFile,
          retainUnresolved: true,
        })
      }
    }

    const lines = content.split(/\r?\n/)
    const metadataIdsUsedByPublish = publishedMetadataIds(lines)
    for (let index = 0; index < lines.length; index += 1) {
      const field = lines[index].match(/^(\s*)(?:images|tags):\s*(.*)$/)
      if (!field) continue

      const fieldIndent = field[1].length
      const actionStep = dockerActionForField(lines, index, fieldIndent)
      if (!actionStep) continue
      const fieldName = lines[index].trimStart().split(':', 1)[0]
      if (fieldName === 'images') {
        if (actionStep.action !== 'docker/metadata-action') continue
        if (!actionStep.id || !metadataIdsUsedByPublish.has(actionStep.id)) continue
      }
      if (fieldName === 'tags') {
        if (actionStep.action !== 'docker/build-push-action') continue
        if (!actionStepPublishes(actionStep.block)) continue
      }

      const inline = field[2]
      for (const ref of extractRefsFromYamlValue(inline, context)) {
        if (fieldName === 'tags' && isMetadataTagsOutput(ref)) continue
        addDeclaration(declarations, ref, {
          source: 'ci',
          sourceFile,
          retainUnresolved: true,
        })
      }

      if (inline && inline !== '|' && inline !== '>') continue
      for (let next = index + 1; next < lines.length; next += 1) {
        const indentation = lines[next].match(/^\s*/)[0].length
        if (lines[next].trim() && indentation <= fieldIndent) break
        for (const ref of extractRefsFromYamlValue(lines[next], context)) {
          if (fieldName === 'tags' && isMetadataTagsOutput(ref)) continue
          addDeclaration(declarations, ref, {
            source: 'ci',
            sourceFile,
            retainUnresolved: true,
          })
        }
      }
    }
  }

  return declarations
}

function findComposePath (workDir) {
  return ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml']
    .map(name => path.join(workDir, name))
    .find(file => fs.existsSync(file)) || null
}

function parseYamlMapping (content) {
  const match = content.match(/^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_.-]+)):\s*(.*)$/)
  if (!match) return null
  return {
    key: match[1] || match[2] || match[3],
    value: match[4],
  }
}

function inlineNames (value) {
  return value
    .replace(/^[\[{]/, '')
    .replace(/[\]}]$/, '')
    .split(',')
    .map(item => stripQuotes(item.trim().split(':', 1)[0]))
    .filter(name => /^[A-Za-z0-9_.-]+$/.test(name))
}

function splitInlineYamlItems (value) {
  const items = []
  let start = 0
  let quote = null
  let depth = 0

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if ((character === '"' || character === "'") && value[index - 1] !== '\\') {
      quote = quote === character ? null : (quote || character)
      continue
    }
    if (quote) continue
    if (character === '[' || character === '{') depth += 1
    if (character === ']' || character === '}') depth = Math.max(0, depth - 1)
    if (character === ',' && depth === 0) {
      items.push(value.slice(start, index).trim())
      start = index + 1
    }
  }

  items.push(value.slice(start).trim())
  return items.filter(Boolean)
}

function inlineYamlMapping (value) {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null

  const mapping = new Map()
  const body = trimmed.slice(1, -1)
  for (const item of splitInlineYamlItems(body)) {
    let quote = null
    let depth = 0
    let separator = -1

    for (let index = 0; index < item.length; index += 1) {
      const character = item[index]
      if ((character === '"' || character === "'") && item[index - 1] !== '\\') {
        quote = quote === character ? null : (quote || character)
        continue
      }
      if (quote) continue
      if (character === '[' || character === '{') depth += 1
      if (character === ']' || character === '}') depth = Math.max(0, depth - 1)
      if (character === ':' && depth === 0) {
        separator = index
        break
      }
    }

    if (separator < 0) continue
    const key = stripQuotes(item.slice(0, separator).trim())
    if (!key) continue
    mapping.set(key, item.slice(separator + 1).trim())
  }
  return mapping
}

function buildArgName (raw) {
  let value = String(raw || '').trim().replace(/^-\s*/, '')
  if (!value) return null

  const mapping = parseYamlMapping(value)
  if (mapping) value = mapping.key
  else {
    value = stripQuotes(value)
    const equals = value.indexOf('=')
    if (equals >= 0) value = value.slice(0, equals)
  }

  value = stripQuotes(value.trim())
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) ? value : null
}

function addBuildArg (build, raw) {
  const name = buildArgName(raw)
  if (name && !build.args.includes(name)) build.args.push(name)
}

function addBuildArgs (build, raw) {
  const value = String(raw || '').trim()
  if (!value) return

  if (value.startsWith('[') && value.endsWith(']')) {
    for (const item of splitInlineYamlItems(value.slice(1, -1))) {
      addBuildArg(build, item)
    }
    return
  }

  const mapping = inlineYamlMapping(value)
  if (mapping) {
    for (const name of mapping.keys()) addBuildArg(build, name)
    return
  }

  addBuildArg(build, value)
}

function createBuildPlan (context = '.') {
  return {
    context: stripQuotes(String(context || '').trim()) || '.',
    dockerfile: 'Dockerfile',
    target: null,
    args: [],
    origin: null,
  }
}

function applyBuildMapping (build, mapping) {
  if (mapping.has('context')) {
    build.context = stripQuotes(mapping.get('context')) || '.'
  }
  if (mapping.has('dockerfile')) {
    build.dockerfile = stripQuotes(mapping.get('dockerfile')) || 'Dockerfile'
  }
  if (mapping.has('target')) {
    build.target = stripQuotes(mapping.get('target')) || null
  }
  if (mapping.has('args')) addBuildArgs(build, mapping.get('args'))
}

function parseBuildDeclaration (raw) {
  const value = String(raw || '').trim()
  if (!value) return createBuildPlan()

  const mapping = inlineYamlMapping(value)
  if (mapping) {
    const build = createBuildPlan()
    applyBuildMapping(build, mapping)
    return build
  }

  return createBuildPlan(value)
}

function finalizeBuildPlan (build, composePath) {
  if (!build) return null

  const unresolved = [build.context, build.dockerfile]
    .some(value => value.includes('$'))
  const remoteContext = /^(?:[A-Za-z][A-Za-z0-9+.-]*:\/\/|git@)/.test(build.context)
  if (unresolved || remoteContext) return build

  const composeDir = path.dirname(composePath)
  const contextPath = path.isAbsolute(build.context)
    ? build.context
    : path.resolve(composeDir, build.context)
  const dockerfilePath = path.isAbsolute(build.dockerfile)
    ? build.dockerfile
    : path.resolve(contextPath, build.dockerfile)

  try {
    if (fs.statSync(dockerfilePath).isFile()) build.origin = 'existing'
  } catch {
    // Phase 3 will generate or minimally repair a missing local Dockerfile.
  }
  return build
}

function implicitProjectService (workDir) {
  const build = finalizeBuildPlan(
    createBuildPlan(),
    path.join(workDir, 'compose.yaml'),
  )
  return {
    name: path.basename(workDir) || 'project',
    role: 'application',
    source: 'project',
    source_file: '.',
    declared_image: null,
    build,
    image_status: 'build_required',
    image_ref: null,
    digest: null,
  }
}

function extractComposeEvidence (workDir) {
  const declarations = []
  const services = []
  const composePath = findComposePath(workDir)
  if (!composePath) return { declarations, services }

  const sourceFile = path.relative(workDir, composePath)
  const lines = fs.readFileSync(composePath, 'utf8').split(/\r?\n/)
  let servicesIndent = null
  let currentState = null
  let activeBlock = null
  const states = new Map()

  function setServiceImage (state, rawValue) {
    const resolvedValue = resolveComposeImageExpression(rawValue)
    const parsed = parseImageRef(resolvedValue)
    state.service.declared_image = parsed?.declaredRef || resolvedValue
    state.service.image_status = parsed ? 'unavailable' : (
      state.service.build ? 'build_required' : 'unavailable'
    )
    if (!parsed) {
      state.declaration = addDeclaration(declarations, resolvedValue, {
        source: 'compose',
        sourceFile,
        service: state.service.name,
        role: state.service.role,
        selectionRank: 3,
        retainUnresolved: true,
      })
      return
    }

    state.service.role = classifyImageRole(parsed, state.service.name)
    state.declaration = addDeclaration(declarations, resolvedValue, {
      source: 'compose',
      sourceFile,
      service: state.service.name,
      role: state.service.role,
      selectionRank: 3,
    })
  }

  function startService (name, indent, inlineBody = '') {
    const service = {
      name,
      role: 'application',
      source: 'compose',
      source_file: sourceFile,
      declared_image: null,
      build: null,
      image_status: 'unavailable',
      image_ref: null,
      digest: null,
    }
    services.push(service)
    currentState = {
      service,
      indent,
      declaration: null,
      dependsOn: new Set(),
      publishesPorts: false,
    }
    states.set(name, currentState)
    activeBlock = null

    const inlineImage = inlineBody.match(/\bimage:\s*(\$\{[^}]+\}|"[^"]+"|'[^']+'|[^,}]+)/)
    if (inlineImage) setServiceImage(currentState, inlineImage[1])

    const inlineService = inlineYamlMapping(inlineBody)
    const inlineBuild = inlineService?.get('build')
    if (inlineBuild !== undefined) {
      service.build = parseBuildDeclaration(inlineBuild)
      if (!service.declared_image) service.image_status = 'build_required'
    }

    const inlineDepends = inlineBody.match(/\bdepends_on:\s*(\[[^\]]*]|\{[^}]*})/)
    if (inlineDepends) {
      for (const dependency of inlineNames(inlineDepends[1])) {
        currentState.dependsOn.add(dependency)
      }
    }

    if (/\bports:\s*(?:\[|[^,}\s])/.test(inlineBody)) {
      currentState.publishesPorts = true
    }
  }

  for (const line of lines) {
    const content = stripYamlComment(line)
    if (!content) continue
    const indent = line.match(/^\s*/)[0].length

    if (servicesIndent === null) {
      const servicesMatch = content.match(/^(\s*)services:\s*$/)
      if (servicesMatch) servicesIndent = servicesMatch[1].length
      continue
    }

    if (indent <= servicesIndent) break

    const mapping = parseYamlMapping(content)
    if (mapping && (!currentState || indent <= currentState.indent)) {
      startService(mapping.key, indent, mapping.value)
      continue
    }

    if (!currentState || indent <= currentState.indent) continue

    if (activeBlock && indent > activeBlock.indent) {
      if (activeBlock.name === 'depends_on') {
        const listItem = content.match(/^\s*-\s*['"]?([A-Za-z0-9_.-]+)/)
        const dependencyMapping = parseYamlMapping(content)
        if (activeBlock.itemIndent === undefined && (listItem || dependencyMapping)) {
          activeBlock.itemIndent = indent
        }
        const dependency = indent === activeBlock.itemIndent
          ? (listItem?.[1] || dependencyMapping?.key)
          : null
        if (dependency) currentState.dependsOn.add(dependency)
        continue
      }
      if (activeBlock.name === 'ports') {
        if (/^\s*-\s*\S+/.test(content)) currentState.publishesPorts = true
        continue
      }
      if (activeBlock.name === 'build') {
        if (
          activeBlock.argsIndent !== undefined &&
          indent > activeBlock.argsIndent
        ) {
          addBuildArg(currentState.service.build, content)
          continue
        }
        if (
          activeBlock.argsIndent !== undefined &&
          indent <= activeBlock.argsIndent
        ) {
          activeBlock.argsIndent = undefined
        }

        const buildMapping = parseYamlMapping(content)
        if (buildMapping) {
          if (activeBlock.propertyIndent === undefined) {
            activeBlock.propertyIndent = indent
          }
          if (indent !== activeBlock.propertyIndent) continue

          if (buildMapping.key === 'context') {
            currentState.service.build.context =
              stripQuotes(buildMapping.value) || '.'
          } else if (buildMapping.key === 'dockerfile') {
            currentState.service.build.dockerfile =
              stripQuotes(buildMapping.value) || 'Dockerfile'
          } else if (buildMapping.key === 'target') {
            currentState.service.build.target =
              stripQuotes(buildMapping.value) || null
          } else if (buildMapping.key === 'args') {
            if (buildMapping.value) {
              addBuildArgs(currentState.service.build, buildMapping.value)
            } else {
              activeBlock.argsIndent = indent
            }
          }
        }
        continue
      }
    }
    activeBlock = null

    const imageMatch = content.match(/^\s*image:\s*(.+)$/)
    if (imageMatch) {
      setServiceImage(currentState, imageMatch[1])
      continue
    }

    const buildMatch = content.match(/^\s*build:\s*(.*)$/)
    if (buildMatch) {
      currentState.service.build = parseBuildDeclaration(buildMatch[1])
      currentState.service.image_status = 'build_required'
      if (!buildMatch[1]) activeBlock = { name: 'build', indent }
      continue
    }

    const dependsMatch = content.match(/^\s*depends_on:\s*(.*)$/)
    if (dependsMatch) {
      if (dependsMatch[1]) {
        for (const dependency of inlineNames(dependsMatch[1])) {
          currentState.dependsOn.add(dependency)
        }
      } else {
        activeBlock = { name: 'depends_on', indent }
      }
      continue
    }

    const portsMatch = content.match(/^\s*ports:\s*(.*)$/)
    if (portsMatch) {
      if (portsMatch[1]) currentState.publishesPorts = true
      else activeBlock = { name: 'ports', indent }
    }
  }

  const imageStates = [...states.values()].filter(state => state.declaration)
  const dependedUpon = new Set(
    [...states.values()].flatMap(state => [...state.dependsOn]),
  )

  for (const state of imageStates) {
    let selectionRank
    if (imageStates.length === 1 || state.service.build || state.dependsOn.size > 0) {
      selectionRank = 0
    } else if (state.publishesPorts) {
      selectionRank = 1
    } else if (!dependedUpon.has(state.service.name)) {
      selectionRank = 2
    } else {
      selectionRank = 3
    }
    state.declaration.selectionRank = selectionRank
  }

  for (const state of states.values()) {
    state.service.build = finalizeBuildPlan(state.service.build, composePath)
  }

  return { declarations, services }
}

function collectProjectEvidence (workDir, options = {}) {
  const githubUrl = options.githubUrl || getGithubUrlFromGitRemote(workDir)
  const context = {
    githubRepository: parseGithubRepository(githubUrl),
    githubSha: getGitHead(workDir),
  }
  const readme = extractReadmeDeclarations(workDir)
  const ci = extractWorkflowDeclarations(workDir, context)
  const compose = extractComposeEvidence(workDir)

  return {
    declarations: [...readme, ...ci, ...compose.declarations],
    services: compose.services,
  }
}

async function fetchWithTimeout (fetchImpl, url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function registryToken (image, fetchImpl) {
  let url
  if (image.registry === 'dockerhub') {
    url = `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${image.repository}:pull`
  } else if (image.registry === 'ghcr') {
    url = `https://ghcr.io/token?scope=repository:${image.repository}:pull`
  } else {
    return null
  }

  const response = await fetchWithTimeout(fetchImpl, url)
  if (!response.ok) return null
  const payload = await response.json()
  return payload.token || payload.access_token || null
}

function parseBearerChallenge (header) {
  if (!header || !/^Bearer\s+/i.test(header)) return null
  const parameters = {}
  for (const match of header.slice(header.indexOf(' ') + 1).matchAll(/(\w+)="([^"]*)"/g)) {
    parameters[match[1]] = match[2]
  }
  return parameters.realm ? parameters : null
}

async function challengeToken (challenge, fetchImpl) {
  const url = new URL(challenge.realm)
  if (challenge.service) url.searchParams.set('service', challenge.service)
  if (challenge.scope) url.searchParams.set('scope', challenge.scope)
  const response = await fetchWithTimeout(fetchImpl, url)
  if (!response.ok) return null
  const payload = await response.json()
  return payload.token || payload.access_token || null
}

function registryBaseUrl (image) {
  if (image.registry === 'dockerhub') return 'https://registry-1.docker.io'
  return `https://${image.registryHost}`
}

async function requestRegistry (url, token, fetchImpl, accept = MANIFEST_ACCEPT) {
  const headers = { Accept: accept }
  if (token) headers.Authorization = `Bearer ${token}`
  return fetchWithTimeout(fetchImpl, url, { headers })
}

async function fetchManifest (image, fetchImpl) {
  const baseUrl = registryBaseUrl(image)
  const manifestUrl = `${baseUrl}/v2/${image.repository}/manifests/${image.selector}`
  let token = await registryToken(image, fetchImpl)
  let response = await requestRegistry(manifestUrl, token, fetchImpl)

  if (response.status === 401) {
    const challenge = parseBearerChallenge(response.headers.get('www-authenticate'))
    if (challenge) {
      token = await challengeToken(challenge, fetchImpl)
      if (token) response = await requestRegistry(manifestUrl, token, fetchImpl)
    }
  }

  if (!response.ok) {
    return {
      error: `registry returned HTTP ${response.status} for the declared reference`,
    }
  }

  const raw = await response.text()
  let manifest
  try {
    manifest = JSON.parse(raw)
  } catch {
    return { error: 'registry returned an invalid manifest' }
  }

  const responseDigest = response.headers.get('docker-content-digest')?.toLowerCase()
  const bodyDigest = `sha256:${crypto.createHash('sha256').update(raw).digest('hex')}`
  if (!/^sha256:[a-f0-9]{64}$/.test(responseDigest || '')) {
    return { error: 'registry response did not provide a valid content digest' }
  }
  if (responseDigest !== bodyDigest) {
    return { error: 'registry manifest body does not match its content digest' }
  }
  if (image.declaredDigest && image.declaredDigest.toLowerCase() !== responseDigest) {
    return { error: 'registry manifest does not match the requested digest' }
  }

  return { baseUrl, token, manifest, digest: responseDigest }
}

async function resolveRegistryImage (image, fetchImpl = globalThis.fetch) {
  try {
    const resolved = await fetchManifest(image, fetchImpl)
    if (resolved.error) {
      return { status: 'unavailable', error: resolved.error }
    }

    return {
      status: 'verified',
      digest: resolved.digest,
      image_ref: `${image.displayImage}@${resolved.digest}`,
    }
  } catch {
    return {
      status: 'unavailable',
      error: 'could not resolve the declared image from its registry',
    }
  }
}

function groupDeclarations (declarations) {
  const groups = new Map()

  for (const declaration of declarations) {
    if (!groups.has(declaration.key)) {
      groups.set(declaration.key, {
        image: declaration.displayImage,
        declared_ref: declaration.declaredRef,
        declared_tag: declaration.declaredTag,
        resolution_tag: declaration.declaredDigest ? null : declaration.selector,
        declared_digest: declaration.declaredDigest,
        registry: declaration.registry,
        role: declaration.role,
        priority: SOURCE_PRIORITY[declaration.source],
        selectionRank: declaration.selectionRank,
        sources: [],
        parsed: declaration,
      })
    }

    const group = groups.get(declaration.key)
    group.priority = Math.min(group.priority, SOURCE_PRIORITY[declaration.source])
    group.selectionRank = Math.min(group.selectionRank, declaration.selectionRank)
    if (group.role !== 'application' && declaration.role === 'application') {
      group.role = 'application'
    }
    group.sources.push({
      source: declaration.source,
      file: declaration.sourceFile,
      service: declaration.service,
      declared_ref: declaration.declaredRef,
    })
  }

  return [...groups.values()]
}

function attachServiceResults (services, inventory) {
  const byService = new Map()
  for (const image of inventory) {
    for (const source of image.sources) {
      if (source.source === 'compose' && source.service) {
        byService.set(source.service, image)
      }
    }
  }

  return services.map(service => {
    const image = byService.get(service.name)
    if (!image) return service
    const imageStatus = image.status === 'verified'
      ? 'verified'
      : (service.build ? 'build_required' : image.status)
    return {
      ...service,
      image_status: imageStatus,
      image_ref: image.image_ref || null,
      digest: image.digest || null,
    }
  })
}

function publicInventoryEntry (group, resolution) {
  return {
    image: group.image,
    declared_ref: group.declared_ref,
    declared_tag: group.declared_tag,
    resolution_tag: group.resolution_tag,
    declared_digest: group.declared_digest,
    registry: group.registry,
    role: group.role,
    sources: group.sources,
    status: resolution.status,
    digest: resolution.digest || null,
    image_ref: resolution.image_ref || null,
    error: resolution.error || null,
  }
}

async function detectExistingImages (workDir, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch
  const evidence = collectProjectEvidence(workDir, options)
  const groups = groupDeclarations(evidence.declarations)

  const inventory = await Promise.all(groups.map(async group => {
    const resolution = group.parsed.unresolved
      ? {
          status: 'unavailable',
          error: 'declared image contains an unresolved variable',
        }
      : await resolveRegistryImage(group.parsed, fetchImpl)
    return {
      group,
      public: publicInventoryEntry(group, resolution),
    }
  }))

  const imageInventory = inventory.map(entry => entry.public)
  const serviceInventory = attachServiceResults(evidence.services, imageInventory)
  const fallbackServiceInventory = serviceInventory.length === 0
    ? [implicitProjectService(workDir)]
    : serviceInventory
  // `role` is descriptive topology evidence only. It must not disqualify a
  // product whose real application image happens to be named nginx, cache,
  // postgres, and so on. Project declaration context and Compose topology
  // decide primary-image intent.
  const verifiedCandidates = inventory
    .filter(entry => entry.public.status === 'verified')

  if (verifiedCandidates.length === 0) {
    return {
      found: false,
      reason: groups.length === 0
        ? 'no_explicit_image_declarations'
        : 'no_resolved_image',
      image_inventory: imageInventory,
      service_inventory: fallbackServiceInventory,
    }
  }

  const highestPriority = Math.min(...verifiedCandidates.map(entry => entry.group.priority))
  const sourcePreferred = verifiedCandidates
    .filter(entry => entry.group.priority === highestPriority)
  const highestIntent = Math.min(...sourcePreferred.map(entry => entry.group.selectionRank))
  const preferred = sourcePreferred
    .filter(entry => entry.group.selectionRank === highestIntent)

  if (preferred.length !== 1) {
    return {
      found: false,
      reason: 'ambiguous_primary_images',
      image_inventory: imageInventory,
      service_inventory: fallbackServiceInventory,
    }
  }

  const selected = preferred[0].public
  const selectedSource = selected.sources
    .slice()
    .sort((left, right) => SOURCE_PRIORITY[left.source] - SOURCE_PRIORITY[right.source])[0]

  return {
    found: true,
    image: selected.image,
    tag: selected.resolution_tag,
    source: selectedSource.source,
    digest: selected.digest,
    image_ref: selected.image_ref,
    declared_ref: selectedSource.declared_ref,
    image_inventory: imageInventory,
    service_inventory: serviceInventory,
  }
}

function getGithubUrlFromGitRemote (dir) {
  try {
    const remote = execFileSync(
      'git',
      ['remote', 'get-url', 'origin'],
      { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    return remote.includes('github.com') ? remote : null
  } catch {
    return null
  }
}

async function main () {
  const [, , arg1, arg2] = process.argv
  if (!arg1) {
    console.error('Usage: node detect-image.mjs <github-url> [work-dir]')
    console.error('       node detect-image.mjs <work-dir>')
    process.exitCode = 1
    return
  }

  const firstIsUrl = /^https?:\/\//.test(arg1) || arg1.startsWith('git@')
  const workDir = path.resolve(firstIsUrl ? (arg2 || '.') : arg1)
  const githubUrl = firstIsUrl ? arg1 : getGithubUrlFromGitRemote(workDir)

  if (!fs.existsSync(workDir) || !fs.statSync(workDir).isDirectory()) {
    console.log(JSON.stringify({
      found: false,
      reason: 'work_directory_not_found',
      image_inventory: [],
      service_inventory: [],
    }, null, 2))
    process.exitCode = 1
    return
  }

  const result = await detectExistingImages(workDir, { githubUrl })
  console.log(JSON.stringify(result, null, 2))
}

const isMain = process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMain) await main()

export {
  classifyImageRole,
  collectProjectEvidence,
  detectExistingImages,
  parseImageRef,
  resolveRegistryImage,
}
