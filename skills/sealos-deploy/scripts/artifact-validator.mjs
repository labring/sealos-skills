#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCHEMA_DIR = path.join(__dirname, '..', 'schemas')
const KANIKO_SCHEMA_DIR = path.join(__dirname, '..', '..', 'k8s-kaniko-job', 'schemas')

const SCHEMA_FILES = {
  config: 'config.schema.json',
  analysis: 'analysis.schema.json',
  'build-request': 'build-request.schema.json',
  'build-result': { dir: KANIKO_SCHEMA_DIR, file: 'build-result.schema.json' },
  'template-match': 'template-match.schema.json',
  'delivery-manifest': 'delivery-manifest.schema.json',
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isIsoDateTime(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function isCommitSha(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value)
}

function isSafeRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0) return false
  if (path.isAbsolute(value)) return false
  const normalized = path.posix.normalize(value.replaceAll('\\', '/'))
  return normalized !== '..' && !normalized.startsWith('../')
}

function normalizeRelativePath(value) {
  return path.posix.normalize(String(value).replaceAll('\\', '/'))
}

function pathContains(parent, child) {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function formatPath(pointer, suffix = '') {
  return `${pointer}${suffix}`
}

function pushError(errors, pointer, message) {
  errors.push({ path: pointer, message })
}

function stripInlineComment(line) {
  let quote = null
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if ((char === '"' || char === "'") && line[index - 1] !== '\\') {
      quote = quote === char ? null : quote || char
    }
    if (char === '#' && quote === null && (index === 0 || /\s/.test(line[index - 1]))) {
      return line.slice(0, index)
    }
  }
  return line
}

function tokenizeDockerInstruction(value) {
  const tokens = []
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g
  let match
  while ((match = pattern.exec(value)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3])
  }
  return tokens
}

function parseDockerCopySources(dockerfileContent) {
  const sources = []

  for (const line of dockerfileContent.split(/\r?\n/)) {
    const trimmed = stripInlineComment(line).trim()
    const match = trimmed.match(/^(COPY|ADD)\s+(.+)$/i)
    if (!match) continue

    const rest = match[2].trim()
    if (rest.startsWith('[')) {
      try {
        const values = JSON.parse(rest)
        if (Array.isArray(values) && values.length >= 2) {
          sources.push(...values.slice(0, -1).filter((value) => typeof value === 'string'))
        }
      } catch {
        // Complex or invalid Dockerfile JSON array syntax is left to the build executor.
      }
      continue
    }

    const tokens = tokenizeDockerInstruction(rest)
      .filter((token) => !token.startsWith('--'))
    if (tokens.length >= 2) {
      sources.push(...tokens.slice(0, -1))
    }
  }

  return sources
}

function validateType(expectedType, value) {
  switch (expectedType) {
    case 'object':
      return isPlainObject(value)
    case 'array':
      return Array.isArray(value)
    case 'string':
      return typeof value === 'string'
    case 'integer':
      return Number.isInteger(value)
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'null':
      return value === null
    default:
      return false
  }
}

function validateAgainstSchema(schema, value, pointer = '$', errors = []) {
  if (schema.anyOf) {
    const branches = schema.anyOf.map((candidate) => {
      const branchErrors = []
      validateAgainstSchema(candidate, value, pointer, branchErrors)
      return branchErrors
    })

    if (!branches.some((branchErrors) => branchErrors.length === 0)) {
      pushError(errors, pointer, 'does not match any allowed schema')
    }
    return errors
  }

  if (schema.oneOf) {
    const branches = schema.oneOf.map((candidate) => {
      const branchErrors = []
      validateAgainstSchema(candidate, value, pointer, branchErrors)
      return branchErrors
    })
    const validCount = branches.filter((branchErrors) => branchErrors.length === 0).length
    if (validCount !== 1) {
      pushError(errors, pointer, `expected exactly one schema match, got ${validCount}`)
    }
    return errors
  }

  if (Object.prototype.hasOwnProperty.call(schema, 'const') && value !== schema.const) {
    pushError(errors, pointer, `must equal ${JSON.stringify(schema.const)}`)
    return errors
  }

  if (schema.enum && !schema.enum.includes(value)) {
    pushError(errors, pointer, `must be one of ${schema.enum.join(', ')}`)
    return errors
  }

  if (schema.type && !validateType(schema.type, value)) {
    pushError(errors, pointer, `must be of type ${schema.type}`)
    return errors
  }

  switch (schema.type) {
    case 'object':
      validateObjectSchema(schema, value, pointer, errors)
      break
    case 'array':
      validateArraySchema(schema, value, pointer, errors)
      break
    case 'string':
      validateStringSchema(schema, value, pointer, errors)
      break
    case 'integer':
    case 'number':
      validateNumberSchema(schema, value, pointer, errors)
      break
    default:
      break
  }

  return errors
}

