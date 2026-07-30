import fs from 'fs'
import path from 'path'

const IMMUTABLE_IMAGE_PATTERN = /^[^\s@]+@sha256:[0-9a-fA-F]{64}$/
const DIGEST_PATTERN = /^sha256:[0-9a-fA-F]{64}$/

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}

export function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, file)
}

export function assertAggregateRequest(request) {
  if (request?.version !== '2.0') {
    throw new Error(`build request version must be 2.0, got ${request?.version}`)
  }
  if (request.route !== 'standard') {
    throw new Error(`Kaniko only runs on route=standard, got ${request.route}`)
  }
  if (request.source?.type !== 'sandbox-context') {
    throw new Error(`source.type must be sandbox-context, got ${request.source?.type}`)
  }
  if (!Array.isArray(request.services) || request.services.length === 0) {
    throw new Error('build request services must contain at least one service')
  }
  return request
}

export function selectService(request, selector) {
  assertAggregateRequest(request)
  if (typeof selector !== 'string' || selector.length === 0) {
    throw new Error('--service is required for an aggregate build request')
  }
  const matches = request.services.filter((service) => (
    service?.name === selector || service?.artifact_key === selector
  ))
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `service not found in build request: ${selector}`
        : `service selector is ambiguous: ${selector}`,
    )
  }
  return matches[0]
}

export function assertBuildRequiredService(service) {
  if (service.mode !== 'build-required') {
    throw new Error(`service ${service.name} is not build-required`)
  }
  if (!service.image?.target_image?.startsWith('ghcr.io/')) {
    throw new Error(`service ${service.name} must use a tagged GHCR target image`)
  }
  if (!service.build) {
    throw new Error(`service ${service.name} has no build plan`)
  }
  return service
}

export function imageRepository(image) {
  const withoutDigest = String(image).split('@', 1)[0]
  const lastSlash = withoutDigest.lastIndexOf('/')
  const lastColon = withoutDigest.lastIndexOf(':')
  return lastColon > lastSlash ? withoutDigest.slice(0, lastColon) : withoutDigest
}

export function assertDigest(value) {
  if (!DIGEST_PATTERN.test(String(value || ''))) {
    throw new Error(`digest must be sha256:<64 hex>, got ${value}`)
  }
  return String(value).toLowerCase()
}

export function digestFromImmutableRef(value) {
  if (!IMMUTABLE_IMAGE_PATTERN.test(String(value || ''))) {
    throw new Error(`image_ref must be immutable, got ${value}`)
  }
  return String(value).slice(String(value).lastIndexOf('@') + 1).toLowerCase()
}

export function initialAggregateResult(request) {
  if (request?.version !== '2.0') {
    throw new Error(`build request version must be 2.0, got ${request?.version}`)
  }
  if (request.route === 'official-template') {
    return {
      version: '2.0',
      generated_at: new Date().toISOString(),
      route: 'official-template',
      status: 'skipped',
      expected_services: 0,
      services: [],
    }
  }

  assertAggregateRequest(request)
  return {
    version: '2.0',
    generated_at: new Date().toISOString(),
    route: 'standard',
    status: 'in_progress',
    expected_services: request.services.length,
    services: [],
  }
}

export function upsertServiceResult(aggregate, result) {
  const services = Array.isArray(aggregate.services) ? [...aggregate.services] : []
  const index = services.findIndex((entry) => entry.artifact_key === result.artifact_key)
  if (index >= 0) {
    services[index] = result
  } else {
    services.push(result)
  }
  services.sort((left, right) => left.artifact_key.localeCompare(right.artifact_key))
  aggregate.services = services
  aggregate.generated_at = new Date().toISOString()
  if (services.some((entry) => entry.outcome === 'failed')) {
    aggregate.status = 'failed'
  } else if (services.length === aggregate.expected_services) {
    aggregate.status = 'succeeded'
  } else {
    aggregate.status = 'in_progress'
  }
  return aggregate
}
