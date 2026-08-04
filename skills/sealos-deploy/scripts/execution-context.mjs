#!/usr/bin/env node

import { spawnSync } from 'child_process'
import { pathToFileURL } from 'url'

export function isSandboxEnvironment(env = process.env) {
  return Object.prototype.hasOwnProperty.call(env, 'SEALAI_DEPLOY_TASK_ID')
}

export function deriveRegionFromApiServer(server) {
  let url
  try {
    url = new URL(String(server || '').trim())
  } catch {
    throw new Error('kubeconfig current cluster is missing a valid API server URL')
  }

  if (!url.hostname) {
    throw new Error('kubeconfig API server URL does not contain a hostname')
  }

  return {
    api_server: url.toString().replace(/\/$/, ''),
    region: `${url.protocol}//${url.hostname}`,
    region_domain: url.hostname,
    template_api_url: `https://template.${url.hostname}/api/v2alpha/templates/raw`,
  }
}

export function parseMinifiedKubeconfig(data) {
  const context = data?.contexts?.[0]?.context || {}
  const server = data?.clusters?.[0]?.cluster?.server
  if (!context.namespace) {
    throw new Error('kubeconfig current context does not contain a namespace')
  }

  return {
    namespace: context.namespace,
    ...deriveRegionFromApiServer(server),
  }
}

function parseArgs(argv) {
  const args = { environmentOnly: false, kubeconfig: null, kubectl: 'kubectl' }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--environment-only') {
      args.environmentOnly = true
      continue
    }
    if (arg === '--kubeconfig' || arg === '--kubectl') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`)
      args[arg.slice(2)] = value
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

function readCurrentKubeconfig({ kubectl, kubeconfig }) {
  const env = { ...process.env }
  if (kubeconfig) env.KUBECONFIG = kubeconfig
  const result = spawnSync(
    kubectl,
    ['config', 'view', '--minify', '--raw', '-o', 'json'],
    { encoding: 'utf8', env },
  )

  if (result.error || result.status !== 0) {
    const detail = result.error?.message || result.stderr?.trim() || 'kubectl config view failed'
    throw new Error(`unable to read the active kubeconfig: ${detail}`)
  }

  try {
    return JSON.parse(result.stdout)
  } catch (error) {
    throw new Error(`kubectl returned invalid kubeconfig JSON: ${error.message}`)
  }
}

export function resolveExecutionEnvironment(env = process.env) {
  const sandbox = isSandboxEnvironment(env)
  return {
    execution_environment: sandbox ? 'sandbox' : 'local',
    sandbox,
    non_interactive: sandbox,
    builder: sandbox ? 'kaniko' : 'buildx',
    sealai_deploy_task_id_present: sandbox,
  }
}

export function main(argv = process.argv.slice(2)) {
  try {
    const args = parseArgs(argv)
    const execution = resolveExecutionEnvironment()
    if (args.environmentOnly) {
      process.stdout.write(`${JSON.stringify(execution, null, 2)}\n`)
      return
    }

    const cluster = parseMinifiedKubeconfig(readCurrentKubeconfig(args))
    process.stdout.write(`${JSON.stringify({
      ...execution,
      ...cluster,
      kubeconfig_path: args.kubeconfig || process.env.KUBECONFIG || null,
    }, null, 2)}\n`)
  } catch (error) {
    console.error(JSON.stringify({ error: error.message }, null, 2))
    process.exitCode = 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
