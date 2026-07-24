#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCHEMA_DIR = path.join(__dirname, '..', 'schemas')
const OFFICIAL_TEMPLATE_CATALOG = 'https://github.com/labring-actions/templates.git'
const OFFICIAL_TEMPLATE_CATALOG_REF = 'kb-0.9'
const DEPLOYMENT_TEMPLATE_PATH = '.sealos/template/index.yaml'

const SCHEMA_FILES = {
  config: 'config.schema.json',
  analysis: 'analysis.schema.json',
  'build-result': 'build-result.schema.json',
  state: 'state.schema.json',
  'template-references': 'template-references.schema.json',
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isIsoDateTime(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function formatPath(pointer, suffix = '') {
  return `${pointer}${suffix}`
}

function pushError(errors, pointer, message) {
  errors.push({ path: pointer, message })
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

function resolveLocalRefs(schema, rootSchema) {
  if (Array.isArray(schema)) {
    return schema.map((item) => resolveLocalRefs(item, rootSchema))
  }
  if (!isPlainObject(schema)) {
    return schema
  }

  if (typeof schema.$ref === 'string') {
    if (!schema.$ref.startsWith('#/')) {
      throw new Error(`Unsupported schema reference: ${schema.$ref}`)
    }

    const target = schema.$ref
      .slice(2)
      .split('/')
      .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
      .reduce((current, segment) => current?.[segment], rootSchema)

    if (!isPlainObject(target)) {
      throw new Error(`Unresolved schema reference: ${schema.$ref}`)
    }

    const siblings = Object.fromEntries(
      Object.entries(schema).filter(([key]) => key !== '$ref'),
    )
    return resolveLocalRefs({ ...target, ...siblings }, rootSchema)
  }

  return Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [key, resolveLocalRefs(value, rootSchema)]),
  )
}

function loadSchema(kind) {
  const fileName = SCHEMA_FILES[kind]
  if (!fileName) {
    throw new Error(`Unknown artifact kind: ${kind}`)
  }

  const schema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, fileName), 'utf-8'))
  return resolveLocalRefs(schema, schema)
}

function isImmutableImageRef(value) {
  return typeof value === 'string' && /@sha256:[a-fA-F0-9]{64}$/.test(value)
}

function hasImageSelector(value) {
  if (isImmutableImageRef(value)) return true
  if (typeof value !== 'string') return false
  return value.lastIndexOf(':') > value.lastIndexOf('/')
}

function imageRepository(value) {
  const withoutDigest = value.split('@', 1)[0]
  const lastSlash = withoutDigest.lastIndexOf('/')
  const lastColon = withoutDigest.lastIndexOf(':')
  return lastColon > lastSlash ? withoutDigest.slice(0, lastColon) : withoutDigest
}