function validateObjectSchema(schema, value, pointer, errors) {
  const keys = Object.keys(value)

  if (schema.required) {
    for (const requiredKey of schema.required) {
      if (!Object.prototype.hasOwnProperty.call(value, requiredKey)) {
        pushError(errors, pointer, `missing required property ${requiredKey}`)
      }
    }
  }

  if (typeof schema.minProperties === 'number' && keys.length < schema.minProperties) {
    pushError(errors, pointer, `must have at least ${schema.minProperties} properties`)
  }

  const properties = schema.properties || {}
  const patternProperties = schema.patternProperties || {}
  const compiledPatterns = Object.entries(patternProperties).map(([pattern, childSchema]) => ({
    regex: new RegExp(pattern),
    schema: childSchema,
  }))

  for (const [key, childValue] of Object.entries(value)) {
    const childPointer = formatPath(pointer, `.${key}`)

    if (Object.prototype.hasOwnProperty.call(properties, key)) {
      validateAgainstSchema(properties[key], childValue, childPointer, errors)
      continue
    }

    const matched = compiledPatterns.filter(({ regex }) => regex.test(key))
    if (matched.length > 0) {
      for (const candidate of matched) {
        validateAgainstSchema(candidate.schema, childValue, childPointer, errors)
      }
      continue
    }

    if (schema.additionalProperties === false) {
      pushError(errors, childPointer, 'is not allowed')
      continue
    }

    if (isPlainObject(schema.additionalProperties)) {
      validateAgainstSchema(schema.additionalProperties, childValue, childPointer, errors)
    }
  }
}

function validateArraySchema(schema, value, pointer, errors) {
  if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
    pushError(errors, pointer, `must contain at least ${schema.minItems} items`)
  }

  if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
    pushError(errors, pointer, `must contain at most ${schema.maxItems} items`)
  }

  if (schema.uniqueItems) {
    const seen = new Set()
    for (let index = 0; index < value.length; index++) {
      const encoded = JSON.stringify(value[index])
      if (seen.has(encoded)) {
        pushError(errors, formatPath(pointer, `[${index}]`), 'must be unique')
      }
      seen.add(encoded)
    }
  }

  if (schema.items) {
    for (let index = 0; index < value.length; index++) {
      validateAgainstSchema(schema.items, value[index], formatPath(pointer, `[${index}]`), errors)
    }
  }
}

function validateStringSchema(schema, value, pointer, errors) {
  if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
    pushError(errors, pointer, `must be at least ${schema.minLength} characters long`)
  }

  if (schema.pattern && !(new RegExp(schema.pattern).test(value))) {
    pushError(errors, pointer, `must match pattern ${schema.pattern}`)
  }

  if (schema.format === 'date-time' && !isIsoDateTime(value)) {
    pushError(errors, pointer, 'must be a valid ISO 8601 date-time')
  }
}

function validateNumberSchema(schema, value, pointer, errors) {
  if (typeof schema.minimum === 'number' && value < schema.minimum) {
    pushError(errors, pointer, `must be >= ${schema.minimum}`)
  }

  if (typeof schema.maximum === 'number' && value > schema.maximum) {
    pushError(errors, pointer, `must be <= ${schema.maximum}`)
  }
}

function loadSchema(kind) {
  const schemaRef = SCHEMA_FILES[kind]
  if (!schemaRef) {
    throw new Error(`Unknown artifact kind: ${kind}`)
  }

  if (typeof schemaRef === 'string') {
    return JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, schemaRef), 'utf-8'))
  }

  return JSON.parse(fs.readFileSync(path.join(schemaRef.dir, schemaRef.file), 'utf-8'))
}

