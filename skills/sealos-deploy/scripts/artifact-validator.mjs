#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const schemaDir = path.join(scriptDir, '..', 'schemas')

const schemaFiles = {
  'analysis-phase-0': 'analysis-phase-0.schema.json',
  'analysis-phase-1': 'analysis-phase-1.schema.json',
  analysis: 'analysis.schema.json',
  config: 'config.schema.json',
  'deployment-plan': 'deployment-plan.schema.json',
  'build-result': 'build-result.schema.json',
}

const stages = {
  'phase-0': { analysisKind: 'analysis-phase-0', requirePlan: false, requireBuild: false },
  'phase-1': { analysisKind: 'analysis-phase-1', requirePlan: false, requireBuild: false },
  'phase-2': { analysisKind: 'analysis', requirePlan: true, requireBuild: false },
  'phase-3': { analysisKind: 'analysis', requirePlan: true, requireBuild: true },
}

const officialTemplatePointer = '.sealos/phase-1/official-template.yaml'

function isPlainObject (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function addError (errors, pointer, message) {
  errors.push({ path: pointer, message })
}

function valueMatchesType (expected, value) {
  if (Array.isArray(expected)) return expected.some(type => valueMatchesType(type, value))
  if (expected === 'null') return value === null
  if (expected === 'array') return Array.isArray(value)
  if (expected === 'object') return isPlainObject(value)
  if (expected === 'string') return typeof value === 'string'
  if (expected === 'integer') return Number.isInteger(value)
  if (expected === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (expected === 'boolean') return typeof value === 'boolean'
  return false
}

function resolveReference (reference, rootSchema) {
  if (!reference.startsWith('#/')) throw new Error(`Unsupported schema reference: ${reference}`)
  const target = reference.slice(2).split('/').reduce((current, key) => (
    current?.[key.replaceAll('~1', '/').replaceAll('~0', '~')]
  ), rootSchema)
  if (!isPlainObject(target)) throw new Error(`Unresolved schema reference: ${reference}`)
  return target
}

function validateSchema (schema, value, pointer, errors, rootSchema) {
  if (schema.$ref) {
    validateSchema(resolveReference(schema.$ref, rootSchema), value, pointer, errors, rootSchema)
    return
  }

  if (schema.anyOf) {
    const matches = schema.anyOf.some(candidate => {
      const candidateErrors = []
      validateSchema(candidate, value, pointer, candidateErrors, rootSchema)
      return candidateErrors.length === 0
    })
    if (!matches) addError(errors, pointer, 'does not match an allowed schema')
    return
  }

  if (Object.hasOwn(schema, 'const') && value !== schema.const) {
    addError(errors, pointer, `must equal ${JSON.stringify(schema.const)}`)
    return
  }

  if (schema.enum && !schema.enum.includes(value)) {
    addError(errors, pointer, `must be one of ${schema.enum.join(', ')}`)
    return
  }

  if (schema.type && !valueMatchesType(schema.type, value)) {
    addError(errors, pointer, `must be of type ${Array.isArray(schema.type) ? schema.type.join(' or ') : schema.type}`)
    return
  }

  if (isPlainObject(value)) validateObject(schema, value, pointer, errors, rootSchema)
  if (Array.isArray(value)) validateArray(schema, value, pointer, errors, rootSchema)
  if (typeof value === 'string') validateString(schema, value, pointer, errors)
  if (typeof value === 'number') validateNumber(schema, value, pointer, errors)
}

function validateObject (schema, value, pointer, errors, rootSchema) {
  const keys = Object.keys(value)
  for (const key of schema.required || []) {
    if (!Object.hasOwn(value, key)) addError(errors, pointer, `missing required property ${key}`)
  }
  if (typeof schema.minProperties === 'number' && keys.length < schema.minProperties) {
    addError(errors, pointer, `must have at least ${schema.minProperties} properties`)
  }

  const properties = schema.properties || {}
  const patterns = Object.entries(schema.patternProperties || {}).map(([pattern, child]) => ({
    expression: new RegExp(pattern),
    schema: child,
  }))

  for (const [key, child] of Object.entries(value)) {
    const childPointer = `${pointer}.${key}`
    if (Object.hasOwn(properties, key)) {
      validateSchema(properties[key], child, childPointer, errors, rootSchema)
      continue
    }
    const matches = patterns.filter(pattern => pattern.expression.test(key))
    if (matches.length > 0) {
      for (const match of matches) validateSchema(match.schema, child, childPointer, errors, rootSchema)
      continue
    }
    if (schema.additionalProperties === false) addError(errors, childPointer, 'is not allowed')
    if (isPlainObject(schema.additionalProperties)) {
      validateSchema(schema.additionalProperties, child, childPointer, errors, rootSchema)
    }
  }
}

function validateArray (schema, value, pointer, errors, rootSchema) {
  if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
    addError(errors, pointer, `must contain at least ${schema.minItems} items`)
  }
  if (schema.items) {
    value.forEach((item, index) => validateSchema(schema.items, item, `${pointer}[${index}]`, errors, rootSchema))
  }
}

function validateString (schema, value, pointer, errors) {
  if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
    addError(errors, pointer, `must be at least ${schema.minLength} characters long`)
  }
  if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
    addError(errors, pointer, `must match pattern ${schema.pattern}`)
  }
  if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) {
    addError(errors, pointer, 'must be a valid ISO 8601 date-time')
  }
}

