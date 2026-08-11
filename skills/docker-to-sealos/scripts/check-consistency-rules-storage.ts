/**
 * Storage and workload-runtime consistency rules.
 */

import { basename } from 'node:path'

import {
  DB_COMPONENT_RESOURCE_LIMITS,
  DB_COMPONENT_RESOURCE_REQUESTS,
  MAX_PVC_STORAGE_BYTES,
  type Rule,
  type ScanContext,
  SEALOS_CPU_REQUEST_BY_LIMIT,
  SEALOS_MEMORY_REQUEST_BY_LIMIT,
  TEMPLATE_DEPLOY_KEY,
  type Violation,
  type YamlDocument,
} from './check-consistency-models.ts'
import { findLine } from './check-consistency-parser.ts'
import { addDocViolation } from './check-consistency-helpers-violations.ts'
import {
  containsKey,
  hasVariableExpression,
  iterPvcStorageValues,
  parseStorageBytes,
} from './check-consistency-helpers-storage.ts'
import { iterContainers } from './check-consistency-helpers-workload.ts'
import { pathToVnName } from './path-converter.ts'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function checkNoEmptydir(context: ScanContext): Violation[] {
  const violations: Violation[] = []
  for (const doc of context.yamlDocuments) {
    if (doc.skipChecks) {
      continue
    }
    if (containsKey(doc.data, 'emptyDir')) {
      addDocViolation(violations, {
        ruleId: 'R005',
        doc,
        pattern: String.raw`^\s*emptyDir\s*:`,
        message: 'emptyDir is not allowed; use persistent storage',
      })
    }
  }
  return violations
}

export function checkImagePullPolicy(context: ScanContext): Violation[] {
  const violations: Violation[] = []
  for (const doc of context.yamlDocuments) {
    if (doc.skipChecks) {
      continue
    }
    for (const container of iterContainers(doc.data)) {
      const image = container.image
      if (typeof image !== 'string' || !image.trim()) {
        continue
      }
      const pullPolicy = container.imagePullPolicy
      if (pullPolicy !== 'IfNotPresent') {
        const line = findLine(
          doc,
          String.raw`^\s*imagePullPolicy\s*:`,
          findLine(doc, String.raw`^\s*image\s*:`),
        )
        const message =
          pullPolicy !== undefined && pullPolicy !== null
            ? 'container imagePullPolicy must be IfNotPresent'
            : 'container must explicitly set imagePullPolicy: IfNotPresent'
        violations.push({ ruleId: 'R006', path: doc.path, line, message })
      }
    }
  }
  return violations
}

export function checkPvcStorageLimit(context: ScanContext): Violation[] {
  const violations: Violation[] = []
  for (const doc of context.yamlDocuments) {
    if (doc.skipChecks) {
      continue
    }

    for (const rawStorage of iterPvcStorageValues(doc.data)) {
      const storageText = String(rawStorage).trim()
      const line = findLine(
        doc,
        `^\\s*storage\\s*:\\s*['"]?${escapeRegExp(storageText)}['"]?\\s*$`,
        findLine(doc, String.raw`^\s*storage\s*:`),
      )

      if (hasVariableExpression(storageText)) {
        violations.push({
          ruleId: 'R011',
          path: doc.path,
          line,
          message: 'PVC storage must be a concrete quantity (variables are not allowed)',
        })
        continue
      }

      const storageBytes = parseStorageBytes(storageText)
      if (storageBytes === null || storageBytes === undefined) {
        violations.push({
          ruleId: 'R011',
          path: doc.path,
          line,
          message: `unable to parse PVC storage quantity: ${JSON.stringify(storageText)}`,
        })
        continue
      }

      if (storageBytes > MAX_PVC_STORAGE_BYTES) {
        violations.push({
          ruleId: 'R011',
          path: doc.path,
          line,
          message: 'PVC storage request must be <= 1Gi',
        })
      }
    }
  }

  return violations
}

