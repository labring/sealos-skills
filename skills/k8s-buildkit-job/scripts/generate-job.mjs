#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

function usage() {
  console.error([
    'Usage:',
    '  node generate-job.mjs --request <file> --namespace <namespace> --job-name <name> --service-name <name> --registry-secret <name> [--service-account <name>]',
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
  return normalized
}

function assertSafeAbsolutePath(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`)
  }
  const normalized = path.posix.normalize(value.replaceAll('\\', '/'))
  if (!normalized.startsWith('/')) {
    throw new Error(`${field} must be an absolute sandbox path, got ${value}`)
  }
  if (normalized.includes('\n') || normalized.includes('\r')) {
    throw new Error(`${field} must not contain line breaks`)
  }
  return normalized
}

function validateDnsName(value, field, maxLength = 253) {
  if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(value) || value.length > maxLength) {
    throw new Error(`${field} must be a valid DNS label/name up to ${maxLength} characters: ${value}`)
  }
}

function yamlSingleQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function validateBuildRequest(request) {
  if (request.mode !== 'build-required') {
    throw new Error(`generate-job only supports mode=build-required, got ${request.mode}`)
  }

  const sourceType = request.source?.type
  const workDir = request.source?.work_dir
  const targetImage = request.image?.target_image
  const contextPath = request.build?.context_path
  const dockerfilePath = request.build?.dockerfile_path

  if (sourceType !== 'sandbox-context') {
    throw new Error(`Only source.type=sandbox-context is supported, got ${sourceType}`)
  }
  if (!targetImage) throw new Error('image.target_image is required')
  if (!String(targetImage).startsWith('ghcr.io/')) {
    throw new Error(`Only ghcr.io target images are supported, got ${targetImage}`)
  }

  const normalizedWorkDir = assertSafeAbsolutePath(workDir, 'source.work_dir')
  const normalizedContext = assertSafeRelativePath(contextPath, 'build.context_path')
  const normalizedDockerfile = assertSafeRelativePath(dockerfilePath, 'build.dockerfile_path')
  const dockerfileDir = path.posix.dirname(normalizedDockerfile)
  const contextLocal = normalizedContext === '.' ? normalizedWorkDir : path.posix.join(normalizedWorkDir, normalizedContext)
  const dockerfileLocal = dockerfileDir === '.' ? normalizedWorkDir : path.posix.join(normalizedWorkDir, dockerfileDir)
  const dockerfileFile = path.posix.join(normalizedWorkDir, normalizedDockerfile)

  return {
    targetImage: String(targetImage),
    contextLocal,
    dockerfileLocal,
    dockerfileFile,
    buildArgs: request.build?.build_args || {},
  }
}

function renderManifest({ request, namespace, jobName, serviceName, registrySecret, serviceAccount }) {
  const build = validateBuildRequest(request)
  validateDnsName(namespace, 'namespace')
  validateDnsName(jobName, 'job-name', 63)
  validateDnsName(serviceName, 'service-name', 63)
  validateDnsName(registrySecret, 'registry-secret')
  if (serviceAccount) {
    validateDnsName(serviceAccount, 'service-account')
  }

  return `apiVersion: v1
kind: Service
metadata:
  name: ${serviceName}
  namespace: ${namespace}
  labels:
    app.kubernetes.io/name: seakills-buildkitd
    app.kubernetes.io/part-of: seakills
    seakills.dev/buildkitd-job: ${jobName}
  annotations:
    seakills.dev/build-context: ${yamlSingleQuote(build.contextLocal)}
    seakills.dev/dockerfile-dir: ${yamlSingleQuote(build.dockerfileLocal)}
    seakills.dev/dockerfile-file: ${yamlSingleQuote(build.dockerfileFile)}
    seakills.dev/target-image: ${yamlSingleQuote(build.targetImage)}
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: seakills-buildkitd
    seakills.dev/buildkitd-job: ${jobName}
  ports:
  - name: buildkit
    port: 1234
    targetPort: buildkit
---
apiVersion: batch/v1
kind: Job
metadata:
  name: ${jobName}
  namespace: ${namespace}
  labels:
    app.kubernetes.io/name: seakills-buildkitd
    app.kubernetes.io/part-of: seakills
    seakills.dev/buildkitd-job: ${jobName}
spec:
  backoffLimit: 0
  template:
    metadata:
      labels:
        app.kubernetes.io/name: seakills-buildkitd
        app.kubernetes.io/part-of: seakills
        seakills.dev/buildkitd-job: ${jobName}
    spec:
      restartPolicy: Never
${serviceAccount ? `      serviceAccountName: ${serviceAccount}
` : ''}      hostUsers: false
      containers:
      - name: buildkitd
        image: moby/buildkit:master-rootless
        args:
        - --addr
        - tcp://0.0.0.0:1234
        - --oci-worker-no-process-sandbox
        ports:
        - name: buildkit
          containerPort: 1234
        env:
        - name: DOCKER_CONFIG
          value: /home/user/.docker
        securityContext:
          runAsUser: 1000
          runAsGroup: 1000
          runAsNonRoot: true
        volumeMounts:
        - name: docker-config
          mountPath: /home/user/.docker
          readOnly: true
        - name: buildkitd
          mountPath: /home/user/.local/share/buildkit
      volumes:
      - name: docker-config
        secret:
          secretName: ${registrySecret}
          items:
          - key: config.json
            path: config.json
      - name: buildkitd
        emptyDir: {}
`
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2))
    const requestFile = requireArg(args, 'request')
    const namespace = requireArg(args, 'namespace')
    const jobName = requireArg(args, 'job-name')
    const serviceName = requireArg(args, 'service-name')
    const registrySecret = requireArg(args, 'registry-secret')
    const serviceAccount = args['service-account'] || null

    const request = readJson(requestFile)
    process.stdout.write(renderManifest({ request, namespace, jobName, serviceName, registrySecret, serviceAccount }))
  } catch (error) {
    usage()
    console.error(`\nError: ${error.message}`)
    process.exit(1)
  }
}

main()
