/**
 * Workload-centric helper utilities for consistency rules.
 */

import { APP_WORKLOAD_KINDS, type ScanContext, type YamlDocument } from './check-consistency-models.ts'

export function* iterDocumentsByKind(context: ScanContext, kind: string): Generator<YamlDocument> {
  for (const doc of context.yamlDocuments) {
    if (doc.skipChecks) continue
    if (doc.data != null && typeof doc.data === 'object' && !Array.isArray(doc.data)) {
      if ((doc.data as Record<string, unknown>).kind === kind) yield doc
    }
  }
}

export function* iterContainers(node: unknown): Generator<Record<string, unknown>> {
  if (node != null && typeof node === 'object' && !Array.isArray(node)) {
    const obj = node as Record<string, unknown>
    for (const [childKey, childValue] of Object.entries(obj)) {
      if (
        (childKey === 'containers' || childKey === 'initContainers') &&
        Array.isArray(childValue)
      ) {
        for (const item of childValue) {
          if (item != null && typeof item === 'object' && !Array.isArray(item)) {
            yield item as Record<string, unknown>
          }
        }
      }
      yield* iterContainers(childValue)
    }
  } else if (Array.isArray(node)) {
    for (const item of node) {
      yield* iterContainers(item)
    }
  }
}

export function* iterWorkloadEnvSecretRefs(
  data: Record<string, unknown>,
): Generator<[string, string]> {
  for (const [envName, secretName] of iterWorkloadEnvSecretKeyRefs(data)) {
    yield [envName, secretName]
  }
}

export function* iterWorkloadEnvSecretKeyRefs(
  data: Record<string, unknown>,
): Generator<[string, string, string | null]> {
  for (const [source, secretName, envName, secretKey] of iterWorkloadSecretRefs(data)) {
    if (source === 'env' && envName != null) {
      yield [envName, secretName, secretKey]
    }
  }
}

export function* iterWorkloadSecretRefs(
  data: Record<string, unknown>,
): Generator<[string, string, string | null, string | null]> {
  for (const container of iterContainers(data)) {
    let envList = container.env
    if (!Array.isArray(envList)) envList = []

    for (const envItem of envList) {
      if (envItem == null || typeof envItem !== 'object' || Array.isArray(envItem)) continue
      const env = envItem as Record<string, unknown>
      const envName = env.name
      const valueFrom = env.valueFrom
      if (typeof envName !== 'string' || valueFrom == null || typeof valueFrom !== 'object') continue
      const secretRef = (valueFrom as Record<string, unknown>).secretKeyRef
      if (secretRef == null || typeof secretRef !== 'object' || Array.isArray(secretRef)) continue
      const secretName = (secretRef as Record<string, unknown>).name
      const secretKey = (secretRef as Record<string, unknown>).key
      if (typeof secretName === 'string') {
        yield [
          'env',
          secretName,
          envName,
          typeof secretKey === 'string' ? secretKey : null,
        ]
      }
    }

    const envFromList = container.envFrom
    if (Array.isArray(envFromList)) {
      for (const envFromItem of envFromList) {
        if (envFromItem == null || typeof envFromItem !== 'object' || Array.isArray(envFromItem)) {
          continue
        }
        const secretRef = (envFromItem as Record<string, unknown>).secretRef
        if (secretRef == null || typeof secretRef !== 'object' || Array.isArray(secretRef)) continue
        const secretName = (secretRef as Record<string, unknown>).name
        if (typeof secretName === 'string') {
          yield ['envFrom', secretName, null, null]
        }
      }
    }
  }

  const templateSpec = getTemplateSpec(data)
  if (templateSpec == null) return

  const volumes = templateSpec.volumes
  if (!Array.isArray(volumes)) return

  for (const volume of volumes) {
    if (volume == null || typeof volume !== 'object' || Array.isArray(volume)) continue
    const vol = volume as Record<string, unknown>
    const secretSpec = vol.secret
    if (secretSpec != null && typeof secretSpec === 'object' && !Array.isArray(secretSpec)) {
      const secretName = (secretSpec as Record<string, unknown>).secretName
      if (typeof secretName === 'string') {
        yield ['volume', secretName, null, null]
      }
    }

    const projected = vol.projected
    if (projected == null || typeof projected !== 'object' || Array.isArray(projected)) continue
    const sources = (projected as Record<string, unknown>).sources
    if (!Array.isArray(sources)) continue
    for (const source of sources) {
      if (source == null || typeof source !== 'object' || Array.isArray(source)) continue
      const sourceSecret = (source as Record<string, unknown>).secret
      if (sourceSecret == null || typeof sourceSecret !== 'object' || Array.isArray(sourceSecret)) {
        continue
      }
      const secretName = (sourceSecret as Record<string, unknown>).name
      if (typeof secretName === 'string') {
        yield ['projected', secretName, null, null]
      }
    }
  }
}

export function getTemplateSpec(
  data: Record<string, unknown>,
): Record<string, unknown> | null {
  const spec = data.spec
  if (spec == null || typeof spec !== 'object' || Array.isArray(spec)) return null
  const template = (spec as Record<string, unknown>).template
  if (template == null || typeof template !== 'object' || Array.isArray(template)) return null
  const templateSpec = (template as Record<string, unknown>).spec
  if (templateSpec == null || typeof templateSpec !== 'object' || Array.isArray(templateSpec)) {
    return null
  }
  return templateSpec as Record<string, unknown>
}

export function isAppWorkloadDocument(doc: YamlDocument): boolean {
  if (doc.data == null || typeof doc.data !== 'object' || Array.isArray(doc.data)) return false
  const data = doc.data as Record<string, unknown>
  if (!APP_WORKLOAD_KINDS.has(String(data.kind))) return false
  const templateSpec = getTemplateSpec(data)
  if (templateSpec == null) return false
  const containers = templateSpec.containers
  return Array.isArray(containers) && containers.length > 0
}

export function hasManagedWorkloadMarker(data: Record<string, unknown>): boolean {
  const metadata = data.metadata
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) return false
  const meta = metadata as Record<string, unknown>

  const labels = meta.labels
  if (labels != null && typeof labels === 'object' && !Array.isArray(labels)) {
    if (Object.prototype.hasOwnProperty.call(labels, 'cloud.sealos.io/app-deploy-manager')) {
      return true
    }
  }

  const annotations = meta.annotations
  if (annotations != null && typeof annotations === 'object' && !Array.isArray(annotations)) {
    if (Object.prototype.hasOwnProperty.call(annotations, 'originImageName')) {
      return true
    }
  }

  return false
}

export function isManagedAppWorkloadDocument(doc: YamlDocument): boolean {
  if (!isAppWorkloadDocument(doc)) return false
  if (doc.data == null || typeof doc.data !== 'object' || Array.isArray(doc.data)) return false
  return hasManagedWorkloadMarker(doc.data as Record<string, unknown>)
}
