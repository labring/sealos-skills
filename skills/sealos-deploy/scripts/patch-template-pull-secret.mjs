#!/usr/bin/env node

import fs from 'fs'

import {
  patchTemplatePullSecret,
  pullAuthRequired,
  resolveGhcrDockerConfig,
  resolveSecretName,
} from './ghcr-pull-secret.mjs'

function usage() {
  console.error([
    'Usage:',
    '  node patch-template-pull-secret.mjs --template <index.yaml> --build-result <build-result.json> [options]',
    '',
    'Options:',
    '  --token-env <name>   Environment variable containing GitHub token (default: GITHUB_TOKEN)',
  ].join('\n'))
}

function parseArgs(argv) {
  const args = { tokenEnv: 'GITHUB_TOKEN' }
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]
    if (!key.startsWith('--')) {
      throw new Error(`Unexpected argument: ${key}`)
    }
    const value = argv[i + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${key}`)
    }
    if (key === '--template') args.template = value
    else if (key === '--build-result') args.buildResult = value
    else if (key === '--token-env') args.tokenEnv = value
    else throw new Error(`Unknown argument: ${key}`)
    i += 1
  }
  return args
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2))
    if (!args.template) throw new Error('Missing required argument --template')
    if (!args.buildResult) throw new Error('Missing required argument --build-result')

    const buildResult = JSON.parse(fs.readFileSync(args.buildResult, 'utf-8'))
    if (!pullAuthRequired(buildResult)) {
      process.stdout.write(JSON.stringify({
        ok: true,
        skipped: true,
        reason: 'pull_auth_not_required',
      }, null, 2))
      process.stdout.write('\n')
      return
    }

    const token = process.env[args.tokenEnv]
    if (!token) {
      throw new Error(`${args.tokenEnv} is missing; required to inline GHCR pull credentials for POC`)
    }

    const secretName = resolveSecretName(buildResult)
    const { login, dockerConfigJson } = await resolveGhcrDockerConfig(token)
    const templateContent = fs.readFileSync(args.template, 'utf-8')
    const patched = patchTemplatePullSecret(templateContent, dockerConfigJson, secretName)

    fs.writeFileSync(args.template, patched)
    process.stdout.write(`${JSON.stringify({
      ok: true,
      skipped: false,
      template: args.template,
      secret_name: secretName,
      github_login: login,
      warning: 'POC: index.yaml now contains inline registry credentials; do not commit this file',
    }, null, 2)}\n`)
  } catch (error) {
    usage()
    console.error(`\nError: ${error.message}`)
    process.exit(1)
  }
}

main()
