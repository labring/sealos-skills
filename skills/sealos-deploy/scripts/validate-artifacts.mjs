#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import {
  inferArtifactKind,
  validateArtifactFile,
} from './artifact-validator.mjs'

const FINAL_ARTIFACTS = [
  '.sealos/analysis.json',
  '.sealos/template-references.json',
  '.sealos/build-request.json',
  '.sealos/build-result.json',
  '.sealos/template/index.yaml',
  '.sealos/delivery-manifest.json',
]

function collectProjectArtifacts(workDir) {
  const sealosDir = path.join(workDir, '.sealos')
  const candidates = [
    path.join(sealosDir, 'config.json'),
    path.join(sealosDir, 'template-references.json'),
    path.join(sealosDir, 'analysis.json'),
    path.join(sealosDir, 'build-request.json'),
    path.join(sealosDir, 'build-result.json'),
    path.join(sealosDir, 'delivery-manifest.json'),
  ]

  return candidates
    .filter((candidate) => fs.existsSync(candidate))
    .map((candidate) => ({
      file: candidate,
      kind: inferArtifactKind(candidate),
    }))
    .filter((entry) => entry.kind)
}

function readJsonIfPresent(file, pointer, errors) {
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    errors.push({
      path: pointer,
      message: `cannot perform cross-artifact validation: ${error.message}`,
    })
    return null
  }
}

function imageRepository(value) {
  const withoutDigest = String(value || '').split('@', 1)[0]
  const lastSlash = withoutDigest.lastIndexOf('/')
  const lastColon = withoutDigest.lastIndexOf(':')
  return lastColon > lastSlash ? withoutDigest.slice(0, lastColon) : withoutDigest
}

function sameKubernetesEvidence(left, right) {
  if (!left || !right) return left === right
  return (
    left.namespace === right.namespace
    && left.job === right.job
    && left.pod === right.pod
  )
}

function expectedRoute(templateReferences) {
  return templateReferences?.decision?.route === 'deploy_official_template'
    ? 'official-template'
    : 'standard'
}