function displayAllowed(values: Record<string, string>): string {
  return Object.keys(values).join('/')
}

function resourceLine(doc: YamlDocument, key: string, value: unknown): number {
  if (value === null || value === undefined) {
    return findLine(
      doc,
      `^\\s*${escapeRegExp(key)}\\s*:`,
      findLine(doc, String.raw`^\s*resources\s*:`),
    )
  }
  return findLine(
    doc,
    `^\\s*${escapeRegExp(key)}\\s*:\\s*['"]?${escapeRegExp(String(value))}['"]?\\s*$`,
    findLine(doc, String.raw`^\s*resources\s*:`),
  )
}

export function checkManagedWorkloadResourceLadder(context: ScanContext): Violation[] {
  const violations: Violation[] = []
  for (const doc of context.yamlDocuments) {
    if (doc.skipChecks || !isRecord(doc.data)) {
      continue
    }
    if (basename(doc.path) !== 'index.yaml') {
      continue
    }
    if (
      !['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob'].includes(
        String(doc.data.kind ?? ''),
      )
    ) {
      continue
    }

    for (const container of iterContainers(doc.data)) {
      const image = container.image
      if (typeof image !== 'string' || !image.trim()) {
        continue
      }

      const name = String(container.name ?? '<unknown>')
      const resources = container.resources
      if (!isRecord(resources)) {
        violations.push({
          ruleId: 'R038',
          path: doc.path,
          line: findLine(doc, `^\\s*name\\s*:\\s*${escapeRegExp(name)}\\s*$`),
          message: `container ${name} must define resources limits/requests from the Sealos ladder`,
        })
        continue
      }

      const limits = resources.limits
      const requests = resources.requests
      if (!isRecord(limits)) {
        violations.push({
          ruleId: 'R038',
          path: doc.path,
          line: findLine(doc, String.raw`^\s*resources\s*:`),
          message: `container ${name} must define resources.limits from the Sealos ladder`,
        })
        continue
      }
      if (!isRecord(requests)) {
        violations.push({
          ruleId: 'R038',
          path: doc.path,
          line: findLine(doc, String.raw`^\s*resources\s*:`),
          message: `container ${name} must define resources.requests derived from limits`,
        })
        continue
      }

      const cpuLimit = String(limits.cpu ?? '').trim()
      const memoryLimit = String(limits.memory ?? '').trim()
      if (!(cpuLimit in SEALOS_CPU_REQUEST_BY_LIMIT)) {
        violations.push({
          ruleId: 'R038',
          path: doc.path,
          line: resourceLine(doc, 'cpu', limits.cpu),
          message:
            `container ${name} limits.cpu must use Sealos ladder ` +
            `(${displayAllowed(SEALOS_CPU_REQUEST_BY_LIMIT)})`,
        })
      }
      if (!(memoryLimit in SEALOS_MEMORY_REQUEST_BY_LIMIT)) {
        violations.push({
          ruleId: 'R038',
          path: doc.path,
          line: resourceLine(doc, 'memory', limits.memory),
          message:
            `container ${name} limits.memory must use Sealos ladder ` +
            `(${displayAllowed(SEALOS_MEMORY_REQUEST_BY_LIMIT)})`,
        })
      }

      const expectedCpuRequest = SEALOS_CPU_REQUEST_BY_LIMIT[cpuLimit]
      const expectedMemoryRequest = SEALOS_MEMORY_REQUEST_BY_LIMIT[memoryLimit]
      const actualCpuRequest = String(requests.cpu ?? '').trim()
      const actualMemoryRequest = String(requests.memory ?? '').trim()
      if (expectedCpuRequest !== undefined && actualCpuRequest !== expectedCpuRequest) {
        violations.push({
          ruleId: 'R038',
          path: doc.path,
          line: resourceLine(doc, 'cpu', requests.cpu),
          message:
            `container ${name} requests.cpu must be ${expectedCpuRequest} ` +
            `when limits.cpu is ${cpuLimit}`,
        })
      }
      if (
        expectedMemoryRequest !== undefined &&
        actualMemoryRequest !== expectedMemoryRequest
      ) {
        violations.push({
          ruleId: 'R038',
          path: doc.path,
          line: resourceLine(doc, 'memory', requests.memory),
          message:
            `container ${name} requests.memory must be ${expectedMemoryRequest} ` +
            `when limits.memory is ${memoryLimit}`,
        })
      }
    }
  }

  return violations
}

