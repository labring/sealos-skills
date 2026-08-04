#!/usr/bin/env node

import { execFileSync, spawnSync } from 'child_process'
import { ensureGhScopesWithPrompt, run } from './gh-auth-utils.mjs'

function runFile (command, args, opts = {}) {
  return execFileSync(command, args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim()
}

function getKubeEnv () {
  if (Object.prototype.hasOwnProperty.call(process.env, 'SEALAI_DEPLOY_TASK_ID')) {
    return { ...process.env }
  }
  return { ...process.env, KUBECONFIG: process.env.KUBECONFIG || `${process.env.HOME}/.sealos/kubeconfig` }
}

function kubectlArgs (args) {
  if (Object.prototype.hasOwnProperty.call(process.env, 'SEALAI_DEPLOY_TASK_ID')) return args
  return ['--insecure-skip-tls-verify', ...args]
}

function parseImageRegistry (imageRef) {
  const text = String(imageRef || '').trim()
  if (!text) return ''

  const withoutDigest = text.split('@', 1)[0]
  const withoutTag = withoutDigest.includes(':') && withoutDigest.lastIndexOf(':') > withoutDigest.lastIndexOf('/')
    ? withoutDigest.slice(0, withoutDigest.lastIndexOf(':'))
    : withoutDigest
  const first = withoutTag.split('/', 1)[0]
  if (first.includes('.') || first.includes(':') || first === 'localhost') {
    return first
  }
  return 'docker.io'
}

async function ensureGhAuth () {
  return ensureGhScopesWithPrompt(
    ['write:packages'],
    'GHCR image pull secret creation',
  )
}

function ensureKubectl () {
  try {
    run('kubectl version --client=true --output=yaml', { env: getKubeEnv() })
  } catch {
    throw new Error('kubectl is required to create image pull secrets')
  }
}

function createOrUpdateDockerRegistrySecret ({ namespace, secretName, registry, username, password, email }) {
  const auth = Buffer.from(`${username}:${password}`, 'utf8').toString('base64')
  const dockerConfig = JSON.stringify({
    auths: {
      [registry]: { username, password, email, auth },
    },
  })
  const manifest = JSON.stringify({
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: { name: secretName, namespace },
    type: 'kubernetes.io/dockerconfigjson',
    data: {
      '.dockerconfigjson': Buffer.from(dockerConfig, 'utf8').toString('base64'),
    },
  })
  const result = spawnSync(
    'kubectl',
    kubectlArgs(['apply', '-f', '-']),
    { env: getKubeEnv(), encoding: 'utf8', input: manifest },
  )
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr?.trim() || 'kubectl apply failed for image pull Secret')
  }
}

function getDeploymentImagePullSecretNames ({ namespace, deploymentName }) {
  const output = runFile(
    'kubectl',
    kubectlArgs(['get', 'deployment', deploymentName, '-n', namespace, '-o', 'json']),
    { env: getKubeEnv() },
  )
  const deployment = JSON.parse(output)
  return (deployment.spec?.template?.spec?.imagePullSecrets || [])
    .map(secret => secret?.name)
    .filter(Boolean)
}

function ensureDeploymentImagePullSecret ({ namespace, deploymentName, secretName }) {
  if (!deploymentName) {
    return { action: 'skipped', reason: 'no deployment specified' }
  }

  const existingSecretNames = getDeploymentImagePullSecretNames({ namespace, deploymentName })
  if (existingSecretNames.includes(secretName)) {
    return { action: 'already_present', image_pull_secrets: existingSecretNames }
  }

  const mergedSecrets = [...existingSecretNames, secretName].map(name => ({ name }))
  const patch = JSON.stringify({
    spec: {
      template: {
        spec: {
          imagePullSecrets: mergedSecrets,
        },
      },
    },
  })

  runFile(
    'kubectl',
    kubectlArgs(['patch', 'deployment', deploymentName, '-n', namespace, '--type', 'merge', '-p', patch]),
    { env: getKubeEnv() },
  )

  return {
    action: 'patched',
    image_pull_secrets: mergedSecrets.map(secret => secret.name),
  }
}

function parseArgs (argv) {
  const args = argv.slice(2)
  if (args.length < 3) {
    throw new Error('Usage: node ensure-image-pull-secret.mjs <namespace> <secret-name> <image-ref> [deployment-name]')
  }

  return {
    namespace: args[0],
    secretName: args[1],
    imageRef: args[2],
    deploymentName: args[3] || null,
  }
}

try {
  const { namespace, secretName, imageRef, deploymentName } = parseArgs(process.argv)
  const registry = parseImageRegistry(imageRef)

  if (registry !== 'ghcr.io') {
    console.log(JSON.stringify({
      success: true,
      action: 'skipped',
      reason: `registry ${registry || 'unknown'} does not use gh CLI pull-secret automation`,
    }, null, 2))
    process.exit(0)
  }

  const sandbox = Object.prototype.hasOwnProperty.call(process.env, 'SEALAI_DEPLOY_TASK_ID')
  let username
  let password
  if (sandbox) {
    password = process.env.GITHUB_TOKEN
    if (!password) throw new Error('GITHUB_TOKEN is required for sandbox GHCR pull-secret creation')
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${password}`,
        Accept: 'application/vnd.github+json',
      },
    })
    if (!response.ok) throw new Error(`GITHUB_TOKEN identity lookup failed with HTTP ${response.status}`)
    const identity = await response.json()
    username = identity.login
    if (!username) throw new Error('GITHUB_TOKEN identity response did not include login')
  } else {
    const authCheck = await ensureGhAuth()
    if (!authCheck.ok) {
      console.log(JSON.stringify({ success: false, ...authCheck }, null, 2))
      process.exit(1)
    }
    username = run('gh api user -q .login')
    password = run('gh auth token')
  }
  ensureKubectl()
  createOrUpdateDockerRegistrySecret({
    namespace,
    secretName,
    registry,
    username,
    password,
    email: 'none@example.com',
  })
  const deployment = ensureDeploymentImagePullSecret({
    namespace,
    deploymentName,
    secretName,
  })

  console.log(JSON.stringify({
    success: true,
    action: 'created_or_updated',
    namespace,
    secret_name: secretName,
    registry,
    username,
    deployment_name: deploymentName,
    deployment,
  }, null, 2))
} catch (error) {
  const structured = error && typeof error === 'object' && 'error' in error
  console.log(JSON.stringify({
    success: false,
    ...(structured ? error : { error: error.message }),
  }, null, 2))
  process.exit(1)
}
