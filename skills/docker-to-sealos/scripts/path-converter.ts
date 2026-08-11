#!/usr/bin/env node
/**
 * Sealos Path to vn- Name Converter
 *
 * Converts file paths to Sealos vn- naming for ConfigMap data keys,
 * volume names, and VolumeClaimTemplates metadata names.
 *
 * Rules:
 * - Convert to lowercase
 * - Replace every non [a-z0-9] character sequence with 'vn-'
 * - Prefix the final name with 'vn-'
 * - Reject empty or non-alphanumeric-only paths
 * - Truncate names longer than 63 chars with a stable hash suffix
 */

import { createHash } from 'node:crypto'

const MAX_K8S_NAME_LEN = 63

function normalizePathToSuffix(path: string): string {
  if (path == null) {
    throw new Error('Path cannot be None')
  }

  const raw = path.trim()
  if (!raw) {
    throw new Error('Path cannot be empty')
  }

  if (/^\/+$/.test(raw)) {
    return 'root'
  }

  const normalized = raw.replace(/^\/+|\/+$/g, '').toLowerCase()
  const segments = normalized.split(/[^a-z0-9]+/).filter(Boolean)
  if (segments.length === 0) {
    throw new Error('Path must contain at least one alphanumeric character')
  }

  return segments.join('vn-')
}

function truncateWithHash(name: string, original: string): string {
  if (name.length <= MAX_K8S_NAME_LEN) {
    return name
  }

  const digest = createHash('sha1').update(original, 'utf8').digest('hex').slice(0, 8)
  const keepLen = MAX_K8S_NAME_LEN - digest.length - 1
  let prefix = name.slice(0, keepLen).replace(/-+$/, '')
  if (!prefix) {
    prefix = 'vn'
  }

  return `${prefix}-${digest}`
}

/** Convert a file path to Sealos vn- naming convention. */
export function pathToVnName(path: string): string {
  const suffix = normalizePathToSuffix(path)
  const vnName = `vn-${suffix}`
  return truncateWithHash(vnName, path)
}

/**
 * Convert a vn- name back to a file path (best effort).
 * Ambiguous: original separators may have been '/', '-', or '.'.
 */
export function vnNameToPath(vnName: string): string {
  let name = vnName
  if (name.startsWith('vn-')) {
    name = name.slice(3)
  }

  let path = name.replaceAll('vn-', '/')
  if (!path.startsWith('/')) {
    path = `/${path}`
  }
  return path
}

export function runSelfTest(): number {
  const cases: Array<[string, string]> = [
    ['/etc/nginx/nginx.conf', 'vn-etcvn-nginxvn-nginxvn-conf'],
    ['/var/lib/My_App', 'vn-varvn-libvn-myvn-app'],
    ['/data/cache@prod', 'vn-datavn-cachevn-prod'],
    ['/', 'vn-root'],
  ]

  for (const [raw, expected] of cases) {
    const actual = pathToVnName(raw)
    if (actual !== expected) {
      console.log(`FAIL: ${raw} -> ${actual}, expected ${expected}`)
      return 1
    }
  }

  for (const raw of ['', '____']) {
    try {
      pathToVnName(raw)
      console.log(`FAIL: expected Error for input: ${JSON.stringify(raw)}`)
      return 1
    } catch {
      // expected
    }
  }

  console.log('Self-test passed.')
  return 0
}

function main(argv: string[]): number {
  if (argv.length < 1) {
    console.log('Usage:')
    console.log('  Convert path to vn-name:')
    console.log('    node --experimental-strip-types path-converter.ts /etc/nginx/conf.d/default.conf')
    console.log()
    console.log('  Run self-test:')
    console.log('    node --experimental-strip-types path-converter.ts --self-test')
    console.log()
    console.log('  Convert vn-name to path:')
    console.log(
      '    node --experimental-strip-types path-converter.ts --reverse vn-etcvn-nginxvn-confvn-dvn-defaultvn-conf',
    )
    return 1
  }

  try {
    if (argv[0] === '--self-test') {
      return runSelfTest()
    }
    if (argv[0] === '--reverse') {
      if (argv.length < 2) {
        console.log('Error: Please provide a vn-name to convert')
        return 1
      }
      const vnName = argv[1]
      const result = vnNameToPath(vnName)
      console.log(`vn-name: ${vnName}`)
      console.log(`Path:    ${result}`)
      return 0
    }

    const path = argv[0]
    const result = pathToVnName(path)
    console.log(`Path:    ${path}`)
    console.log(`vn-name: ${result}`)
    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`Error: ${message}`)
    return 1
  }
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('path-converter.ts') || process.argv[1].endsWith('path-converter.js'))

if (isDirectRun) {
  process.exit(main(process.argv.slice(2)))
}