function validateAnalysisSemantics(data, errors) {
  if (!data.all_languages.includes(data.language)) {
    pushError(errors, '$.all_languages', 'must include the primary language')
  }

  const dimensionTotal = Object.values(data.score.dimensions).reduce((sum, value) => sum + value, 0)
  if (data.score.total !== dimensionTotal) {
    pushError(errors, '$.score.total', `must equal the sum of score.dimensions (${dimensionTotal})`)
  }

  if (!Object.prototype.hasOwnProperty.call(data.runtime_version, data.language)) {
    pushError(errors, '$.runtime_version', `must include a version field for primary language ${data.language}`)
  }

  if (typeof data.image_ref === 'string' && !data.image_ref.includes(':')) {
    pushError(errors, '$.image_ref', 'must include an explicit image tag')
  }

  if (data.build_environment) {
    validateBuildEnvironmentSemantics(data.build_environment, errors)
  }
}

function validateBuildEnvironmentSemantics(buildEnvironment, errors) {
  if (buildEnvironment.status === 'detected') {
    const hasSignal = [
      buildEnvironment.project_type,
      buildEnvironment.package_manager,
      buildEnvironment.port,
      buildEnvironment.install_command,
      buildEnvironment.build_command,
      buildEnvironment.start_command,
      buildEnvironment.providers?.length > 0,
      buildEnvironment.system_packages?.length > 0,
      buildEnvironment.runtime_versions && Object.keys(buildEnvironment.runtime_versions).length > 0,
      buildEnvironment.env_vars && Object.keys(buildEnvironment.env_vars).length > 0,
    ].some(Boolean)

    if (!hasSignal) {
      pushError(errors, '$.build_environment', 'detected Railpack output must include at least one build signal')
    }

    if (!buildEnvironment.evidence_paths || buildEnvironment.evidence_paths.length === 0) {
      pushError(errors, '$.build_environment.evidence_paths', 'detected Railpack output must include evidence paths')
    }
  }

  if (
    (buildEnvironment.status === 'skipped' || buildEnvironment.status === 'failed') &&
    (typeof buildEnvironment.reason !== 'string' || buildEnvironment.reason.length === 0)
  ) {
    pushError(errors, '$.build_environment.reason', 'must explain skipped or failed Railpack probes')
  }

  for (const [key, command] of [
    ['install_command', buildEnvironment.install_command],
    ['build_command', buildEnvironment.build_command],
    ['start_command', buildEnvironment.start_command],
  ]) {
    if (typeof command === 'string' && /\r|\n|\0/.test(command)) {
      pushError(errors, `$.build_environment.${key}`, 'must be a single-line command')
    }
  }
}

function validateBuildRequestSemantics(data, errors) {
  const { mode, image, build, source } = data

  if (mode === 'reuse-image') {
    if (typeof image.image_ref !== 'string' || image.image_ref.length === 0) {
      pushError(errors, '$.image.image_ref', 'must be a non-empty image reference when mode is reuse-image')
    }

    if (image.target_image !== null) {
      pushError(errors, '$.image.target_image', 'must be null when mode is reuse-image')
    }
  }

  if (mode === 'build-required') {
    if (typeof image.target_image !== 'string' || image.target_image.length === 0) {
      pushError(errors, '$.image.target_image', 'must be a non-empty image reference when mode is build-required')
    }
  }

  for (const [pointer, imageRef] of [
    ['$.image.image_ref', image.image_ref],
    ['$.image.target_image', image.target_image],
  ]) {
    if (typeof imageRef === 'string' && !imageRef.includes(':')) {
      pushError(errors, pointer, 'must include an explicit image tag')
    }
  }

  if (!isSafeRelativePath(build.context_path)) {
    pushError(errors, '$.build.context_path', 'must be a safe relative path inside the repository')
  }

  if (!isSafeRelativePath(build.dockerfile_path)) {
    pushError(errors, '$.build.dockerfile_path', 'must be a safe relative path inside the repository')
  }

  if (source.type !== 'sandbox-context') {
    pushError(errors, '$.source.type', 'must be sandbox-context for the current k8s sandbox kaniko workflow')
  }

  if (typeof source.github_url !== 'string' || source.github_url.length === 0) {
    pushError(errors, '$.source.github_url', 'must be set so the build remains traceable to a GitHub repository')
  }

  if (typeof source.repo !== 'string' || source.repo.length === 0) {
    pushError(errors, '$.source.repo', 'must be set so image naming and build traceability can use owner/repo metadata')
  }

  if (source.ref === 'HEAD') {
    pushError(errors, '$.source.ref', 'must be resolved to a concrete commit SHA')
  }

  if (!isCommitSha(source.ref)) {
    pushError(errors, '$.source.ref', 'must be a full 40-character commit SHA')
  }

  if (!path.isAbsolute(source.work_dir)) {
    pushError(errors, '$.source.work_dir', 'must be an absolute sandbox path')
  }

  validateBuildContextSemantics({ mode, build, source }, errors)
}