export function checkDatabaseClusterComponentResources(context: ScanContext): Violation[] {
  const violations: Violation[] = []
  for (const doc of context.yamlDocuments) {
    if (doc.skipChecks || !isRecord(doc.data)) {
      continue
    }
    if (basename(doc.path) !== 'index.yaml') {
      continue
    }
    if (doc.data.kind !== 'Cluster') {
      continue
    }

    const metadata = doc.data.metadata
    const labels = isRecord(metadata) ? metadata.labels : null
    const dbLabel = isRecord(labels) ? labels['kb.io/database'] : null
    if (typeof dbLabel !== 'string' || !dbLabel.trim()) {
      continue
    }

    const spec = doc.data.spec
    const componentSpecs = isRecord(spec) ? spec.componentSpecs : null
    if (!Array.isArray(componentSpecs)) {
      continue
    }

    for (const component of componentSpecs) {
      if (!isRecord(component)) {
        continue
      }
      const componentName = String(component.name ?? '<unknown>')
      const resources = component.resources
      if (!isRecord(resources)) {
        const line = findLine(
          doc,
          `^\\s*name\\s*:\\s*${escapeRegExp(componentName)}\\s*$`,
          findLine(doc, String.raw`^\s*componentSpecs\s*:`),
        )
        violations.push({
          ruleId: 'R019',
          path: doc.path,
          line,
          message: `database component ${componentName} must define resources limits/requests`,
        })
        continue
      }

      const expectedSections: Array<[string, Record<string, string>]> = [
        ['limits', DB_COMPONENT_RESOURCE_LIMITS],
        ['requests', DB_COMPONENT_RESOURCE_REQUESTS],
      ]
      for (const [sectionName, expectedValues] of expectedSections) {
        const section = resources[sectionName]
        if (!isRecord(section)) {
          const line = findLine(
            doc,
            `^\\s*name\\s*:\\s*${escapeRegExp(componentName)}\\s*$`,
            findLine(doc, String.raw`^\s*resources\s*:`),
          )
          violations.push({
            ruleId: 'R019',
            path: doc.path,
            line,
            message: `database component ${componentName} must define resources.${sectionName}`,
          })
          continue
        }

        for (const [key, expected] of Object.entries(expectedValues)) {
          const actual = section[key]
          if (actual === expected) {
            continue
          }
          const line = findLine(
            doc,
            `^\\s*${escapeRegExp(key)}\\s*:\\s*['"]?${escapeRegExp(String(actual))}['"]?\\s*$`,
            findLine(
              doc,
              `^\\s*name\\s*:\\s*${escapeRegExp(componentName)}\\s*$`,
              findLine(doc, String.raw`^\s*resources\s*:`),
            ),
          )
          violations.push({
            ruleId: 'R019',
            path: doc.path,
            line,
            message:
              `database component ${componentName} resources.${sectionName}.${key} ` +
              `must be ${expected}`,
          })
        }
      }
    }
  }

  return violations
}

