/**
 * Security and secret-handling consistency rules.
 */

import {
  DB_SECRET_SUFFIXES,
  type Rule,
  type ScanContext,
  type Violation,
  type YamlDocument,
  WORKLOAD_KINDS,
} from './check-consistency-models.ts'
import { iterContainers, iterWorkloadSecretRefs } from './check-consistency-helpers-workload.ts'
import { findLine } from './check-consistency-parser.ts'

const APP_NAME_PLACEHOLDER = String.raw`\$\{\{\s*defaults\.app_name\s*\}\}`
const SERVICE_ACCOUNT_PLACEHOLDER = String.raw`\$\{\{\s*SEALOS_SERVICE_ACCOUNT\s*\}\}`

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const APPROVED_DB_SECRET_PATTERN = new RegExp(
  `^${APP_NAME_PLACEHOLDER}(?:${DB_SECRET_SUFFIXES.map((suffix) => escapeRegExp(suffix)).join('|')})$`,
)
const OBJECT_STORAGE_BASE_SECRET_NAME = 'object-storage-key'
const OBJECT_STORAGE_BUCKET_SECRET_PATTERN = new RegExp(
  `^object-storage-key-${SERVICE_ACCOUNT_PLACEHOLDER}-${APP_NAME_PLACEHOLDER}(?:-[a-z0-9](?:[-a-z0-9]*[a-z0-9])?)*$`,
)
const OBJECT_STORAGE_BASE_ENV_NAMES = new Set([
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'BACKEND_STORAGE_MINIO_EXTERNAL_ENDPOINT',
])
const OBJECT_STORAGE_BUCKET_ENV_NAMES = new Set(['S3_BUCKET'])
const DB_CONNECTION_INDICATOR_HINTS = new Set([
  'DB',
  'DATABASE',
  'POSTGRES',
  'POSTGRESQL',
  'PG',
  'MYSQL',
  'MARIADB',
  'MONGO',
  'MONGODB',
  'REDIS',
  'KAFKA',
])
// These envs contain DB-related tokens (PG/URL/PORT) in names but are not
// direct database connection fields and should not be forced to secretKeyRef.
const NON_DB_CONNECTION_ENV_EXACT = new Set([
  'STUDIO_PG_META_URL',
  'POSTGREST_URL',
  'POSTGREST_BASE_URL',
  'PGRST_OPENAPI_SERVER_PROXY_URI',
  'PG_META_PORT',
  'CODE_SANDBOX_URL',
  'SANDBOX_URL',
])
const ENV_VALUE_REF_RE = /\$\(([A-Za-z_][A-Za-z0-9_]*)\)/g
const DB_COMPOSABLE_KEYS = new Set(['endpoint', 'host', 'port', 'username', 'password'])
const REDIS_SERVICE_HOST_TEMPLATE_PATTERN = new RegExp(
  `^${APP_NAME_PLACEHOLDER}-redis-redis(?:-redis)?\\.\\$\\{\\{\\s*SEALOS_NAMESPACE\\s*\\}\\}\\.svc(?:\\.cluster\\.local)?$`,
)
const REDIS_SERVICE_HOST_RUNTIME_PATTERN =
  /^[a-z0-9](?:[-a-z0-9]*redis[-a-z0-9]*)\.[a-z0-9](?:[-a-z0-9]*[a-z0-9])?\.svc(?:\.cluster\.local)?$/
const MONGODB_SERVICE_HOST_TEMPLATE_PATTERN = new RegExp(
  `^${APP_NAME_PLACEHOLDER}-(?:mongo|mongodb)-mongodb\\.\\$\\{\\{\\s*SEALOS_NAMESPACE\\s*\\}\\}\\.svc(?:\\.cluster\\.local)?$`,
)
const MONGODB_SERVICE_HOST_RUNTIME_PATTERN =
  /^[a-z0-9](?:[-a-z0-9]*mongo(?:db)?[-a-z0-9]*)-mongodb\.[a-z0-9](?:[-a-z0-9]*[a-z0-9])?\.svc(?:\.cluster\.local)?$/

