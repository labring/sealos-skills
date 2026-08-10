#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'

function usage() {
  console.error([
    'Usage:',
    '  node prepare-context.mjs --request <file> --context-root <posix-dir> --bucket <bucket> [--prefix <s3-prefix>] --devbox <name> --build-id <id> --out <file>',
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

function normalizeRelativePath(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`)
  }
  if (path.isAbsolute(value)) {
    throw new Error(`${field} must be relative, got ${value}`)
  }
  const normalized = path.posix.normalize(value.replaceAll('\\', '/'))
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`${field} must not escape the repository, got ${value}`)
  }
  return normalized
}

function normalizeAbsolutePath(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`)
  }
  const normalized = path.resolve(value)
  if (!path.isAbsolute(normalized)) {
    throw new Error(`${field} must be absolute, got ${value}`)
  }
  if (normalized.includes('\n') || normalized.includes('\r')) {
    throw new Error(`${field} must not contain line breaks`)
  }
  return normalized
}

function normalizeObjectPath(value, field) {
  const normalized = normalizeRelativePath(value, field)
  if (normalized === '.' || normalized.split('/').includes('.')) {
    throw new Error(`${field} must not contain dot path segments: ${value}`)
  }
  if (!/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(normalized)) {
    throw new Error(`${field} contains unsupported characters: ${value}`)
  }
  return normalized
}

function normalizeBucketName(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('bucket must be a non-empty string')
  }
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(value) || value.length < 3 || value.length > 63) {
    throw new Error(`bucket must be a DNS-compatible S3 bucket name: ${value}`)
  }
  return value
}

function toPosixPath(value) {
  return value.split(path.sep).join('/')
}

function assertBuildRequest(request) {
  if (request.mode !== 'build-required') {
    throw new Error(`prepare-context only supports mode=build-required, got ${request.mode}`)
  }
  if (request.source?.type !== 'sandbox-context') {
    throw new Error(`Only source.type=sandbox-context is supported, got ${request.source?.type}`)
  }
  if (!request.image?.target_image) {
    throw new Error('image.target_image is required')
  }
  if (!String(request.image.target_image).startsWith('ghcr.io/')) {
    throw new Error(`Only ghcr.io target images are supported, got ${request.image.target_image}`)
  }

  const workDir = normalizeAbsolutePath(request.source?.work_dir, 'source.work_dir')
  const contextPath = normalizeRelativePath(request.build?.context_path, 'build.context_path')
  const dockerfilePath = normalizeRelativePath(request.build?.dockerfile_path, 'build.dockerfile_path')
  const contextDir = path.resolve(workDir, contextPath)
  const dockerfileFile = path.resolve(workDir, dockerfilePath)

  if (!fs.existsSync(contextDir) || !fs.statSync(contextDir).isDirectory()) {
    throw new Error(`build.context_path does not exist or is not a directory: ${contextDir}`)
  }
  if (!fs.existsSync(dockerfileFile) || !fs.statSync(dockerfileFile).isFile()) {
    throw new Error(`build.dockerfile_path does not exist or is not a file: ${dockerfileFile}`)
  }

  const dockerfileInsideContext = path.relative(contextDir, dockerfileFile)
  if (
    dockerfileInsideContext === '' ||
    dockerfileInsideContext.startsWith('..') ||
    path.isAbsolute(dockerfileInsideContext)
  ) {
    throw new Error('build.dockerfile_path must be inside build.context_path for kaniko S3 contexts')
  }

  return {
    workDir,
    contextPath,
    dockerfilePath,
    contextDir,
    dockerfileInsideContext: toPosixPath(dockerfileInsideContext),
  }
}

function toTarExcludePath(relativePath) {
  const normalized = toPosixPath(relativePath)
  if (!normalized || normalized === '.') return null
  return normalized.startsWith('./') ? normalized : `./${normalized}`
}

function buildRuntimeExcludes({ contextDir, contextRoot }) {
  const excludes = [
    './.git',
    './.git/*',
    './.sealos',
    './.sealos/*',
    './.versitygw-s3',
    './.versitygw-s3/*',
    './.versitygw-iam',
    './.versitygw-iam/*',
    './.versitygw-versioning',
    './.versitygw-versioning/*',
  ]

  const relativeContextRoot = path.relative(contextDir, contextRoot)
  if (
    relativeContextRoot &&
    !relativeContextRoot.startsWith('..') &&
    !path.isAbsolute(relativeContextRoot)
  ) {
    const tarPath = toTarExcludePath(relativeContextRoot)
    if (tarPath) {
      excludes.push(tarPath, `${tarPath}/*`)
    }
  }

  return [...new Set(excludes)]
}

function createContextTar({ contextDir, contextRoot, targetFile }) {
  fs.mkdirSync(path.dirname(targetFile), { recursive: true })
  const targetDir = path.dirname(targetFile)
  const tmpDir = fs.mkdtempSync(path.join(targetDir, '.tmp-'))
  const tmpFile = path.join(tmpDir, 'context.tar.gz')
  const excludeArgs = buildRuntimeExcludes({ contextDir, contextRoot })
    .flatMap((entry) => ['--exclude', entry])

  const result = spawnSync('tar', [
    ...excludeArgs,
    '-C',
    contextDir,
    '-czf',
    tmpFile,
    '.',
  ], { encoding: 'utf8' })

  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`tar failed: ${result.stderr || result.stdout}`)
  }

  fs.renameSync(tmpFile, targetFile)
  fs.rmSync(tmpDir, { recursive: true, force: true })
}

function buildMetadata({ args, request }) {
  const build = assertBuildRequest(request)
  const contextRoot = normalizeAbsolutePath(requireArg(args, 'context-root'), 'context-root')
  const bucket = normalizeBucketName(requireArg(args, 'bucket'))
  const prefix = args.prefix ? normalizeObjectPath(args.prefix, 'prefix') : ''
  const devbox = normalizeObjectPath(requireArg(args, 'devbox'), 'devbox')
  const buildId = normalizeObjectPath(requireArg(args, 'build-id'), 'build-id')
  const objectKey = [prefix, devbox, buildId, 'context.tar.gz'].filter(Boolean).join('/')
  const tarPath = path.join(contextRoot, devbox, buildId, 'context.tar.gz')

  createContextTar({
    contextDir: build.contextDir,
    contextRoot,
    targetFile: tarPath,
  })

  return {
    version: '1.0',
    generated_at: new Date().toISOString(),
    source: {
      work_dir: build.workDir,
      context_path: build.contextPath,
      dockerfile_path: build.dockerfilePath,
    },
    context: {
      bucket,
      prefix: prefix || null,
      object_key: objectKey,
      uri: `s3://${bucket}/${objectKey}`,
      tar_path: tarPath,
    },
    kaniko: {
      dockerfile: build.dockerfileInsideContext,
      context_sub_path: null,
    },
  }
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2))
    const requestFile = requireArg(args, 'request')
    const outFile = requireArg(args, 'out')
    const request = readJson(requestFile)
    const metadata = buildMetadata({ args, request })

    fs.mkdirSync(path.dirname(outFile), { recursive: true })
    fs.writeFileSync(outFile, `${JSON.stringify(metadata, null, 2)}\n`)
    process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`)
  } catch (error) {
    usage()
    console.error(`\nError: ${error.message}`)
    process.exit(1)
  }
}

main()