export function checkDatabaseClusterVisibilityLabels(context: ScanContext): Violation[] {
  const violations: Violation[] = []
  const requiredLabelKeys = [
    'kb.io/database',
    'sealos-db-provider-cr',
    'clusterdefinition.kubeblocks.io/name',
  ] as const

  for (const doc of context.yamlDocuments) {
    if (doc.skipChecks || !isRecord(doc.data)) {
      continue
    }
    if (basename(doc.path) !== 'index.yaml') {
      continue
    }
    if (doc.data.kind !== 'Cluster') {
      continue
    }
    const apiVersion = doc.data.apiVersion
    if (typeof apiVersion !== 'string' || !apiVersion.startsWith('apps.kubeblocks.io/')) {
      continue
    }

    const metadata = doc.data.metadata
    if (!isRecord(metadata)) {
      continue
    }
    const labels = metadata.labels
    if (!isRecord(labels)) {
      addDocViolation(violations, {
        ruleId: 'R040',
        doc,
        pattern: String.raw`^\s*labels\s*:`,
        defaultPattern: String.raw`^\s*metadata\s*:`,
        message:
          'database Cluster metadata.labels must include ' +
          'kb.io/database, sealos-db-provider-cr, and ' +
          'clusterdefinition.kubeblocks.io/name for dbprovider visibility',
      })
      continue
    }

    const name = metadata.name
    if (typeof name !== 'string' || !name.trim()) {
      continue
    }

    for (const labelKey of requiredLabelKeys) {
      const labelValue = labels[labelKey]
      if (typeof labelValue === 'string' && labelValue.trim()) {
        continue
      }
      addDocViolation(violations, {
        ruleId: 'R040',
        doc,
        pattern: `^\\s*${escapeRegExp(labelKey)}\\s*:`,
        defaultPattern: String.raw`^\s*labels\s*:`,
        message:
          'database Cluster metadata.labels must include ' +
          'kb.io/database, sealos-db-provider-cr, and ' +
          'clusterdefinition.kubeblocks.io/name for dbprovider visibility',
      })
    }

    const labelValue = labels['sealos-db-provider-cr']
    if (labelValue !== undefined && labelValue !== null && labelValue !== name) {
      addDocViolation(violations, {
        ruleId: 'R040',
        doc,
        pattern: String.raw`^\s*sealos-db-provider-cr\s*:`,
        defaultPattern: String.raw`^\s*labels\s*:`,
        message:
          'database Cluster metadata.labels.sealos-db-provider-cr must exactly match metadata.name',
      })
    }
  }

  return violations
}

function isMongodbCluster(data: Record<string, unknown>): boolean {
  if (data.kind !== 'Cluster') {
    return false
  }

  const metadata = data.metadata
  const labels = isRecord(metadata) ? metadata.labels : null
  if (isRecord(labels)) {
    const databaseLabel = labels['kb.io/database']
    const clusterDefinition = labels['clusterdefinition.kubeblocks.io/name']
    if (typeof databaseLabel === 'string' && databaseLabel.toLowerCase().startsWith('mongodb')) {
      return true
    }
    if (clusterDefinition === 'mongodb') {
      return true
    }
  }

  const spec = data.spec
  const componentSpecs = isRecord(spec) ? spec.componentSpecs : null
  if (!Array.isArray(componentSpecs)) {
    return false
  }
  for (const component of componentSpecs) {
    if (!isRecord(component)) {
      continue
    }
    if (component.name === 'mongodb' || component.componentDef === 'mongodb') {
      return true
    }
  }
  return false
}