function findAllEnvValueRefs(value: string): string[] {
  const names: string[] = []
  ENV_VALUE_REF_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = ENV_VALUE_REF_RE.exec(value)) !== null) {
    names.push(match[1]!)
  }
  return names
}

export function isApprovedDbSecretName(secretName: string): boolean {
  return APPROVED_DB_SECRET_PATTERN.test(secretName)
}

export function isApprovedObjectStorageSecretRef(
  source: string,
  secretName: string,
  envName: string | null | undefined,
): boolean {
  if (source !== 'env' || typeof envName !== 'string') {
    return false
  }
  if (secretName === OBJECT_STORAGE_BASE_SECRET_NAME) {
    return OBJECT_STORAGE_BASE_ENV_NAMES.has(envName)
  }
  if (OBJECT_STORAGE_BUCKET_SECRET_PATTERN.test(secretName)) {
    const normalizedEnv = normalizeEnvName(envName)
    return OBJECT_STORAGE_BUCKET_ENV_NAMES.has(normalizedEnv) || normalizedEnv.endsWith('_BUCKET')
  }
  return false
}

export function normalizeEnvName(envName: string): string {
  return envName.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
}

export function inferDbConnectionField(envName: string): string | null {
  const upper = normalizeEnvName(envName)
  if (NON_DB_CONNECTION_ENV_EXACT.has(upper)) {
    return null
  }
  let hasHint = false
  for (const hint of DB_CONNECTION_INDICATOR_HINTS) {
    if (upper.includes(hint)) {
      hasHint = true
      break
    }
  }
  if (!hasHint) {
    return null
  }

  if (/(?:^|_)(?:PASSWORD|PASS|PWD)(?:$|_)/.test(upper)) {
    return 'password'
  }
  if (/(?:^|_)(?:USERNAME|USER)(?:$|_)/.test(upper)) {
    return 'username'
  }
  if (/(?:^|_)(?:ENDPOINT|URI|URL|DSN)(?:$|_)/.test(upper)) {
    return 'endpoint'
  }
  if (/(?:^|_)(?:HOST|SERVER)(?:$|_)/.test(upper)) {
    return 'host'
  }
  if (/(?:^|_)(?:PORT)(?:$|_)/.test(upper)) {
    return 'port'
  }

  return null
}

export function extractSecretRef(envItem: Record<string, unknown>): { name: string; key: string } | null {
  const valueFrom = envItem.valueFrom
  const secretRef = isRecord(valueFrom) ? valueFrom.secretKeyRef : null
  if (!isRecord(secretRef)) {
    return null
  }
  const name = secretRef.name
  const key = secretRef.key
  if (typeof name !== 'string' || typeof key !== 'string') {
    return null
  }
  return { name, key }
}

export function isComposedDbEndpointFromSecret(
  envItem: Record<string, unknown>,
  envItemsByName: Record<string, Record<string, unknown>>,
): boolean {
  const value = envItem.value
  if (typeof value !== 'string') {
    return false
  }

  const refNames = findAllEnvValueRefs(value)
  if (refNames.length === 0) {
    return false
  }

  let hasEndpoint = false
  let hasHost = false
  let hasPort = false
  for (const refName of refNames) {
    const refEnv = envItemsByName[refName]
    if (!isRecord(refEnv)) {
      return false
    }
    const refSecret = extractSecretRef(refEnv)
    if (refSecret === null) {
      return false
    }
    if (!isApprovedDbSecretName(refSecret.name)) {
      return false
    }
    const refKey = refSecret.key
    if (!DB_COMPOSABLE_KEYS.has(refKey)) {
      return false
    }
    if (refKey === 'endpoint') {
      hasEndpoint = true
    }
    if (refKey === 'host') {
      hasHost = true
    }
    if (refKey === 'port') {
      hasPort = true
    }
  }

  return hasEndpoint || (hasHost && hasPort)
}

