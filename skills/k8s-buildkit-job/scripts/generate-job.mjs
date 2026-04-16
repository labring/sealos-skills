#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

function usage() {
  console.error([
    'Usage:',
    '  node generate-job.mjs --request <file> --namespace <namespace> --job-name <name> --github-secret <name> --registry-secret <name>',
  ].join('\n'))
}

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

function requireArg(args, key) {
  if (!args[key]) throw new Error(`Missing required argument --${key}`)
  return args[key]
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}

function assertSafeRelativePath(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`)
  }
  if (path.isAbsolute(value)) {
    throw new Error(`${field} must be relative, got ${value}`)
  }
  const normalized = path.posix.normalize(value.replaceAll('\\', '/'))
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`${field} must not escape the repository, got ${value}`)
  }
  return normalized === '.' ? '' : normalized
}

function parseGithubUrl(url) {
  if (typeof url !== 'string') return null

  const ssh = url.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/)
  if (ssh) return { owner: ssh[1], repo: ssh[2] }

  const https = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/)
  if (https) return { owner: https[1], repo: https[2] }

  return null
}

function validateDnsName(value, field, maxLength = 253) {
  if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(value) || value.length > maxLength) {
    throw new Error(`${field} must be a valid DNS label/name up to ${maxLength} characters: ${value}`)
  }
}

function shellSingleQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`
}

function yamlSingleQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function indent(text, spaces) {
  const prefix = ' '.repeat(spaces)
  return text.split('\n').map((line) => (line ? `${prefix}${line}` : line)).join('\n')
}

function renderList(items, spaces) {
  return items.map((item) => `${' '.repeat(spaces)}- ${yamlSingleQuote(item)}`).join('\n')
}

function validateBuildRequest(request) {
  if (request.mode !== 'build-required') {
    throw new Error(`generate-job only supports mode=build-required, got ${request.mode}`)
  }

  const githubUrl = request.source?.github_url
  const ref = request.source?.ref
  const targetImage = request.image?.target_image
  const contextPath = request.build?.context_path
  const dockerfilePath = request.build?.dockerfile_path

  if (!githubUrl) throw new Error('source.github_url is required')
  if (!ref) throw new Error('source.ref is required')
  if (!targetImage) throw new Error('image.target_image is required')
  if (!String(targetImage).startsWith('ghcr.io/')) {
    throw new Error(`Only ghcr.io target images are supported, got ${targetImage}`)
  }

  const parsed = parseGithubUrl(githubUrl)
  if (!parsed) throw new Error(`Only GitHub URLs are supported, got ${githubUrl}`)

  const normalizedContext = assertSafeRelativePath(contextPath, 'build.context_path') || '.'
  const normalizedDockerfile = assertSafeRelativePath(dockerfilePath, 'build.dockerfile_path')
  const dockerfileDir = path.posix.dirname(normalizedDockerfile)
  const dockerfileLocal = dockerfileDir === '.' ? '/workspace' : `/workspace/${dockerfileDir}`
  const contextLocal = normalizedContext === '.' ? '/workspace' : `/workspace/${normalizedContext}`
  const dockerfileFile = `/workspace/${normalizedDockerfile}`

  return {
    githubUrl,
    ref: String(ref),
    targetImage: String(targetImage),
    owner: parsed.owner,
    repo: parsed.repo,
    contextLocal,
    dockerfileLocal,
    dockerfileFile,
    buildArgs: request.build?.build_args || {},
  }
}

function renderJob({ request, namespace, jobName, githubSecret, registrySecret }) {
  const build = validateBuildRequest(request)
  validateDnsName(jobName, 'job-name', 63)
  validateDnsName(githubSecret, 'github-secret')
  validateDnsName(registrySecret, 'registry-secret')

  const cloneScript = [
    'set -eu',
    'git clone "https://x-access-token:${GITHUB_TOKEN}@github.com/' + `${build.owner}/${build.repo}.git" /workspace`,
    'cd /workspace',
    `git checkout ${shellSingleQuote(build.ref)}`,
    `test -f ${shellSingleQuote(build.dockerfileFile)}`,
  ].join('\n')

  const args = [
    'build',
    '--frontend',
    'dockerfile.v0',
    '--local',
    `context=${build.contextLocal}`,
    '--local',
    `dockerfile=${build.dockerfileLocal}`,
  ]

  for (const [key, value] of Object.entries(build.buildArgs)) {
    args.push('--opt', `build-arg:${key}=${String(value)}`)
  }

  args.push('--output', `type=image,name=${build.targetImage},push=true`)

  return `apiVersion: batch/v1
kind: Job
metadata:
  name: ${jobName}
  namespace: ${namespace}
  labels:
    app.kubernetes.io/name: k8s-buildkit-job
    app.kubernetes.io/part-of: seakills
spec:
  backoffLimit: 0
  template:
    metadata:
      labels:
        app.kubernetes.io/name: k8s-buildkit-job
        app.kubernetes.io/part-of: seakills
    spec:
      restartPolicy: Never
      hostUsers: false
      initContainers:
      - name: clone
        image: alpine/git:latest
        env:
        - name: GITHUB_TOKEN
          valueFrom:
            secretKeyRef:
              name: ${githubSecret}
              key: token
        command:
        - sh
        - -c
        - |
${indent(cloneScript, 10)}
        volumeMounts:
        - name: workspace
          mountPath: /workspace
      containers:
      - name: buildkit
        image: moby/buildkit:master
        command:
        - buildctl-daemonless.sh
        args:
${renderList(args, 8)}
        securityContext:
          privileged: true
        volumeMounts:
        - name: workspace
          mountPath: /workspace
          readOnly: true
        - name: docker-config
          mountPath: /root/.docker
          readOnly: true
      volumes:
      - name: workspace
        emptyDir: {}
      - name: docker-config
        secret:
          secretName: ${registrySecret}
          items:
          - key: config.json
            path: config.json
`
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2))
    const requestFile = requireArg(args, 'request')
    const namespace = requireArg(args, 'namespace')
    const jobName = requireArg(args, 'job-name')
    const githubSecret = requireArg(args, 'github-secret')
    const registrySecret = requireArg(args, 'registry-secret')

    const request = readJson(requestFile)
    process.stdout.write(renderJob({ request, namespace, jobName, githubSecret, registrySecret }))
  } catch (error) {
    usage()
    console.error(`\nError: ${error.message}`)
    process.exit(1)
  }
}

main()
