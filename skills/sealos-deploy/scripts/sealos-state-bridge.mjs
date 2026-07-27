#!/usr/bin/env node

/**
 * Persist the deploy state for a deployment that was started from a temporary
 * GitHub checkout. The project-local state remains the source used by the
 * pipeline; this bridge only restores or copies the validated state artifact.
 */

import fs from 'node:fs'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { validateArtifactFile } from './artifact-validator.mjs'

function fail (message, extra = {}) {
  console.error(JSON.stringify({ success: false, error: message, ...extra }, null, 2))
  process.exit(1)
}

function printHelp () {
  console.log(`Sealos deployment state bridge

Usage:
  node sealos-state-bridge.mjs restore --work-dir <dir> --github-url <url>
  node sealos-state-bridge.mjs persist --work-dir <dir> --github-url <url>

The bridge stores only a validated .sealos/state.json outside a temporary
GitHub checkout. Set SEALOS_DEPLOY_STATE_ROOT for an isolated test location.
`)
}

function parseArgs (argv) {
  const args = argv.slice(2)
  let command = null
  let workDir = null
  let githubUrl = null

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
    if (arg === '--work-dir' || arg === '--github-url') {
      if (index + 1 >= args.length || args[index + 1].startsWith('--')) {
        fail(`${arg} requires a value`)
      }
      if (arg === '--work-dir') workDir = args[index + 1]
      if (arg === '--github-url') githubUrl = args[index + 1]
      index += 1
      continue
    }
    if (!command && (arg === 'restore' || arg === 'persist')) {
      command = arg
      continue
    }
    fail(`Unexpected argument: ${arg}`)
  }

  if (!command) fail('Command must be restore or persist')
  if (!workDir) fail('--work-dir is required')
  if (!githubUrl) fail('--github-url is required')

  return {
    command,
    workDir: path.resolve(workDir),
    githubUrl,
  }
}

function parseGithubRepository (value) {
  const text = String(value || '').trim()
  let owner
  let repo

  if (text.startsWith('git@github.com:')) {
    ;[owner, repo] = text.slice('git@github.com:'.length).split('/')
  } else {
    let url
    try {
      url = new URL(text)
    } catch (error) {
      throw new Error(`Invalid GitHub URL: ${error.message}`)
    }
    if (!['github.com', 'www.github.com'].includes(url.hostname.toLowerCase())) {
      throw new Error('State bridge only accepts github.com repositories')
    }
    ;[owner, repo] = url.pathname.split('/').filter(Boolean)
  }

  repo = String(repo || '').replace(/\.git$/, '')
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(owner || '')
    || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repo)
  ) {
    throw new Error('GitHub URL must identify exactly one owner and repository')
  }

  return {
    owner: owner.toLowerCase(),
    repo: repo.toLowerCase(),
  }
}

function statePaths ({ workDir, githubUrl }) {
  const repository = parseGithubRepository(githubUrl)
  const root = process.env.SEALOS_DEPLOY_STATE_ROOT?.trim()
    || path.join(os.homedir(), '.sealos', 'deployments')
  const persistentDir = path.join(root, 'github.com', repository.owner, repository.repo)
  return {
    repository,
    localPath: path.join(workDir, '.sealos', 'state.json'),
    persistentPath: path.join(persistentDir, 'state.json'),
  }
}

function assertRegularFile (filePath, label) {
  let stats
  try {
    stats = fs.lstatSync(filePath)
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`${label} not found`)
    throw error
  }
  if (!stats.isFile()) throw new Error(`${label} must be a regular file`)
}

function validateState (filePath, label) {
  assertRegularFile(filePath, label)
  const result = validateArtifactFile('state', filePath)
  if (!result.valid) {
    const details = result.errors
      .slice(0, 3)
      .map(error => `${error.path}: ${error.message}`)
      .join('; ')
    throw new Error(`${label} failed state validation${details ? ` (${details})` : ''}`)
  }
}

function copyAtomically (sourcePath, targetPath) {
  const targetDir = path.dirname(targetPath)
  fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 })

  if (fs.existsSync(targetPath) && fs.lstatSync(targetPath).isSymbolicLink()) {
    throw new Error('Persistent state path must not be a symbolic link')
  }

  const temporaryPath = path.join(
    targetDir,
    `.state-${process.pid}-${crypto.randomBytes(8).toString('hex')}.tmp`,
  )
  try {
    fs.copyFileSync(sourcePath, temporaryPath)
    fs.chmodSync(temporaryPath, 0o600)
    fs.renameSync(temporaryPath, targetPath)
  } finally {
    try {
      fs.unlinkSync(temporaryPath)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
}

function restoreState ({ localPath, persistentPath }) {
  if (fs.existsSync(localPath)) {
    validateState(localPath, 'Project state')
    return { action: 'already_present', source: localPath }
  }
  if (!fs.existsSync(persistentPath)) {
    return { action: 'not_found', source: null }
  }

  validateState(persistentPath, 'Persistent state')
  fs.mkdirSync(path.dirname(localPath), { recursive: true, mode: 0o700 })
  copyAtomically(persistentPath, localPath)
  validateState(localPath, 'Restored project state')
  return { action: 'restored', source: persistentPath }
}

function persistState ({ localPath, persistentPath }) {
  validateState(localPath, 'Project state')
  copyAtomically(localPath, persistentPath)
  validateState(persistentPath, 'Persistent state')
  return { action: 'persisted', source: localPath }
}

try {
  const input = parseArgs(process.argv)
  const paths = statePaths(input)
  const result = input.command === 'restore'
    ? restoreState(paths)
    : persistState(paths)

  console.log(JSON.stringify({
    success: true,
    ...result,
    repository: `${paths.repository.owner}/${paths.repository.repo}`,
    persistent_path: paths.persistentPath,
  }, null, 2))
} catch (error) {
  fail(error.message)
}