export function checkMongodbClusterSchema(context: ScanContext): Violation[] {
  const violations: Violation[] = []
  for (const doc of context.yamlDocuments) {
    if (doc.skipChecks || !isRecord(doc.data)) {
      continue
    }
    if (basename(doc.path) !== 'index.yaml' || !isMongodbCluster(doc.data)) {
      continue
    }

    if (doc.data.apiVersion !== 'apps.kubeblocks.io/v1alpha1') {
      addDocViolation(violations, {
        ruleId: 'R057',
        doc,
        pattern: String.raw`^\s*apiVersion\s*:`,
        message: 'MongoDB Cluster apiVersion must be apps.kubeblocks.io/v1alpha1',
      })
    }

    const metadata = doc.data.metadata
    const name = isRecord(metadata) ? metadata.name : null
    const labels = isRecord(metadata) ? metadata.labels : null
    const expectedLabels: Record<string, unknown> = {
      'kb.io/database': 'mongodb-8.0.4',
      'clusterdefinition.kubeblocks.io/name': 'mongodb',
      'app.kubernetes.io/instance': name,
    }
    for (const [key, expected] of Object.entries(expectedLabels)) {
      const actual = isRecord(labels) ? labels[key] : null
      if (actual === expected) {
        continue
      }
      addDocViolation(violations, {
        ruleId: 'R057',
        doc,
        pattern: `^\\s*${escapeRegExp(key)}\\s*:`,
        defaultPattern: String.raw`^\s*labels\s*:`,
        message: `MongoDB Cluster metadata.labels.${key} must be ${expected}`,
      })
    }

    const spec = doc.data.spec
    const componentSpecs = isRecord(spec) ? spec.componentSpecs : null
    const component =
      Array.isArray(componentSpecs) && componentSpecs.length > 0 ? componentSpecs[0] : null
    if (!isRecord(component)) {
      addDocViolation(violations, {
        ruleId: 'R057',
        doc,
        pattern: String.raw`^\s*componentSpecs\s*:`,
        defaultPattern: String.raw`^\s*spec\s*:`,
        message: 'MongoDB Cluster must define a mongodb componentSpec',
      })
      continue
    }

    const expectedComponentFields: Record<string, string> = {
      name: 'mongodb',
      componentDef: 'mongodb',
      serviceVersion: '8.0.4',
    }
    for (const [key, expected] of Object.entries(expectedComponentFields)) {
      if (component[key] === expected) {
        continue
      }
      addDocViolation(violations, {
        ruleId: 'R057',
        doc,
        pattern: `^\\s*${escapeRegExp(key)}\\s*:`,
        defaultPattern: String.raw`^\s*componentSpecs\s*:`,
        message: `MongoDB Cluster componentSpecs[0].${key} must be ${expected}`,
      })
    }
  }

  return violations
}

