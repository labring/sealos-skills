#!/usr/bin/env node

/**
 * Resolve the five target-identity values Phase 5/6 need:
 * context, namespace, service account, app cloud domain, cert secret name.
 *
 * The app/ingress domain is NOT always the console region domain from
 * ~/.sealos/auth.json (usw-1 console is usw-1.sealos.io while apps live on
 * usw-1.sealos.app). Resolution order:
 *   1. Host suffix shared by existing Ingresses in the target namespace.
 *   2. `app_domains` map in the skill config.json (console URL -> app domain).
 *   3. Console region domain, flagged with a warning (server dry-run will
 *      reject the Ingress host if it is wrong).
 *
 * Prints JSON. Never prints credentials.
 */

import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function kubectl(args) {
  const kubeconfig = path.join(os.homedir(), '.sealos', 'kubeconfig')
  return execFileSync(
    'kubectl',
    ['--insecure-skip-tls-verify', ...args],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, KUBECONFIG: kubeconfig },
    },
  ).trim()
}

function tryKubectl(args) {
  try {
    return kubectl(args)
  } catch {
    return ''
  }
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function mostCommon(values) {
  const counts = new Map()
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  let best = ''
  let bestCount = 0
  for (const [value, count] of counts.entries()) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

function main() {
  const warnings = []
  const sources = {}

  const context = tryKubectl(['config', 'current-context'])
  if (!context) {
    process.stderr.write('ERROR: cannot read current kube context from ~/.sealos/kubeconfig\n')
    process.exit(1)
  }

  const namespace = tryKubectl([
    'config', 'view', '--minify', '-o', 'jsonpath={.contexts[0].context.namespace}',
  ])
  if (!namespace) {
    process.stderr.write('ERROR: kubeconfig context has no namespace\n')
    process.exit(1)
  }

  let serviceAccount = 'default'
  const whoami = tryKubectl(['auth', 'whoami', '-o', 'jsonpath={.status.userInfo.username}'])
  if (whoami.startsWith('system:serviceaccount:')) {
    serviceAccount = whoami.split(':').pop()
  }

  // Console region domain from auth.json (fallback only).
  const auth = readJsonSafe(path.join(os.homedir(), '.sealos', 'auth.json'))
  const consoleDomain = typeof auth?.region === 'string'
    ? auth.region.replace(/^https?:\/\//, '').replace(/\/+$/, '')
    : ''

  // 1. Existing ingress host suffixes in this namespace.
  let cloudDomain = ''
  let certSecretName = ''
  const ingressJson = tryKubectl(['get', 'ingress', '-n', namespace, '-o', 'json'])
  if (ingressJson) {
    try {
      const parsed = JSON.parse(ingressJson)
      const suffixes = []
      const certNames = []
      for (const item of parsed.items ?? []) {
        for (const rule of item?.spec?.rules ?? []) {
          const host = rule?.host
          if (typeof host === 'string' && host.includes('.')) {
            suffixes.push(host.split('.').slice(1).join('.'))
          }
        }
        for (const tls of item?.spec?.tls ?? []) {
          if (typeof tls?.secretName === 'string' && tls.secretName) {
            certNames.push(tls.secretName)
          }
        }
      }
      if (suffixes.length > 0) {
        cloudDomain = mostCommon(suffixes)
        sources.cloud_domain = 'namespace-ingress-hosts'
      }
      if (certNames.length > 0) {
        certSecretName = mostCommon(certNames)
        sources.cert_secret_name = 'namespace-ingress-tls'
      }
    } catch {
      /* fall through to other sources */
    }
  }

  // 2. Skill config app_domains map.
  if (!cloudDomain && typeof auth?.region === 'string') {
    const config = readJsonSafe(path.join(__dirname, '..', 'config.json'))
    const mapped = config?.app_domains?.[auth.region]
    if (typeof mapped === 'string' && mapped) {
      cloudDomain = mapped.replace(/^https?:\/\//, '').replace(/\/+$/, '')
      sources.cloud_domain = 'config-app-domains'
    }
  }

  // 3. Console domain fallback (may be wrong on split-domain regions).
  if (!cloudDomain && consoleDomain) {
    cloudDomain = consoleDomain
    sources.cloud_domain = 'console-region-fallback'
    warnings.push(
      'cloud_domain fell back to the console region domain; on split-domain regions the app domain differs (server dry-run will reject the Ingress host if so)',
    )
  }

  if (!certSecretName) {
    certSecretName = 'wildcard-cert'
    sources.cert_secret_name = 'platform-default'
    warnings.push('cert_secret_name defaulted to wildcard-cert (no Ingress found in the namespace to confirm)')
  }

  if (!cloudDomain) {
    process.stderr.write('ERROR: cannot resolve the app cloud domain from ingress hosts, config app_domains, or auth.json\n')
    process.exit(1)
  }

  process.stdout.write(`${JSON.stringify({
    context,
    namespace,
    service_account: serviceAccount,
    cloud_domain: cloudDomain,
    cert_secret_name: certSecretName,
    console_domain: consoleDomain || null,
    sources,
    warnings,
  }, null, 2)}\n`)
}

main()