export function isComposedDbHostFromSecret(
  envItem: Record<string, unknown>,
  envItemsByName: Record<string, Record<string, unknown>>,
): boolean {
  const value = envItem.value
  if (typeof value !== 'string') {
    return false
  }

  const refNames = findAllEnvValueRefs(value)
  if (refNames.length === 0) {
    return false
  }

  let hasHost = false
  let hasPort = false
  for (const refName of refNames) {
    const refEnv = envItemsByName[refName]
    if (!isRecord(refEnv)) {
      return false
    }
    const refSecret = extractSecretRef(refEnv)
    if (refSecret === null) {
      return false
    }
    if (!isApprovedDbSecretName(refSecret.name)) {
      return false
    }
    const refKey = refSecret.key
    if (refKey === 'host') {
      hasHost = true
    } else if (refKey === 'port') {
      hasPort = true
    } else {
      return false
    }
  }

  return hasHost && hasPort
}

export function resolveEnvValue(
  value: unknown,
  envItemsByName: Record<string, Record<string, unknown>>,
  depth = 0,
): string | null {
  if (typeof value !== 'string') {
    return null
  }
  if (depth > 4) {
    return null
  }

  const refMatch = /^\$\(([A-Za-z_][A-Za-z0-9_]*)\)$/.exec(value.trim())
  if (!refMatch) {
    return value
  }

  const refEnv = envItemsByName[refMatch[1]!]
  if (!isRecord(refEnv)) {
    return null
  }
  return resolveEnvValue(refEnv.value, envItemsByName, depth + 1)
}

export function isRedisServiceHost(value: string): boolean {
  const stripped = value.trim()
  return (
    REDIS_SERVICE_HOST_TEMPLATE_PATTERN.test(stripped) ||
    REDIS_SERVICE_HOST_RUNTIME_PATTERN.test(stripped)
  )
}

export function isRedisServicePort(value: string): boolean {
  return value.trim() === '6379'
}

export function isMongodbServiceHost(value: string): boolean {
  const stripped = value.trim()
  return (
    MONGODB_SERVICE_HOST_TEMPLATE_PATTERN.test(stripped) ||
    MONGODB_SERVICE_HOST_RUNTIME_PATTERN.test(stripped)
  )
}

export function isMongodbServicePort(value: string): boolean {
  return value.trim() === '27017'
}

export function isMongodbHostFromEnv(
  envItem: Record<string, unknown>,
  envItemsByName: Record<string, Record<string, unknown>>,
): boolean {
  const resolved = resolveEnvValue(envItem.value, envItemsByName)
  return typeof resolved === 'string' && isMongodbServiceHost(resolved)
}

export function isMongodbPortFromEnv(
  envItem: Record<string, unknown>,
  envItemsByName: Record<string, Record<string, unknown>>,
): boolean {
  const resolved = resolveEnvValue(envItem.value, envItemsByName)
  return typeof resolved === 'string' && isMongodbServicePort(resolved)
}

export function hasMongodbServiceHostEnv(
  envItemsByName: Record<string, Record<string, unknown>>,
): boolean {
  for (const item of Object.values(envItemsByName)) {
    if (isMongodbHostFromEnv(item, envItemsByName)) {
      return true
    }
  }
  return false
}

export function isRedisHostFromEnv(
  envItem: Record<string, unknown>,
  envItemsByName: Record<string, Record<string, unknown>>,
): boolean {
  const resolved = resolveEnvValue(envItem.value, envItemsByName)
  return typeof resolved === 'string' && isRedisServiceHost(resolved)
}

export function isRedisPortFromEnv(
  envItem: Record<string, unknown>,
  envItemsByName: Record<string, Record<string, unknown>>,
): boolean {
  const resolved = resolveEnvValue(envItem.value, envItemsByName)
  return typeof resolved === 'string' && isRedisServicePort(resolved)
}

