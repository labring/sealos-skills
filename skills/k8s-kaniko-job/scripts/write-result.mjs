#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

const STATUSES = new Set(['succeeded', 'failed'])
const ERROR_PHASES = new Set([
  'preflight',
  'build-request',
  'auth',
  'context',
  'dockerfile',
  'kaniko',
  'push',
  'kubernetes',
  'timeout',
  'unknown',
])

function usage() {
  console.error([
    'Usage:',
    '  node write-result.mjs --request <file> --out <file> --status <succeeded|failed> [options]',
    '',
    'Options:',
    '  --namespace <namespace>',
    '  --job <job-name>',
    '  --pod <pod-name>',
    '  --log-file <path>',
    '  --digest <sha256:digest>',
    '  --error-phase <phase>',
    '  --error-message <message>',
  ].join('\n'))
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]
    if (!key.startsWith('--')) {
      throw new Error(`Unexpected argument: ${key}`)
    }
    const value = argv[i + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${key}`)
    }
    args[key.slice(2)] = value
    i += 1
  }
  return args
}

function requireArg(args, key) {
  if (!args[key]) throw new Error(`Missing required argument --${key}`)
  return args[key]
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}

function resolveImage(request) {
  if (!request.image?.target_image) {
    throw new Error('image.target_image is required for mode=build-required')
  }

  return request.image.target_image
}

function buildResult(request, args) {
  const status = requireArg(args, 'status')
  if (!STATUSES.has(status)) {
    throw new Error(`Invalid status: ${status}`)
  }

  if (request.mode !== 'build-required') {
    throw new Error('main deployment flow invokes Kaniko only for mode=build-required')
  }
  const imageRef = resolveImage(request)
  const source = request.source || {}
  const build = request.build || {}
  if (!source.github_url) throw new Error('source.github_url is required')
  if (!source.repo) throw new Error('source.repo is required')
  if (!source.ref) throw new Error('source.ref is required')
  if (!build.context_path) throw new Error('build.context_path is required')
  if (!build.dockerfile_path) throw new Error('build.dockerfile_path is required')

  const now = new Date().toISOString()
  const imageName = source.repo.split('/').at(-1).toLowerCase().replace(/[^a-z0-9_.-]+/g, '-')
  const result = {
    outcome: status === 'succeeded' ? 'success' : 'failed',
    registry: 'ghcr',
    builder: 'kaniko',
    build: {
      image_name: imageName,
      started_at: now,
    },
    push: {
      remote_image: imageRef,
    },
    kubernetes: {
      namespace: requireArg(args, 'namespace'),
      job: requireArg(args, 'job'),
      pod: args.pod || null,
    },
    logs: {
      local_file: requireArg(args, 'log-file'),
    },
    finished_at: now,
  }

  if (status === 'succeeded') result.push.pushed_at = now

  if (status === 'failed') {
    const phase = args['error-phase'] || 'unknown'
    if (!ERROR_PHASES.has(phase)) {
      throw new Error(`Invalid error phase: ${phase}`)
    }
    result.error = `${phase}: ${args['error-message'] || 'Build failed; see logs.local_file'}`
  }

  return result
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2))
    const requestFile = requireArg(args, 'request')
    const outFile = requireArg(args, 'out')
    const request = readJson(requestFile)
    const result = buildResult(request, args)

    fs.mkdirSync(path.dirname(outFile), { recursive: true })
    fs.writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } catch (error) {
    usage()
    console.error(`\nError: ${error.message}`)
    process.exit(1)
  }
}

main()