function validateNumber (schema, value, pointer, errors) {
  if (typeof schema.minimum === 'number' && value < schema.minimum) {
    addError(errors, pointer, `must be >= ${schema.minimum}`)
  }
  if (typeof schema.maximum === 'number' && value > schema.maximum) {
    addError(errors, pointer, `must be <= ${schema.maximum}`)
  }
}

function loadSchema (kind) {
  const file = schemaFiles[kind]
  if (!file) throw new Error(`Unknown artifact kind: ${kind}`)
  return JSON.parse(fs.readFileSync(path.join(schemaDir, file), 'utf8'))
}

function validateAnalysisSemantics (data, errors) {
  if (!path.isAbsolute(data.work_dir)) addError(errors, '$.work_dir', 'must be an absolute path')
  if (typeof data.github_url === 'string' && !/^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/i.test(data.github_url)) {
    addError(errors, '$.github_url', 'must be a GitHub repository URL or null')
  }
  if (typeof data.official_template === 'string' && data.official_template !== officialTemplatePointer) {
    addError(errors, '$.official_template', 'must point to the saved official template or be null')
  }
}

function validateBuildResultSemantics (data, errors) {
  const digestKeys = Object.keys(data.digests)
  const accessKeys = Object.keys(data.pull_access)
  if (digestKeys.length !== accessKeys.length || digestKeys.some(key => !Object.hasOwn(data.pull_access, key))) {
    addError(errors, '$.pull_access', 'must contain exactly the digest service keys')
  }
  for (const [service, image] of Object.entries(data.digests)) {
    if (!image.startsWith('ghcr.io/')) addError(errors, `$.digests.${service}`, 'must use GHCR')
  }
}

function validateDeploymentPlanSemantics (data, errors) {
  const value = data.deployment_source
  if (path.isAbsolute(value) || value.split(/[\\/]+/).includes('..')) {
    addError(errors, '$.deployment_source', 'must be a work-directory-relative path')
  }
}

const semanticValidators = {
  'analysis-phase-0': validateAnalysisSemantics,
  'analysis-phase-1': validateAnalysisSemantics,
  analysis: validateAnalysisSemantics,
  config: () => {},
  'deployment-plan': validateDeploymentPlanSemantics,
  'build-result': validateBuildResultSemantics,
}

export function inferArtifactKind (filePath) {
  const normalized = filePath.split(path.sep).join('/')
  if (normalized.endsWith('/phase-2/deployment-plan.json')) return 'deployment-plan'
  if (normalized.endsWith('/phase-3/build-result.json')) return 'build-result'
  if (normalized.endsWith('/analysis.json')) return 'analysis'
  if (normalized.endsWith('/config.json')) return 'config'
  return null
}

export function validateArtifactData (kind, data) {
  const schema = loadSchema(kind)
  const errors = []
  validateSchema(schema, data, '$', errors, schema)
  if (errors.length === 0) semanticValidators[kind](data, errors)
  return { kind, valid: errors.length === 0, errors }
}