export function isRedisPasswordFromSecret(
  envItem: Record<string, unknown>,
  envItemsByName: Record<string, Record<string, unknown>>,
): boolean {
  const refMatch = /^\$\(([A-Za-z_][A-Za-z0-9_]*)\)$/.exec(String(envItem.value ?? '').trim())
  if (refMatch === null) {
    return false
  }
  const refEnv = envItemsByName[refMatch[1]!]
  if (!isRecord(refEnv)) {
    return false
  }
  const refSecret = extractSecretRef(refEnv)
  if (refSecret === null) {
    return false
  }
  return isApprovedDbSecretName(refSecret.name) && refSecret.key === 'password'
}

export function isComposedRedisEndpointFromService(
  envItem: Record<string, unknown>,
  envItemsByName: Record<string, Record<string, unknown>>,
): boolean {
  const value = envItem.value
  if (typeof value !== 'string') {
    return false
  }
  if (!value.startsWith('redis://')) {
    return false
  }

  const refNames = findAllEnvValueRefs(value)
  let hasHost = false
  let hasPort = false

  for (const refName of refNames) {
    const refEnv = envItemsByName[refName]
    if (!isRecord(refEnv)) {
      return false
    }

    const refSecret = extractSecretRef(refEnv)
    if (refSecret !== null) {
      if (!isApprovedDbSecretName(refSecret.name)) {
        return false
      }
      const refKey = refSecret.key
      if (refKey === 'endpoint') {
        hasHost = true
        hasPort = true
      } else if (refKey === 'host') {
        hasHost = true
      } else if (refKey === 'port') {
        hasPort = true
      } else if (refKey === 'username' || refKey === 'password') {
        // allowed credential refs
      } else {
        return false
      }
      continue
    }

    const resolved = resolveEnvValue(refEnv.value, envItemsByName)
    if (typeof resolved !== 'string') {
      return false
    }
    if (isRedisServiceHost(resolved)) {
      hasHost = true
      continue
    }
    if (isRedisServicePort(resolved)) {
      hasPort = true
      continue
    }
    const normalizedRef = normalizeEnvName(refName)
    if (normalizedRef.endsWith('PASSWORD') || normalizedRef.endsWith('USERNAME')) {
      continue
    }
    return false
  }

  if (refNames.length === 0) {
    const match = /redis:\/\/(?::[^@]+@)?([^/:]+):([0-9]+)/.exec(value)
    if (match === null) {
      return false
    }
    return isRedisServiceHost(match[1]!) && isRedisServicePort(match[2]!)
  }

  return hasHost && hasPort
}

export function isComposedMongodbEndpointFromService(
  envItem: Record<string, unknown>,
  envItemsByName: Record<string, Record<string, unknown>>,
): boolean {
  const value = envItem.value
  if (typeof value !== 'string') {
    return false
  }
  if (!value.startsWith('mongodb://')) {
    return false
  }

  const refNames = findAllEnvValueRefs(value)
  let hasHost = false
  let hasPort = false

  const match = /mongodb:\/\/(?:[^:@]+(?::[^@]+)?@)?([^/:?]+):([0-9]+)/.exec(value)
  if (match !== null) {
    if (isMongodbServiceHost(match[1]!)) {
      hasHost = true
    }
    if (isMongodbServicePort(match[2]!)) {
      hasPort = true
    }
  }

  for (const refName of refNames) {
    const refEnv = envItemsByName[refName]
    if (!isRecord(refEnv)) {
      return false
    }

    const refSecret = extractSecretRef(refEnv)
    if (refSecret !== null) {
      if (!isApprovedDbSecretName(refSecret.name)) {
        return false
      }
      const refKey = refSecret.key
      if (refKey === 'endpoint') {
        hasHost = true
        hasPort = true
      } else if (refKey === 'host') {
        hasHost = true
      } else if (refKey === 'port') {
        hasPort = true
      } else if (refKey === 'username' || refKey === 'password') {
        // allowed credential refs
      } else {
        return false
      }
      continue
    }

    const resolved = resolveEnvValue(refEnv.value, envItemsByName)
    if (typeof resolved !== 'string') {
      return false
    }
    if (isMongodbServiceHost(resolved)) {
      hasHost = true
      continue
    }
    if (isMongodbServicePort(resolved)) {
      hasPort = true
      continue
    }
    const normalizedRef = normalizeEnvName(refName)
    if (normalizedRef.endsWith('PASSWORD') || normalizedRef.endsWith('USERNAME')) {
      continue
    }
    return false
  }

  return hasHost && hasPort
}

