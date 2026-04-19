#!/usr/bin/env node

function parseArgs(argv) {
  const args = { requireScope: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]
    if (!key.startsWith('--')) {
      throw new Error(`Unexpected argument: ${key}`)
    }
    const value = argv[i + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${key}`)
    }
    const normalizedKey = key.slice(2)
    if (normalizedKey === 'require-scope') {
      args.requireScope.push(value)
    } else {
      args[normalizedKey] = value
    }
    i += 1
  }
  return args
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2))
    const tokenEnv = args['token-env'] || 'GITHUB_TOKEN'
    const token = process.env[tokenEnv]
    if (!token) {
      throw new Error(`${tokenEnv} is missing`)
    }

    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'seakills-ghcr-preflight',
      },
    })

    if (!response.ok) {
      throw new Error(`GitHub /user check failed with status ${response.status}`)
    }

    const scopes = (response.headers.get('x-oauth-scopes') || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
    const requiredScopes = args.requireScope.length > 0 ? args.requireScope : ['write:packages']
    const missingScopes = requiredScopes.filter((scope) => !scopes.includes(scope))
    const body = await response.json()

    process.stdout.write(`${JSON.stringify({
      ok: missingScopes.length === 0,
      login: body.login || null,
      scopes,
      missing_scopes: missingScopes,
    }, null, 2)}\n`)

    if (missingScopes.length > 0) {
      throw new Error(`missing required GHCR scopes: ${missingScopes.join(', ')}`)
    }
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}

main()
