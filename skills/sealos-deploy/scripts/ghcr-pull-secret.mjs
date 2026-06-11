#!/usr/bin/env node

const DEFAULT_SECRET_NAME = '${{ defaults.app_name }}'

export async function resolveGhcrDockerConfig(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('GitHub token is required')
  }

  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'sealos-deploy-ghcr-pull-secret',
    },
  })

  if (!response.ok) {
    throw new Error(`GitHub /user check failed with status ${response.status}`)
  }

  const body = await response.json()
  const login = body.login
  if (!login) {
    throw new Error('GitHub login could not be resolved from /user')
  }

  const dockerAuth = Buffer.from(`${login}:${token}`).toString('base64')
  const dockerConfigJson = JSON.stringify({
    auths: {
      'ghcr.io': { auth: dockerAuth },
    },
  })

  return { login, dockerConfigJson }
}

export function buildPullSecretYaml(secretName, dockerConfigJson) {
  const encoded = Buffer.from(dockerConfigJson, 'utf-8').toString('base64')
  return [
    'apiVersion: v1',
    'kind: Secret',
    'metadata:',
    `  name: ${secretName}`,
    'type: kubernetes.io/dockerconfigjson',
    'data:',
    `  .dockerconfigjson: ${encoded}`,
  ].join('\n')
}

export function splitYamlDocuments(content) {
  const normalized = content.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []
  return normalized.split(/\n---\n/).map((part) => part.trim()).filter(Boolean)
}

export function joinYamlDocuments(documents) {
  return `${documents.join('\n---\n')}\n`
}

export function documentKind(doc) {
  const match = doc.match(/^kind:\s*(\S+)/m)
  return match ? match[1] : null
}

export function documentHasPullSecret(doc, secretName) {
  return documentKind(doc) === 'Secret'
    && doc.includes('kubernetes.io/dockerconfigjson')
    && new RegExp(`^\\s*name:\\s*${escapeRegExp(secretName)}\\s*$`, 'm').test(doc)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function injectImagePullSecrets(doc, secretName = DEFAULT_SECRET_NAME) {
  const kind = documentKind(doc)
  if (kind !== 'Deployment' && kind !== 'StatefulSet') {
    return doc
  }

  if (/^\s+imagePullSecrets:/m.test(doc)) {
    return doc
  }

  const lines = doc.split('\n')
  let inTemplate = false
  let templateSpecLine = -1

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (/^  template:\s*$/.test(line)) {
      inTemplate = true
      continue
    }
    if (inTemplate && /^    spec:\s*$/.test(line)) {
      templateSpecLine = i
      break
    }
    if (inTemplate && /^  \S/.test(line) && !/^    /.test(line)) {
      inTemplate = false
    }
  }

  if (templateSpecLine === -1) {
    throw new Error(`Could not find template.spec in ${kind} document`)
  }

  lines.splice(
    templateSpecLine + 1,
    0,
    '      imagePullSecrets:',
    `        - name: ${secretName}`,
  )

  return lines.join('\n')
}

export function patchTemplatePullSecret(templateContent, dockerConfigJson, secretName = DEFAULT_SECRET_NAME) {
  const documents = splitYamlDocuments(templateContent)
  if (documents.length === 0) {
    throw new Error('Template is empty')
  }

  const hasSecret = documents.some((doc) => documentHasPullSecret(doc, secretName))
  const nextDocuments = hasSecret
    ? [...documents]
    : [buildPullSecretYaml(secretName, dockerConfigJson), ...documents]

  const patched = nextDocuments.map((doc) => injectImagePullSecrets(doc, secretName))
  return joinYamlDocuments(patched)
}

export function pullAuthRequired(buildResult) {
  if (buildResult?.registry?.pull_auth_required === true) {
    return true
  }
  return buildResult?.mode === 'build-required' && buildResult?.status === 'succeeded'
}

export function resolveSecretName(buildResult) {
  return buildResult?.registry?.pull_secret_name || DEFAULT_SECRET_NAME
}

export { DEFAULT_SECRET_NAME }