function validateBuildContextSemantics({ mode, build, source }, errors) {
  if (mode !== 'build-required') return
  if (!path.isAbsolute(source.work_dir)) return
  if (!isSafeRelativePath(build.context_path) || !isSafeRelativePath(build.dockerfile_path)) return

  const workDir = path.resolve(source.work_dir)
  if (!fs.existsSync(workDir) || !fs.statSync(workDir).isDirectory()) return

  const contextPath = normalizeRelativePath(build.context_path)
  const dockerfilePath = normalizeRelativePath(build.dockerfile_path)
  const contextDir = path.resolve(workDir, contextPath)
  const dockerfileFile = path.resolve(workDir, dockerfilePath)

  if (!fs.existsSync(contextDir) || !fs.statSync(contextDir).isDirectory()) {
    pushError(errors, '$.build.context_path', 'must exist as a directory under source.work_dir')
    return
  }
  if (!fs.existsSync(dockerfileFile) || !fs.statSync(dockerfileFile).isFile()) {
    pushError(errors, '$.build.dockerfile_path', 'must exist as a file under source.work_dir')
    return
  }
  if (!pathContains(contextDir, dockerfileFile)) {
    pushError(errors, '$.build.dockerfile_path', 'must be inside build.context_path')
    return
  }

  const dockerfileContent = fs.readFileSync(dockerfileFile, 'utf-8')
  for (const sourcePath of parseDockerCopySources(dockerfileContent)) {
    if (
      sourcePath.startsWith('--') ||
      sourcePath.includes('$') ||
      /^[a-z][a-z0-9+.-]*:\/\//i.test(sourcePath)
    ) {
      continue
    }

    const normalizedSourcePath = normalizeRelativePath(sourcePath)
    if (
      normalizedSourcePath === '..' ||
      normalizedSourcePath.startsWith('../') ||
      path.posix.isAbsolute(normalizedSourcePath)
    ) {
      continue
    }

    const contextCopySource = path.resolve(contextDir, normalizedSourcePath)
    if (fs.existsSync(contextCopySource) && pathContains(contextDir, contextCopySource)) {
      continue
    }

    const workspaceCopySource = path.resolve(workDir, normalizedSourcePath)
    if (fs.existsSync(workspaceCopySource) && !pathContains(contextDir, workspaceCopySource)) {
      pushError(errors, '$.build.context_path', `must include Dockerfile COPY source ${sourcePath}`)
      return
    }
  }
}

function validateBuildResultSemantics(data, errors) {
  if (typeof data.image?.image_ref === 'string' && !data.image.image_ref.includes(':')) {
    pushError(errors, '$.image.image_ref', 'must include an explicit image tag')
  }
}