function supportsLinuxAmd64(platforms) {
  return Array.isArray(platforms) && platforms.some((platform) => (
    typeof platform === 'string'
    && (platform === 'linux/amd64' || platform.startsWith('linux/amd64/'))
  ))
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

  if (typeof data.image_ref === 'string' && !hasImageSelector(data.image_ref)) {
    pushError(errors, '$.image_ref', 'must include a tag or immutable digest')
  }

  const verifiedApplicationRefs = new Set()
  for (let index = 0; index < data.image_inventory.length; index += 1) {
    const image = data.image_inventory[index]
    const pointer = `$.image_inventory[${index}]`

    if (image.status === 'verified') {
      if (!isImmutableImageRef(image.image_ref)) {
        pushError(errors, `${pointer}.image_ref`, 'verified images must use an immutable sha256 digest')
      }
      if (image.digest === null || image.image_ref !== `${image.image}@${image.digest}`) {
        pushError(errors, `${pointer}.digest`, 'must match the immutable image_ref')
      }
      if (image.error !== null) {
        pushError(errors, `${pointer}.error`, 'must be null for a verified image')
      }
      if (image.role === 'application' && image.image_ref !== null) {
        verifiedApplicationRefs.add(image.image_ref)
      }
    } else {
      if (image.digest !== null || image.image_ref !== null) {
        pushError(errors, pointer, 'unverified images must not expose a deployable digest reference')
      }
      if (image.error === null) {
        pushError(errors, `${pointer}.error`, 'must explain why the image is not verified')
      }
    }
  }

  if (
    typeof data.image_ref === 'string'
    && verifiedApplicationRefs.size > 0
    && !verifiedApplicationRefs.has(data.image_ref)
  ) {
    pushError(errors, '$.image_ref', 'must match a verified application image from image_inventory')
  }
  if (data.image_ref === null && verifiedApplicationRefs.size === 1) {
    pushError(errors, '$.image_ref', 'must record the single verified application image')
  }

  const serviceNames = new Set()
  for (let index = 0; index < data.service_inventory.length; index += 1) {
    const service = data.service_inventory[index]
    const pointer = `$.service_inventory[${index}]`
    if (serviceNames.has(service.name)) {
      pushError(errors, `${pointer}.name`, 'must be unique')
    }
    serviceNames.add(service.name)

    if (service.image_status === 'verified' || service.image_status === 'built') {
      if (!isImmutableImageRef(service.image_ref)) {
        pushError(errors, `${pointer}.image_ref`, 'deployable service images must use an immutable sha256 digest')
      }
      if (service.digest === null || service.image_ref !== `${service.image_ref?.split('@')[0]}@${service.digest}`) {
        pushError(errors, `${pointer}.digest`, 'must match the immutable image_ref')
      }
      if (service.image_status === 'built' && !supportsLinuxAmd64(service.platforms || [])) {
        pushError(errors, `${pointer}.platforms`, 'locally built service images must target linux/amd64')
      }
    }

    if (service.image_status === 'build_required' && service.build === null) {
      pushError(errors, `${pointer}.build`, 'must define the per-service build plan when image_status is build_required')
    }
    if (
      service.image_status === 'built'
      && (service.build === null || service.build.origin === null)
    ) {
      pushError(errors, `${pointer}.build`, 'built services must retain the effective build plan and its origin')
    }
  }
}

function validateBuildResultSemantics(data, errors) {
  const startedAt = Date.parse(data.build.started_at)
  const finishedAt = Date.parse(data.finished_at)

  if (!Number.isNaN(startedAt) && !Number.isNaN(finishedAt) && finishedAt < startedAt) {
    pushError(errors, '$.finished_at', 'must not be earlier than build.started_at')
  }

  if (data.registry === 'ghcr' && !data.push.remote_image.startsWith('ghcr.io/')) {
    pushError(errors, '$.push.remote_image', 'must be a GHCR image when registry is ghcr')
  }

  if (data.registry === 'dockerhub' && data.push.remote_image.startsWith('ghcr.io/')) {
    pushError(errors, '$.push.remote_image', 'must not be a GHCR image when registry is dockerhub')
  }

  if (data.push.remote_image.lastIndexOf(':') <= data.push.remote_image.lastIndexOf('/')) {
    pushError(errors, '$.push.remote_image', 'must include an explicit image tag')
  }

  if (data.outcome === 'success') {
    if (!isImmutableImageRef(data.push.image_ref)) {
      pushError(errors, '$.push.image_ref', 'must use an immutable sha256 digest')
    }
    if (data.push.image_ref !== `${imageRepository(data.push.remote_image)}@${data.push.digest}`) {
      pushError(errors, '$.push.image_ref', 'must match remote_image repository and push.digest')
    }
    if (!supportsLinuxAmd64(data.push.platforms)) {
      pushError(errors, '$.push.platforms', 'must include linux/amd64')
    }
  }
}