function validateArtifactSet(workDir, { requireComplete = false } = {}) {
  const errors = []
  const absoluteWorkDir = path.resolve(workDir)
  const artifactPath = (relative) => path.join(absoluteWorkDir, relative)

  if (requireComplete) {
    for (const relative of FINAL_ARTIFACTS) {
      if (!fs.existsSync(artifactPath(relative))) {
        errors.push({ path: relative, message: 'required final artifact is missing' })
      }
    }
  }

  const analysis = readJsonIfPresent(
    artifactPath('.sealos/analysis.json'),
    '.sealos/analysis.json',
    errors,
  )
  const references = readJsonIfPresent(
    artifactPath('.sealos/template-references.json'),
    '.sealos/template-references.json',
    errors,
  )
  const request = readJsonIfPresent(
    artifactPath('.sealos/build-request.json'),
    '.sealos/build-request.json',
    errors,
  )
  const result = readJsonIfPresent(
    artifactPath('.sealos/build-result.json'),
    '.sealos/build-result.json',
    errors,
  )
  const delivery = readJsonIfPresent(
    artifactPath('.sealos/delivery-manifest.json'),
    '.sealos/delivery-manifest.json',
    errors,
  )
  const templateFile = artifactPath('.sealos/template/index.yaml')
  const template = fs.existsSync(templateFile)
    ? fs.readFileSync(templateFile, 'utf8')
    : null

  if (!request || !result || !delivery || !references) {
    return {
      valid: errors.length === 0,
      errors,
      complete: !requireComplete || errors.length === 0,
    }
  }
  if (
    !Array.isArray(request.services)
    || !Array.isArray(result.services)
    || !Array.isArray(delivery.artifacts)
    || !Array.isArray(analysis?.service_inventory)
    || typeof references.decision?.route !== 'string'
  ) {
    errors.push({
      path: '.sealos',
      message: 'cross-artifact validation requires individually valid artifact shapes',
    })
    return {
      valid: false,
      errors,
      complete: false,
    }
  }

  const route = expectedRoute(references)
  for (const [name, value] of [
    ['build-request', request.route],
    ['build-result', result.route],
    ['delivery-manifest', delivery.route],
  ]) {
    if (value !== route) {
      errors.push({
        path: `.sealos/${name}.json.route`,
        message: `must equal the template-reference route ${route}`,
      })
    }
  }
  if (
    requireComplete
    && delivery.template_references_path !== '.sealos/template-references.json'
  ) {
    errors.push({
      path: '.sealos/delivery-manifest.json.template_references_path',
      message: 'complete delivery must identify the Phase 1.5 decision artifact',
    })
  }

  if (request.source?.work_dir && path.resolve(request.source.work_dir) !== absoluteWorkDir) {
    errors.push({
      path: '.sealos/build-request.json.source.work_dir',
      message: 'must identify the validated project work directory',
    })
  }
  if (
    analysis
    && request.source?.repo
    && ![
      request.source.repo,
      request.source.repo.split('/').at(-1),
    ].includes(analysis.project?.repo_name)
  ) {
    errors.push({
      path: '.sealos/build-request.json.source.repo',
      message: 'must match analysis.project.repo_name',
    })
  }

  if (route === 'official-template') {
    if (request.services.length !== 0 || result.services.length !== 0 || result.status !== 'skipped') {
      errors.push({
        path: '.sealos/build-result.json',
        message: 'official-template route must have no services and a skipped result',
      })
    }
    if (
      request.primary_service !== null
      || result.primary_service !== null
      || result.mode !== null
      || result.image !== null
      || result.kubernetes !== null
    ) {
      errors.push({
        path: '.sealos/build-result.json',
        message: 'official-template route must have an empty Brain compatibility projection',
      })
    }
    const selectedReference = references.references?.find((reference) => (
      reference.match === 'exact'
      && reference.name === references.decision.reference_name
    ))
    const referenceFile = selectedReference
      ? artifactPath(selectedReference.reference_path)
      : null
    if (
      !referenceFile
      || !fs.existsSync(referenceFile)
      || !fs.statSync(referenceFile).isFile()
      || template === null
    ) {
      errors.push({
        path: '.sealos/template/index.yaml',
        message: 'official delivery must retain its selected materialized reference and final Template',
      })
    }
  } else {
    if (result.status !== 'succeeded') {
      errors.push({
        path: '.sealos/build-result.json.status',
        message: 'standard delivery requires a succeeded aggregate build result',
      })
    }

    const resultsByKey = new Map(
      (result.services || []).map((service) => [service.artifact_key, service]),
    )
    const requestsByName = new Map(
      request.services.map((service) => [service.name, service]),
    )
    const analysisByName = new Map(
      (analysis?.service_inventory || []).map((service) => [service.name, service]),
    )
    const primaryRequest = request.services.find(
      (service) => service.name === request.primary_service,
    )

    if (result.primary_service !== request.primary_service) {
      errors.push({
        path: '.sealos/build-result.json.primary_service',
        message: 'must match build-request.json.primary_service',
      })
    }
    if (!primaryRequest) {
      errors.push({
        path: '.sealos/build-request.json.primary_service',
        message: 'must identify one requested service',
      })
    } else {
      const primaryResult = resultsByKey.get(primaryRequest.artifact_key)
      if (result.mode !== primaryRequest.mode) {
        errors.push({
          path: '.sealos/build-result.json.mode',
          message: 'must match the primary request service mode',
        })
      }
      if (!primaryResult || primaryResult.name !== primaryRequest.name) {
        errors.push({
          path: '.sealos/build-result.json.primary_service',
          message: 'must identify one resolved primary service',
        })
      } else {
        if (
          result.image?.image_ref !== primaryResult.image.image_ref
          || result.image?.digest !== primaryResult.image.digest
        ) {
          errors.push({
            path: '.sealos/build-result.json.image',
            message: 'must project the primary service immutable image',
          })
        }
        if (!sameKubernetesEvidence(result.kubernetes, primaryResult.kubernetes)) {
          errors.push({
            path: '.sealos/build-result.json.kubernetes',
            message: 'must project the primary service Kubernetes evidence',
          })
        }
      }
    }

    for (let index = 0; index < analysis.service_inventory.length; index += 1) {
      const analyzed = analysis.service_inventory[index]
      const pointer = `.sealos/analysis.json.service_inventory[${index}]`
      if (['build_required', 'unavailable'].includes(analyzed.image_status)) {
        errors.push({
          path: `${pointer}.image_status`,
          message: 'final container services must be resolved before delivery',
        })
        continue
      }
      if (!['verified', 'built'].includes(analyzed.image_status)) {
        continue
      }

      const requested = requestsByName.get(analyzed.name)
      if (!requested) {
        errors.push({
          path: pointer,
          message: 'every resolved final container service must appear in build-request.json',
        })
        continue
      }
      const expectedMode = analyzed.image_status === 'built'
        ? 'build-required'
        : 'reuse-image'
      if (requested.mode !== expectedMode) {
        errors.push({
          path: pointer,
          message: `image_status=${analyzed.image_status} requires request mode=${expectedMode}`,
        })
      }
    }

    for (let index = 0; index < request.services.length; index += 1) {
      const requested = request.services[index]
      const resolved = resultsByKey.get(requested.artifact_key)
      const analyzed = analysisByName.get(requested.name)
      const pointer = `.sealos/build-request.json.services[${index}]`

      if (!resolved || resolved.name !== requested.name) {
        errors.push({
          path: pointer,
          message: 'must have exactly one matching aggregate build result',
        })
        continue
      }
      if (!analyzed) {
        errors.push({
          path: pointer,
          message: 'must match one analyzed service',
        })
      }

      if (requested.mode === 'reuse-image') {
        if (
          resolved.outcome !== 'reused'
          || resolved.image.image_ref !== requested.image.image_ref
          || resolved.image.pull_access !== requested.image.pull_access
        ) {
          errors.push({
            path: pointer,
            message: 'reused request and result image contracts must match',
          })
        }
      } else if (
        resolved.outcome !== 'success'
        || imageRepository(resolved.image.remote_image)
          !== imageRepository(requested.image.target_image)
      ) {
        errors.push({
          path: pointer,
          message: 'build-required request must resolve successfully from its GHCR target',
        })
      }

      if (
        analyzed
        && (
          analyzed.image_ref !== resolved.image.image_ref
          || analyzed.digest !== resolved.image.digest
          || !['verified', 'built'].includes(analyzed.image_status)
        )
      ) {
        errors.push({
          path: `.sealos/analysis.json.service_inventory.${requested.name}`,
          message: 'must record the same final immutable image as the aggregate result',
        })
      }

      if (template !== null && !template.includes(resolved.image.image_ref)) {
        errors.push({
          path: '.sealos/template/index.yaml',
          message: `must reference the resolved image for service ${requested.name}`,
        })
      }
    }

    if (resultsByKey.size !== request.services.length) {
      errors.push({
        path: '.sealos/build-result.json.services',
        message: 'must contain exactly the services from build-request.json',
      })
    }

    const needsPullSecret = result.services.some((service) => (
      service.outcome !== 'failed'
      && service.image.pull_access !== 'anonymous'
    ))
    if (
      needsPullSecret
      && template !== null
      && (
        !template.includes('imagePullSecrets:')
        || !template.includes('${{ defaults.app_name }}')
      )
    ) {
      errors.push({
        path: '.sealos/template/index.yaml',
        message: 'must retain the app-scoped image pull Secret reference',
      })
    }
  }

  if (
    template !== null
    && (
      /kubernetes\.io\/dockerconfigjson/i.test(template)
      || /\.dockerconfigjson\s*:/i.test(template)
      || /config\.json\s*:[\s\S]{0,500}["']?auths["']?\s*:\s*[{[][\s\S]{0,500}ghcr\.io/i.test(template)
    )
  ) {
    errors.push({
      path: '.sealos/template/index.yaml',
      message: 'must not inline registry credential payloads',
    })
  }

  for (let index = 0; index < delivery.artifacts.length; index += 1) {
    const relative = delivery.artifacts[index]
    const resolved = path.resolve(absoluteWorkDir, relative)
    const insideWorkDir = resolved === absoluteWorkDir
      || resolved.startsWith(`${absoluteWorkDir}${path.sep}`)
    if (!insideWorkDir || !fs.existsSync(resolved)) {
      errors.push({
        path: `.sealos/delivery-manifest.json.artifacts[${index}]`,
        message: 'must identify an existing artifact inside the project work directory',
      })
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    complete: FINAL_ARTIFACTS.every((relative) => fs.existsSync(artifactPath(relative))),
  }
}

function printAndExit(result, code) {
  console.log(JSON.stringify(result, null, 2))
  process.exit(code)
}

function main(args = process.argv.slice(2)) {
  if (args.length === 0) {
    printAndExit({
      valid: false,
      error: 'Usage: node validate-artifacts.mjs <file> | <kind> <file> | --dir <work-dir> [--require-complete]',
    }, 1)
  }

  if (args[0] === '--dir') {
    const workDir = args[1]
    if (!workDir) {
      printAndExit({ valid: false, error: 'Missing work directory after --dir' }, 1)
    }

    const resolvedWorkDir = path.resolve(workDir)
    const results = collectProjectArtifacts(resolvedWorkDir).map(({ kind, file }) => ({
      file,
      ...validateArtifactFile(kind, file),
    }))
    const artifactsValid = results.every((entry) => entry.valid)
    const artifactSet = artifactsValid
      ? validateArtifactSet(resolvedWorkDir, {
          requireComplete: args.includes('--require-complete'),
        })
      : {
          valid: false,
          complete: false,
          errors: [{
            path: '.sealos',
            message: 'cross-artifact validation skipped until individual artifacts are valid',
          }],
        }
    const valid = artifactsValid && artifactSet.valid

    printAndExit({
      valid,
      results,
      artifact_set: artifactSet,
    }, valid ? 0 : 1)
  }

  let kind
  let filePath

  if (args.length === 1) {
    filePath = path.resolve(args[0])
    kind = inferArtifactKind(filePath)
    if (!kind) {
      printAndExit({
        valid: false,
        error: `Could not infer artifact kind from filename: ${path.basename(filePath)}`,
      }, 1)
    }
  } else {
    kind = args[0]
    filePath = path.resolve(args[1])
  }

  const result = validateArtifactFile(kind, filePath)
  printAndExit({
    file: filePath,
    ...result,
  }, result.valid ? 0 : 1)
}

const isMain = process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMain) main()

export {
  collectProjectArtifacts,
  validateArtifactSet,
}