function validateDeliveryManifestSemantics(data, errors) {
  const artifactSet = new Set(data.artifacts)

  const fastPath = data.mode === 'template-fast-path'

  if (fastPath) {
    if (data.build_request_path !== null) {
      pushError(errors, '$.build_request_path', 'must be null when mode is template-fast-path')
    }
    if (data.build_result_path !== null) {
      pushError(errors, '$.build_result_path', 'must be null when mode is template-fast-path')
    }
    if (artifactSet.has('.sealos/build-request.json') || artifactSet.has('.sealos/build-result.json')) {
      pushError(errors, '$.artifacts', 'must not include build artifacts when mode is template-fast-path')
    }
  } else {
    if (data.build_request_path !== '.sealos/build-request.json') {
      pushError(errors, '$.build_request_path', 'must point to .sealos/build-request.json when mode is build-template')
    }
    if (data.build_result_path !== '.sealos/build-result.json') {
      pushError(errors, '$.build_result_path', 'must point to .sealos/build-result.json when mode is build-template')
    }
  }

  const requiredArtifacts = fastPath
    ? [
        '.sealos/template-match.json',
        '.sealos/template/index.yaml',
      ]
    : [
        '.sealos/analysis.json',
        '.sealos/build-request.json',
        '.sealos/build-result.json',
        '.sealos/template/index.yaml',
      ]

  for (const requiredArtifact of requiredArtifacts) {
    if (!artifactSet.has(requiredArtifact)) {
      pushError(errors, '$.artifacts', `must include ${requiredArtifact}`)
    }
  }

  if (!artifactSet.has(data.template_path)) {
    pushError(errors, '$.template_path', 'must be present in artifacts')
  }

  if (data.build_request_path !== null && !artifactSet.has(data.build_request_path)) {
    pushError(errors, '$.build_request_path', 'must be present in artifacts')
  }

  if (data.build_result_path !== null && !artifactSet.has(data.build_result_path)) {
    pushError(errors, '$.build_result_path', 'must be present in artifacts')
  }

  for (const artifact of data.artifacts) {
    if (artifact.includes('railpack') && ![
      '.sealos/railpack-info.json',
      '.sealos/railpack-plan.json',
    ].includes(artifact)) {
      pushError(errors, '$.artifacts', `unsupported Railpack artifact path ${artifact}`)
    }
  }
}

function validateTemplateMatchSemantics(data, errors) {
  if (!data.matched) {
    if (data.materialized) {
      pushError(errors, '$.materialized', 'must be false when matched is false')
    }
    if (data.repo !== null || data.template !== null || data.template_path !== null || data.source !== 'none') {
      pushError(errors, '$', 'unmatched results must not include repo, template, template_path, or a non-none source')
    }
    return
  }

  if (data.repo === null) {
    pushError(errors, '$.repo', 'must be set when matched is true')
  }

  if (data.template === null) {
    pushError(errors, '$.template', 'must be set when matched is true')
  }

  if (data.source === 'none') {
    pushError(errors, '$.source', 'must not be none when matched is true')
  }

  if (data.materialized && data.template_path !== '.sealos/template/index.yaml') {
    pushError(errors, '$.template_path', 'must point to .sealos/template/index.yaml when materialized is true')
  }

  if (!data.materialized && data.template_path !== null) {
    pushError(errors, '$.template_path', 'must be null when materialized is false')
  }
}

const SEMANTIC_VALIDATORS = {
  config: () => {},
  analysis: validateAnalysisSemantics,
  'build-request': validateBuildRequestSemantics,
  'build-result': validateBuildResultSemantics,
  'template-match': validateTemplateMatchSemantics,
  'delivery-manifest': validateDeliveryManifestSemantics,
}

export function inferArtifactKind(filePath) {
  const baseName = path.basename(filePath)
  switch (baseName) {
    case 'config.json':
      return 'config'
    case 'analysis.json':
      return 'analysis'
    case 'build-request.json':
      return 'build-request'
    case 'build-result.json':
      return 'build-result'
    case 'template-match.json':
      return 'template-match'
    case 'delivery-manifest.json':
      return 'delivery-manifest'
    default:
      return null
  }
}

export function validateArtifactData(kind, data) {
  const schema = loadSchema(kind)
  const errors = []

  validateAgainstSchema(schema, data, '$', errors)
  if (errors.length === 0) {
    SEMANTIC_VALIDATORS[kind](data, errors)
  }

  return {
    kind,
    valid: errors.length === 0,
    errors,
  }
}

export function validateArtifactFile(kind, filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8')
  let data
  try {
    data = JSON.parse(raw)
  } catch (error) {
    return {
      kind,
      valid: false,
      errors: [{ path: '$', message: `invalid JSON: ${error.message}` }],
    }
  }

  return validateArtifactData(kind, data)
}