export function checkStatefulsetVolumeClaimMetadata(context: ScanContext): Violation[] {
  const violations: Violation[] = []
  for (const doc of context.yamlDocuments) {
    if (doc.skipChecks || !isRecord(doc.data)) {
      continue
    }
    if (basename(doc.path) !== 'index.yaml' || doc.data.kind !== 'StatefulSet') {
      continue
    }

    const spec = doc.data.spec
    const claimTemplates = isRecord(spec) ? spec.volumeClaimTemplates : null
    if (!Array.isArray(claimTemplates) || claimTemplates.length === 0) {
      continue
    }

    const metadata = doc.data.metadata
    const workloadLabels = isRecord(metadata) ? metadata.labels : null
    if (isRecord(workloadLabels) && TEMPLATE_DEPLOY_KEY in workloadLabels) {
      addDocViolation(violations, {
        ruleId: 'R056',
        doc,
        pattern: `^\\s*${escapeRegExp(TEMPLATE_DEPLOY_KEY)}\\s*:`,
        defaultPattern: String.raw`^\s*labels\s*:`,
        message:
          `StatefulSet metadata.labels must omit ${TEMPLATE_DEPLOY_KEY} ` +
          'when spec.volumeClaimTemplates is present',
      })
    }

    const mountedPaths = new Set<string>()
    for (const container of iterContainers(doc.data)) {
      const mounts = container.volumeMounts
      if (!Array.isArray(mounts)) {
        continue
      }
      for (const mount of mounts) {
        if (!isRecord(mount)) {
          continue
        }
        const mountName = mount.name
        const mountPath = mount.mountPath
        if (typeof mountName === 'string' && typeof mountPath === 'string') {
          mountedPaths.add(`${mountName.trim()}\0${mountPath.trim()}`)
        }
      }
    }

    for (const claimTemplate of claimTemplates) {
      const claimMetadata = isRecord(claimTemplate) ? claimTemplate.metadata : null
      if (!isRecord(claimMetadata)) {
        addDocViolation(violations, {
          ruleId: 'R056',
          doc,
          pattern: String.raw`^\s*volumeClaimTemplates\s*:`,
          message: 'each volumeClaimTemplates item must define metadata',
        })
        continue
      }

      const claimLabels = claimMetadata.labels
      if (isRecord(claimLabels) && TEMPLATE_DEPLOY_KEY in claimLabels) {
        addDocViolation(violations, {
          ruleId: 'R056',
          doc,
          pattern: `^\\s*${escapeRegExp(TEMPLATE_DEPLOY_KEY)}\\s*:`,
          defaultPattern: String.raw`^\s*volumeClaimTemplates\s*:`,
          message: `volumeClaimTemplates[].metadata.labels must omit ${TEMPLATE_DEPLOY_KEY}`,
        })
      }

      const annotations = claimMetadata.annotations
      let path = isRecord(annotations) ? annotations.path : null
      const value = isRecord(annotations) ? annotations.value : null
      const name = claimMetadata.name
      if (typeof path !== 'string' || !path.trim()) {
        addDocViolation(violations, {
          ruleId: 'R056',
          doc,
          pattern: String.raw`^\s*annotations\s*:`,
          defaultPattern: String.raw`^\s*volumeClaimTemplates\s*:`,
          message: 'volumeClaimTemplates[].metadata.annotations.path is required',
        })
        continue
      }
      path = path.trim()

      if (value !== '1') {
        addDocViolation(violations, {
          ruleId: 'R056',
          doc,
          pattern: String.raw`^\s*value\s*:`,
          defaultPattern: String.raw`^\s*annotations\s*:`,
          message: "volumeClaimTemplates[].metadata.annotations.value must be the string '1'",
        })
      }

      let expectedName: string
      try {
        expectedName = pathToVnName(path)
      } catch {
        addDocViolation(violations, {
          ruleId: 'R056',
          doc,
          pattern: String.raw`^\s*path\s*:`,
          defaultPattern: String.raw`^\s*annotations\s*:`,
          message: 'volumeClaimTemplates[].metadata.annotations.path must produce a valid vn name',
        })
        continue
      }
      if (name !== expectedName) {
        addDocViolation(violations, {
          ruleId: 'R056',
          doc,
          pattern: String.raw`^\s*name\s*:`,
          defaultPattern: String.raw`^\s*volumeClaimTemplates\s*:`,
          message:
            'volumeClaimTemplates[].metadata.name must be derived from annotations.path ' +
            `with path_to_vn_name (expected ${expectedName})`,
        })
      }

      if (!mountedPaths.has(`${expectedName}\0${path}`)) {
        addDocViolation(violations, {
          ruleId: 'R056',
          doc,
          pattern: String.raw`^\s*volumeClaimTemplates\s*:`,
          message:
            'each volume claim template must have a matching container volumeMount ' +
            'whose name is derived from annotations.path and whose mountPath equals that path',
        })
      }
    }
  }

  return violations
}

export const STORAGE_RULES: Record<string, Rule> = {
  R005: { ruleId: 'R005', check: checkNoEmptydir },
  R006: { ruleId: 'R006', check: checkImagePullPolicy },
  R011: { ruleId: 'R011', check: checkPvcStorageLimit },
  R019: { ruleId: 'R019', check: checkDatabaseClusterComponentResources },
  R040: { ruleId: 'R040', check: checkDatabaseClusterVisibilityLabels },
  R057: { ruleId: 'R057', check: checkMongodbClusterSchema },
  R038: { ruleId: 'R038', check: checkManagedWorkloadResourceLadder },
  R056: { ruleId: 'R056', check: checkStatefulsetVolumeClaimMetadata },
}
