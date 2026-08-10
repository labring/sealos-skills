#!/usr/bin/env node

import fs from 'fs'
import { fileURLToPath } from 'url'

const MAX_BUILD_DEADLINE_SECONDS = 1800

function usage() {
  console.error(
    'Usage: node resolve-build-deadline.mjs <build-runtime.json> [--now-ms <milliseconds>]',
  )
}

function positiveInteger(value, field) {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > MAX_BUILD_DEADLINE_SECONDS
  ) {
    throw new Error(
      `${field} must be an integer from 1 to ${MAX_BUILD_DEADLINE_SECONDS}`,
    )
  }
  return value
}

export function resolveBuildDeadlineSeconds(runtime, nowMs = Date.now()) {
  const configured = positiveInteger(
    runtime?.buildDeadlineSeconds ?? MAX_BUILD_DEADLINE_SECONDS,
    'buildDeadlineSeconds',
  )
  if (runtime?.buildDeadlineAt == null) {
    return configured
  }
  const deadlineAtMs = Date.parse(runtime.buildDeadlineAt)
  if (!Number.isFinite(deadlineAtMs)) {
    throw new Error('buildDeadlineAt must be a valid ISO timestamp')
  }
  const remaining = Math.ceil((deadlineAtMs - nowMs) / 1000)
  if (remaining <= 0) {
    throw new Error('build deadline has elapsed')
  }
  return Math.min(configured, remaining)
}

function parseNowMs(args) {
  const index = args.indexOf('--now-ms')
  if (index === -1) {
    return Date.now()
  }
  const value = Number(args[index + 1])
  if (!Number.isFinite(value)) {
    throw new Error('--now-ms must be a finite number')
  }
  args.splice(index, 2)
  return value
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    const nowMs = parseNowMs(args)
    if (args.length !== 1) {
      usage()
      process.exit(1)
    }
    const file = args[0]
    const runtime = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, 'utf8'))
      : {}
    process.stdout.write(String(resolveBuildDeadlineSeconds(runtime, nowMs)))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