export function isAllowedRedisServiceEnv(
  envName: string,
  expectedKey: string,
  envItem: Record<string, unknown>,
  envItemsByName: Record<string, Record<string, unknown>>,
): boolean {
  const normalized = normalizeEnvName(envName)
  if (!normalized.includes('REDIS')) {
    return false
  }

  if (expectedKey === 'host') {
    return isRedisHostFromEnv(envItem, envItemsByName)
  }
  if (expectedKey === 'port') {
    return isRedisPortFromEnv(envItem, envItemsByName)
  }
  if (expectedKey === 'password') {
    return isRedisPasswordFromSecret(envItem, envItemsByName)
  }
  if (expectedKey === 'endpoint') {
    return isComposedRedisEndpointFromService(envItem, envItemsByName)
  }
  return false
}

export function isAllowedMongodbServiceEnv(
  envName: string,
  expectedKey: string,
  envItem: Record<string, unknown>,
  envItemsByName: Record<string, Record<string, unknown>>,
): boolean {
  const normalized = normalizeEnvName(envName)
  const isMongodbNamed = normalized.includes('MONGO')

  if (expectedKey === 'host') {
    return isMongodbHostFromEnv(envItem, envItemsByName)
  }
  if (expectedKey === 'port') {
    return (
      isMongodbPortFromEnv(envItem, envItemsByName) &&
      (isMongodbNamed || hasMongodbServiceHostEnv(envItemsByName))
    )
  }
  if (expectedKey === 'endpoint') {
    return isComposedMongodbEndpointFromService(envItem, envItemsByName)
  }
  return false
}

function findSecretRefLine(
  doc: YamlDocument,
  source: string,
  secretName: string,
  envName: string | null | undefined,
): number {
  if (source === 'env' && typeof envName === 'string') {
    return findLine(doc, `^\\s*-\\s*name\\s*:\\s*${escapeRegExp(envName)}\\s*$`)
  }
  if (source === 'volume') {
    return findLine(doc, `^\\s*secretName\\s*:\\s*${escapeRegExp(secretName)}\\s*$`)
  }
  return findLine(doc, `^\\s*name\\s*:\\s*${escapeRegExp(secretName)}\\s*$`)
}

function collectReservedDbSecretOverrides(context: ScanContext): Violation[] {
  const violations: Violation[] = []
  for (const doc of context.yamlDocuments) {
    if (doc.skipChecks || !isRecord(doc.data)) {
      continue
    }
    if (doc.data.kind !== 'Secret') {
      continue
    }

    const metadata = doc.data.metadata
    const secretName = isRecord(metadata) ? metadata.name : null
    if (typeof secretName !== 'string' || !isApprovedDbSecretName(secretName)) {
      continue
    }

    const line = findLine(
      doc,
      `^\\s*name\\s*:\\s*${escapeRegExp(secretName)}\\s*$`,
      findLine(doc, String.raw`^\s*metadata\s*:`),
    )
    violations.push({
      ruleId: 'R007',
      path: doc.path,
      line,
      message:
        'database secret names managed by Kubeblocks are reserved; ' +
        'do not define custom Secret resources with those names',
    })
  }
  return violations
}

