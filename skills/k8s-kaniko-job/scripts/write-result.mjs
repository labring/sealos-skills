#!/usr/bin/env node

import fs from 'fs'
import {
  assertBuildRequiredService,
  assertDigest,
  digestFromImmutableRef,
  imageRepository,
  initialAggregateResult,
  readJson,
  selectService,
  upsertServiceResult,
  writeJsonAtomic,
} from './build-contract.mjs'

const STATUSES = new Set(['succeeded', 'failed', 'skipped'])
const PULL_ACCESS = new Set([
  'anonymous',
  'ghcr_secret_required',
  'indeterminate',
])
const ERROR_PHASES = new Set([
  'preflight',
  'build-request',
  'auth',
  'context',
  'dockerfile',
  'kaniko',
  'push',
  'kubernetes',
  'unknown',
])

function usage() {
  console.error([
    'Usage:',
    '  node write-result.mjs --request <file> --out <file> --initialize true',
    '  node write-result.mjs --request <file> --out <file> --service <name-or-key> --status <succeeded|failed|skipped> [options]',
    '',
    'Options:',
    '  --namespace <namespace>',
    '  --job <job-name>',
    '  --pod <pod-name>',
    '  --log-file <path>',
    '  --digest <sha256:digest>',
    '  --pull-access <anonymous|ghcr_secret_required|indeterminate>',
    '  --error-phase <phase>',
    '  --error-message <message>',
  ].join('\n'))
}

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (!key.startsWith('--')) {
      throw new Error(`Unexpected argument: ${key}`)
    }
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${key}`)
    }
    args[key.slice(2)] = value
    index += 1
  }
  return args
}

function requireArg(args, key) {
  if (!args[key]) throw new Error(`Missing required argument --${key}`)
  return args[key]
}

function buildEvidence(service) {
  if (!service.build) return null
  return {
    context: service.build.context_path,
    dockerfile: service.build.dockerfile_path,
    target: service.build.target,
    build_arg_names: service.build.build_arg_names,
  }
}

function kubernetesEvidence(args, required) {
  const namespace = args.namespace || null
  const job = args.job || null
  if (required && (!namespace || !job)) {
    throw new Error('--namespace and --job are required for a successful Kaniko build')
  }
  if ((namespace && !job) || (!namespace && job)) {
    throw new Error('--namespace and --job must be provided together')
  }
  if (!namespace) return null
  return {
    namespace,
    job,
    pod: args.pod || null,
  }
}

function logEvidence(args, required) {
  if (required && !args['log-file']) {
    throw new Error('--log-file is required for a successful Kaniko build')
  }
  return args['log-file']
    ? { local_file: args['log-file'] }
    : null
}

function buildServiceResult(request, service, args) {
  const status = requireArg(args, 'status')
  if (!STATUSES.has(status)) {
    throw new Error(`Invalid status: ${status}`)
  }

  const finishedAt = new Date().toISOString()
  if (status === 'skipped') {
    if (service.mode !== 'reuse-image') {
      throw new Error('status=skipped is valid only for mode=reuse-image')
    }
    const imageRef = service.image?.image_ref
    const digest = digestFromImmutableRef(imageRef)
    const pullAccess = service.image?.pull_access
    if (!PULL_ACCESS.has(pullAccess)) {
      throw new Error('reused images must record pull access in build-request.json')
    }
    return {
      name: service.name,
      artifact_key: service.artifact_key,
      outcome: 'reused',
      image: {
        remote_image: null,
        digest,
        image_ref: imageRef,
        platforms: service.image.platforms || [],
        pull_access: pullAccess,
      },
      build: buildEvidence(service),
      kubernetes: null,
      logs: null,
      error: null,
      finished_at: finishedAt,
    }
  }

  assertBuildRequiredService(service)
  const remoteImage = service.image.target_image
  const build = buildEvidence(service)

  if (status === 'succeeded') {
    const digest = assertDigest(requireArg(args, 'digest'))
    const pullAccess = requireArg(args, 'pull-access')
    if (!PULL_ACCESS.has(pullAccess)) {
      throw new Error(`Invalid pull access: ${pullAccess}`)
    }
    return {
      name: service.name,
      artifact_key: service.artifact_key,
      outcome: 'success',
      image: {
        remote_image: remoteImage,
        digest,
        image_ref: `${imageRepository(remoteImage)}@${digest}`,
        platforms: ['linux/amd64'],
        pull_access: pullAccess,
      },
      build,
      kubernetes: kubernetesEvidence(args, true),
      logs: logEvidence(args, true),
      error: null,
      finished_at: finishedAt,
    }
  }

  const phase = args['error-phase'] || 'unknown'
  if (!ERROR_PHASES.has(phase)) {
    throw new Error(`Invalid error phase: ${phase}`)
  }
  return {
    name: service.name,
    artifact_key: service.artifact_key,
    outcome: 'failed',
    image: {
      remote_image: remoteImage,
      digest: null,
      image_ref: null,
      platforms: [],
      pull_access: null,
    },
    build,
    kubernetes: kubernetesEvidence(args, false),
    logs: logEvidence(args, false),
    error: {
      phase,
      message: args['error-message'] || 'Kaniko build failed; see the private build log',
    },
    finished_at: finishedAt,
  }
}

function loadAggregate(outFile, request) {
  if (!fs.existsSync(outFile)) {
    return initialAggregateResult(request)
  }
  const aggregate = readJson(outFile)
  if (
    aggregate.version !== '2.0'
    || aggregate.route !== request.route
    || aggregate.expected_services !== request.services.length
  ) {
    throw new Error('existing build-result.json does not match the current aggregate request')
  }
  if (!Array.isArray(aggregate.services)) {
    throw new Error('existing build-result.json services must be an array')
  }
  const requestServices = new Map(
    request.services.map((service) => [service.artifact_key, service.name]),
  )
  const seen = new Set()
  for (const service of aggregate.services) {
    if (
      seen.has(service.artifact_key)
      || requestServices.get(service.artifact_key) !== service.name
    ) {
      throw new Error('existing build-result.json contains services outside the current request')
    }
    seen.add(service.artifact_key)
  }
  return aggregate
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2))
    const requestFile = requireArg(args, 'request')
    const outFile = requireArg(args, 'out')
    const request = readJson(requestFile)

    if (args.initialize === 'true') {
      const aggregate = initialAggregateResult(request)
      writeJsonAtomic(outFile, aggregate)
      process.stdout.write(`${JSON.stringify(aggregate, null, 2)}\n`)
      return
    }

    const service = selectService(request, requireArg(args, 'service'))
    const serviceResult = buildServiceResult(request, service, args)
    const aggregate = upsertServiceResult(loadAggregate(outFile, request), serviceResult)
    writeJsonAtomic(outFile, aggregate)
    process.stdout.write(`${JSON.stringify(aggregate, null, 2)}\n`)
  } catch (error) {
    usage()
    console.error(`\nError: ${error.message}`)
    process.exit(1)
  }
}

main()
