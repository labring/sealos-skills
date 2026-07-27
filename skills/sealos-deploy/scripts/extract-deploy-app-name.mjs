#!/usr/bin/env node

/**
 * Extract the server-generated application name from the sanitized
 * deploy-template response. Keep this boundary strict because the value is
 * later used as a Kubernetes Secret name and to scope runtime discovery.
 */

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  input += chunk
})

function fail (message) {
  console.error(message)
  process.exitCode = 1
}

function isKubernetesName (value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value)
}

process.stdin.on('end', () => {
  let payload
  try {
    payload = JSON.parse(input)
  } catch {
    fail('Template response was not valid JSON')
    return
  }

  const name = payload?.response?.name ?? payload?.name
  if (!isKubernetesName(name)) {
    fail('Template response did not contain a valid application name')
    return
  }

  process.stdout.write(`${name}\n`)
})
