/**
 * Shared data models and constants for docker-to-sealos consistency checks.
 */

export const LATEST_IMAGE_PATTERN =
  /\b(?:image|originImageName)\s*:\s*['"]?[^#\s'"]*:latest\b/

export const TEMPLATE_NAME_PATTERN = /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/

export const NEGATIVE_MARKERS = ['wrong example', '❌', 'invalid example'] as const

export const WORKLOAD_KINDS = new Set([
  'Deployment',
  'StatefulSet',
  'DaemonSet',
  'Job',
  'CronJob',
])

export const APP_WORKLOAD_KINDS = new Set(['Deployment', 'StatefulSet', 'DaemonSet'])

export const TEMPLATE_DEPLOY_KEY = 'cloud.sealos.io/deploy-on-sealos'

export const DB_SECRET_SUFFIXES = [
  '-pg-conn-credential',
  '-mysql-conn-credential',
  '-mongodb-account-root',
  '-mongo-mongodb-account-root',
  '-mongodb-mongodb-account-root',
  '-redis-redis-account-default',
  '-redis-account-default',
  '-broker-account-admin',
] as const

export const MAX_PVC_STORAGE_BYTES = 1024 ** 3 // 1Gi

export const SEALOS_CPU_REQUEST_BY_LIMIT: Record<string, string> = {
  '100m': '10m',
  '200m': '20m',
  '500m': '50m',
  '1': '100m',
  '2': '200m',
  '3': '300m',
  '4': '400m',
  '8': '800m',
}

export const SEALOS_MEMORY_REQUEST_BY_LIMIT: Record<string, string> = {
  '128Mi': '12Mi',
  '256Mi': '25Mi',
  '512Mi': '51Mi',
  '1024Mi': '102Mi',
  '2048Mi': '204Mi',
  '4096Mi': '409Mi',
  '8192Mi': '819Mi',
  '16384Mi': '1638Mi',
}

export const DB_COMPONENT_RESOURCE_LIMITS = { cpu: '500m', memory: '512Mi' }
export const DB_COMPONENT_RESOURCE_REQUESTS = { cpu: '50m', memory: '51Mi' }

export const STORAGE_UNIT_TO_BYTES: Record<string, number> = {
  '': 1,
  k: 1000,
  m: 1000 ** 2,
  g: 1000 ** 3,
  t: 1000 ** 4,
  p: 1000 ** 5,
  e: 1000 ** 6,
  ki: 1024,
  mi: 1024 ** 2,
  gi: 1024 ** 3,
  ti: 1024 ** 4,
  pi: 1024 ** 5,
  ei: 1024 ** 6,
}

export const DEFAULT_SEVERITY = 'error'
export const ALLOWED_SEVERITIES = new Set(['error', 'warning'])

export type LineLocator = {
  startLine: number
  lines: readonly string[]
  find: (pattern: string, defaultLine?: number | null) => number
}

export type YamlBlock = {
  path: string
  startLine: number
  source: string
  skipChecks: boolean
}

export type YamlDocument = {
  path: string
  startLine: number
  source: string
  data: unknown
  skipChecks: boolean
  lineLocator: LineLocator
}

export type Violation = {
  ruleId: string
  path: string
  line: number
  message: string
  severity?: string
}

export type CheckFunction = (context: ScanContext) => Violation[]

export type Rule = {
  ruleId: string
  check: CheckFunction
}

export type RegistryRuleConfig = {
  ruleId: string
  description: string
  severity: string
  includePaths: readonly string[]
}

export type RegistryConfig = {
  includePaths: string[]
  rules: Record<string, RegistryRuleConfig>
  orderedRuleIds: string[]
}

export type ScanContext = {
  skillPath: string
  referencesDir: string
  scannedPaths: string[]
  fileTexts: Record<string, string>
  yamlDocuments: YamlDocument[]
  /** Backward-compatible alias for pre-refactor callers. */
  readonly markdownPaths: string[]
}

export function createScanContext(input: {
  skillPath: string
  referencesDir: string
  scannedPaths: string[]
  fileTexts: Record<string, string>
  yamlDocuments: YamlDocument[]
}): ScanContext {
  return {
    ...input,
    get markdownPaths() {
      return this.scannedPaths
    },
  }
}