function validateStateSemantics(data, errors) {
  const { last_deploy: lastDeploy, history } = data

  if (history[0]?.action !== 'deploy') {
    pushError(errors, '$.history[0].action', 'the first history entry must be deploy')
  }

  if (history[0]?.status !== 'success') {
    pushError(errors, '$.history[0].status', 'the first history entry must be successful')
  }

  const deployedAt = Date.parse(lastDeploy.deployed_at)
  const updatedAt = Date.parse(lastDeploy.last_updated_at)
  if (!Number.isNaN(deployedAt) && !Number.isNaN(updatedAt) && updatedAt < deployedAt) {
    pushError(errors, '$.last_deploy.last_updated_at', 'must not be earlier than deployed_at')
  }

  try {
    const host = new URL(lastDeploy.url).hostname
    if (!host.endsWith(`.${lastDeploy.region}`)) {
      pushError(errors, '$.last_deploy.url', 'hostname must end with .<region>')
    }
  } catch {
    pushError(errors, '$.last_deploy.url', 'must be a valid https URL')
  }

  let previousAt = null
  let latestSuccessfulImage = null
  for (let index = 0; index < history.length; index++) {
    const entry = history[index]
    const at = Date.parse(entry.at)

    if (previousAt !== null && !Number.isNaN(at) && at < previousAt) {
      pushError(errors, `$.history[${index}].at`, 'must be in non-decreasing chronological order')
    }
    if (!Number.isNaN(at)) {
      previousAt = at
    }

    if (entry.action === 'set-image' && entry.image === entry.previous_image) {
      pushError(errors, `$.history[${index}].image`, 'must differ from previous_image for set-image actions')
    }

    if ((entry.action === 'deploy' || entry.action === 'set-image') && entry.status === 'success') {
      latestSuccessfulImage = entry.image
    }

  }

  if (latestSuccessfulImage && latestSuccessfulImage !== lastDeploy.image) {
    pushError(errors, '$.last_deploy.image', 'must match the latest successful image-changing history entry')
  }
}

