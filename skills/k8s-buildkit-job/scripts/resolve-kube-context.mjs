#!/usr/bin/env node

import fs from 'fs'
import { spawnSync } from 'child_process'

const SERVICE_ACCOUNT_DIR = '/var/run/secrets/kubernetes.io/serviceaccount'
const NAMESPACE_FILE = `${SERVICE_ACCOUNT_DIR}/namespace`
const TOKEN_FILE = `${SERVICE_ACCOUNT_DIR}/token`

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

function runKubectl(args) {
  const result = spawnSync('kubectl', args, { encoding: 'utf8' })
  if (result.error || result.status !== 0) {
    return null
  }
  return result.stdout.trim()
}

function readFile(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim()
  } catch {
    return null
  }
}

function decodeJwtPayload(token) {
  if (!token || !token.includes('.')) return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const payload = parts[1]
    const normalized = payload.replaceAll('-', '+').replaceAll('_', '/')
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

function resolveNamespace(explicitNamespace) {
  if (explicitNamespace) {
    return { value: explicitNamespace, source: 'arg' }
  }

  if (process.env.NAMESPACE) {
    return { value: process.env.NAMESPACE, source: 'env' }
  }

  const minified = runKubectl(['config', 'view', '--minify', '-o', 'json'])
  if (minified) {
    try {
      const parsed = JSON.parse(minified)
      const namespace = parsed.contexts?.[0]?.context?.namespace
      if (namespace) {
        return { value: namespace, source: 'kubectl-context' }
      }
    } catch {
      // ignore and continue with other namespace sources
    }
  }

  const fileNamespace = readFile(NAMESPACE_FILE)
  if (fileNamespace) {
    return { value: fileNamespace, source: 'serviceaccount-file' }
  }

  return { value: null, source: 'unresolved' }
}

function resolveServiceAccount(namespace, podName) {
  if (process.env.SERVICE_ACCOUNT_NAME) {
    return { value: process.env.SERVICE_ACCOUNT_NAME, source: 'env' }
  }

  const payload = decodeJwtPayload(readFile(TOKEN_FILE))
  const tokenServiceAccount =
    payload?.kubernetes?.serviceaccount?.name ||
    payload?.['kubernetes.io/serviceaccount/service-account.name'] ||
    (typeof payload?.sub === 'string' && payload.sub.startsWith('system:serviceaccount:')
      ? payload.sub.split(':').slice(-1)[0]
      : null)

  if (tokenServiceAccount) {
    return { value: tokenServiceAccount, source: 'serviceaccount-token' }
  }

  if (namespace && podName) {
    const podServiceAccount = runKubectl([
      'get',
      'pod',
      podName,
      '-n',
      namespace,
      '-o',
      'jsonpath={.spec.serviceAccountName}',
    ])
    if (podServiceAccount) {
      return { value: podServiceAccount, source: 'pod-spec' }
    }
  }

  return { value: null, source: 'unresolved' }
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2))
    const namespace = resolveNamespace(args.namespace)
    const podName = args['pod-name'] || process.env.HOSTNAME || null
    const serviceAccount = resolveServiceAccount(namespace.value, podName)
    const currentContext = runKubectl(['config', 'current-context'])
    const kubectlVersion = runKubectl(['version', '--client', '-o', 'json'])

    process.stdout.write(`${JSON.stringify({
      namespace: namespace.value,
      namespace_source: namespace.source,
      service_account_name: serviceAccount.value,
      service_account_source: serviceAccount.source,
      pod_name: podName,
      kubeconfig: process.env.KUBECONFIG || null,
      current_context: currentContext || null,
      kubectl_available: Boolean(kubectlVersion),
    }, null, 2)}\n`)
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}

main()
