#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCHEMA_DIR = path.join(__dirname, '..', 'schemas')
const BUILDKIT_SCHEMA_DIR = path.join(__dirname, '..', '..', 'k8s-buildkit-job', 'schemas')

const SCHEMA_FILES = {
  config: 'config.schema.json',
  analysis: 'analysis.schema.json',
  'build-request': 'build-request.schema.json',
  'build-result': { dir: BUILDKIT_SCHEMA_DIR, file: 'build-result.schema.json' },
  'delivery-manifest': 'delivery-manifest.schema.json',
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

  if (build.context_path !== '.') {
    pushError(errors, '$.build.context_path', 'must be "." for the current prepare workflow')
  }

  if (build.dockerfile_path !== 'Dockerfile') {
    pushError(errors, '$.build.dockerfile_path', 'must be "Dockerfile" for the current prepare workflow')
  }

  if (source.repo === null && source.github_url !== null) {
    pushError(errors, '$.source.repo', 'must be set when github_url is known')
  }

  if (source.ref === 'HEAD') {
    pushError(errors, '$.source.ref', 'must be resolved to a concrete commit SHA')
  }
}

function validateBuildResultSemantics(data, errors) {
  if (typeof data.image?.image_ref === 'string' && !data.image.image_ref.includes(':')) {
    pushError(errors, '$.image.image_ref', 'must include an explicit image tag')
  }
}

function validateDeliveryManifestSemantics(data, errors) {
  const artifactSet = new Set(data.artifacts)

  for (const requiredArtifact of [
    '.sealos/analysis.json',
    '.sealos/build-request.json',
    '.sealos/build-result.json',
    '.sealos/template/index.yaml',
  ]) {
    if (!artifactSet.has(requiredArtifact)) {
      pushError(errors, '$.artifacts', `must include ${requiredArtifact}`)
    }
  }

  if (!artifactSet.has(data.template_path)) {
    pushError(errors, '$.template_path', 'must be present in artifacts')
  }

  if (!artifactSet.has(data.build_request_path)) {
    pushError(errors, '$.build_request_path', 'must be present in artifacts')
  }

  if (!artifactSet.has(data.build_result_path)) {
    pushError(errors, '$.build_result_path', 'must be present in artifacts')
  }
}

const SEMANTIC_VALIDATORS = {
  config: () => {},
  analysis: validateAnalysisSemantics,
  'build-request': validateBuildRequestSemantics,
  'build-result': validateBuildResultSemantics,
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