function validateTemplateReferencesSemantics(data, errors) {
  const exactReferences = data.references.filter((reference) => reference.match === 'exact')
  const exactCount = exactReferences.length
  const similarCount = data.references.filter((reference) => reference.match === 'similar').length

  if (data.summary.exact_count !== exactCount) {
    pushError(errors, '$.summary.exact_count', `must equal the number of exact references (${exactCount})`)
  }
  if (data.summary.similar_count !== similarCount) {
    pushError(errors, '$.summary.similar_count', `must equal the number of similar references (${similarCount})`)
  }
  if (similarCount !== 0) {
    pushError(errors, '$.references', 'version 2.0 does not select similar template references')
  }

  let sawSimilar = false
  const catalogPaths = new Set()
  const referencePaths = new Set()

  for (let index = 0; index < data.references.length; index++) {
    const reference = data.references[index]
    const pointer = `$.references[${index}]`

    if (reference.match === 'similar') {
      sawSimilar = true
      if (reference.score >= 100) {
        pushError(errors, `${pointer}.score`, 'must be below 100 for a similar reference')
      }
    } else {
      if (sawSimilar) {
        pushError(errors, `${pointer}.match`, 'exact references must appear before similar references')
      }
      if (reference.score !== 100) {
        pushError(errors, `${pointer}.score`, 'must equal 100 for an exact reference')
      }
      if (reference.git_repo === null) {
        pushError(errors, `${pointer}.git_repo`, 'must identify a repository for an exact reference')
      }
    }

    if (catalogPaths.has(reference.catalog_path)) {
      pushError(errors, `${pointer}.catalog_path`, 'must be unique')
    }
    catalogPaths.add(reference.catalog_path)

    if (referencePaths.has(reference.reference_path)) {
      pushError(errors, `${pointer}.reference_path`, 'must be unique')
    }
    referencePaths.add(reference.reference_path)
  }

  if (!data.catalog.available) {
    if (data.catalog.source !== 'unavailable') {
      pushError(errors, '$.catalog.source', 'must be unavailable when the catalog is unavailable')
    }
    if (data.catalog.template_count !== 0) {
      pushError(errors, '$.catalog.template_count', 'must be zero when the catalog is unavailable')
    }
    if (data.catalog.skipped_templates !== 0) {
      pushError(errors, '$.catalog.skipped_templates', 'must be zero when the catalog is unavailable')
    }
    if (data.references.length !== 0) {
      pushError(errors, '$.references', 'must be empty when the catalog is unavailable')
    }
  } else if (data.catalog.source === 'unavailable') {
    pushError(errors, '$.catalog.source', 'must not be unavailable when the catalog is available')
  }

  if (data.catalog.stale && data.catalog.source !== 'cache') {
    pushError(errors, '$.catalog.stale', 'may only be true for a cached catalog')
  }

  if (data.project.repo_reference === null && exactCount > 0) {
    pushError(errors, '$.summary.exact_count', 'must be zero when the project repository is unknown')
  }

  if (data.references.length > data.catalog.template_count) {
    pushError(errors, '$.references', 'cannot contain more references than parsed catalog templates')
  }

  const officialCatalog = (
    data.catalog.repository === OFFICIAL_TEMPLATE_CATALOG
    && data.catalog.ref === OFFICIAL_TEMPLATE_CATALOG_REF
  )
  if (
    data.catalog.verified_for_reuse
    && (
      !data.catalog.available
      || data.catalog.source !== 'refreshed'
      || data.catalog.commit === null
      || !officialCatalog
    )
  ) {
    pushError(
      errors,
      '$.catalog.verified_for_reuse',
      'may be true only for a refreshed official catalog with a concrete commit',
    )
  }
  const shouldDeployOfficialTemplate = (
    data.decision.reuse_requested
    && data.catalog.available
    && officialCatalog
    && data.catalog.source === 'refreshed'
    && data.catalog.verified_for_reuse
    && data.catalog.commit !== null
    && data.project.repo_subdir === null
    && exactCount === 1
  )

  if (shouldDeployOfficialTemplate) {
    if (data.decision.route !== 'deploy_official_template') {
      pushError(
        errors,
        '$.decision.route',
        'must deploy the unique exact official template when reuse was requested',
      )
    }
    if (data.decision.reference_name !== exactReferences[0].name) {
      pushError(
        errors,
        '$.decision.reference_name',
        'must identify the unique exact official template',
      )
    }
    if (data.decision.template_path !== DEPLOYMENT_TEMPLATE_PATH) {
      pushError(
        errors,
        '$.decision.template_path',
        `must equal ${DEPLOYMENT_TEMPLATE_PATH} for official-template deployment`,
      )
    }
  } else {
    if (data.decision.route !== 'continue_standard_pipeline') {
      pushError(
        errors,
        '$.decision.route',
        'must continue the standard pipeline when official-template reuse is not eligible',
      )
    }
    if (data.decision.reference_name !== null) {
      pushError(
        errors,
        '$.decision.reference_name',
        'must be null when continuing the standard pipeline',
      )
    }
    if (data.decision.template_path !== null) {
      pushError(
        errors,
        '$.decision.template_path',
        'must be null when continuing the standard pipeline',
      )
    }
  }

  if (data.reason !== data.decision.reason) {
    pushError(errors, '$.reason', 'must match decision.reason')
  }
}

const SEMANTIC_VALIDATORS = {
  config: () => {},
  analysis: validateAnalysisSemantics,
  'build-result': validateBuildResultSemantics,
  state: validateStateSemantics,
  'template-references': validateTemplateReferencesSemantics,
}

export function inferArtifactKind(filePath) {
  const baseName = path.basename(filePath)
  switch (baseName) {
    case 'config.json':
      return 'config'
    case 'analysis.json':
      return 'analysis'
    case 'build-result.json':
      return 'build-result'
    case 'state.json':
      return 'state'
    case 'template-references.json':
      return 'template-references'
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