export function validateArtifactFile (kind, filePath) {
  let data
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    return {
      kind,
      valid: false,
      errors: [{ path: '$', message: `invalid JSON: ${error.message}` }],
    }
  }
  return validateArtifactData(kind, data)
}

function withinDirectory (root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function resultForFile (kind, filePath) {
  if (!fs.existsSync(filePath)) {
    return { kind, file: filePath, valid: false, errors: [{ path: '$', message: 'file does not exist' }] }
  }
  return { kind, file: filePath, ...validateArtifactFile(kind, filePath) }
}

function resultForOfficialTemplate (workDir) {
  const filePath = path.resolve(workDir, officialTemplatePointer)
  if (!withinDirectory(workDir, filePath)) {
    return {
      kind: 'official-template',
      file: filePath,
      valid: false,
      errors: [{ path: '$.official_template', message: 'must stay inside work_dir' }],
    }
  }
  if (!fs.existsSync(filePath)) {
    return {
      kind: 'official-template',
      file: filePath,
      valid: false,
      errors: [{ path: '$.official_template', message: 'saved official template does not exist' }],
    }
  }
  if (!fs.statSync(filePath).isFile()) {
    return {
      kind: 'official-template',
      file: filePath,
      valid: false,
      errors: [{ path: '$.official_template', message: 'saved official template must be a file' }],
    }
  }
  if (!fs.readFileSync(filePath, 'utf8').trim()) {
    return {
      kind: 'official-template',
      file: filePath,
      valid: false,
      errors: [{ path: '$.official_template', message: 'saved official template must not be empty' }],
    }
  }
  return { kind: 'official-template', file: filePath, valid: true, errors: [] }
}

export function validateProjectArtifacts (workDir, stage) {
  const contract = stages[stage]
  if (!contract) throw new Error(`Unknown stage: ${stage}`)
  const absoluteWorkDir = path.resolve(workDir)
  const sealosDir = path.join(absoluteWorkDir, '.sealos')
  const analysisPath = path.join(sealosDir, 'analysis.json')
  const results = [resultForFile(contract.analysisKind, analysisPath)]
  let analysis = null

  try {
    analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'))
  } catch {
    analysis = null
  }

  if (stage !== 'phase-0' && typeof analysis?.official_template === 'string') {
    results.push(resultForOfficialTemplate(absoluteWorkDir))
  }

  if (contract.requirePlan) {
    const planPath = path.join(sealosDir, 'phase-2', 'deployment-plan.json')
    const planResult = resultForFile('deployment-plan', planPath)
    results.push(planResult)
    if (planResult.valid) {
      const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'))
      const sourcePath = path.resolve(absoluteWorkDir, plan.deployment_source)
      if (!withinDirectory(absoluteWorkDir, sourcePath) || !fs.existsSync(sourcePath)) {
        planResult.valid = false
        planResult.errors.push({ path: '$.deployment_source', message: 'must point to an existing path inside work_dir' })
      }
      const composeNames = new Set(['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml'])
      if (
        composeNames.has(path.basename(plan.deployment_source))
        && plan.deployment_source !== '.sealos/phase-2/docker-compose.yml'
      ) {
        planResult.valid = false
        planResult.errors.push({ path: '$.deployment_source', message: 'must use the canonical Phase 2 Compose path' })
      }
    }
    if (analysis?.deployment_plan !== '.sealos/phase-2/deployment-plan.json') {
      results[0].valid = false
      results[0].errors.push({ path: '$.deployment_plan', message: 'must point to the Phase 2 plan' })
    }
  }

  if (contract.requireBuild) {
    const buildPath = path.join(sealosDir, 'phase-3', 'build-result.json')
    results.push(resultForFile('build-result', buildPath))
    if (analysis?.build_result !== '.sealos/phase-3/build-result.json') {
      results[0].valid = false
      results[0].errors.push({ path: '$.build_result', message: 'must point to the Phase 3 result' })
    }
  }

  return {
    stage,
    valid: results.every(result => result.valid),
    results,
  }
}
