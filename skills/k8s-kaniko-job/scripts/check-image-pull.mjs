#!/usr/bin/env node

import path from 'path'
import { pathToFileURL } from 'url'
import {
  assertDigest,
  imageRepository,
} from './build-contract.mjs'

const ACCEPT = [
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
].join(', ')

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error('Usage: node check-image-pull.mjs --image <ghcr-tag> --digest <sha256:digest>')
    }
    args[key.slice(2)] = value
    index += 1
  }
  return args
}

function parseGhcrImage(value) {
  const repository = imageRepository(value)
  const match = repository.match(/^ghcr\.io\/([^/]+)\/(.+)$/)
  if (!match) {
    throw new Error(`image must be hosted on ghcr.io, got ${value}`)
  }
  return {
    namespace: match[1],
    packageName: match[2],
    repository,
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export async function checkAnonymousPull({
  image,
  digest,
  fetchImpl = globalThis.fetch,
  sleepImpl = sleep,
  attempts = 5,
}) {
  const parsed = parseGhcrImage(image)
  const normalizedDigest = assertDigest(digest)
  const scope = `repository:${parsed.namespace}/${parsed.packageName}:pull`
  const tokenUrl = `https://ghcr.io/token?scope=${encodeURIComponent(scope)}`
  const manifestUrl = `https://ghcr.io/v2/${parsed.namespace}/${parsed.packageName}/manifests/${normalizedDigest}`
  let lastStatus = null
  let lastError = null

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const tokenResponse = await fetchImpl(tokenUrl)
      lastStatus = tokenResponse.status
      if (tokenResponse.status === 401 || tokenResponse.status === 403) {
        return {
          ok: true,
          pull_access: 'ghcr_secret_required',
          image_ref: `${parsed.repository}@${normalizedDigest}`,
          status: tokenResponse.status,
        }
      }
      if (tokenResponse.ok) {
        const tokenPayload = await tokenResponse.json()
        if (!tokenPayload.token) {
          lastError = 'GHCR anonymous token response did not include a token'
        } else {
          const manifestResponse = await fetchImpl(manifestUrl, {
            headers: {
              Authorization: `Bearer ${tokenPayload.token}`,
              Accept: ACCEPT,
            },
          })
          lastStatus = manifestResponse.status
          if (manifestResponse.ok) {
            return {
              ok: true,
              pull_access: 'anonymous',
              image_ref: `${parsed.repository}@${normalizedDigest}`,
              status: manifestResponse.status,
            }
          }
          if (manifestResponse.status === 401 || manifestResponse.status === 403) {
            return {
              ok: true,
              pull_access: 'ghcr_secret_required',
              image_ref: `${parsed.repository}@${normalizedDigest}`,
              status: manifestResponse.status,
            }
          }
        }
      }
    } catch (error) {
      lastError = error.message
    }

    if (attempt < attempts - 1) {
      await sleepImpl(2000)
    }
  }

  return {
    ok: true,
    pull_access: 'indeterminate',
    image_ref: `${parsed.repository}@${normalizedDigest}`,
    status: lastStatus,
    error: lastError,
  }
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2))
    const result = await checkAnonymousPull({
      image: args.image,
      digest: args.digest,
    })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMain) main()