export function checkBusinessEnvSecretPolicy(context: ScanContext): Violation[] {
  const violations: Violation[] = collectReservedDbSecretOverrides(context)

  for (const doc of context.yamlDocuments) {
    if (doc.skipChecks || !isRecord(doc.data)) {
      continue
    }
    const kind = doc.data.kind
    if (typeof kind !== 'string' || !WORKLOAD_KINDS.has(kind)) {
      continue
    }

    for (const [source, secretName, envName] of iterWorkloadSecretRefs(doc.data)) {
      if (
        isApprovedDbSecretName(secretName) ||
        isApprovedObjectStorageSecretRef(source, secretName, envName)
      ) {
        continue
      }

      const line = findSecretRefLine(doc, source, secretName, envName)
      violations.push({
        ruleId: 'R007',
        path: doc.path,
        line,
        message:
          'business workload secret references must not use custom secrets unless they reference ' +
          'an approved database or object storage secret',
      })
    }
  }

  return violations
}

export function checkDbConnectionEnvSecretRequirements(context: ScanContext): Violation[] {
  const violations: Violation[] = []

  for (const doc of context.yamlDocuments) {
    if (doc.skipChecks || !isRecord(doc.data)) {
      continue
    }
    const kind = doc.data.kind
    if (typeof kind !== 'string' || !WORKLOAD_KINDS.has(kind)) {
      continue
    }

    for (const container of iterContainers(doc.data)) {
      const envList = container.env
      if (!Array.isArray(envList)) {
        continue
      }

      const envItemsByName: Record<string, Record<string, unknown>> = {}
      for (const envItem of envList) {
        if (!isRecord(envItem)) {
          continue
        }
        const envName = envItem.name
        if (typeof envName === 'string' && !(envName in envItemsByName)) {
          envItemsByName[envName] = envItem
        }
      }

      for (const envItem of envList) {
        if (!isRecord(envItem)) {
          continue
        }
        const envName = envItem.name
        if (typeof envName !== 'string') {
          continue
        }

        const expectedKey = inferDbConnectionField(envName)
        if (expectedKey === null) {
          continue
        }

        const secretRef = extractSecretRef(envItem)
        if (secretRef === null) {
          if (isAllowedRedisServiceEnv(envName, expectedKey, envItem, envItemsByName)) {
            continue
          }
          if (isAllowedMongodbServiceEnv(envName, expectedKey, envItem, envItemsByName)) {
            continue
          }
          if (
            expectedKey === 'endpoint' &&
            isComposedMongodbEndpointFromService(envItem, envItemsByName)
          ) {
            continue
          }
          if (
            expectedKey === 'endpoint' &&
            isComposedDbEndpointFromSecret(envItem, envItemsByName)
          ) {
            continue
          }
          if (expectedKey === 'host' && isComposedDbHostFromSecret(envItem, envItemsByName)) {
            continue
          }
          const line = findLine(doc, `^\\s*-\\s*name\\s*:\\s*${escapeRegExp(envName)}\\s*$`)
          violations.push({
            ruleId: 'R017',
            path: doc.path,
            line,
            message:
              'database connection env fields (endpoint/host/port/username/password) ' +
              'must use valueFrom.secretKeyRef',
          })
          continue
        }

        const secretName = secretRef.name
        if (!isApprovedDbSecretName(secretName)) {
          // Let R007 report unapproved/invalid secret references.
          continue
        }

        const secretKey = secretRef.key
        if (secretKey !== expectedKey) {
          const line = findLine(doc, `^\\s*-\\s*name\\s*:\\s*${escapeRegExp(envName)}\\s*$`)
          violations.push({
            ruleId: 'R017',
            path: doc.path,
            line,
            message:
              `database env '${envName}' must use secret key '${expectedKey}' ` +
              'from an approved database secret',
          })
        }
      }
    }
  }

  return violations
}

export const SECURITY_RULES: Record<string, Rule> = {
  R007: { ruleId: 'R007', check: checkBusinessEnvSecretPolicy },
  R017: { ruleId: 'R017', check: checkDbConnectionEnvSecretRequirements },
}
