#!/usr/bin/env node

import fs from 'fs'

const DEFAULT_KANIKO_IMAGE = 'gcr.io/kaniko-project/executor:v1.24.0'
const DEFAULT_PLATFORM = 'linux/amd64'

function usage() {
  console.error([
    'Usage:',
    '  node generate-job.mjs --request <file> --context <file> --namespace <namespace> --job-name <name> --registry-secret <name> --s3-secret <name> --s3-endpoint <url> [--aws-region <region>] [--service-account <name>]',
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

function validateDnsName(value, field, maxLength = 253) {
  if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(value) || value.length > maxLength) {
    throw new Error(`${field} must be a valid DNS label/name up to ${maxLength} characters: ${value}`)
  }
}

function validateEnvValue(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\n') || value.includes('\r')) {
    throw new Error(`${field} must be a non-empty single-line string`)
  }
}

function validateJobReachableS3Endpoint(value) {
  validateEnvValue(value, 's3-endpoint')
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`s3-endpoint must be a valid URL: ${value}`)
  }
  if (['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname)) {
    throw new Error('s3-endpoint must be reachable from the kaniko Job Pod; use KANIKO_JOB_S3_ENDPOINT or a Pod/Service address instead of loopback')
  }
}

function validateBuildArgKey(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`build arg key must be an environment-style identifier: ${value}`)
  }
}

function validateBuildRequest(request) {
  if (request.mode !== 'build-required') {
    throw new Error(`generate-job only supports mode=build-required, got ${request.mode}`)
  }
  if (!request.image?.target_image) {
    throw new Error('image.target_image is required')
  }
  const targetImage = String(request.image.target_image)
  validateEnvValue(targetImage, 'image.target_image')
  if (!targetImage.startsWith('ghcr.io/')) {
    throw new Error(`Only ghcr.io target images are supported, got ${targetImage}`)
  }
  return {
    targetImage,
    buildArgs: request.build?.build_args || {},
  }
}

function validateContextMetadata(metadata) {
  const contextUri = metadata.context?.uri
  const dockerfile = metadata.kaniko?.dockerfile
  if (typeof contextUri !== 'string' || !contextUri.startsWith('s3://')) {
    throw new Error('context.uri must be an s3:// URI')
  }
  validateEnvValue(contextUri, 'context.uri')
  if (typeof dockerfile !== 'string' || dockerfile.length === 0) {
    throw new Error('kaniko.dockerfile is required')
  }
  validateEnvValue(dockerfile, 'kaniko.dockerfile')
  return {
    contextUri,
    dockerfile,
  }
}

function yamlSingleQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function renderBuildArgs(buildArgs) {
  return Object.entries(buildArgs)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => {
      validateBuildArgKey(key)
      validateEnvValue(String(value), `build arg ${key}`)
      return `        - --build-arg=${key}=${String(value)}`
    })
    .join('\n')
}

function renderManifest({ request, context, args }) {
  const build = validateBuildRequest(request)
  const contextMetadata = validateContextMetadata(context)
  const namespace = requireArg(args, 'namespace')
  const jobName = requireArg(args, 'job-name')
  const registrySecret = requireArg(args, 'registry-secret')
  const s3Secret = requireArg(args, 's3-secret')
  const s3Endpoint = requireArg(args, 's3-endpoint')
  const awsRegion = args['aws-region'] || 'sealos-internal'
  const serviceAccount = args['service-account'] || null
  const kanikoImage = args['kaniko-image'] || DEFAULT_KANIKO_IMAGE
  const platform = args.platform || DEFAULT_PLATFORM

  validateDnsName(namespace, 'namespace')
  validateDnsName(jobName, 'job-name', 63)
  validateDnsName(registrySecret, 'registry-secret')
  validateDnsName(s3Secret, 's3-secret')
  if (serviceAccount) validateDnsName(serviceAccount, 'service-account')
  validateJobReachableS3Endpoint(s3Endpoint)
  validateEnvValue(awsRegion, 'aws-region')
  validateEnvValue(kanikoImage, 'kaniko-image')
  validateEnvValue(platform, 'platform')

  const buildArgYaml = renderBuildArgs(build.buildArgs)

  return `apiVersion: batch/v1
kind: Job
metadata:
  name: ${jobName}
  namespace: ${namespace}
  labels:
    app.kubernetes.io/name: seakills-kaniko
    app.kubernetes.io/part-of: seakills
    seakills.dev/kaniko-job: ${jobName}
  annotations:
    seakills.dev/context-uri: ${yamlSingleQuote(contextMetadata.contextUri)}
    seakills.dev/dockerfile: ${yamlSingleQuote(contextMetadata.dockerfile)}
    seakills.dev/target-image: ${yamlSingleQuote(build.targetImage)}
spec:
  backoffLimit: 0
  ttlSecondsAfterFinished: 3600
  template:
    metadata:
      labels:
        app.kubernetes.io/name: seakills-kaniko
        app.kubernetes.io/part-of: seakills
        seakills.dev/kaniko-job: ${jobName}
    spec:
      restartPolicy: Never
${serviceAccount ? `      serviceAccountName: ${serviceAccount}
` : ''}      containers:
      - name: kaniko
        image: ${kanikoImage}
        resources:
          requests:
            cpu: "500m"
            memory: "2Gi"
            ephemeral-storage: "2Gi"
          limits:
            cpu: "2"
            memory: "8Gi"
            ephemeral-storage: "10Gi"
        args:
        - --dockerfile=${contextMetadata.dockerfile}
        - --context=${contextMetadata.contextUri}
        - --destination=${build.targetImage}
        - --custom-platform=${platform}
        - --cleanup
        - --verbosity=info
${buildArgYaml ? `${buildArgYaml}
` : ''}        env:
        - name: S3_ENDPOINT
          value: ${yamlSingleQuote(s3Endpoint)}
        - name: S3_FORCE_PATH_STYLE
          value: "true"
        - name: AWS_EC2_METADATA_DISABLED
          value: "true"
        - name: AWS_REGION
          value: ${yamlSingleQuote(awsRegion)}
        - name: AWS_ACCESS_KEY_ID
          valueFrom:
            secretKeyRef:
              name: ${s3Secret}
              key: AWS_ACCESS_KEY_ID
        - name: AWS_SECRET_ACCESS_KEY
          valueFrom:
            secretKeyRef:
              name: ${s3Secret}
              key: AWS_SECRET_ACCESS_KEY
        volumeMounts:
        - name: docker-config
          mountPath: /kaniko/.docker/config.json
          subPath: config.json
          readOnly: true
      volumes:
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
    const request = readJson(requireArg(args, 'request'))
    const context = readJson(requireArg(args, 'context'))
    process.stdout.write(renderManifest({ request, context, args }))
  } catch (error) {
    usage()
    console.error(`\nError: ${error.message}`)
    process.exit(1)
  }
}

main()
