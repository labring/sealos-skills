/**
 * Application-centric consistency rules.
 */

import { basename, dirname, extname } from 'node:path'
import { isIP } from 'node:net'
import {
  LATEST_IMAGE_PATTERN,
  TEMPLATE_NAME_PATTERN,
  type Rule,
  type ScanContext,
  type Violation,
  type YamlDocument,
} from './check-consistency-models.ts'
import {
  addDocViolation,
  checkManagedWorkloadSetting,
} from './check-consistency-helpers-violations.ts'
import {
  getTemplateSpec,
  hasManagedWorkloadMarker,
  isAppWorkloadDocument,
  isManagedAppWorkloadDocument,
  iterContainers,
  iterDocumentsByKind,
  iterWorkloadSecretRefs,
} from './check-consistency-helpers-workload.ts'
import { findLine } from './check-consistency-parser.ts'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pathSuffix(filePath: string): string {
  return extname(filePath)
}

function pathName(filePath: string): string {
  return basename(filePath)
}

function pathParts(filePath: string): string[] {
  return filePath.split(/[\\/]/).filter((p) => p.length > 0)
}

function unquotePlus(value: string): string {
  return decodeURIComponent(value.replace(/\+/g, ' '))
}

function urlsplit(value: string): {
  scheme: string
  netloc: string
  path: string
  query: string
  fragment: string
  hostname: string | null
} {
  try {
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) && !value.startsWith('//')) {
      const hashParts = value.split('#', 2)
      const noHash = hashParts[0] ?? ''
      const fragment = hashParts.length > 1 ? (hashParts[1] ?? '') : ''
      const qParts = noHash.split('?', 2)
      return {
        scheme: '',
        netloc: '',
        path: qParts[0] ?? '',
        query: qParts.length > 1 ? (qParts[1] ?? '') : '',
        fragment,
        hostname: null,
      }
    }
    const url = new URL(value)
    return {
      scheme: url.protocol.replace(/:$/, ''),
      netloc: url.host,
      path: url.pathname,
      query: url.search.startsWith('?') ? url.search.slice(1) : url.search,
      fragment: url.hash.startsWith('#') ? url.hash.slice(1) : url.hash,
      hostname: url.hostname || null,
    }
  } catch {
    return { scheme: '', netloc: '', path: value, query: '', fragment: '', hostname: null }
  }
}

class Counter<T extends string | number> {
  private readonly map = new Map<T, number>()
  constructor(iterable?: Iterable<T>) {
    if (iterable) {
      for (const item of iterable) this.increment(item)
    }
  }
  increment(item: T, n = 1): void {
    this.map.set(item, (this.map.get(item) ?? 0) + n)
  }
  add(item: T, n = 1): void {
    this.increment(item, n)
  }
  get(item: T): number {
    return this.map.get(item) ?? 0
  }
  keys(): IterableIterator<T> {
    return this.map.keys()
  }
  values(): IterableIterator<number> {
    return this.map.values()
  }
  entries(): IterableIterator<[T, number]> {
    return this.map.entries()
  }
  [Symbol.iterator](): IterableIterator<[T, number]> {
    return this.map.entries()
  }
}

function contains(left: unknown, right: unknown): boolean {
  if (typeof right === 'string') return right.includes(String(left))
  if (right instanceof Set) return right.has(left as never)
  if (Array.isArray(right)) return right.includes(left as never)
  if (isRecord(right)) return Object.prototype.hasOwnProperty.call(right, String(left))
  return false
}

/** Python str.splitlines()-compatible splitter. */
function splitLines(text: string): string[] {
  if (text.length === 0) return []
  const parts = text.split(/\r\n|\r|\n/)
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop()
  return parts
}

/** Iterate like Python: arrays/sets as values, plain objects as keys. */
function asIterable(value: unknown): Iterable<any> {
  if (value == null) return []
  if (typeof value === 'string') return value as any
  if (typeof (value as any)[Symbol.iterator] === 'function') return value as Iterable<any>
  if (typeof value === 'object') return Object.keys(value as object)
  return []
}

function isSubset(left: Set<unknown>, right: Set<unknown> | Iterable<unknown>): boolean {
  const r = right instanceof Set ? right : new Set(right)
  for (const item of left) {
    if (!r.has(item)) return false
  }
  return true
}

function setIntersection<T>(a: Set<T>, b: Set<T> | Iterable<T>): Set<T> {
  const other = b instanceof Set ? b : new Set(b)
  const out = new Set<T>()
  for (const item of a) {
    if (other.has(item)) out.add(item)
  }
  return out
}

/** Runtime stand-ins for Python type objects used in TEMPLATE_REQUIRED_SPEC_FIELDS. */
const pyStr = String
const pyDict = Object
const pyList = Array

const TEMPLATE_ARTIFACT_SUFFIXES = new Set([".yaml", ".yml"])
const TEMPLATE_REQUIRED_SPEC_FIELDS = { title: pyStr, url: pyStr, gitRepo: pyStr, author: pyStr, description: pyStr, icon: pyStr, templateType: pyStr, locale: pyStr, i18n: pyDict, categories: pyList }
const FLOATING_TAG_ALIASES = new Set(["latest", "stable", "main", "master", "edge", "nightly", "dev"])
const FLOATING_NUMERIC_TAG_RE = new RegExp("^v?\\d+(?:\\.\\d+)?$")
const COMPOSE_VAR_IN_IMAGE_RE = new RegExp("\\$(?:\\{[^}]+\\}|[A-Za-z_][A-Za-z0-9_]*)")
const ZH_CHAR_RE = new RegExp("[\\u3400-\\u4DBF\\u4E00-\\u9FFF]")
const ALLOWED_TEMPLATE_CATEGORIES = new Set(["tool", "ai", "game", "database", "low-code", "monitor", "dev-ops", "blog", "storage", "frontend", "backend"])
const TEMPLATE_README_BASE = "https://raw.githubusercontent.com/labring-actions/templates/kb-0.9/template"
const HTTP_INGRESS_REQUIRED_ANNOTATIONS: Record<string, string> = { "kubernetes.io/ingress.class": "nginx", "nginx.ingress.kubernetes.io/proxy-body-size": "32m", "nginx.ingress.kubernetes.io/server-snippet": "client_header_buffer_size 64k;\nlarge_client_header_buffers 4 128k;", "nginx.ingress.kubernetes.io/ssl-redirect": "true", "nginx.ingress.kubernetes.io/backend-protocol": "HTTP", "nginx.ingress.kubernetes.io/client-body-buffer-size": "64k", "nginx.ingress.kubernetes.io/proxy-buffer-size": "64k", "nginx.ingress.kubernetes.io/proxy-send-timeout": "300", "nginx.ingress.kubernetes.io/proxy-read-timeout": "300", "nginx.ingress.kubernetes.io/configuration-snippet": "if ($request_uri ~* \\.(js|css|gif|jpe?g|png)) {\n  expires 30d;\n  add_header Cache-Control \"public\";\n}" }
const WEBSOCKET_INGRESS_REQUIRED_ANNOTATIONS: Record<string, string> = { "kubernetes.io/ingress.class": "nginx", "nginx.ingress.kubernetes.io/proxy-body-size": "32m", "nginx.ingress.kubernetes.io/proxy-read-timeout": "3600", "nginx.ingress.kubernetes.io/proxy-send-timeout": "3600", "nginx.ingress.kubernetes.io/backend-protocol": "WS", "nginx.ingress.kubernetes.io/ssl-redirect": "true" }
const WEBSOCKET_PORT_NAME_TOKENS = new Set(["websocket", "ws", "wss"])
const CRONJOB_LABEL_KEY = "cloud.sealos.io/cronjob"
const CRONJOB_REQUIRED_LABELS: Record<string, string> = { "cronjob-launchpad-name": "", "cronjob-type": "image" }
const POSTGRES_URL_DATABASE_RE = new RegExp("postgres(?:ql)?://[^/\\s]+/([^?\\s'\\\";]+)")
const DEFAULT_POSTGRES_DATABASE_NAMES = new Set(["postgres", "template0", "template1"])
const DATABASE_WORKLOAD_IMAGE_NAMES = new Set(["apecloud-mysql", "kafka", "mariadb", "mongo", "mongodb", "mysql", "percona", "postgis", "postgres", "postgresql", "redis", "timescaledb", "valkey"])
const DATABASE_RAW_WORKLOAD_KINDS = new Set(["Deployment", "StatefulSet", "DaemonSet", "Job", "CronJob"])
const DATABASE_RAW_RESOURCE_KINDS = new Set([...DATABASE_RAW_WORKLOAD_KINDS, ...new Set(["Service"])])
const DATABASE_CLIENT_JOB_TOKENS = new Set(["init", "migrate", "migration", "bootstrap", "setup", "seed", "backup", "restore"])
const DATABASE_RESOURCE_NAME_TOKENS = new Set(["postgres", "postgresql", "mysql", "mariadb", "mongo", "mongodb", "redis", "kafka"])
const OFFICIAL_HEALTH_HTTP_EXPECTATIONS: Record<string, Record<string, unknown>> = { "goauthentik/server": { liveness_path: "/-/health/live/", readiness_path: "/-/health/ready/", startup_path: "/-/health/ready/", port: 9000 }, "ghcr.io/danny-avila/librechat-rag-api-dev-lite": { liveness_path: "/health", readiness_path: "/health", startup_path: "/health", port: 8000 }, "ghcr.io/clickhouse/librechat-admin-panel": { liveness_path: "/health", readiness_path: "/health", startup_path: "/health", port: 3000 } }
const OFFICIAL_HEALTH_WORKER_EXEC_EXPECTATIONS: Record<string, Record<string, string>> = { "goauthentik/server": { liveness_command: "ak healthcheck", readiness_command: "ak healthcheck", startup_command: "ak healthcheck" } }
const RUNTIME_ENV_VALUE_CONSTRAINTS: Record<string, Record<string, Record<string, unknown>>> = { "ghcr.io/danny-avila/librechat": { CREDS_KEY: { format: "hex", length: 64 }, CREDS_IV: { format: "hex", length: 32 } } }
const RUNTIME_CREDENTIAL_REQUIREMENTS: Record<string, Array<Record<string, unknown>>> = { "ghcr.io/danny-avila/librechat-rag-api-dev-lite": [{ provider_env: "EMBEDDINGS_PROVIDER", provider_value: "openai", credential_envs: ["RAG_OPENAI_API_KEY", "OPENAI_API_KEY"] }] }
const RUNTIME_STARTUP_GATE_EXPECTATIONS: Record<string, Record<string, Array<string>>> = { "ghcr.io/danny-avila/librechat-rag-api-dev-lite": { required_tokens: ["pg_isready"], required_any_tokens: ["vector", "pg_extension", "to_regtype"] } }
const KNOWN_PUBLIC_IMAGE_REPOSITORIES = new Set(["nginx", "docker.io/library/nginx", "ghcr.io/clickhouse/librechat-admin-panel", "ghcr.io/danny-avila/librechat", "ghcr.io/danny-avila/librechat-rag-api-dev-lite"])
const TEMPLATE_DEFAULT_REF_RE = new RegExp("^\\$\\{\\{\\s*defaults\\.([A-Za-z_][A-Za-z0-9_]*)\\s*\\}\\}$")
const TEMPLATE_INPUT_FULL_REF_RE = new RegExp("^\\$\\{\\{\\s*inputs\\.([A-Za-z_][A-Za-z0-9_]*)\\s*\\}\\}$")
const HEX_VALUE_RE = new RegExp("^[0-9a-fA-F]+$")
const MAIN_CONTAINER_BOOTSTRAP_RE = new RegExp("\\b(?:cp|rsync|chmod|chown|psql|createdb|dropdb|mysql|mongosh|redis-cli|sed|awk|envsubst|openssl|useradd|groupadd|apk|apt-get|yum|dnf|pip|npm|pnpm|yarn)\\b")
const MAIN_CONTAINER_ALLOWED_SHORT_SETUP_RE = new RegExp("^\\s*mkdir\\s+-p\\s+[-./A-Za-z0-9_ ]+\\s+&&\\s+exec\\s+\\S+")
const MAIN_CONTAINER_SHELLS = new Set(["sh", "/bin/sh", "bash", "/bin/bash", "ash", "/bin/ash"])
const MAIN_CONTAINER_MAX_SCRIPT_CHARS = 160
const MAIN_CONTAINER_MAX_SCRIPT_COMMANDS = 2
const CONFIGMAP_DATA_KEY_RE = new RegExp("^vn-[a-z0-9]+(?:vn-[a-z0-9]+)*$")
const OBJECT_STORAGE_INPUT_TEXT_RE = new RegExp("\\b(?:object\\s*storage|objectstorage|s3|s3-compatible|bucket|binary\\s+data|external\\s+storage)\\b")
const LICENSE_GATED_TEXT_RE = new RegExp("\\b(?:enterprise|paid|commercial|premium|subscription|license|licensed|licence|licenced)\\b")
const OBJECT_STORAGE_BRANCH_MARKER_RE = new RegExp("(?:\\bObjectStorageBucket\\b|\\bobject-storage-key\\b|\\bobject\\s+storage\\b|\\bs3[_-]|\\bs3\\b|\\baws_access_key_id\\b|\\baws_secret_access_key\\b|\\bstorage_s3\\b|\\bs3-compatible\\b|\\bbucket(?:_name)?\\b|\\bminio\\b)")
const OBJECT_STORAGE_WIRING_BRANCH_MARKER_RE = new RegExp("(?:\\bkind\\s*:\\s*secret\\b|\\bsecretkeyref\\b|\\b(?:aws_access_key_id|aws_secret_access_key)\\b|\\b(?:s3|object[_-]?storage|minio|bucket)[_-]?(?:access|secret|endpoint|bucket|key|credential|region|url)\\b|\\b(?:initcontainer|init-container)\\b)")
const OBJECT_STORAGE_PROVIDER_VALUE_RE = new RegExp("\\b(?:s3|s3 compatible|object storage|minio|sealos objectstorage|sealos object storage|aws s3|external s3)\\b")
const OBJECT_STORAGE_PROVIDER_DECISION_VALUE_RE = new RegExp("\\b(?:aws\\s+s3|sealos\\s+object\\s*storage|managed\\s+(?:s3|object\\s*storage)|bundled\\s+minio)\\b")
const OBJECT_STORAGE_INPUT_TEXT_MAX_ITEMS = 32
const OBJECT_STORAGE_INPUT_TEXT_MAX_VALUE_CHARS = 512
const OBJECT_STORAGE_INPUT_TEXT_MAX_CHARS = 4096
const OBJECT_STORAGE_UNSAFE_INPUT_MARKER = "object storage provider"
const OBJECT_STORAGE_SELECTOR_TOKENS = new Set(["PROVIDER", "BACKEND", "TYPE", "MODE", "DRIVER"])
const OBJECT_STORAGE_PROVIDER_DECISION_TOKENS = new Set(["USE", "ENABLE", "ENABLED", "DISABLE", "DISABLED"])
const OBJECT_STORAGE_CONFIG_TOKENS = new Set(["ACCESS", "BUCKET", "CAPACITY", "CLASS", "DOMAIN", "ENDPOINT", "KEY", "PASSWORD", "POLICY", "REGION", "SECURE", "SECRET", "SIZE", "SSL", "TLS", "URL", "USER", "USERNAME"])
const OBJECT_STORAGE_PROXY_ROLE_TOKENS = new Set(["ADAPTER", "COMPAT", "COMPATIBILITY", "GATEWAY", "PROXY"])
const OBJECT_STORAGE_PROXY_HELPER_TOKENS = new Set(["CHECK", "INIT", "PROBE", "WAIT"])
const PERSISTENT_VOLUME_SOURCE_KEYS = new Set(["awsElasticBlockStore", "azureDisk", "azureFile", "cephfs", "cinder", "csi", "fc", "flexVolume", "flocker", "gcePersistentDisk", "glusterfs", "hostPath", "iscsi", "nfs", "persistentVolumeClaim", "photonPersistentDisk", "portworxVolume", "quobyte", "rbd", "scaleIO", "storageos", "vsphereVolume"])
const MINIO_SERVER_IMAGE_RE = new RegExp("(?:^|/)(?:minio/minio|bitnami(?:legacy)?/minio)(?::|@|$)")
const EXTERNAL_OBJECT_STORAGE_SOURCE_ANNOTATION = "docker-to-sealos.external-object-storage-source"
const OBJECT_STORAGE_COMPATIBILITY_PROXY_SOURCE_ANNOTATION = "docker-to-sealos.object-storage-compatibility-proxy-source"
const OBJECT_STORAGE_USER_REQUEST_EVIDENCE_RE = new RegExp("user-request:[A-Za-z0-9][A-Za-z0-9._/-]*")
const OBJECT_STORAGE_SOURCE_EVIDENCE_MAX_CHARS = 2048
const OBJECT_STORAGE_SOURCE_SENSITIVE_QUERY_TOKENS = new Set(["access", "auth", "authorization", "apikey", "credential", "key", "password", "secret", "sig", "signature", "token"])
const AWS_OBJECT_STORAGE_INPUT_RE = new RegExp("^AWS_(?:ACCESS_KEY(?:_ID)?|SECRET(?:_ACCESS)?_KEY|SESSION_TOKEN|ENDPOINT(?:_URL)?(?:_S3)?|REGION|DEFAULT_REGION|S3_BUCKET(?:_NAME)?|BUCKET(?:_NAME)?)$")
const AWS_OBJECT_STORAGE_CONTEXT_RE = new RegExp("\\b(?:s3|object\\s*storage|minio|external\\s*storage)\\b")
const EXTERNAL_OBJECT_STORAGE_DESCRIPTION_RE = new RegExp("\\b(?:s3|object\\s*storage|minio)\\b")
const EXTERNAL_OBJECT_STORAGE_CONFIG_TOKENS = new Set(["BUCKET", "CREDENTIAL", "CREDENTIALS", "ENDPOINT", "KEY", "PASSWORD", "REGION", "SECRET", "TOKEN", "URL", "USER", "USERNAME"])
const MANAGED_OBJECT_STORAGE_TOGGLE_NAMES = new Set(["ENABLE_OBJECT_STORAGE", "ENABLE_S3_STORAGE", "ENABLE_SEALOS_OBJECT_STORAGE", "ENABLE_SEALOS_OBJECTSTORAGE", "ENABLE_S3", "USE_OBJECT_STORAGE", "USE_MANAGED_OBJECT_STORAGE", "USE_MANAGED_S3", "USE_SEALOS_OBJECT_STORAGE", "USE_SEALOS_OBJECTSTORAGE", "USE_SEALOS_S3"])
const TEMPLATE_IF_RE = new RegExp("\\$\\{\\{\\s*if\\s*\\((.*?)\\)\\s*\\}\\}")
const TEMPLATE_ELSE_RE = new RegExp("\\$\\{\\{\\s*else\\(\\)\\s*\\}\\}")
const TEMPLATE_ENDIF_RE = new RegExp("\\$\\{\\{\\s*endif\\(\\)\\s*\\}\\}")
const TEMPLATE_INPUT_REF_RE = new RegExp("\\binputs\\.([A-Za-z_][A-Za-z0-9_]*)\\b")
const TEMPLATE_EXPRESSION_RE = new RegExp("\\$\\{\\{(.*?)\\}\\}")
const TEMPLATE_CONTROL_DIRECTIVE_RE = new RegExp("\\$\\{\\{\\s*(?:if\\s*\\(|elif\\s*\\(|else\\s*\\(\\s*\\)|endif\\s*\\(\\s*\\))")
const TEMPLATE_SCOPED_REF_RE = new RegExp("\\b(defaults|inputs)\\s*[.\\[]")
const TEMPLATE_KIND_LINE_RE = new RegExp("^\\s*kind\\s*:\\s*['\"]?Template['\"]?\\s*$", "m")
const RUNTIME_BUNDLE_EVIDENCE_KIND = "RuntimeBundleEvidence"
const RUNTIME_SECRET_CONTRACT_ANNOTATION = "docker-to-sealos.runtime-secret-contract"
const DATABASE_MODE_ANNOTATION = "docker-to-sealos.database-mode"
const RUNTIME_BUNDLE_SOURCE_FIELD = "source"
const RUNTIME_BUNDLE_IMAGES_FIELD = "images"
const RUNTIME_BUNDLE_COMPONENTS_FIELD = "components"
const RUNTIME_BUNDLE_ROUTES_FIELD = "routes"
const RUNTIME_BUNDLE_ENVS_FIELD = "env"
const TOPOLOGY_EVIDENCE_KIND = "TopologyEvidence"
const TOPOLOGY_EVIDENCE_DIR = "topology-evidence"
const TOPOLOGY_RESOURCE_KINDS = new Set(["Deployment", "StatefulSet", "DaemonSet", "CronJob", "Cluster", "ObjectStorageBucket"])
const TOPOLOGY_REPLICA_KINDS = new Set(["Deployment", "StatefulSet"])
function *_iterTemplateArtifactDocuments(context: ScanContext): Generator<Iterable, void, unknown> {
  for (const doc of asIterable(iterDocumentsByKind(context, "Template"))) {
    if (contains(String(pathSuffix(doc.path)).toLowerCase(), TEMPLATE_ARTIFACT_SUFFIXES)) {
      yield doc
    }
  }
}

function *_iterTemplateArtifactPaths(context: ScanContext): Generator<string, void, unknown> {
  for (const path of asIterable([...asIterable(context.fileTexts)].sort())) {
    if ((!contains(String(pathSuffix(path)).toLowerCase(), TEMPLATE_ARTIFACT_SUFFIXES))) {
      continue
    }
    if ((pathName(path) !== "index.yaml")) {
      continue
    }
    yield path
  }
}

function _lineNumberForOffset(text: string, offset: number): number {
  return (((String(text).match(new RegExp(escapeRegExp(String("\n")), 'g')) || []).length) + 1)
}

function _metadataAnnotations(data: Record<string, unknown>): Record<string, unknown> {
  let metadata = ((data as any)?.["metadata"])
  let annotations = (isRecord(metadata) ? ((metadata as any)?.["annotations"]) : null)
  return (isRecord(annotations) ? annotations : {  })
}

function _splitRuntimeBundleValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    let raw = (Array.from(value as any).filter((item) => ((item !== null))).map((item) => (String(item))) as any).join("\n")
  } else if ((value === null)) {
    raw = ""
  } else {
    raw = String(value)
  }
  return Array.from(String(raw).split(new RegExp("[\\n,]+", "")) as any).filter((item) => (String(item).trim())).map((item) => (String(item).trim()))
}

function _parseRuntimeBundleRouteString(value: string): [string, string] {
  if (contains("->", value)) {
    let [path, service] = ((() => { const __s = String(value); const __m = 1; if (__m < 0) return __s.split("->"); const __parts: string[] = []; let __rest = __s; for (let __i = 0; __i < __m; __i++) { const __idx = __rest.indexOf("->"); if (__idx < 0) break; __parts.push(__rest.slice(0, __idx)); __rest = __rest.slice(__idx + String("->").length) } __parts.push(__rest); return __parts })())
  } else if (contains("=", value)) {
    [path, service] = ((() => { const __s = String(value); const __m = 1; if (__m < 0) return __s.split("="); const __parts: string[] = []; let __rest = __s; for (let __i = 0; __i < __m; __i++) { const __idx = __rest.indexOf("="); if (__idx < 0) break; __parts.push(__rest.slice(0, __idx)); __rest = __rest.slice(__idx + String("=").length) } __parts.push(__rest); return __parts })())
  } else {
    [path, service] = [value, ""]
  }
  return [String(path).trim(), String(service).trim()]
}

function _parseRuntimeBundleRoutes(value: unknown): [string, string][] {
  let routes: [string, string][] = []
  if (Array.isArray(value)) {
    for (const item of asIterable(value)) {
      if (isRecord(item)) {
        let path = ((item as any)?.["path"])
        let service = ((item as any)?.["service"])
        routes.push([((typeof path === "string") ? String(path).trim() : ""), ((typeof service === "string") ? String(service).trim() : "")])
        continue
      }
      routes.push(_parseRuntimeBundleRouteString(String(item)))
    }
    return routes
  }
  for (const item of asIterable(_splitRuntimeBundleValues(value))) {
    routes.push(_parseRuntimeBundleRouteString(item))
  }
  return routes
}

function *_iterRuntimeBundleEvidenceDocuments(context: ScanContext): Generator<YamlDocument, void, unknown> {
  for (const doc of asIterable(iterDocumentsByKind(context, RUNTIME_BUNDLE_EVIDENCE_KIND))) {
    if (contains(String(pathSuffix(doc.path)).toLowerCase(), TEMPLATE_ARTIFACT_SUFFIXES)) {
      yield doc
    }
  }
}

function _runtimeBundleSpec(doc: YamlDocument): Record<string, unknown> {
  let data = doc.data
  let spec = (isRecord(data) ? ((data as any)?.["spec"]) : null)
  return (isRecord(spec) ? spec : {  })
}

function _templateArtifactsByName(context: ScanContext): Record<string, YamlDocument> {
  let templates: Record<string, YamlDocument> = {  }
  for (const doc of asIterable(_iterTemplateArtifactDocuments(context))) {
    if ((!isRecord(doc.data))) {
      continue
    }
    let name = _metadataName(doc.data)
    if (name) {
      templates[name] = doc
    }
  }
  return templates
}

function *_iterIngressRoutes(data: Record<string, unknown>): Generator<[string, string], void, unknown> {
  let spec = ((data as any)?.["spec"])
  let rules = (isRecord(spec) ? ((spec as any)?.["rules"]) : null)
  if ((!Array.isArray(rules))) {
    return
  }
  for (const rule of asIterable(rules)) {
    let http = (isRecord(rule) ? ((rule as any)?.["http"]) : null)
    let paths = (isRecord(http) ? ((http as any)?.["paths"]) : null)
    if ((!Array.isArray(paths))) {
      continue
    }
    for (const pathEntry of asIterable(paths)) {
      if ((!isRecord(pathEntry))) {
        continue
      }
      let pathValue = ((pathEntry as any)?.["path"])
      let backend = ((pathEntry as any)?.["backend"])
      let service = (isRecord(backend) ? ((backend as any)?.["service"]) : null)
      let serviceName = (isRecord(service) ? ((service as any)?.["name"]) : null)
      if (((typeof pathValue === "string") && (typeof serviceName === "string"))) {
        let routesTuple = [String(pathValue).trim(), String(serviceName).trim()]
        if ((routesTuple[0] && routesTuple[1])) {
          yield routesTuple
        }
      }
    }
  }
}

function _collectRuntimeBundleState(context: ScanContext, artifactPath: string): Record<string, Set<unknown>> {
  let state = { images: new Set(), workloads: new Set(), services: new Set(), routes: new Set(), envs: new Set() }
  for (const doc of asIterable(context.yamlDocuments)) {
    if ((doc.skipChecks || (!isRecord(doc.data)))) {
      continue
    }
    if ((doc.path !== artifactPath)) {
      continue
    }
    if ((!contains(String(pathSuffix(doc.path)).toLowerCase(), TEMPLATE_ARTIFACT_SUFFIXES))) {
      continue
    }
    let kind = ((doc.data as any)?.["kind"])
    let name = _metadataName(doc.data)
    if (((kind === "Service") && name)) {
      state["services"].add(name)
    } else if ((kind === "Ingress")) {
      ((() => { const __o = state["routes"]; if (__o instanceof Set) { for (const __x of _iterIngressRoutes(doc.data) as any) __o.add(__x) } else { Object.assign(__o, _iterIngressRoutes(doc.data)) } })())
    }
    if (((!isAppWorkloadDocument(doc)) || (!hasManagedWorkloadMarker(doc.data)))) {
      continue
    }
    if (name) {
      state["workloads"].add(name)
    }
    let annotations = _metadataAnnotations(doc.data)
    let originImage = ((annotations as any)?.["originImageName"])
    if (((typeof originImage === "string") && String(originImage).trim())) {
      state["images"].add(String(originImage).trim())
    }
    for (const container of asIterable(iterContainers(doc.data))) {
      let image = ((container as any)?.["image"])
      if (((typeof image === "string") && String(image).trim())) {
        state["images"].add(String(image).trim())
      }
      let envList = ((container as any)?.["env"])
      if ((!Array.isArray(envList))) {
        continue
      }
      for (const envItem of asIterable(envList)) {
        if ((!isRecord(envItem))) {
          continue
        }
        let envName = ((envItem as any)?.["name"])
        if (((typeof envName === "string") && String(envName).trim())) {
          state["envs"].add(String(envName).trim())
        }
      }
    }
  }
  return state
}

function *_iterTopologyEvidenceDocuments(context: ScanContext): Generator<YamlDocument, void, unknown> {
  for (const doc of asIterable(iterDocumentsByKind(context, TOPOLOGY_EVIDENCE_KIND))) {
    if (contains(String(pathSuffix(doc.path)).toLowerCase(), TEMPLATE_ARTIFACT_SUFFIXES)) {
      yield doc
    }
  }
}

function _normalizeTopologyWhen(value: string): string {
  return String(String(value).trim()).replace(new RegExp("\\s+", 'g'), " " as any)
}

function _topologyConditionsByLine(text: string): Record<number, Array<string>> {
  let active: string[] = []
  let conditions: Record<number, Array<string>> = {  }
  for (const [lineNumber, line] of asIterable(Array.from(splitLines(String(text)) as any, (v: any, i: number) => [i + (0), v] as const))) {
    let match = TEMPLATE_IF_RE.exec(String(line))
    if ((match !== null)) {
      active.push(_normalizeTopologyWhen((match as RegExpMatchArray)[1]))
    }
    conditions[lineNumber] = tuple(active)
    if ((TEMPLATE_ENDIF_RE.exec(String(line)) && active)) {
      active.pop()
    }
  }
  return conditions
}

function _topologyWhenForDocument(doc: YamlDocument, conditionsByLine: Record<number, Array<string>>): string {
  let apiLine = doc.startLine
  for (const [offset, line] of asIterable(Array.from(splitLines(String(doc.source)) as any, (v: any, i: number) => [i + (0), v] as const))) {
    if (new RegExp('^(?:' + ("^\\s*apiVersion\\s*:") + ')', "").exec(String(line))) {
      apiLine = (doc.startLine + offset)
      break
    }
  }
  let active = ((conditionsByLine as any)?.[apiLine] ?? [])
  return (active ? (active as any).join(" && ") : "always")
}

function _isKubeblocksCluster(data: Record<string, unknown>): boolean {
  let apiVersion = ((data as any)?.["apiVersion"])
  return ((((data as any)?.["kind"]) === "Cluster") && (typeof apiVersion === "string") && String(apiVersion).startsWith("apps.kubeblocks.io/"))
}

function _topologyClusterComponents(data: Record<string, unknown>): Array<[string, number]> | null {
  let spec = ((data as any)?.["spec"])
  let componentSpecs = (isRecord(spec) ? ((spec as any)?.["componentSpecs"]) : null)
  if (((!Array.isArray(componentSpecs)) || (!componentSpecs))) {
    return null
  }
  let components: Record<string, number> = {  }
  for (const component of asIterable(componentSpecs)) {
    if ((!isRecord(component))) {
      return null
    }
    let name = ((component as any)?.["name"])
    let replicas = ((component as any)?.["replicas"])
    if (((!(typeof name === "string")) || (!String(name).trim()) || (typeof replicas === "boolean") || (!(typeof replicas === "number" && Number.isInteger(replicas))) || (replicas < 1) || contains(String(name).trim(), components))) {
      return null
    }
    components[String(name).trim()] = replicas
  }
  return tuple([...asIterable(Object.entries(components as any))].sort())
}

function _topologyRecordLabel(record: [string, string, string, number | null, Array<[string, number]>]): string {
  let [kind, name, when, replicas, components] = record
  let details = [`${kind}/${name}`, `when=${when}`]
  if ((replicas !== null)) {
    details.push(`replicas=${replicas}`)
  }
  if (components) {
    let rendered = (Array.from(components as any).map(([component, count]) => (`${component}=${count}`)) as any).join(",")
    details.push(`components=${rendered}`)
  }
  return (details as any).join(" ")
}

function _collectTopologyRecords(context: ScanContext, artifactPath: string, violations: Violation[]): [[string, string, string, number | null, Array<[string, number]>][], Record<[string, string, string, number | null, Array<[string, number]>], YamlDocument>] {
  let text = ((context.fileTexts as any)?.[artifactPath] ?? "")
  let conditionsByLine = _topologyConditionsByLine(text)
  let records: [string, string, string, number | null, Array<[string, number]>][] = []
  let docsByRecord: Record<[string, string, string, number | null, Array<[string, number]>], YamlDocument> = {  }
  for (const doc of asIterable(context.yamlDocuments)) {
    if ((doc.skipChecks || (doc.path !== artifactPath) || (!isRecord(doc.data)))) {
      continue
    }
    let kind = ((doc.data as any)?.["kind"])
    if ((!contains(kind, TOPOLOGY_RESOURCE_KINDS))) {
      continue
    }
    if (((kind === "Cluster") && (!_isKubeblocksCluster(doc.data)))) {
      continue
    }
    let name = _metadataName(doc.data)
    if ((!name)) {
      addDocViolation(violations, { ruleId: "R050", doc: doc, pattern: "^\\s*metadata\\s*:", defaultPattern: "^\\s*kind\\s*:", message: "topology-bearing resources must define metadata.name" })
      continue
    }
    let replicas: number | null = null
    if (contains(kind, TOPOLOGY_REPLICA_KINDS)) {
      let spec = ((doc.data as any)?.["spec"])
      let rawReplicas = (isRecord(spec) ? ((spec as any)?.["replicas"] ?? 1) : 1)
      if (((typeof rawReplicas === "boolean") || (!(typeof rawReplicas === "number" && Number.isInteger(rawReplicas))) || (rawReplicas < 1))) {
        addDocViolation(violations, { ruleId: "R050", doc: doc, pattern: "^\\s*replicas\\s*:", defaultPattern: "^\\s*spec\\s*:", message: "Deployment and StatefulSet spec.replicas must be a positive integer" })
      } else {
        replicas = rawReplicas
      }
    }
    let components: Array<[string, number]> = []
    if ((kind === "Cluster")) {
      let parsedComponents = _topologyClusterComponents(doc.data)
      if ((parsedComponents === null)) {
        addDocViolation(violations, { ruleId: "R050", doc: doc, pattern: "^\\s*componentSpecs\\s*:", defaultPattern: "^\\s*spec\\s*:", message: "KubeBlocks Cluster topology requires non-empty componentSpecs with unique names and positive integer replicas" })
      } else {
        components = parsedComponents
      }
    }
    let record = [String(kind), name, _topologyWhenForDocument(doc, conditionsByLine), replicas, components]
    records.push(record)
    ((() => { const __o = docsByRecord as any; if (__o[record] === undefined) __o[record] = doc; return __o[record] })())
  }
  return [records, docsByRecord]
}

function _parseTopologyEvidenceResources(doc: YamlDocument, resources: unknown, violations: Violation[]): [string, string, string, number | null, Array<[string, number]>][] {
  if (((!Array.isArray(resources)) || (!resources))) {
    addDocViolation(violations, { ruleId: "R050", doc: doc, pattern: "^\\s*resources\\s*:", defaultPattern: "^\\s*spec\\s*:", message: "TopologyEvidence spec.resources must be a non-empty list" })
    return []
  }
  let records: [string, string, string, number | null, Array<[string, number]>][] = []
  for (const item of asIterable(resources)) {
    if ((!isRecord(item))) {
      addDocViolation(violations, { ruleId: "R050", doc: doc, pattern: "^\\s*resources\\s*:", message: "TopologyEvidence resources entries must be objects" })
      continue
    }
    let kind = ((item as any)?.["kind"])
    let name = ((item as any)?.["name"])
    let when = ((item as any)?.["when"])
    if ((!contains(kind, TOPOLOGY_RESOURCE_KINDS))) {
      addDocViolation(violations, { ruleId: "R050", doc: doc, pattern: "^\\s*kind\\s*:", defaultPattern: "^\\s*resources\\s*:", message: `TopologyEvidence resource kind must be one of ${[...asIterable(TOPOLOGY_RESOURCE_KINDS)].sort()}` })
      continue
    }
    if (((!(typeof name === "string")) || (!String(name).trim()))) {
      addDocViolation(violations, { ruleId: "R050", doc: doc, pattern: "^\\s*name\\s*:", defaultPattern: "^\\s*resources\\s*:", message: "TopologyEvidence resources entries must define a non-empty name" })
      continue
    }
    if (((!(typeof when === "string")) || (!String(when).trim()))) {
      addDocViolation(violations, { ruleId: "R050", doc: doc, pattern: "^\\s*when\\s*:", defaultPattern: "^\\s*resources\\s*:", message: "TopologyEvidence resources entries must define when as always or a template condition" })
      continue
    }
    let replicas: number | null = null
    let rawReplicas = ((item as any)?.["replicas"])
    if (contains(kind, TOPOLOGY_REPLICA_KINDS)) {
      if (((typeof rawReplicas === "boolean") || (!(typeof rawReplicas === "number" && Number.isInteger(rawReplicas))) || (rawReplicas < 1))) {
        addDocViolation(violations, { ruleId: "R050", doc: doc, pattern: "^\\s*replicas\\s*:", defaultPattern: "^\\s*resources\\s*:", message: "TopologyEvidence Deployment and StatefulSet entries require positive integer replicas" })
        continue
      }
      replicas = rawReplicas
    } else if ((rawReplicas !== null)) {
      addDocViolation(violations, { ruleId: "R050", doc: doc, pattern: "^\\s*replicas\\s*:", defaultPattern: "^\\s*resources\\s*:", message: `TopologyEvidence ${kind} entries do not use replicas` })
      continue
    }
    let components: Array<[string, number]> = []
    let rawComponents = ((item as any)?.["components"])
    if ((kind === "Cluster")) {
      if (((!Array.isArray(rawComponents)) || (!rawComponents))) {
        addDocViolation(violations, { ruleId: "R050", doc: doc, pattern: "^\\s*components\\s*:", defaultPattern: "^\\s*resources\\s*:", message: "TopologyEvidence Cluster entries require a non-empty components list" })
        continue
      }
      let parsedComponents: Record<string, number> = {  }
      let invalidComponent = false
      for (const component of asIterable(rawComponents)) {
        if ((!isRecord(component))) {
          invalidComponent = true
          break
        }
        let componentName = ((component as any)?.["name"])
        let componentReplicas = ((component as any)?.["replicas"])
        if (((!(typeof componentName === "string")) || (!String(componentName).trim()) || (typeof componentReplicas === "boolean") || (!(typeof componentReplicas === "number" && Number.isInteger(componentReplicas))) || (componentReplicas < 1) || contains(String(componentName).trim(), parsedComponents))) {
          invalidComponent = true
          break
        }
        parsedComponents[String(componentName).trim()] = componentReplicas
      }
      if (invalidComponent) {
        addDocViolation(violations, { ruleId: "R050", doc: doc, pattern: "^\\s*components\\s*:", defaultPattern: "^\\s*resources\\s*:", message: "TopologyEvidence Cluster components require unique non-empty names and positive integer replicas" })
        continue
      }
      components = tuple([...asIterable(Object.entries(parsedComponents as any))].sort())
    } else if ((rawComponents !== null)) {
      addDocViolation(violations, { ruleId: "R050", doc: doc, pattern: "^\\s*components\\s*:", defaultPattern: "^\\s*resources\\s*:", message: `TopologyEvidence ${kind} entries do not use components` })
      continue
    }
    records.push([String(kind), String(name).trim(), _normalizeTopologyWhen(when), replicas, components])
  }
  return records
}

function _isNonEmptyValue(value: unknown, expectedType: unknown): boolean {
  if ((expectedType === pyStr)) {
    return ((typeof value === "string") && Boolean(String(value).trim()))
  }
  if ((expectedType === pyDict)) {
    return (isRecord(value) && (((() => { const __v = value as any; if (__v == null) return 0; if (typeof __v.length === "number") return __v.length; if (__v instanceof Set || __v instanceof Map) return __v.size; if (typeof __v === "object") return Object.keys(__v).length; return 0 })()) > 0))
  }
  if ((expectedType === pyList)) {
    return (Array.isArray(value) && (((() => { const __v = value as any; if (__v == null) return 0; if (typeof __v.length === "number") return __v.length; if (__v instanceof Set || __v instanceof Map) return __v.size; if (typeof __v === "object") return Object.keys(__v).length; return 0 })()) > 0))
  }
  return /*isinstance*/(value)
}

function _extractTemplateDirectoryName(path: string): string {
  let parts = pathParts(path)
  if ((!contains("template", parts))) {
    return ""
  }
  let index = ((() => { const __i = (parts as any).indexOf("template"); if (__i < 0) throw new Error('index'); return __i })())
  if (((index + 1) >= ((() => { const __v = parts as any; if (__v == null) return 0; if (typeof __v.length === "number") return __v.length; if (__v instanceof Set || __v instanceof Map) return __v.size; if (typeof __v === "object") return Object.keys(__v).length; return 0 })()))) {
    return ""
  }
  if (((parts[(index + 1)] === "index.yaml") && (index > 0) && (parts[(index - 1)] === ".sealos"))) {
    return ""
  }
  return parts[(index + 1)]
}

export function checkNoLatestTags(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(context.yamlDocuments)) {
    if (doc.skipChecks) {
      continue
    }
    for (const [lineNo, line] of asIterable(Array.from(splitLines(String(doc.source)) as any, (v: any, i: number) => [i + (0), v] as const))) {
      if (LATEST_IMAGE_PATTERN.exec(String(line))) {
        violations.push({ ruleId: "R001", path: doc.path, line: lineNo, message: "forbidden ':latest' image tag" })
      }
    }
  }
  return violations
}

function _extractImageTag(image: string): string | null {
  let text = String(image).trim()
  if (((!text) || contains("@sha256:", text))) {
    return null
  }
  let withoutDigest = ((() => { const __s = String(text); const __m = 1; if (__m < 0) return __s.split("@"); const __parts: string[] = []; let __rest = __s; for (let __i = 0; __i < __m; __i++) { const __idx = __rest.indexOf("@"); if (__idx < 0) break; __parts.push(__rest.slice(0, __idx)); __rest = __rest.slice(__idx + String("@").length) } __parts.push(__rest); return __parts })())[0]
  let lastSegment = ((() => { const __s = String(withoutDigest); const __sep = String("/"); const __m = 1; if (__m < 0) return __s.split(__sep); const __parts: string[] = []; let __rest = __s; for (let __i = 0; __i < __m; __i++) { const __idx = __rest.lastIndexOf(__sep); if (__idx < 0) break; __parts.unshift(__rest.slice(__idx + __sep.length)); __rest = __rest.slice(0, __idx) } __parts.unshift(__rest); return __parts })())[(-1)]
  if ((!contains(":", lastSegment))) {
    return null
  }
  return String(((() => { const __s = String(lastSegment); const __sep = String(":"); const __m = 1; if (__m < 0) return __s.split(__sep); const __parts: string[] = []; let __rest = __s; for (let __i = 0; __i < __m; __i++) { const __idx = __rest.lastIndexOf(__sep); if (__idx < 0) break; __parts.unshift(__rest.slice(__idx + __sep.length)); __rest = __rest.slice(0, __idx) } __parts.unshift(__rest); return __parts })())[(-1)]).trim()
}

function _isFloatingTag(tag: string): boolean {
  let normalized = String(String(tag).trim()).toLowerCase()
  if (contains(normalized, FLOATING_TAG_ALIASES)) {
    return true
  }
  return (((() => { const __re = FLOATING_NUMERIC_TAG_RE; const __s = String(normalized); const __m = new RegExp('^(?:' + __re.source + ')$', __re.flags).exec(__s); return __m })()) !== null)
}

export function checkNoFloatingImageTags(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(context.yamlDocuments)) {
    if ((doc.skipChecks || (!isRecord(doc.data)))) {
      continue
    }
    if ((!isAppWorkloadDocument(doc))) {
      continue
    }
    if ((!hasManagedWorkloadMarker(doc.data))) {
      continue
    }
    let metadata = ((doc.data as any)?.["metadata"])
    let annotations = (isRecord(metadata) ? ((metadata as any)?.["annotations"]) : null)
    let originImage = (isRecord(annotations) ? ((annotations as any)?.["originImageName"]) : null)
    let values: unknown[] = []
    if (((typeof originImage === "string") && String(originImage).trim())) {
      values.push(["originImageName", String(originImage).trim()])
    }
    let templateSpec = getTemplateSpec(doc.data)
    let containers = (isRecord(templateSpec) ? ((templateSpec as any)?.["containers"]) : null)
    if (Array.isArray(containers)) {
      for (const container of asIterable(containers)) {
        if ((!isRecord(container))) {
          continue
        }
        let image = ((container as any)?.["image"])
        if (((typeof image === "string") && String(image).trim())) {
          values.push(["image", String(image).trim()])
        }
      }
    }
    for (const [fieldName, imageValue] of asIterable(values)) {
      let tag = _extractImageTag(imageValue)
      if (((tag === null) || (!_isFloatingTag(tag)))) {
        continue
      }
      let pattern = ((fieldName === "originImageName") ? "originImageName" : "^\\s*image\\s*:")
      addDocViolation(violations, { ruleId: "R016", doc: doc, pattern: pattern, defaultPattern: ((fieldName === "originImageName") ? "^\\s*metadata\\s*:" : "^\\s*containers\\s*:"), message: `floating image tag '${tag}' is not allowed; use an explicit version tag (e.g. v2.2.0) or digest` })
    }
  }
  return violations
}

export function checkNoComposeImageVariables(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(context.yamlDocuments)) {
    if ((doc.skipChecks || (!isRecord(doc.data)))) {
      continue
    }
    if ((!isAppWorkloadDocument(doc))) {
      continue
    }
    if ((!hasManagedWorkloadMarker(doc.data))) {
      continue
    }
    let metadata = ((doc.data as any)?.["metadata"])
    let annotations = (isRecord(metadata) ? ((metadata as any)?.["annotations"]) : null)
    let originImage = (isRecord(annotations) ? ((annotations as any)?.["originImageName"]) : null)
    let values: unknown[] = []
    if (((typeof originImage === "string") && String(originImage).trim())) {
      values.push(["originImageName", String(originImage).trim()])
    }
    let templateSpec = getTemplateSpec(doc.data)
    let containers = (isRecord(templateSpec) ? ((templateSpec as any)?.["containers"]) : null)
    if (Array.isArray(containers)) {
      for (const container of asIterable(containers)) {
        if ((!isRecord(container))) {
          continue
        }
        let image = ((container as any)?.["image"])
        if (((typeof image === "string") && String(image).trim())) {
          values.push(["image", String(image).trim()])
        }
      }
    }
    for (const [fieldName, imageValue] of asIterable(values)) {
      if ((COMPOSE_VAR_IN_IMAGE_RE.exec(String(imageValue)) === null)) {
        continue
      }
      let pattern = ((fieldName === "originImageName") ? "originImageName" : "^\\s*image\\s*:")
      addDocViolation(violations, { ruleId: "R018", doc: doc, pattern: pattern, defaultPattern: ((fieldName === "originImageName") ? "^\\s*metadata\\s*:" : "^\\s*containers\\s*:"), message: "image references must be concrete and must not contain Compose-style variables; resolve to explicit tag or digest before emitting template artifacts" })
    }
  }
  return violations
}

export function checkAppNoSpecTemplate(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(iterDocumentsByKind(context, "App"))) {
    let spec = (isRecord(doc.data) ? ((doc.data as any)?.["spec"]) : null)
    if ((isRecord(spec) && contains("template", spec))) {
      addDocViolation(violations, { ruleId: "R002", doc: doc, pattern: "^\\s*template\\s*:", defaultPattern: "^\\s*spec\\s*:", message: "App resource must not use spec.template" })
    }
  }
  return violations
}

export function checkAppHasSpecDataUrl(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(iterDocumentsByKind(context, "App"))) {
    let spec = (isRecord(doc.data) ? ((doc.data as any)?.["spec"]) : null)
    let data = (isRecord(spec) ? ((spec as any)?.["data"]) : null)
    let url = (isRecord(data) ? ((data as any)?.["url"]) : null)
    if (((!(typeof url === "string")) || (!String(url).trim()))) {
      addDocViolation(violations, { ruleId: "R003", doc: doc, pattern: "^\\s*data\\s*:", defaultPattern: "^\\s*spec\\s*:", message: "App resource must define spec.data.url" })
    }
  }
  return violations
}

function _checkAppSpecExactString(context: ScanContext, ruleId: string, fieldName: string, expected: string): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(iterDocumentsByKind(context, "App"))) {
    let spec = (isRecord(doc.data) ? ((doc.data as any)?.["spec"]) : null)
    let value = (isRecord(spec) ? ((spec as any)?.[fieldName]) : null)
    if (((!(typeof value === "string")) || (!String(value).trim()))) {
      addDocViolation(violations, { ruleId: ruleId, doc: doc, pattern: `^\\s*${escapeRegExp(fieldName)}\\s*:`, defaultPattern: "^\\s*spec\\s*:", message: `App resource must define spec.${fieldName}: ${expected}` })
      continue
    }
    if ((String(value).trim() !== expected)) {
      addDocViolation(violations, { ruleId: ruleId, doc: doc, pattern: `^\\s*${escapeRegExp(fieldName)}\\s*:`, defaultPattern: "^\\s*spec\\s*:", message: `App resource spec.${fieldName} must be ${JSON.stringify(expected)}` })
    }
  }
  return violations
}

export function checkAppDisplayTypeNormal(context: ScanContext): Violation[] {
  return _checkAppSpecExactString(context, "R032", "displayType", "normal")
}

export function checkAppTypeLink(context: ScanContext): Violation[] {
  return _checkAppSpecExactString(context, "R033", "type", "link")
}

export function checkTemplateNameIsHardcodedLowercase(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(iterDocumentsByKind(context, "Template"))) {
    let metadata = (isRecord(doc.data) ? ((doc.data as any)?.["metadata"]) : null)
    let name = (isRecord(metadata) ? ((metadata as any)?.["name"]) : null)
    if ((!(typeof name === "string"))) {
      addDocViolation(violations, { ruleId: "R004", doc: doc, pattern: "^\\s*metadata\\s*:", message: "Template metadata.name must be a hardcoded lowercase string" })
      continue
    }
    if ((contains("${{", name) || (!((() => { const __re = TEMPLATE_NAME_PATTERN; const __s = String(name); const __m = new RegExp('^(?:' + __re.source + ')$', __re.flags).exec(__s); return __m })())))) {
      addDocViolation(violations, { ruleId: "R004", doc: doc, pattern: "^\\s*name\\s*:", message: "Template metadata.name must be hardcoded lowercase and must not use variables" })
    }
  }
  return violations
}

export function checkTemplateRequiredMetadataFields(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(_iterTemplateArtifactDocuments(context))) {
    let spec = (isRecord(doc.data) ? ((doc.data as any)?.["spec"]) : null)
    if ((!isRecord(spec))) {
      addDocViolation(violations, { ruleId: "R012", doc: doc, pattern: "^\\s*spec\\s*:", message: "Template must define spec with required metadata fields" })
      continue
    }
    for (const [field, expectedType] of asIterable(Object.entries(TEMPLATE_REQUIRED_SPEC_FIELDS as any))) {
      if (_isNonEmptyValue(((spec as any)?.[field]), expectedType)) {
        continue
      }
      addDocViolation(violations, { ruleId: "R012", doc: doc, pattern: `^\\s*${escapeRegExp(field)}\\s*:`, defaultPattern: "^\\s*spec\\s*:", message: `Template spec.${field} must be defined and non-empty` })
    }
  }
  return violations
}

export function checkTemplateFolderMatchesName(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(_iterTemplateArtifactDocuments(context))) {
    if ((pathName(doc.path) !== "index.yaml")) {
      continue
    }
    let expectedName = _extractTemplateDirectoryName(doc.path.resolve())
    if ((!expectedName)) {
      continue
    }
    let metadata = (isRecord(doc.data) ? ((doc.data as any)?.["metadata"]) : null)
    let actualName = (isRecord(metadata) ? ((metadata as any)?.["name"]) : null)
    if ((!(typeof actualName === "string"))) {
      continue
    }
    if ((expectedName === actualName)) {
      continue
    }
    addDocViolation(violations, { ruleId: "R013", doc: doc, pattern: "^\\s*name\\s*:", defaultPattern: "^\\s*metadata\\s*:", message: `Template folder name '${expectedName}' must match metadata.name '${actualName}'` })
  }
  return violations
}

export function checkTemplateIconPaths(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(_iterTemplateArtifactDocuments(context))) {
    let metadata = (isRecord(doc.data) ? ((doc.data as any)?.["metadata"]) : null)
    let spec = (isRecord(doc.data) ? ((doc.data as any)?.["spec"]) : null)
    let appName = (isRecord(metadata) ? ((metadata as any)?.["name"]) : null)
    if (((!(typeof appName === "string")) || (!isRecord(spec)))) {
      continue
    }
    let icon = ((spec as any)?.["icon"])
    if ((typeof icon === "string")) {
      let iconPattern = new RegExp(`^https://raw\\.githubusercontent\\.com/.+/kb-0\\.9/template/${escapeRegExp(appName)}/logo\\.[A-Za-z0-9]+$`)
      if ((((() => { const __re = iconPattern; const __s = String(String(icon).trim()); const __m = new RegExp('^(?:' + __re.source + ')$', __re.flags).exec(__s); return __m })()) === null)) {
        addDocViolation(violations, { ruleId: "R014", doc: doc, pattern: "^\\s*icon\\s*:", defaultPattern: "^\\s*spec\\s*:", message: "Template spec.icon must point to raw.githubusercontent.com/.../kb-0.9/template/<app-name>/logo.<ext>" })
      }
    }
  }
  return violations
}

export function checkTemplateReadmePaths(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(_iterTemplateArtifactDocuments(context))) {
    let metadata = (isRecord(doc.data) ? ((doc.data as any)?.["metadata"]) : null)
    let spec = (isRecord(doc.data) ? ((doc.data as any)?.["spec"]) : null)
    let appName = (isRecord(metadata) ? ((metadata as any)?.["name"]) : null)
    if (((!(typeof appName === "string")) || (!isRecord(spec)))) {
      continue
    }
    let expectedReadme = `${TEMPLATE_README_BASE}/${appName}/README.md`
    let expectedZhReadme = `${TEMPLATE_README_BASE}/${appName}/README_zh.md`
    let readme = ((spec as any)?.["readme"])
    if ((!((typeof readme === "string") && (String(readme).trim() === expectedReadme)))) {
      addDocViolation(violations, { ruleId: "R025", doc: doc, pattern: "^\\s*readme\\s*:", defaultPattern: "^\\s*spec\\s*:", message: `Template spec.readme must be '${expectedReadme}'` })
    }
    let i18n = (isRecord(spec) ? ((spec as any)?.["i18n"]) : null)
    let zh = (isRecord(i18n) ? ((i18n as any)?.["zh"]) : null)
    let zhReadme = (isRecord(zh) ? ((zh as any)?.["readme"]) : null)
    if ((!((typeof zhReadme === "string") && (String(zhReadme).trim() === expectedZhReadme)))) {
      addDocViolation(violations, { ruleId: "R025", doc: doc, pattern: "^\\s*i18n\\s*:", defaultPattern: "^\\s*spec\\s*:", message: `Template spec.i18n.zh.readme must be '${expectedZhReadme}'` })
    }
  }
  return violations
}

export function checkTemplateI18nZhDescriptionChinese(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(_iterTemplateArtifactDocuments(context))) {
    let spec = (isRecord(doc.data) ? ((doc.data as any)?.["spec"]) : null)
    let i18n = (isRecord(spec) ? ((spec as any)?.["i18n"]) : null)
    let zh = (isRecord(i18n) ? ((i18n as any)?.["zh"]) : null)
    let description = (isRecord(zh) ? ((zh as any)?.["description"]) : null)
    if (((typeof description === "string") && String(description).trim() && ZH_CHAR_RE.exec(String(description)))) {
      continue
    }
    addDocViolation(violations, { ruleId: "R021", doc: doc, pattern: "^\\s*i18n\\s*:", defaultPattern: "^\\s*spec\\s*:", message: "Template spec.i18n.zh.description must be provided in Simplified Chinese" })
  }
  return violations
}

export function checkTemplateI18nZhTitleAbsent(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(_iterTemplateArtifactDocuments(context))) {
    let spec = (isRecord(doc.data) ? ((doc.data as any)?.["spec"]) : null)
    let i18n = (isRecord(spec) ? ((spec as any)?.["i18n"]) : null)
    let zh = (isRecord(i18n) ? ((i18n as any)?.["zh"]) : null)
    if ((!isRecord(zh))) {
      continue
    }
    if ((!contains("title", zh))) {
      continue
    }
    addDocViolation(violations, { ruleId: "R022", doc: doc, pattern: "^\\s*i18n\\s*:", defaultPattern: "^\\s*spec\\s*:", message: "Template spec.i18n.zh.title should be omitted when it is identical to spec.title" })
  }
  return violations
}

export function checkTemplateCategoriesAllowed(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  let allowed = ([...asIterable(ALLOWED_TEMPLATE_CATEGORIES)].sort() as any).join(", ")
  for (const doc of asIterable(_iterTemplateArtifactDocuments(context))) {
    let spec = (isRecord(doc.data) ? ((doc.data as any)?.["spec"]) : null)
    let categories = (isRecord(spec) ? ((spec as any)?.["categories"]) : null)
    if ((!Array.isArray(categories))) {
      continue
    }
    for (const item of asIterable(categories)) {
      if (((typeof item === "string") && contains(item, ALLOWED_TEMPLATE_CATEGORIES))) {
        continue
      }
      addDocViolation(violations, { ruleId: "R023", doc: doc, pattern: "^\\s*categories\\s*:", defaultPattern: "^\\s*spec\\s*:", message: `Template spec.categories entries must be from allowlist: ${allowed}` })
      break
    }
  }
  return violations
}

export function checkDeployManagerLabelMatchName(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  let labelKey = "cloud.sealos.io/app-deploy-manager"
  for (const doc of asIterable(context.yamlDocuments)) {
    if ((doc.skipChecks || (!isRecord(doc.data)))) {
      continue
    }
    if ((!isAppWorkloadDocument(doc))) {
      continue
    }
    let metadata = ((doc.data as any)?.["metadata"])
    if ((!isRecord(metadata))) {
      continue
    }
    let name = ((metadata as any)?.["name"])
    let labels = ((metadata as any)?.["labels"])
    if ((!(typeof name === "string"))) {
      continue
    }
    let labelValue = (isRecord(labels) ? ((labels as any)?.[labelKey]) : null)
    if ((labelValue === null)) {
      addDocViolation(violations, { ruleId: "R008", doc: doc, pattern: "^\\s*labels\\s*:", defaultPattern: "^\\s*metadata\\s*:", message: `${labelKey} label is required and must exactly match metadata.name` })
      continue
    }
    if ((labelValue !== name)) {
      addDocViolation(violations, { ruleId: "R008", doc: doc, pattern: escapeRegExp(labelKey), message: `${labelKey} must exactly match metadata.name` })
    }
  }
  return violations
}

export function checkAppLabelMatchName(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  let labelKey = "app"
  for (const doc of asIterable(context.yamlDocuments)) {
    if ((doc.skipChecks || (!isRecord(doc.data)))) {
      continue
    }
    if ((!isAppWorkloadDocument(doc))) {
      continue
    }
    if ((!hasManagedWorkloadMarker(doc.data))) {
      continue
    }
    let metadata = ((doc.data as any)?.["metadata"])
    if ((!isRecord(metadata))) {
      continue
    }
    let name = ((metadata as any)?.["name"])
    if (((!(typeof name === "string")) || (!String(name).trim()))) {
      continue
    }
    let labels = ((metadata as any)?.["labels"])
    let labelValue = (isRecord(labels) ? ((labels as any)?.[labelKey]) : null)
    if (((!(typeof labelValue === "string")) || (!String(labelValue).trim()))) {
      addDocViolation(violations, { ruleId: "R034", doc: doc, pattern: "^\\s*app\\s*:", defaultPattern: "^\\s*metadata\\s*:", message: "metadata.labels.app is required and must exactly match metadata.name for managed app workloads" })
      continue
    }
    if ((labelValue !== name)) {
      addDocViolation(violations, { ruleId: "R034", doc: doc, pattern: "^\\s*app\\s*:", defaultPattern: "^\\s*metadata\\s*:", message: "metadata.labels.app must exactly match metadata.name for managed app workloads" })
    }
  }
  return violations
}

export function checkContainerNamesMatchWorkloadName(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(context.yamlDocuments)) {
    if ((doc.skipChecks || (!isRecord(doc.data)))) {
      continue
    }
    if ((!isAppWorkloadDocument(doc))) {
      continue
    }
    if ((!hasManagedWorkloadMarker(doc.data))) {
      continue
    }
    let metadata = ((doc.data as any)?.["metadata"])
    if ((!isRecord(metadata))) {
      continue
    }
    let workloadName = ((metadata as any)?.["name"])
    if (((!(typeof workloadName === "string")) || (!String(workloadName).trim()))) {
      continue
    }
    let templateSpec = getTemplateSpec(doc.data)
    let containers = (isRecord(templateSpec) ? ((templateSpec as any)?.["containers"]) : null)
    if ((!Array.isArray(containers))) {
      continue
    }
    let hasPrimaryContainer = Array.from(containers as any).some((container) => (Boolean((isRecord(container) && (typeof ((container as any)?.["name"]) === "string") && (String(container["name"]).trim() === workloadName)))))
    if (hasPrimaryContainer) {
      continue
    }
    addDocViolation(violations, { ruleId: "R028", doc: doc, pattern: "^\\s*containers\\s*:", defaultPattern: "^\\s*containers\\s*:", message: `managed app workloads must include a primary business container named exactly like metadata.name '${workloadName}'; sidecar/helper containers may use distinct names` })
  }
  return violations
}

export function checkOriginImageNameMatchesContainer(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(context.yamlDocuments)) {
    if ((doc.skipChecks || (!isRecord(doc.data)))) {
      continue
    }
    if ((!contains(String(pathSuffix(doc.path)).toLowerCase(), TEMPLATE_ARTIFACT_SUFFIXES))) {
      continue
    }
    if ((!isAppWorkloadDocument(doc))) {
      continue
    }
    if ((!hasManagedWorkloadMarker(doc.data))) {
      continue
    }
    let metadata = ((doc.data as any)?.["metadata"])
    let annotations = (isRecord(metadata) ? ((metadata as any)?.["annotations"]) : null)
    let originImage = (isRecord(annotations) ? ((annotations as any)?.["originImageName"]) : null)
    let templateSpec = getTemplateSpec(doc.data)
    let containers = (isRecord(templateSpec) ? ((templateSpec as any)?.["containers"]) : null)
    let images = Array.from((containers || []) as any).filter((item) => (isRecord(item))).map((item) => (((item as any)?.["image"])))
    let imageValues = Array.from(images as any).filter((image) => (((typeof image === "string") && String(image).trim()))).map((image) => (String(image).trim()))
    if ((!imageValues)) {
      continue
    }
    if (((!(typeof originImage === "string")) || (!String(originImage).trim()))) {
      addDocViolation(violations, { ruleId: "R015", doc: doc, pattern: "originImageName", defaultPattern: "^\\s*metadata\\s*:", message: "managed app workloads must define metadata.annotations.originImageName" })
      continue
    }
    if ((!contains(String(originImage).trim(), imageValues))) {
      addDocViolation(violations, { ruleId: "R015", doc: doc, pattern: "originImageName", defaultPattern: "^\\s*metadata\\s*:", message: "metadata.annotations.originImageName must match a container image in the workload" })
    }
  }
  return violations
}

export function checkServicePortsHaveNames(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(iterDocumentsByKind(context, "Service"))) {
    if ((!contains(String(pathSuffix(doc.path)).toLowerCase(), TEMPLATE_ARTIFACT_SUFFIXES))) {
      continue
    }
    if ((pathName(doc.path) !== "index.yaml")) {
      continue
    }
    let spec = (isRecord(doc.data) ? ((doc.data as any)?.["spec"]) : null)
    let ports = (isRecord(spec) ? ((spec as any)?.["ports"]) : null)
    if ((!Array.isArray(ports))) {
      continue
    }
    for (const entry of asIterable(ports)) {
      if ((!isRecord(entry))) {
        continue
      }
      let portValue = ((entry as any)?.["port"])
      let name = ((entry as any)?.["name"])
      if (((typeof name === "string") && String(name).trim())) {
        continue
      }
      let pattern = ((portValue !== null) ? `^\\s*port\\s*:\\s*${escapeRegExp(String(portValue))}\\s*$` : "^\\s*ports\\s*:")
      addDocViolation(violations, { ruleId: "R020", doc: doc, pattern: pattern, defaultPattern: "^\\s*ports\\s*:", message: "Service spec.ports entries must define a non-empty name" })
    }
  }
  return violations
}

export function checkServiceLabelsMatchSelectorApp(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  let cloudLabelKey = "cloud.sealos.io/app-deploy-manager"
  for (const doc of asIterable(iterDocumentsByKind(context, "Service"))) {
    if ((!contains(String(pathSuffix(doc.path)).toLowerCase(), TEMPLATE_ARTIFACT_SUFFIXES))) {
      continue
    }
    if ((pathName(doc.path) !== "index.yaml")) {
      continue
    }
    if ((!isRecord(doc.data))) {
      continue
    }
    let spec = ((doc.data as any)?.["spec"])
    let selector = (isRecord(spec) ? ((spec as any)?.["selector"]) : null)
    let selectorApp = (isRecord(selector) ? ((selector as any)?.["app"]) : null)
    if (((!(typeof selectorApp === "string")) || (!String(selectorApp).trim()))) {
      continue
    }
    selectorApp = String(selectorApp).trim()
    let metadata = ((doc.data as any)?.["metadata"])
    let metadataName = (isRecord(metadata) ? ((metadata as any)?.["name"]) : null)
    let labels = (isRecord(metadata) ? ((metadata as any)?.["labels"]) : null)
    let appLabel = (isRecord(labels) ? ((labels as any)?.["app"]) : null)
    let cloudLabel = (isRecord(labels) ? ((labels as any)?.[cloudLabelKey]) : null)
    if (((!(typeof metadataName === "string")) || (!String(metadataName).trim()))) {
      addDocViolation(violations, { ruleId: "R029", doc: doc, pattern: "^\\s*name\\s*:", defaultPattern: "^\\s*metadata\\s*:", message: "Service metadata.name is required and must match spec.selector.app" })
      continue
    }
    metadataName = String(metadataName).trim()
    if ((metadataName !== selectorApp)) {
      addDocViolation(violations, { ruleId: "R029", doc: doc, pattern: "^\\s*name\\s*:", defaultPattern: "^\\s*metadata\\s*:", message: "Service metadata.name must match spec.selector.app" })
    }
    if (((!(typeof appLabel === "string")) || (!String(appLabel).trim()))) {
      addDocViolation(violations, { ruleId: "R029", doc: doc, pattern: "^\\s*labels\\s*:", defaultPattern: "^\\s*metadata\\s*:", message: "Service metadata.labels.app is required and must match metadata.name/spec.selector.app" })
    } else if ((String(appLabel).trim() !== metadataName)) {
      addDocViolation(violations, { ruleId: "R029", doc: doc, pattern: "^\\s*app\\s*:", defaultPattern: "^\\s*labels\\s*:", message: "Service metadata.labels.app must match metadata.name/spec.selector.app" })
    }
    if (((!(typeof cloudLabel === "string")) || (!String(cloudLabel).trim()))) {
      addDocViolation(violations, { ruleId: "R029", doc: doc, pattern: escapeRegExp(cloudLabelKey), defaultPattern: "^\\s*labels\\s*:", message: "Service metadata.labels.cloud.sealos.io/app-deploy-manager is required and must match metadata.name/spec.selector.app" })
    } else if ((String(cloudLabel).trim() !== metadataName)) {
      addDocViolation(violations, { ruleId: "R029", doc: doc, pattern: escapeRegExp(cloudLabelKey), defaultPattern: "^\\s*labels\\s*:", message: "Service metadata.labels.cloud.sealos.io/app-deploy-manager must match metadata.name/spec.selector.app" })
    }
  }
  return violations
}

function _configmapVolumeNames(templateSpec: Record<string, unknown>, configmapName: string): unknown {
  let names: unknown = new Set()
  let volumes = ((templateSpec as any)?.["volumes"])
  if ((!Array.isArray(volumes))) {
    return names
  }
  for (const volume of asIterable(volumes)) {
    if ((!isRecord(volume))) {
      continue
    }
    let volumeName = ((volume as any)?.["name"])
    if (((!(typeof volumeName === "string")) || (!String(volumeName).trim()))) {
      continue
    }
    let configMap = ((volume as any)?.["configMap"])
    if ((isRecord(configMap) && (((configMap as any)?.["name"]) === configmapName))) {
      names.add(String(volumeName).trim())
      continue
    }
    let projected = ((volume as any)?.["projected"])
    let sources = (isRecord(projected) ? ((projected as any)?.["sources"]) : null)
    if ((!Array.isArray(sources))) {
      continue
    }
    for (const source of asIterable(sources)) {
      if ((!isRecord(source))) {
        continue
      }
      let sourceConfigMap = ((source as any)?.["configMap"])
      if ((isRecord(sourceConfigMap) && (((sourceConfigMap as any)?.["name"]) === configmapName))) {
        names.add(String(volumeName).trim())
        break
      }
    }
  }
  return names
}

function _volumeMountNames(container: Record<string, unknown>): unknown {
  let mounts = ((container as any)?.["volumeMounts"])
  if ((!Array.isArray(mounts))) {
    return new Set()
  }
  return new Set(Array.from(mounts as any).filter((item) => ((isRecord(item) && (typeof ((item as any)?.["name"]) === "string") && String(item["name"]).trim()))).map((item) => (String(item["name"]).trim())))
}

function _persistentVolumeNames(data: Record<string, unknown>, templateSpec: Record<string, unknown>): unknown {
  let names: unknown = new Set()
  let spec = ((data as any)?.["spec"])
  let claimTemplates = (isRecord(spec) ? ((spec as any)?.["volumeClaimTemplates"]) : null)
  if (Array.isArray(claimTemplates)) {
    for (const claimTemplate of asIterable(claimTemplates)) {
      let metadata = (isRecord(claimTemplate) ? ((claimTemplate as any)?.["metadata"]) : null)
      let name = (isRecord(metadata) ? ((metadata as any)?.["name"]) : null)
      if (((typeof name === "string") && String(name).trim())) {
        names.add(String(name).trim())
      }
    }
  }
  let volumes = ((templateSpec as any)?.["volumes"])
  if (Array.isArray(volumes)) {
    for (const volume of asIterable(volumes)) {
      if ((!isRecord(volume))) {
        continue
      }
      name = ((volume as any)?.["name"])
      if (((typeof name === "string") && String(name).trim() && isRecord(((volume as any)?.["persistentVolumeClaim"])))) {
        names.add(String(name).trim())
      }
    }
  }
  return names
}

function _containerCommandText(container: Record<string, unknown>): string {
  let parts: string[] = []
  for (const key of asIterable(["command", "args"])) {
    let value = ((container as any)?.[key])
    if (Array.isArray(value)) {
      parts.push(...(Array.from(value as any).map((item) => (String(item))) as any))
    } else if ((typeof value === "string")) {
      parts.push(value)
    }
  }
  return (parts as any).join("\n")
}

function _looksLikeCopyToStorage(container: Record<string, unknown>): boolean {
  let commandText = String(_containerCommandText(container)).toLowerCase()
  let copyMarkers = ["cp ", "cp\t", "rsync", "install ", "tee ", "cat "]
  return Array.from(copyMarkers as any).some((marker) => (Boolean(contains(marker, commandText))))
}

function _isBootstrapOnlyConfigmap(context: ScanContext, configmapName: string): boolean {
  let sawBootstrapReference = false
  for (const workloadDoc of asIterable(context.yamlDocuments)) {
    if ((!isAppWorkloadDocument(workloadDoc))) {
      continue
    }
    if ((!isRecord(workloadDoc.data))) {
      continue
    }
    let templateSpec = getTemplateSpec(workloadDoc.data)
    if ((!isRecord(templateSpec))) {
      continue
    }
    let configmapVolumeNames = _configmapVolumeNames(templateSpec, configmapName)
    if ((!configmapVolumeNames)) {
      continue
    }
    let containers = ((templateSpec as any)?.["containers"])
    if (Array.isArray(containers)) {
      for (const container of asIterable(containers)) {
        if ((isRecord(container) && setIntersection(_volumeMountNames(container), configmapVolumeNames))) {
          return false
        }
      }
    }
    let persistentVolumeNames = _persistentVolumeNames(workloadDoc.data, templateSpec)
    let initContainers = ((templateSpec as any)?.["initContainers"])
    if ((!Array.isArray(initContainers))) {
      return false
    }
    let matchedBootstrapContainer = false
    for (const container of asIterable(initContainers)) {
      if ((!isRecord(container))) {
        continue
      }
      let mounts = _volumeMountNames(container)
      if ((!setIntersection(mounts, configmapVolumeNames))) {
        continue
      }
      if ((!setIntersection(mounts, persistentVolumeNames))) {
        return false
      }
      if ((!_looksLikeCopyToStorage(container))) {
        return false
      }
      matchedBootstrapContainer = true
    }
    if (matchedBootstrapContainer) {
      sawBootstrapReference = true
    } else {
      return false
    }
  }
  return sawBootstrapReference
}

export function checkConfigmapLabelsMatchName(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  let cloudLabelKey = "cloud.sealos.io/app-deploy-manager"
  for (const doc of asIterable(iterDocumentsByKind(context, "ConfigMap"))) {
    if ((!contains(String(pathSuffix(doc.path)).toLowerCase(), TEMPLATE_ARTIFACT_SUFFIXES))) {
      continue
    }
    if ((pathName(doc.path) !== "index.yaml")) {
      continue
    }
    if ((!isRecord(doc.data))) {
      continue
    }
    let metadata = ((doc.data as any)?.["metadata"])
    let metadataName = (isRecord(metadata) ? ((metadata as any)?.["name"]) : null)
    let labels = (isRecord(metadata) ? ((metadata as any)?.["labels"]) : null)
    let appLabel = (isRecord(labels) ? ((labels as any)?.["app"]) : null)
    let cloudLabel = (isRecord(labels) ? ((labels as any)?.[cloudLabelKey]) : null)
    if (((!(typeof metadataName === "string")) || (!String(metadataName).trim()))) {
      continue
    }
    metadataName = String(metadataName).trim()
    if (_isBootstrapOnlyConfigmap(context, metadataName)) {
      if ((appLabel !== null)) {
        addDocViolation(violations, { ruleId: "R030", doc: doc, pattern: "^\\s*app\\s*:", defaultPattern: "^\\s*labels\\s*:", message: "Bootstrap-only ConfigMap must not define metadata.labels.app" })
      }
      if ((cloudLabel !== null)) {
        addDocViolation(violations, { ruleId: "R030", doc: doc, pattern: escapeRegExp(cloudLabelKey), defaultPattern: "^\\s*labels\\s*:", message: "Bootstrap-only ConfigMap must not define metadata.labels.cloud.sealos.io/app-deploy-manager" })
      }
      continue
    }
    if (((!(typeof appLabel === "string")) || (!String(appLabel).trim()))) {
      addDocViolation(violations, { ruleId: "R030", doc: doc, pattern: "^\\s*labels\\s*:", defaultPattern: "^\\s*metadata\\s*:", message: "ConfigMap metadata.labels.app is required and must match metadata.name" })
    } else if ((String(appLabel).trim() !== metadataName)) {
      addDocViolation(violations, { ruleId: "R030", doc: doc, pattern: "^\\s*app\\s*:", defaultPattern: "^\\s*labels\\s*:", message: "ConfigMap metadata.labels.app must match metadata.name" })
    }
    if (((!(typeof cloudLabel === "string")) || (!String(cloudLabel).trim()))) {
      addDocViolation(violations, { ruleId: "R030", doc: doc, pattern: escapeRegExp(cloudLabelKey), defaultPattern: "^\\s*labels\\s*:", message: "ConfigMap metadata.labels.cloud.sealos.io/app-deploy-manager is required and must match metadata.name" })
    } else if ((String(cloudLabel).trim() !== metadataName)) {
      addDocViolation(violations, { ruleId: "R030", doc: doc, pattern: escapeRegExp(cloudLabelKey), defaultPattern: "^\\s*labels\\s*:", message: "ConfigMap metadata.labels.cloud.sealos.io/app-deploy-manager must match metadata.name" })
    }
  }
  return violations
}

function _metadataName(data: unknown): string | null {
  if ((!isRecord(data))) {
    return null
  }
  let metadata = ((data as any)?.["metadata"])
  if ((!isRecord(metadata))) {
    return null
  }
  let name = ((metadata as any)?.["name"])
  if (((typeof name === "string") && String(name).trim())) {
    return String(name).trim()
  }
  return null
}

function _configmapDocumentsByPath(context: ScanContext): Record<string, Record<string, YamlDocument>> {
  let byPath: Record<string, Record<string, YamlDocument>> = {  }
  for (const doc of asIterable(iterDocumentsByKind(context, "ConfigMap"))) {
    let name = _metadataName(doc.data)
    if ((name === null)) {
      continue
    }
    ((() => { const __o = byPath as any; if (__o[doc.path] === undefined) __o[doc.path] = {  }; return __o[doc.path] })())[name] = doc
  }
  return byPath
}

function _configmapDataKeys(doc: YamlDocument): Set<string> {
  if ((!isRecord(doc.data))) {
    return new Set()
  }
  let data = ((doc.data as any)?.["data"])
  if ((!isRecord(data))) {
    return new Set()
  }
  return new Set(Array.from(Object.keys(data as any) as any).filter((key) => ((typeof key === "string"))).map((key) => (key)))
}

function *_iterConfigmapVolumes(templateSpec: Record<string, unknown>): Generator<Record<string, unknown>, void, unknown> {
  let volumes = ((templateSpec as any)?.["volumes"])
  if ((!Array.isArray(volumes))) {
    return
  }
  for (const volume of asIterable(volumes)) {
    if ((!isRecord(volume))) {
      continue
    }
    let configMap = ((volume as any)?.["configMap"])
    if ((!isRecord(configMap))) {
      continue
    }
    let configName = ((configMap as any)?.["name"])
    let volumeName = ((volume as any)?.["name"])
    if (((!(typeof configName === "string")) || (!String(configName).trim()))) {
      continue
    }
    if (((!(typeof volumeName === "string")) || (!String(volumeName).trim()))) {
      continue
    }
    yield volume
  }
}

function *_iterVolumeMounts(templateSpec: Record<string, unknown>, volumeName: string): Generator<Record<string, unknown>, void, unknown> {
  for (const container of asIterable(iterContainers(templateSpec))) {
    let mounts = ((container as any)?.["volumeMounts"])
    if ((!Array.isArray(mounts))) {
      continue
    }
    for (const mount of asIterable(mounts)) {
      if ((!isRecord(mount))) {
        continue
      }
      if ((((mount as any)?.["name"]) === volumeName)) {
        yield mount
      }
    }
  }
}

function _stringList(value: unknown): string[] {
  if ((typeof value === "string")) {
    return [value]
  }
  if (Array.isArray(value)) {
    return Array.from(value as any).filter((item) => ((item !== null))).map((item) => (String(item)))
  }
  return []
}

function _isShellCommand(value: string): boolean {
  return contains(String(value.name).toLowerCase(), new Set(["sh", "bash", "ash", "zsh", "busybox"]))
}

function _checkConfigmapScriptExecution(doc: YamlDocument, templateSpec: Record<string, unknown>, volumeName: string, configmapDoc: YamlDocument, violations: Violation[]): null {
  let data = (isRecord(configmapDoc.data) ? ((configmapDoc.data as any)?.["data"]) : null)
  if ((!isRecord(data))) {
    return
  }
  let mountedFiles = Object.fromEntries(Array.from(_iterVolumeMounts(templateSpec, volumeName) as any).filter((mount) => ((isRecord(mount) && (typeof ((mount as any)?.["mountPath"]) === "string") && (typeof ((mount as any)?.["subPath"]) === "string")))).map((mount) => [String(((mount as any)?.["mountPath"])), String(((mount as any)?.["subPath"]))] as const))
  if ((!mountedFiles)) {
    return
  }
  for (const container of asIterable((((templateSpec as any)?.["initContainers"]) || []))) {
    if ((!isRecord(container))) {
      continue
    }
    let command = _stringList(((container as any)?.["command"]))
    if ((!command)) {
      continue
    }
    let commandPath = command[0]
    if ((contains(commandPath, mountedFiles) && (!_isShellCommand(commandPath)))) {
      violations.push({ ruleId: "R043", path: doc.path, line: findLine(doc, "^\\s*command\\s*:"), message: `initContainer must invoke ConfigMap-mounted scripts through a shell interpreter; direct execution of ${commandPath} is unsupported` })
    }
  }
  for (const container of asIterable((((templateSpec as any)?.["containers"]) || []))) {
    if ((!isRecord(container))) {
      continue
    }
    command = _stringList(((container as any)?.["command"]))
    let args = _stringList(((container as any)?.["args"]))
    if ((!command)) {
      continue
    }
    commandPath = command[0]
    if ((contains(commandPath, mountedFiles) && (!_isShellCommand(commandPath)))) {
      violations.push({ ruleId: "R043", path: doc.path, line: findLine(doc, "^\\s*command\\s*:"), message: `main container must invoke ConfigMap-mounted scripts through a shell interpreter; direct execution of ${commandPath} is unsupported` })
    }
    let referencedPaths = setIntersection(new Set((command.slice(1) + args) as any), mountedFiles)
    for (const mountPath of asIterable(referencedPaths)) {
      let key = mountedFiles[mountPath]
      let script = ((data as any)?.[key])
      if (((!(typeof script === "string")) || (![".sh", ".bash"].some((p) => String(mountPath).endsWith(p))))) {
        continue
      }
      if ((!new RegExp("\\bexec\\s+", "").exec(String(script)))) {
        violations.push({ ruleId: "R043", path: configmapDoc.path, line: findLine(configmapDoc, escapeRegExp(key)), message: `main ConfigMap startup script ${key} must end with exec of the official process` })
      }
    }
  }
}

function *_iterConfigmapDefaultModeLines(doc: YamlDocument): Generator<[number, string], void, unknown> {
  let lines = splitLines(String(doc.source))
  let inConfigMap = false
  let configMapIndent = (-1)
  for (const [offset, line] of asIterable(Array.from(lines as any, (v: any, i: number) => [i + (0), v] as const))) {
    let stripped = String(line).trim()
    if (((!stripped) || String(stripped).startsWith("#"))) {
      continue
    }
    let indent = (((() => { const __v = line as any; if (__v == null) return 0; if (typeof __v.length === "number") return __v.length; if (__v instanceof Set || __v instanceof Map) return __v.size; if (typeof __v === "object") return Object.keys(__v).length; return 0 })()) - ((() => { const __v = String(line).trimStart() as any; if (__v == null) return 0; if (typeof __v.length === "number") return __v.length; if (__v instanceof Set || __v instanceof Map) return __v.size; if (typeof __v === "object") return Object.keys(__v).length; return 0 })()))
    if ((inConfigMap && (indent <= configMapIndent))) {
      inConfigMap = false
      configMapIndent = (-1)
    }
    if (new RegExp('^(?:' + ("^\\s*configMap\\s*:\\s*(?:#.*)?$") + ')', "").exec(String(line))) {
      inConfigMap = true
      configMapIndent = indent
      continue
    }
    if ((inConfigMap && new RegExp('^(?:' + ("^\\s*defaultMode\\s*:") + ')', "").exec(String(line)))) {
      yield [(doc.startLine + offset), stripped]
    }
  }
}

function _configmapDefaultModeViolation(lineText: string): string | null {
  let _
  let rawValue
  [_, _, rawValue] = lineText.partition(":")
  let value = String(String(((() => { const __s = String(rawValue); const __m = 1; if (__m < 0) return __s.split("#"); const __parts: string[] = []; let __rest = __s; for (let __i = 0; __i < __m; __i++) { const __idx = __rest.indexOf("#"); if (__idx < 0) break; __parts.push(__rest.slice(0, __idx)); __rest = __rest.slice(__idx + String("#").length) } __parts.push(__rest); return __parts })())[0]).trim()).replace(new RegExp(`^[${"'\""}]+|[${"'\""}]+$`, 'g'), '')
  if ((String(value).startsWith("0") && (value !== "0"))) {
    return "ConfigMap volume defaultMode should be omitted; leading-zero modes can be rendered as invalid decimal values by the Sealos template path"
  }
  try {
    let numericValue = Number.parseInt(String(value), 10)
  } catch (_err) {
    return "ConfigMap volume defaultMode should be omitted unless explicitly required"
  }
  if ((numericValue > 511)) {
    return "ConfigMap volume defaultMode must be omitted or use a Kubernetes-valid decimal file mode (0-511)"
  }
  return "ConfigMap volume defaultMode should be omitted unless explicitly required"
}

export function checkConfigmapFileMountContract(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  let configmapsByPath = _configmapDocumentsByPath(context)
  for (const doc of asIterable(context.yamlDocuments)) {
    if ((doc.skipChecks || (!isManagedAppWorkloadDocument(doc)))) {
      continue
    }
    if ((!contains(String(pathSuffix(doc.path)).toLowerCase(), TEMPLATE_ARTIFACT_SUFFIXES))) {
      continue
    }
    if ((pathName(doc.path) !== "index.yaml")) {
      continue
    }
    if ((!isRecord(doc.data))) {
      continue
    }
    if ((!contains(((doc.data as any)?.["kind"]), new Set(["Deployment", "StatefulSet"])))) {
      continue
    }
    let workloadName = _metadataName(doc.data)
    if ((workloadName === null)) {
      continue
    }
    let templateSpec = getTemplateSpec(doc.data)
    if ((!isRecord(templateSpec))) {
      continue
    }
    let localConfigmaps = ((configmapsByPath as any)?.[doc.path] ?? {  })
    for (const [lineNumber, lineText] of asIterable(_iterConfigmapDefaultModeLines(doc))) {
      let message = _configmapDefaultModeViolation(lineText)
      if ((message === null)) {
        continue
      }
      violations.push({ ruleId: "R043", path: doc.path, line: lineNumber, message: message })
    }
    for (const volume of asIterable(_iterConfigmapVolumes(templateSpec))) {
      let volumeName = String(String(((volume as any)?.["name"]))).trim()
      let configMap = ((volume as any)?.["configMap"])
      if (!(isRecord(configMap))) throw new Error('assert failed')
      let configmapName = String(String(((configMap as any)?.["name"]))).trim()
      let configmapDoc = ((localConfigmaps as any)?.[configmapName])
      if ((configmapDoc === null)) {
        continue
      }
      let expectedVolumeName = `${workloadName}-cm`
      if ((configmapName !== workloadName)) {
        violations.push({ ruleId: "R043", path: doc.path, line: findLine(doc, "^\\s*configMap\\s*:"), message: `ConfigMap mounted by a managed workload must use the workload metadata.name; expected configMap.name ${workloadName}, got ${configmapName}` })
      }
      if ((volumeName !== expectedVolumeName)) {
        violations.push({ ruleId: "R043", path: doc.path, line: findLine(doc, "^\\s*volumes\\s*:"), message: `ConfigMap volume name must be the managed workload name plus '-cm'; expected ${expectedVolumeName}, got ${volumeName}` })
      }
      let items = ((configMap as any)?.["items"])
      if (Array.isArray(items)) {
        for (const item of asIterable(items)) {
          if ((!isRecord(item))) {
            continue
          }
          let key = ((item as any)?.["key"])
          let itemPath = ((item as any)?.["path"])
          if (((typeof key === "string") && (typeof itemPath === "string") && (itemPath !== key))) {
            violations.push({ ruleId: "R043", path: doc.path, line: findLine(doc, "^\\s*items\\s*:"), message: "ConfigMap volume items.path must equal items.key when items are used, so volumeMount.subPath can match the ConfigMap data key" })
          }
        }
      }
      let dataKeys = _configmapDataKeys(configmapDoc)
      if ((!dataKeys)) {
        continue
      }
      for (const dataKey of asIterable([...asIterable(dataKeys)].sort())) {
        if (((() => { const __re = CONFIGMAP_DATA_KEY_RE; const __s = String(dataKey); const __m = new RegExp('^(?:' + __re.source + ')$', __re.flags).exec(__s); return __m })())) {
          continue
        }
        violations.push({ ruleId: "R043", path: configmapDoc.path, line: findLine(configmapDoc, escapeRegExp(dataKey)), message: `ConfigMap data keys for mounted files must follow scripts/path_converter.py vn naming; got ${dataKey}` })
      }
      let mounts = Array.from(_iterVolumeMounts(templateSpec, volumeName) as any)
      let mountedKeys: Set<string> = new Set()
      for (const mount of asIterable(mounts)) {
        let subPath = ((mount as any)?.["subPath"])
        let mountPath = ((mount as any)?.["mountPath"])
        if (((!(typeof subPath === "string")) || (!String(subPath).trim()))) {
          violations.push({ ruleId: "R043", path: doc.path, line: findLine(doc, "^\\s*volumeMounts\\s*:"), message: "Each ConfigMap file must be mounted as an independent volumeMount with subPath equal to the ConfigMap data key; directory mounts are not allowed" })
          continue
        }
        if ((!contains(subPath, dataKeys))) {
          violations.push({ ruleId: "R043", path: doc.path, line: findLine(doc, escapeRegExp(subPath)), message: `ConfigMap volumeMount.subPath must exactly match a ConfigMap data key; got ${subPath}` })
          continue
        }
        if (((!(typeof mountPath === "string")) || (!String(mountPath).startsWith("/")))) {
          violations.push({ ruleId: "R043", path: doc.path, line: findLine(doc, escapeRegExp(subPath)), message: "ConfigMap volumeMount.mountPath must be an absolute file path" })
        }
        mountedKeys.add(subPath)
      }
      let missingKeys = [...asIterable((dataKeys - mountedKeys))].sort()
      if (missingKeys) {
        violations.push({ ruleId: "R043", path: configmapDoc.path, line: findLine(configmapDoc, escapeRegExp(missingKeys[0])), message: `Every ConfigMap data key must have a separate volumeMount using the same subPath; missing mounts for ${(missingKeys as any).join(", ")}` })
      }
      _checkConfigmapScriptExecution(doc, templateSpec, volumeName, configmapDoc, violations)
    }
  }
  return violations
}

function *_iterRootPrefixIngressBackendServiceNames(data: Record<string, unknown>): Generator<string, void, unknown> {
  let spec = ((data as any)?.["spec"])
  let rules = (isRecord(spec) ? ((spec as any)?.["rules"]) : null)
  if ((!Array.isArray(rules))) {
    return
  }
  for (const rule of asIterable(rules)) {
    let http = (isRecord(rule) ? ((rule as any)?.["http"]) : null)
    let paths = (isRecord(http) ? ((http as any)?.["paths"]) : null)
    if ((!Array.isArray(paths))) {
      continue
    }
    for (const path of asIterable(paths)) {
      if ((!isRecord(path))) {
        continue
      }
      if (((((path as any)?.["pathType"]) !== "Prefix") || (((path as any)?.["path"]) !== "/"))) {
        continue
      }
      let backend = (isRecord(path) ? ((path as any)?.["backend"]) : null)
      let service = (isRecord(backend) ? ((backend as any)?.["service"]) : null)
      let serviceName = (isRecord(service) ? ((service as any)?.["name"]) : null)
      if (((typeof serviceName === "string") && String(serviceName).trim())) {
        yield String(serviceName).trim()
      }
    }
  }
}

function *_iterIngressHttpPathLists(data: Record<string, unknown>): Generator<unknown[], void, unknown> {
  let spec = ((data as any)?.["spec"])
  let rules = (isRecord(spec) ? ((spec as any)?.["rules"]) : null)
  if ((!Array.isArray(rules))) {
    return
  }
  for (const rule of asIterable(rules)) {
    let http = (isRecord(rule) ? ((rule as any)?.["http"]) : null)
    let paths = (isRecord(http) ? ((http as any)?.["paths"]) : null)
    if (Array.isArray(paths)) {
      yield paths
    }
  }
}

function _isRootPrefixIngressPath(path: unknown): boolean {
  return (isRecord(path) && (((path as any)?.["pathType"]) === "Prefix") && (((path as any)?.["path"]) === "/"))
}

function *_iterIngressBackendServiceNames(data: Record<string, unknown>): Generator<string, void, unknown> {
  let spec = ((data as any)?.["spec"])
  let rules = (isRecord(spec) ? ((spec as any)?.["rules"]) : null)
  if ((!Array.isArray(rules))) {
    return
  }
  for (const rule of asIterable(rules)) {
    let http = (isRecord(rule) ? ((rule as any)?.["http"]) : null)
    let paths = (isRecord(http) ? ((http as any)?.["paths"]) : null)
    if ((!Array.isArray(paths))) {
      continue
    }
    for (const path of asIterable(paths)) {
      if ((!isRecord(path))) {
        continue
      }
      if (((((path as any)?.["pathType"]) !== "Prefix") || (((path as any)?.["path"]) !== "/"))) {
        continue
      }
      let backend = (isRecord(path) ? ((path as any)?.["backend"]) : null)
      let service = (isRecord(backend) ? ((backend as any)?.["service"]) : null)
      let serviceName = (isRecord(service) ? ((service as any)?.["name"]) : null)
      if (((typeof serviceName === "string") && String(serviceName).trim())) {
        yield String(serviceName).trim()
      }
    }
  }
}

export function checkIngressNameMatchesBackends(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  let cloudLabelKey = "cloud.sealos.io/app-deploy-manager"
  for (const doc of asIterable(iterDocumentsByKind(context, "Ingress"))) {
    if ((!contains(String(pathSuffix(doc.path)).toLowerCase(), TEMPLATE_ARTIFACT_SUFFIXES))) {
      continue
    }
    if ((pathName(doc.path) !== "index.yaml")) {
      continue
    }
    if ((!isRecord(doc.data))) {
      continue
    }
    let metadata = ((doc.data as any)?.["metadata"])
    let metadataName = (isRecord(metadata) ? ((metadata as any)?.["name"]) : null)
    let labels = (isRecord(metadata) ? ((metadata as any)?.["labels"]) : null)
    let cloudLabel = (isRecord(labels) ? ((labels as any)?.[cloudLabelKey]) : null)
    if (((!(typeof metadataName === "string")) || (!String(metadataName).trim()))) {
      continue
    }
    metadataName = String(metadataName).trim()
    let rootPrefixBackendNames = Array.from(_iterRootPrefixIngressBackendServiceNames(doc.data) as any)
    if ((!rootPrefixBackendNames)) {
      continue
    }
    if (((!(typeof cloudLabel === "string")) || (!String(cloudLabel).trim()))) {
      addDocViolation(violations, { ruleId: "R031", doc: doc, pattern: escapeRegExp(cloudLabelKey), defaultPattern: "^\\s*labels\\s*:", message: "Ingress metadata.labels.cloud.sealos.io/app-deploy-manager is required and must match metadata.name" })
    } else if ((String(cloudLabel).trim() !== metadataName)) {
      addDocViolation(violations, { ruleId: "R031", doc: doc, pattern: escapeRegExp(cloudLabelKey), defaultPattern: "^\\s*labels\\s*:", message: "Ingress metadata.labels.cloud.sealos.io/app-deploy-manager must match metadata.name" })
    }
    for (const backendName of asIterable(rootPrefixBackendNames)) {
      if ((backendName === metadataName)) {
        continue
      }
      addDocViolation(violations, { ruleId: "R031", doc: doc, pattern: "^\\s*name\\s*:", defaultPattern: "^\\s*service\\s*:", message: "Ingress backend service.name must match Ingress metadata.name" })
      break
    }
  }
  return violations
}

function *_iterRootPrefixIngressBackendServices(data: Record<string, unknown>): Generator<Record<string, unknown>, void, unknown> {
  let spec = ((data as any)?.["spec"])
  let rules = (isRecord(spec) ? ((spec as any)?.["rules"]) : null)
  if ((!Array.isArray(rules))) {
    return
  }
  for (const rule of asIterable(rules)) {
    let http = (isRecord(rule) ? ((rule as any)?.["http"]) : null)
    let paths = (isRecord(http) ? ((http as any)?.["paths"]) : null)
    if ((!Array.isArray(paths))) {
      continue
    }
    for (const path of asIterable(paths)) {
      if ((!isRecord(path))) {
        continue
      }
      if (((((path as any)?.["pathType"]) !== "Prefix") || (((path as any)?.["path"]) !== "/"))) {
        continue
      }
      let backend = ((path as any)?.["backend"])
      let service = (isRecord(backend) ? ((backend as any)?.["service"]) : null)
      yield (isRecord(service) ? service : {  })
    }
  }
}

function _collectDeclaredServicePorts(context: ScanContext): Record<[string, string], Set<number>> {
  let portsByService: Record<[string, string], Set<number>> = {  }
  for (const doc of asIterable(iterDocumentsByKind(context, "Service"))) {
    if ((!contains(String(pathSuffix(doc.path)).toLowerCase(), TEMPLATE_ARTIFACT_SUFFIXES))) {
      continue
    }
    if (((pathName(doc.path) !== "index.yaml") || (!isRecord(doc.data)))) {
      continue
    }
    let metadata = ((doc.data as any)?.["metadata"])
    let serviceName = (isRecord(metadata) ? ((metadata as any)?.["name"]) : null)
    if (((!(typeof serviceName === "string")) || (!String(serviceName).trim()))) {
      continue
    }
    let spec = ((doc.data as any)?.["spec"])
    let ports = (isRecord(spec) ? ((spec as any)?.["ports"]) : null)
    let serviceKey = [doc.path, String(serviceName).trim()]
    if ((!Array.isArray(ports))) {
      ((() => { const __o = portsByService as any; if (__o[serviceKey] === undefined) __o[serviceKey] = new Set(); return __o[serviceKey] })())
      continue
    }
    let declaredPorts = ((() => { const __o = portsByService as any; if (__o[serviceKey] === undefined) __o[serviceKey] = new Set(); return __o[serviceKey] })())
    for (const port of asIterable(ports)) {
      let portNumber = (isRecord(port) ? ((port as any)?.["port"]) : null)
      if (((typeof portNumber === "number" && Number.isInteger(portNumber)) && (!(typeof portNumber === "boolean")))) {
        declaredPorts.add(portNumber)
      }
    }
  }
  return portsByService
}

export function checkRootIngressBackendPortNumbers(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  let portsByService = _collectDeclaredServicePorts(context)
  for (const doc of asIterable(iterDocumentsByKind(context, "Ingress"))) {
    if ((!contains(String(pathSuffix(doc.path)).toLowerCase(), TEMPLATE_ARTIFACT_SUFFIXES))) {
      continue
    }
    if (((pathName(doc.path) !== "index.yaml") || (!isRecord(doc.data)))) {
      continue
    }
    for (const paths of asIterable(_iterIngressHttpPathLists(doc.data))) {
      let hasRootPrefix = Array.from(paths as any).some((path) => (Boolean(_isRootPrefixIngressPath(path))))
      if ((hasRootPrefix && (!_isRootPrefixIngressPath((paths ? paths[0] : null))))) {
        addDocViolation(violations, { ruleId: "R051", doc: doc, pattern: "^\\s*path\\s*:\\s*['\\\"]?/['\\\"]?\\s*$", defaultPattern: "^\\s*paths\\s*:", message: "Root-path Prefix Ingress route must be first in its HTTP path list for Launchpad public-address discovery" })
      }
    }
    for (const service of asIterable(_iterRootPrefixIngressBackendServices(doc.data))) {
      let serviceName = ((service as any)?.["name"])
      if (((!(typeof serviceName === "string")) || (!String(serviceName).trim()))) {
        addDocViolation(violations, { ruleId: "R051", doc: doc, pattern: "^\\s*service\\s*:", defaultPattern: "^\\s*backend\\s*:", message: "Root-path Prefix Ingress backend.service.name must reference a declared Service" })
        continue
      }
      serviceName = String(serviceName).trim()
      let port = ((service as any)?.["port"])
      let portNumber = (isRecord(port) ? ((port as any)?.["number"]) : null)
      let usesNamedPort = (isRecord(port) && contains("name", port))
      if (((!(typeof portNumber === "number" && Number.isInteger(portNumber))) || (typeof portNumber === "boolean") || usesNamedPort)) {
        addDocViolation(violations, { ruleId: "R051", doc: doc, pattern: "^\\s*port\\s*:", defaultPattern: "^\\s*service\\s*:", message: "Root-path Prefix Ingress backend.service.port must use an integer number for Launchpad public-address discovery" })
        continue
      }
      let serviceKey = [doc.path, serviceName]
      if ((!contains(serviceKey, portsByService))) {
        addDocViolation(violations, { ruleId: "R051", doc: doc, pattern: escapeRegExp(serviceName), defaultPattern: "^\\s*service\\s*:", message: `Ingress backend Service ${serviceName} is not declared in the template artifact` })
        continue
      }
      let declaredPorts = portsByService[serviceKey]
      if ((!contains(portNumber, declaredPorts))) {
        let declaredText = ((Array.from([...asIterable(declaredPorts)].sort() as any).map((value) => (String(value))) as any).join(", ") || "none")
        addDocViolation(violations, { ruleId: "R051", doc: doc, pattern: String(portNumber), defaultPattern: "^\\s*port\\s*:", message: `Ingress backend port ${portNumber} must match Service ${serviceName} spec.ports[*].port; declared ports: ${declaredText}` })
      }
    }
  }
  return violations
}

function _normalizeAnnotationValue(value: unknown): string | null {
  if ((typeof value === "string")) {
    return (Array.from(splitLines(String(String(value).trim())) as any).map((line) => (String(line).trimEnd())) as any).join("\n")
  }
  if ((value === null)) {
    return null
  }
  return String(String(value)).trim()
}

function _isWebsocketPortName(value: unknown): boolean {
  if ((!(typeof value === "string"))) {
    return false
  }
  let normalized = String(String(String(value).toLowerCase()).replace(new RegExp("[^a-z0-9]+", 'g'), "-" as any)).replace(new RegExp(`^[${"-"}]+|[${"-"}]+$`, 'g'), '')
  return (contains(normalized, WEBSOCKET_PORT_NAME_TOKENS) || Array.from(String(normalized).split("-") as any).some((token) => (Boolean(contains(token, WEBSOCKET_PORT_NAME_TOKENS)))))
}

function _servicePortKey(value: unknown): string | null {
  if ((typeof value === "number" && Number.isInteger(value))) {
    return String(value)
  }
  if (((typeof value === "string") && String(value).trim())) {
    return String(value).trim()
  }
  return null
}

function _collectServiceWebsocketPorts(context: ScanContext): Record<string, Set<string>> {
  let portsByService: Record<string, Set<string>> = {  }
  for (const doc of asIterable(iterDocumentsByKind(context, "Service"))) {
    if ((!contains(String(pathSuffix(doc.path)).toLowerCase(), TEMPLATE_ARTIFACT_SUFFIXES))) {
      continue
    }
    if ((pathName(doc.path) !== "index.yaml")) {
      continue
    }
    if ((!isRecord(doc.data))) {
      continue
    }
    let metadata = ((doc.data as any)?.["metadata"])
    let serviceName = (isRecord(metadata) ? ((metadata as any)?.["name"]) : null)
    if (((!(typeof serviceName === "string")) || (!String(serviceName).trim()))) {
      continue
    }
    let spec = ((doc.data as any)?.["spec"])
    let ports = (isRecord(spec) ? ((spec as any)?.["ports"]) : null)
    if ((!Array.isArray(ports))) {
      continue
    }
    for (const port of asIterable(ports)) {
      if ((!isRecord(port))) {
        continue
      }
      if ((!_isWebsocketPortName(((port as any)?.["name"])))) {
        continue
      }
      for (const key of asIterable(["name", "port", "targetPort"])) {
        let portKey = _servicePortKey(((port as any)?.[key]))
        if ((portKey === null)) {
          continue
        }
        ((() => { const __o = portsByService as any; if (__o[String(serviceName).trim()] === undefined) __o[String(serviceName).trim()] = new Set(); return __o[String(serviceName).trim()] })()).add(portKey)
      }
    }
  }
  return portsByService
}

function *_iterIngressBackendServicePorts(data: Record<string, unknown>): Generator<[string, string], void, unknown> {
  let spec = ((data as any)?.["spec"])
  let rules = (isRecord(spec) ? ((spec as any)?.["rules"]) : null)
  if ((!Array.isArray(rules))) {
    return
  }
  for (const rule of asIterable(rules)) {
    let http = (isRecord(rule) ? ((rule as any)?.["http"]) : null)
    let paths = (isRecord(http) ? ((http as any)?.["paths"]) : null)
    if ((!Array.isArray(paths))) {
      continue
    }
    for (const path of asIterable(paths)) {
      let backend = (isRecord(path) ? ((path as any)?.["backend"]) : null)
      let service = (isRecord(backend) ? ((backend as any)?.["service"]) : null)
      if ((!isRecord(service))) {
        continue
      }
      let name = ((service as any)?.["name"])
      let port = ((service as any)?.["port"])
      if (((!(typeof name === "string")) || (!isRecord(port)))) {
        continue
      }
      let portKey = _servicePortKey(((port as any)?.["name"]))
      if ((portKey === null)) {
        portKey = _servicePortKey(((port as any)?.["number"]))
      }
      if ((portKey !== null)) {
        yield [String(name).trim(), portKey]
      }
    }
  }
}

export function checkHttpIngressAnnotations(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(iterDocumentsByKind(context, "Ingress"))) {
    if ((!contains(String(pathSuffix(doc.path)).toLowerCase(), TEMPLATE_ARTIFACT_SUFFIXES))) {
      continue
    }
    if ((pathName(doc.path) !== "index.yaml")) {
      continue
    }
    if ((!isRecord(doc.data))) {
      continue
    }
    let metadata = ((doc.data as any)?.["metadata"])
    let annotations = (isRecord(metadata) ? ((metadata as any)?.["annotations"]) : null)
    if ((!isRecord(annotations))) {
      addDocViolation(violations, { ruleId: "R026", doc: doc, pattern: "^\\s*annotations\\s*:", defaultPattern: "^\\s*metadata\\s*:", message: "Ingress metadata.annotations must define the required HTTP annotation set" })
      continue
    }
    let backendProtocol = _normalizeAnnotationValue(((annotations as any)?.["nginx.ingress.kubernetes.io/backend-protocol"]))
    if (((backendProtocol !== null) && (String(backendProtocol).toUpperCase() !== "HTTP"))) {
      continue
    }
    for (const [key, expected] of asIterable(Object.entries(HTTP_INGRESS_REQUIRED_ANNOTATIONS as any))) {
      let actualNormalized = _normalizeAnnotationValue(((annotations as any)?.[key]))
      let expectedNormalized = _normalizeAnnotationValue(expected)
      if ((actualNormalized === expectedNormalized)) {
        continue
      }
      addDocViolation(violations, { ruleId: "R026", doc: doc, pattern: escapeRegExp(key), defaultPattern: "^\\s*annotations\\s*:", message: `Ingress annotation '${key}' must match the required HTTP default` })
    }
  }
  return violations
}

export function checkWebsocketIngressAnnotations(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  let serviceWebsocketPorts = _collectServiceWebsocketPorts(context)
  for (const doc of asIterable(iterDocumentsByKind(context, "Ingress"))) {
    if ((!contains(String(pathSuffix(doc.path)).toLowerCase(), TEMPLATE_ARTIFACT_SUFFIXES))) {
      continue
    }
    if ((pathName(doc.path) !== "index.yaml")) {
      continue
    }
    if ((!isRecord(doc.data))) {
      continue
    }
    let metadata = ((doc.data as any)?.["metadata"])
    let annotations = (isRecord(metadata) ? ((metadata as any)?.["annotations"]) : null)
    let backendProtocol = null
    if (isRecord(annotations)) {
      backendProtocol = _normalizeAnnotationValue(((annotations as any)?.["nginx.ingress.kubernetes.io/backend-protocol"]))
    }
    let routesWebsocketPort = Array.from(_iterIngressBackendServicePorts(doc.data) as any).some(([serviceName, portKey]) => (Boolean(contains(portKey, ((serviceWebsocketPorts as any)?.[serviceName] ?? new Set())))))
    let declaresWebsocket = ((backendProtocol !== null) && (String(backendProtocol).toUpperCase() === "WS"))
    if (((!declaresWebsocket) && (!routesWebsocketPort))) {
      continue
    }
    if ((!isRecord(annotations))) {
      addDocViolation(violations, { ruleId: "R048", doc: doc, pattern: "^\\s*annotations\\s*:", defaultPattern: "^\\s*metadata\\s*:", message: "WebSocket Ingress metadata.annotations must define the required WS annotation set" })
      continue
    }
    for (const [key, expected] of asIterable(Object.entries(WEBSOCKET_INGRESS_REQUIRED_ANNOTATIONS as any))) {
      let actualNormalized = _normalizeAnnotationValue(((annotations as any)?.[key]))
      let expectedNormalized = _normalizeAnnotationValue(expected)
      if ((actualNormalized === expectedNormalized)) {
        continue
      }
      addDocViolation(violations, { ruleId: "R048", doc: doc, pattern: escapeRegExp(key), defaultPattern: "^\\s*annotations\\s*:", message: `Ingress annotation '${key}' must match the required WebSocket default` })
    }
  }
  return violations
}

function _isTemplateArtifactDocument(doc: any): boolean {
  return (contains(String(pathSuffix(doc.path)).toLowerCase(), TEMPLATE_ARTIFACT_SUFFIXES) && (pathName(doc.path) === "index.yaml"))
}

function _imageRepositoryBasename(image: string): string {
  let reference = String(image).trim()
  if (contains("@", reference)) {
    reference = ((() => { const __s = String(reference); const __m = 1; if (__m < 0) return __s.split("@"); const __parts: string[] = []; let __rest = __s; for (let __i = 0; __i < __m; __i++) { const __idx = __rest.indexOf("@"); if (__idx < 0) break; __parts.push(__rest.slice(0, __idx)); __rest = __rest.slice(__idx + String("@").length) } __parts.push(__rest); return __parts })())[0]
  }
  let slashIndex = String(reference).lastIndexOf("/")
  let colonIndex = String(reference).lastIndexOf(":")
  if ((colonIndex > slashIndex)) {
    reference = reference.slice(0, colonIndex)
  }
  return String(((() => { const __s = String(reference); const __sep = String("/"); const __m = 1; if (__m < 0) return __s.split(__sep); const __parts: string[] = []; let __rest = __s; for (let __i = 0; __i < __m; __i++) { const __idx = __rest.lastIndexOf(__sep); if (__idx < 0) break; __parts.unshift(__rest.slice(__idx + __sep.length)); __rest = __rest.slice(0, __idx) } __parts.unshift(__rest); return __parts })())[(-1)]).toLowerCase()
}

function _imageRepository(image: string): string {
  let reference = String(image).trim()
  if (contains("@", reference)) {
    reference = ((() => { const __s = String(reference); const __m = 1; if (__m < 0) return __s.split("@"); const __parts: string[] = []; let __rest = __s; for (let __i = 0; __i < __m; __i++) { const __idx = __rest.indexOf("@"); if (__idx < 0) break; __parts.push(__rest.slice(0, __idx)); __rest = __rest.slice(__idx + String("@").length) } __parts.push(__rest); return __parts })())[0]
  }
  let slashIndex = String(reference).lastIndexOf("/")
  let colonIndex = String(reference).lastIndexOf(":")
  if ((colonIndex > slashIndex)) {
    reference = reference.slice(0, colonIndex)
  }
  return String(reference).toLowerCase()
}

function _isDatabaseImage(image: string): boolean {
  return contains(_imageRepositoryBasename(image), DATABASE_WORKLOAD_IMAGE_NAMES)
}

function _normalizeDatabaseToken(value: unknown): string {
  return String(String(String(String(value)).toLowerCase()).replace(new RegExp("[^a-z0-9]+", 'g'), "-" as any)).replace(new RegExp(`^[${"-"}]+|[${"-"}]+$`, 'g'), '')
}

function *_iterMappingValues(value: unknown): Generator<string, void, unknown> {
  if (isRecord(value)) {
    for (const [key, item] of asIterable(Object.entries(value as any))) {
      if ((typeof key === "string")) {
        yield key
      }
      yield* _iterMappingValues(item) as any
    }
  } else if (Array.isArray(value)) {
    for (const item of asIterable(value)) {
      yield* _iterMappingValues(item) as any
    }
  } else if ((typeof value === "string")) {
    yield value
  }
}

function _matchesDatabaseResourceName(value: unknown): boolean {
  return contains(_normalizeDatabaseToken(value), DATABASE_RESOURCE_NAME_TOKENS)
}

function _containsAnyDatabaseToken(value: unknown, tokens: Set<string>): boolean {
  let normalized = _normalizeDatabaseToken(value)
  if ((!normalized)) {
    return false
  }
  return Boolean(setIntersection(new Set(String(normalized).split("-") as any), tokens))
}

function _isDatabaseClientJob(doc: any): boolean {
  if (((!isRecord(doc.data)) || (!contains(((doc.data as any)?.["kind"]), new Set(["Job", "CronJob"]))))) {
    return false
  }
  let metadata = ((doc.data as any)?.["metadata"])
  let names: unknown[] = []
  if (isRecord(metadata)) {
    names.push(((metadata as any)?.["name"]))
  }
  for (const container of asIterable(iterContainers(doc.data))) {
    names.push(((container as any)?.["name"]))
  }
  return Array.from(names as any).some((name) => (Boolean(_containsAnyDatabaseToken(name, DATABASE_CLIENT_JOB_TOKENS))))
}

function _workloadTemplateSpec(data: Record<string, unknown>): Record<string, unknown> | null {
  let kind = ((data as any)?.["kind"])
  let spec = ((data as any)?.["spec"])
  if ((!isRecord(spec))) {
    return null
  }
  if (contains(kind, new Set(["Deployment", "StatefulSet", "DaemonSet", "Job"]))) {
    let template = ((spec as any)?.["template"])
    let templateSpec = (isRecord(template) ? ((template as any)?.["spec"]) : null)
    return (isRecord(templateSpec) ? templateSpec : null)
  }
  if ((kind === "CronJob")) {
    let jobTemplate = ((spec as any)?.["jobTemplate"])
    let jobSpec = (isRecord(jobTemplate) ? ((jobTemplate as any)?.["spec"]) : null)
    template = (isRecord(jobSpec) ? ((jobSpec as any)?.["template"]) : null)
    templateSpec = (isRecord(template) ? ((template as any)?.["spec"]) : null)
    return (isRecord(templateSpec) ? templateSpec : null)
  }
  return null
}

function *_iterMainWorkloadContainers(data: Record<string, unknown>): Generator<Record<string, unknown>, void, unknown> {
  let templateSpec = _workloadTemplateSpec(data)
  let containers = (isRecord(templateSpec) ? ((templateSpec as any)?.["containers"]) : null)
  if ((!Array.isArray(containers))) {
    return
  }
  for (const container of asIterable(containers)) {
    if (isRecord(container)) {
      yield container
    }
  }
}

function _isDatabaseLikeWorkload(doc: any): boolean {
  if ((!isRecord(doc.data))) {
    return false
  }
  if ((!contains(((doc.data as any)?.["kind"]), DATABASE_RAW_WORKLOAD_KINDS))) {
    return false
  }
  if (_isDatabaseClientJob(doc)) {
    return false
  }
  for (const container of asIterable(_iterMainWorkloadContainers(doc.data))) {
    let image = ((container as any)?.["image"])
    if (((typeof image === "string") && _isDatabaseImage(image))) {
      return true
    }
    if (_matchesDatabaseResourceName(((container as any)?.["name"]))) {
      return true
    }
  }
  return false
}

function _isDatabaseLikeService(doc: any): boolean {
  if (((!isRecord(doc.data)) || (((doc.data as any)?.["kind"]) !== "Service"))) {
    return false
  }
  let metadata = ((doc.data as any)?.["metadata"])
  if (isRecord(metadata)) {
    for (const value of asIterable(_iterMappingValues({ name: ((metadata as any)?.["name"]), labels: ((metadata as any)?.["labels"]) }))) {
      if (_matchesDatabaseResourceName(value)) {
        return true
      }
    }
  }
  let spec = ((doc.data as any)?.["spec"])
  if (isRecord(spec)) {
    let selector = ((spec as any)?.["selector"])
    if (isRecord(selector)) {
      for (const value of asIterable(_iterMappingValues(selector))) {
        if (_matchesDatabaseResourceName(value)) {
          return true
        }
      }
    }
  }
  return false
}

function _asStringList(value: unknown): string[] {
  if ((typeof value === "string")) {
    return [value]
  }
  if (Array.isArray(value)) {
    return Array.from(value as any).filter((item) => (((item !== null) && String(String(item)).trim()))).map((item) => (String(item)))
  }
  return []
}

function _shellScriptPart(container: Record<string, unknown>): string {
  let command = _asStringList(((container as any)?.["command"]))
  let args = _asStringList(((container as any)?.["args"]))
  if ((!command)) {
    return ""
  }
  let shell = String(String(command[0]).trim()).toLowerCase()
  if ((!contains(shell, MAIN_CONTAINER_SHELLS))) {
    return ""
  }
  let candidates: string[] = []
  for (const item of asIterable((command.slice(1) + args))) {
    let stripped = String(item).trim()
    if (contains(stripped, new Set(["-c", "-ec", "-e", "-eux", "-euxc", "-ex", "-exc", "-lc"]))) {
      continue
    }
    candidates.push(item)
  }
  return String((candidates as any).join("\n")).trim()
}

function _isAllowedShortMainContainerWrapper(script: string): boolean {
  let normalized = (String(script).trim().split(/\s+/) as any).join(" ")
  if ((!normalized)) {
    return true
  }
  if (contains("\n", script)) {
    return false
  }
  if ((((() => { const __v = normalized as any; if (__v == null) return 0; if (typeof __v.length === "number") return __v.length; if (__v instanceof Set || __v instanceof Map) return __v.size; if (typeof __v === "object") return Object.keys(__v).length; return 0 })()) > MAIN_CONTAINER_MAX_SCRIPT_CHARS)) {
    return false
  }
  if (((() => { const __re = MAIN_CONTAINER_ALLOWED_SHORT_SETUP_RE; const __m = new RegExp('^(?:' + __re.source + ')', __re.flags).exec(String(normalized)); return __m })())) {
    return true
  }
  if (String(normalized).startsWith("exec ")) {
    return true
  }
  return false
}

function _mainContainerStartupIssue(container: Record<string, unknown>): string | null {
  let command = _asStringList(((container as any)?.["command"]))
  let args = _asStringList(((container as any)?.["args"]))
  if (((!command) && (!args))) {
    return null
  }
  let shellScript = _shellScriptPart(container)
  if ((!shellScript)) {
    let multilineParts = Array.from((command + args) as any).filter((part) => (contains("\n", part))).map((part) => (part))
    let operatorParts = Array.from((command + args) as any).filter((part) => ((new RegExp("(?:&&|\\|\\|)", "").exec(String(part)) && MAIN_CONTAINER_BOOTSTRAP_RE.exec(String(part))))).map((part) => (part))
    if (multilineParts) {
      let script = (multilineParts as any).join("\n")
    } else if (operatorParts) {
      script = (operatorParts as any).join(" ")
    } else {
      return null
    }
  } else {
    script = shellScript
  }
  let normalized = (String(script).trim().split(/\s+/) as any).join(" ")
  let commandCount = ((() => { const __v = Array.from(String(normalized).split(new RegExp("\\s*(?:&&|;|\\|\\|)\\s*", "")) as any).filter((part) => (String(part).trim())).map((part) => (part)) as any; if (__v == null) return 0; if (typeof __v.length === "number") return __v.length; if (__v instanceof Set || __v instanceof Map) return __v.size; if (typeof __v === "object") return Object.keys(__v).length; return 0 })())
  if (_isAllowedShortMainContainerWrapper(script)) {
    return null
  }
  if (contains("\n", script)) {
    return "main container startup uses a multi-line shell script"
  }
  if ((((() => { const __v = normalized as any; if (__v == null) return 0; if (typeof __v.length === "number") return __v.length; if (__v instanceof Set || __v instanceof Map) return __v.size; if (typeof __v === "object") return Object.keys(__v).length; return 0 })()) > MAIN_CONTAINER_MAX_SCRIPT_CHARS)) {
    return "main container startup command is too long for an auditable runtime entry"
  }
  if ((commandCount > MAIN_CONTAINER_MAX_SCRIPT_COMMANDS)) {
    return "main container startup chains too many commands"
  }
  if (MAIN_CONTAINER_BOOTSTRAP_RE.exec(String(normalized))) {
    return "main container startup contains bootstrap/setup commands"
  }
  if ((shellScript && (!contains("exec ", normalized)))) {
    return "main container shell wrapper should exec the final process"
  }
  return null
}

export function checkDatabaseServicesUseClusters(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(context.yamlDocuments)) {
    if ((doc.skipChecks || (!_isTemplateArtifactDocument(doc)))) {
      continue
    }
    if ((!isRecord(doc.data))) {
      continue
    }
    let kind = ((doc.data as any)?.["kind"])
    if ((!contains(kind, DATABASE_RAW_RESOURCE_KINDS))) {
      continue
    }
    let isDatabaseResource = ((kind === "Service") ? _isDatabaseLikeService(doc) : _isDatabaseLikeWorkload(doc))
    if ((!isDatabaseResource)) {
      continue
    }
    addDocViolation(violations, { ruleId: "R039", doc: doc, pattern: "^\\s*kind\\s*:\\s*(?:Deployment|StatefulSet|DaemonSet|Job|CronJob|Service)\\s*$", defaultPattern: "^\\s*kind\\s*:", message: "database services require KubeBlocks Cluster resources; raw Kubernetes resources are invalid" })
  }
  return violations
}

export function checkMainContainerStartupContract(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(context.yamlDocuments)) {
    if ((doc.skipChecks || (!isRecord(doc.data)))) {
      continue
    }
    if ((!_isTemplateArtifactDocument(doc))) {
      continue
    }
    if (((!isAppWorkloadDocument(doc)) || (!hasManagedWorkloadMarker(doc.data)))) {
      continue
    }
    let templateSpec = getTemplateSpec(doc.data)
    let containers = (isRecord(templateSpec) ? ((templateSpec as any)?.["containers"]) : null)
    if ((!Array.isArray(containers))) {
      continue
    }
    for (const container of asIterable(containers)) {
      if ((!isRecord(container))) {
        continue
      }
      let issue = _mainContainerStartupIssue(container)
      if ((issue === null)) {
        continue
      }
      addDocViolation(violations, { ruleId: "R042", doc: doc, pattern: "^\\s*(command|args)\\s*:", defaultPattern: "^\\s*containers\\s*:", message: `${issue}; move file preparation, permissions, database bootstrap, and compatibility repair into initContainers, Jobs, or ConfigMap scripts. Keep only the official entrypoint/args or a short exec wrapper in the main container.` })
    }
  }
  return violations
}

function _templateInputsByPath(context: ScanContext): Record<string, Record<string, string>> {
  let inputsByPath: Record<string, Record<string, string>> = {  }
  for (const doc of asIterable(_iterTemplateArtifactDocuments(context))) {
    if ((!isRecord(doc.data))) {
      continue
    }
    let spec = ((doc.data as any)?.["spec"])
    let inputs = (isRecord(spec) ? ((spec as any)?.["inputs"]) : null)
    if ((!isRecord(inputs))) {
      continue
    }
    let inputTypes: Record<string, string> = {  }
    for (const [inputName, inputSpec] of asIterable(Object.entries(inputs as any))) {
      if (((!(typeof inputName === "string")) || (!isRecord(inputSpec)))) {
        continue
      }
      let inputType = ((inputSpec as any)?.["type"])
      if ((typeof inputType === "string")) {
        inputTypes[inputName] = String(String(inputType).trim()).toLowerCase()
      }
    }
    inputsByPath[doc.path] = inputTypes
  }
  return inputsByPath
}

function _templateInputSpecsByPath(context: ScanContext): Record<string, Record<string, Record<string, unknown>>> {
  let inputsByPath: Record<string, Record<string, Record<string, unknown>>> = {  }
  for (const doc of asIterable(_iterTemplateArtifactDocuments(context))) {
    if ((!isRecord(doc.data))) {
      continue
    }
    let spec = ((doc.data as any)?.["spec"])
    let inputs = (isRecord(spec) ? ((spec as any)?.["inputs"]) : null)
    if ((!isRecord(inputs))) {
      continue
    }
    let inputSpecs = ((() => { const __o = inputsByPath as any; if (__o[doc.path] === undefined) __o[doc.path] = {  }; return __o[doc.path] })())
    for (const [inputName, inputSpec] of asIterable(Object.entries(inputs as any))) {
      if (((typeof inputName === "string") && isRecord(inputSpec))) {
        inputSpecs[inputName] = inputSpec
      }
    }
  }
  return inputsByPath
}

function _templateDefaultSpecsByPath(context: ScanContext): Record<string, Record<string, unknown>> {
  let defaultsByPath: Record<string, Record<string, unknown>> = {  }
  for (const doc of asIterable(_iterTemplateArtifactDocuments(context))) {
    if ((!isRecord(doc.data))) {
      continue
    }
    let spec = ((doc.data as any)?.["spec"])
    let defaults = (isRecord(spec) ? ((spec as any)?.["defaults"]) : null)
    if (isRecord(defaults)) {
      defaultsByPath[doc.path] = defaults
    }
  }
  return defaultsByPath
}

function _runtimeEnvEntries(container: Record<string, unknown>): Record<string, Record<string, unknown>> {
  let envEntries: Record<string, Record<string, unknown>> = {  }
  let env = ((container as any)?.["env"])
  if ((!Array.isArray(env))) {
    return envEntries
  }
  for (const item of asIterable(env)) {
    if ((!isRecord(item))) {
      continue
    }
    let name = ((item as any)?.["name"])
    if (((typeof name === "string") && String(name).trim())) {
      envEntries[String(name).trim()] = item
    }
  }
  return envEntries
}

function _resolveTemplateRuntimeValue(rawValue: unknown, defaultSpecs: Record<string, unknown>, inputSpecs: Record<string, Record<string, unknown>>): [string, unknown] {
  if ((!(typeof rawValue === "string"))) {
    return ["literal", rawValue]
  }
  let value = String(rawValue).trim()
  let defaultMatch = ((() => { const __re = TEMPLATE_DEFAULT_REF_RE; const __s = String(value); const __m = new RegExp('^(?:' + __re.source + ')$', __re.flags).exec(__s); return __m })())
  if (defaultMatch) {
    let defaultSpec = ((defaultSpecs as any)?.[(defaultMatch as RegExpMatchArray)[1]])
    if (isRecord(defaultSpec)) {
      return ["default", ((defaultSpec as any)?.["value"])]
    }
    return ["default", defaultSpec]
  }
  let inputMatch = ((() => { const __re = TEMPLATE_INPUT_FULL_REF_RE; const __s = String(value); const __m = new RegExp('^(?:' + __re.source + ')$', __re.flags).exec(__s); return __m })())
  if (inputMatch) {
    let inputSpec = ((inputSpecs as any)?.[(inputMatch as RegExpMatchArray)[1]])
    if ((!isRecord(inputSpec))) {
      return ["missing_input", null]
    }
    if (((((inputSpec as any)?.["required"]) === true) && (!contains("default", inputSpec)))) {
      return ["required_input", null]
    }
    return ["input_default", ((inputSpec as any)?.["default"])]
  }
  return ["literal", rawValue]
}

function _runtimeValueSatisfiesConstraint(value: unknown, constraint: Record<string, unknown>): boolean {
  let expectedFormat = ((constraint as any)?.["format"])
  let expectedLength = ((constraint as any)?.["length"])
  if ((!(typeof value === "string"))) {
    return false
  }
  if (((typeof expectedLength === "number" && Number.isInteger(expectedLength)) && (((() => { const __v = value as any; if (__v == null) return 0; if (typeof __v.length === "number") return __v.length; if (__v instanceof Set || __v instanceof Map) return __v.size; if (typeof __v === "object") return Object.keys(__v).length; return 0 })()) !== expectedLength))) {
    return false
  }
  if ((expectedFormat === "hex")) {
    return (((() => { const __re = HEX_VALUE_RE; const __s = String(value); const __m = new RegExp('^(?:' + __re.source + ')$', __re.flags).exec(__s); return __m })()) !== null)
  }
  return false
}

export function checkRuntimeEnvValueConstraints(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  let defaultsByPath = _templateDefaultSpecsByPath(context)
  let inputsByPath = _templateInputSpecsByPath(context)
  for (const doc of asIterable(context.yamlDocuments)) {
    if ((doc.skipChecks || (!isRecord(doc.data)))) {
      continue
    }
    if ((!_isTemplateArtifactDocument(doc))) {
      continue
    }
    if (((!isAppWorkloadDocument(doc)) || (!hasManagedWorkloadMarker(doc.data)))) {
      continue
    }
    let templateSpec = getTemplateSpec(doc.data)
    let containers = (isRecord(templateSpec) ? ((templateSpec as any)?.["containers"]) : null)
    if ((!Array.isArray(containers))) {
      continue
    }
    for (const container of asIterable(containers)) {
      if ((!isRecord(container))) {
        continue
      }
      let image = ((container as any)?.["image"])
      if ((!(typeof image === "string"))) {
        continue
      }
      let expectations = ((RUNTIME_ENV_VALUE_CONSTRAINTS as any)?.[_imageRepository(image)])
      if ((!expectations)) {
        continue
      }
      let envEntries = _runtimeEnvEntries(container)
      for (const [envName, constraint] of asIterable(Object.entries(expectations as any))) {
        let envItem = ((envEntries as any)?.[envName])
        if ((envItem === null)) {
          addDocViolation(violations, { ruleId: "R053", doc: doc, pattern: "^\\s*env\\s*:", defaultPattern: "^\\s*containers\\s*:", message: `${envName} is required by the official runtime contract` })
          continue
        }
        let [sourceKind, resolvedValue] = _resolveTemplateRuntimeValue(((envItem as any)?.["value"]), ((defaultsByPath as any)?.[doc.path] ?? {  }), ((inputsByPath as any)?.[doc.path] ?? {  }))
        if ((sourceKind === "required_input")) {
          continue
        }
        if (_runtimeValueSatisfiesConstraint(resolvedValue, constraint)) {
          continue
        }
        let expectedFormat = ((constraint as any)?.["format"] ?? "documented")
        let expectedLength = ((constraint as any)?.["length"])
        let expectedText = (expectedLength ? `${expectedLength}-character ${expectedFormat}` : String(expectedFormat))
        addDocViolation(violations, { ruleId: "R053", doc: doc, pattern: `^\\s*-\\s*name\\s*:\\s*${escapeRegExp(envName)}\\s*$`, defaultPattern: "^\\s*env\\s*:", message: `${envName} must use a valid ${expectedText} value or a required input without a generated default; generic random() output does not satisfy this contract` })
      }
    }
  }
  return violations
}

function _runtimeValueIsNonemptyCredential(rawValue: unknown, defaultSpecs: Record<string, unknown>, inputSpecs: Record<string, Record<string, unknown>>): boolean {
  let [sourceKind, resolvedValue] = _resolveTemplateRuntimeValue(rawValue, defaultSpecs, inputSpecs)
  if ((sourceKind === "required_input")) {
    return true
  }
  if ((!(typeof resolvedValue === "string"))) {
    return false
  }
  let value = String(resolvedValue).trim()
  if ((!value)) {
    return false
  }
  if ((String(value).startsWith("${{") && String(value).endsWith("}}"))) {
    return false
  }
  return true
}

export function checkRuntimeProviderCredentials(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  let defaultsByPath = _templateDefaultSpecsByPath(context)
  let inputsByPath = _templateInputSpecsByPath(context)
  for (const doc of asIterable(context.yamlDocuments)) {
    if ((doc.skipChecks || (!isRecord(doc.data)))) {
      continue
    }
    if ((!_isTemplateArtifactDocument(doc))) {
      continue
    }
    if (((!isAppWorkloadDocument(doc)) || (!hasManagedWorkloadMarker(doc.data)))) {
      continue
    }
    let templateSpec = getTemplateSpec(doc.data)
    let containers = (isRecord(templateSpec) ? ((templateSpec as any)?.["containers"]) : null)
    if ((!Array.isArray(containers))) {
      continue
    }
    for (const container of asIterable(containers)) {
      if ((!isRecord(container))) {
        continue
      }
      let image = ((container as any)?.["image"])
      if ((!(typeof image === "string"))) {
        continue
      }
      let requirements = ((RUNTIME_CREDENTIAL_REQUIREMENTS as any)?.[_imageRepository(image)] ?? [])
      if ((!requirements)) {
        continue
      }
      let envEntries = _runtimeEnvEntries(container)
      for (const requirement of asIterable(requirements)) {
        let providerEnv = String(requirement["provider_env"])
        let providerItem = ((envEntries as any)?.[providerEnv])
        if ((providerItem === null)) {
          continue
        }
        let [providerKind, providerValue] = _resolveTemplateRuntimeValue(((providerItem as any)?.["value"]), ((defaultsByPath as any)?.[doc.path] ?? {  }), ((inputsByPath as any)?.[doc.path] ?? {  }))
        if ((providerKind === "required_input")) {
          continue
        }
        if ((!(typeof providerValue === "string"))) {
          continue
        }
        if ((String(String(providerValue).trim()).toLowerCase() !== String(String(requirement["provider_value"])).toLowerCase())) {
          continue
        }
        let credentialNames = tuple(Array.from(requirement["credential_envs"] as any).map((item) => (String(item))))
        if (Array.from(credentialNames as any).some((credentialName) => (Boolean((contains(credentialName, envEntries) && _runtimeValueIsNonemptyCredential(((envEntries[credentialName] as any)?.["value"]), ((defaultsByPath as any)?.[doc.path] ?? {  }), ((inputsByPath as any)?.[doc.path] ?? {  }))))))) {
          continue
        }
        addDocViolation(violations, { ruleId: "R054", doc: doc, pattern: `^\\s*-\\s*name\\s*:\\s*${escapeRegExp(providerEnv)}\\s*$`, defaultPattern: "^\\s*env\\s*:", message: `${providerEnv}=${String(providerValue).trim()} requires one non-empty credential env from ${(credentialNames as any).join(", ")}; an optional input with an empty default is invalid` })
      }
    }
  }
  return violations
}

function _configmapDataTextForNames(context: ScanContext, path: string, names: Set<string>): string {
  let parts: string[] = []
  if ((!names)) {
    return ""
  }
  for (const doc of asIterable(iterDocumentsByKind(context, "ConfigMap"))) {
    if (((doc.path !== path) || (!isRecord(doc.data)))) {
      continue
    }
    if ((!contains(_metadataName(doc.data), names))) {
      continue
    }
    let data = ((doc.data as any)?.["data"])
    if (isRecord(data)) {
      parts.push(...(Array.from(Object.values(data as any) as any).map((value) => (String(value))) as any))
    }
  }
  return (parts as any).join("\n")
}

function _startupGateText(context: ScanContext, doc: YamlDocument, templateSpec: Record<string, unknown>): string {
  let initContainers = ((templateSpec as any)?.["initContainers"])
  if (((!Array.isArray(initContainers)) || (!initContainers))) {
    return ""
  }
  let parts: string[] = []
  let mountedVolumeNames: Set<string> = new Set()
  for (const container of asIterable(initContainers)) {
    if ((!isRecord(container))) {
      continue
    }
    parts.push(_containerCommandText(container))
    let mounts = ((container as any)?.["volumeMounts"])
    if (Array.isArray(mounts)) {
      for (const mount of asIterable(mounts)) {
        let name = (isRecord(mount) ? ((mount as any)?.["name"]) : null)
        if (((typeof name === "string") && String(name).trim())) {
          mountedVolumeNames.add(String(name).trim())
        }
      }
    }
  }
  let configmapNames: Set<string> = new Set()
  let volumes = ((templateSpec as any)?.["volumes"])
  if (Array.isArray(volumes)) {
    for (const volume of asIterable(volumes)) {
      if ((!isRecord(volume))) {
        continue
      }
      name = ((volume as any)?.["name"])
      if ((!contains(name, mountedVolumeNames))) {
        continue
      }
      let configMap = ((volume as any)?.["configMap"])
      let configmapName = (isRecord(configMap) ? ((configMap as any)?.["name"]) : null)
      if (((typeof configmapName === "string") && String(configmapName).trim())) {
        configmapNames.add(String(configmapName).trim())
      }
    }
  }
  parts.push(_configmapDataTextForNames(context, doc.path, configmapNames))
  return String((parts as any).join("\n")).toLowerCase()
}

export function checkRuntimeStartupGates(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(context.yamlDocuments)) {
    if ((doc.skipChecks || (!isRecord(doc.data)))) {
      continue
    }
    if ((!_isTemplateArtifactDocument(doc))) {
      continue
    }
    if (((!isAppWorkloadDocument(doc)) || (!hasManagedWorkloadMarker(doc.data)))) {
      continue
    }
    let templateSpec = getTemplateSpec(doc.data)
    let containers = (isRecord(templateSpec) ? ((templateSpec as any)?.["containers"]) : null)
    if ((!Array.isArray(containers))) {
      continue
    }
    for (const container of asIterable(containers)) {
      if ((!isRecord(container))) {
        continue
      }
      let image = ((container as any)?.["image"])
      if ((!(typeof image === "string"))) {
        continue
      }
      let expectation = ((RUNTIME_STARTUP_GATE_EXPECTATIONS as any)?.[_imageRepository(image)])
      if ((!expectation)) {
        continue
      }
      let gateText = _startupGateText(context, doc, templateSpec)
      let requiredTokens = ((expectation as any)?.["required_tokens"] ?? [])
      let requiredAnyTokens = ((expectation as any)?.["required_any_tokens"] ?? [])
      let hasRequired = Array.from(requiredTokens as any).every((token) => (Boolean(contains(String(token).toLowerCase(), gateText))))
      let hasRequiredAny = ((!requiredAnyTokens) || Array.from(requiredAnyTokens as any).some((token) => (Boolean(contains(String(token).toLowerCase(), gateText)))))
      if ((hasRequired && hasRequiredAny)) {
        continue
      }
      addDocViolation(violations, { ruleId: "R055", doc: doc, pattern: "^\\s*initContainers\\s*:", defaultPattern: "^\\s*containers\\s*:", message: "this runtime requires an initContainer final-state gate that waits for PostgreSQL and verifies the required vector extension before the business container starts" })
    }
  }
  return violations
}

export function checkTemplateInputReferencesDeclared(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  let inputsByPath = _templateInputsByPath(context)
  for (const path of asIterable(_iterTemplateArtifactPaths(context))) {
    let text = ((context.fileTexts as any)?.[path] ?? "")
    if ((!text)) {
      continue
    }
    let declaredInputs = ((inputsByPath as any)?.[path])
    if ((declaredInputs === null)) {
      let hasTemplateDoc = Array.from(_iterTemplateArtifactDocuments(context) as any).some((doc) => (Boolean((doc.path === path))))
      if ((!hasTemplateDoc)) {
        continue
      }
      declaredInputs = {  }
    }
    let seen: unknown = new Set()
    for (const match of asIterable(Array.from(String(text).matchAll(new RegExp(TEMPLATE_INPUT_REF_RE.source, TEMPLATE_INPUT_REF_RE.flags.includes('g') ? TEMPLATE_INPUT_REF_RE.flags : TEMPLATE_INPUT_REF_RE.flags + 'g'))))) {
      let inputName = (match as RegExpMatchArray)[1]
      if ((contains(inputName, declaredInputs) || contains(inputName, seen))) {
        continue
      }
      seen.add(inputName)
      violations.push({ ruleId: "R045", path: path, line: _lineNumberForOffset(text, ((match as RegExpMatchArray).index ?? 0)), message: `inputs.${inputName} is referenced but missing from this Template CR spec.inputs` })
    }
  }
  return violations
}

function _yamlMappingKeyMatch(line: string, key: string): unknown | null {
  const escaped = escapeRegExp(key)
  const match = new RegExp(`^(?<indent>\\s*)(?:${escaped}|'${escaped}'|"${escaped}")\\s*:`).exec(String(line))
  if (match === null) {
    return null
  }
  // Call sites read match["indent"] (Python-style); mirror the named group there.
  ;(match as any)["indent"] = match.groups?.["indent"] ?? ""
  return match
}

function _matchIndentLength(match: unknown): number {
  const indent = (match as any)?.["indent"]
  return typeof indent === "string" ? indent.length : 0
}

function _templateMappingFieldLine(doc: YamlDocument, collectionName: string, entryName: string, fieldName: string): number {
  const lines = splitLines(String(doc.source))
  let collectionIndex: number | null = null
  let collectionIndent = -1
  for (let index = 0; index < lines.length; index++) {
    const match = _yamlMappingKeyMatch(lines[index], collectionName)
    if (match === null) {
      continue
    }
    collectionIndex = index
    collectionIndent = _matchIndentLength(match)
    break
  }
  if (collectionIndex === null) {
    return doc.startLine
  }
  let entryIndex: number | null = null
  let entryIndent = -1
  for (let index = collectionIndex + 1; index < lines.length; index++) {
    const line = lines[index]
    if (!line.trim() || line.trimStart().startsWith("#")) {
      continue
    }
    const indent = line.length - line.trimStart().length
    if (indent <= collectionIndent) {
      break
    }
    const match = _yamlMappingKeyMatch(line, entryName)
    if (match === null || _matchIndentLength(match) <= collectionIndent) {
      continue
    }
    entryIndex = index
    entryIndent = _matchIndentLength(match)
    break
  }
  if (entryIndex === null) {
    return doc.startLine + collectionIndex
  }
  for (let index = entryIndex + 1; index < lines.length; index++) {
    const line = lines[index]
    if (!line.trim() || line.trimStart().startsWith("#")) {
      continue
    }
    const indent = line.length - line.trimStart().length
    if (indent <= entryIndent) {
      break
    }
    const match = _yamlMappingKeyMatch(line, fieldName)
    if (match !== null && _matchIndentLength(match) > entryIndent) {
      return doc.startLine + index
    }
  }
  return doc.startLine + entryIndex
}

function _yamlValueTypeName(value: unknown): string {
  if ((value === null)) {
    return "null"
  }
  if ((typeof value === "boolean")) {
    return "boolean"
  }
  if ((typeof value === "number" && Number.isInteger(value))) {
    return "integer"
  }
  if ((typeof value === "number")) {
    return "number"
  }
  if (Array.isArray(value)) {
    return "sequence"
  }
  if (isRecord(value)) {
    return "mapping"
  }
  return typeof value._Name
}

export function checkTemplateDefaultScalarTypes(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(_iterTemplateArtifactDocuments(context))) {
    if ((!isRecord(doc.data))) {
      continue
    }
    let spec = ((doc.data as any)?.["spec"])
    if ((!isRecord(spec))) {
      continue
    }
    for (const [collectionName, fieldName] of asIterable([["defaults", "value"], ["inputs", "default"]])) {
      let entries = ((spec as any)?.[collectionName])
      if ((!isRecord(entries))) {
        continue
      }
      for (const [entryName, entrySpec] of asIterable(Object.entries(entries as any))) {
        if (((!(typeof entryName === "string")) || (!isRecord(entrySpec)))) {
          continue
        }
        if (((!contains(fieldName, entrySpec)) || (typeof entrySpec[fieldName] === "string"))) {
          continue
        }
        violations.push({ ruleId: "R052", path: doc.path, line: _templateMappingFieldLine(doc, collectionName, entryName, fieldName), message: `spec.${collectionName}.${entryName}.${fieldName} must be a YAML string, got ${_yamlValueTypeName(entrySpec[fieldName])}; encode this field as a string and quote numeric-, boolean-, and null-like scalars` })
      }
    }
  }
  return violations
}

function _firstDocumentSegment(text: string): [number, string] {
  let startLine = 1
  let collected: string[] = []
  const lines = String(text).split("\n")
  for (let index = 1; index <= lines.length; index++) {
    const line = lines[index - 1]
    if (/^\s*---\s*$/.test(line)) {
      if (collected.some((item) => item.trim().length > 0)) {
        break
      }
      startLine = index + 1
      collected = []
      continue
    }
    collected.push(line)
  }
  return [startLine, collected.join("\n")]
}

export function checkTemplateFirstDocumentContract(context: ScanContext): Violation[] {
  const violations: Violation[] = []
  for (const path of asIterable(_iterTemplateArtifactPaths(context))) {
    const text = String(((context.fileTexts as any)?.[path] ?? ""))
    if (!text.trim()) {
      continue
    }
    const [startLine, firstDoc] = _firstDocumentSegment(text)
    if (!firstDoc.trim()) {
      continue
    }
    if (!TEMPLATE_KIND_LINE_RE.test(firstDoc)) {
      violations.push({
        ruleId: "R060",
        path: path,
        line: startLine,
        message:
          "the first YAML document in a template artifact must be the Template CR (apiVersion: app.sealos.io/v1, kind: Template)",
      })
    }
    const controlRe = new RegExp(TEMPLATE_CONTROL_DIRECTIVE_RE.source, "g")
    for (const match of firstDoc.matchAll(controlRe)) {
      violations.push({
        ruleId: "R060",
        path: path,
        line: startLine + firstDoc.slice(0, match.index ?? 0).split("\n").length - 1,
        message:
          "the first YAML document (Template CR) must not use conditional rendering; move ${{ if }}/${{ elif }}/${{ else }}/${{ endif }} blocks into later resource documents",
      })
    }
  }
  return violations
}

export function checkTemplateDefaultsExpressionScope(context: ScanContext): Violation[] {
  const violations: Violation[] = []
  for (const doc of asIterable(_iterTemplateArtifactDocuments(context))) {
    if (!isRecord(doc.data)) {
      continue
    }
    const spec = (doc.data as any)?.["spec"]
    if (!isRecord(spec)) {
      continue
    }
    const defaults = (spec as any)?.["defaults"]
    if (!isRecord(defaults)) {
      continue
    }
    for (const [entryName, entrySpec] of Object.entries(defaults)) {
      if (typeof entryName !== "string" || !isRecord(entrySpec)) {
        continue
      }
      const value = (entrySpec as any)?.["value"]
      if (typeof value !== "string") {
        continue
      }
      const forbidden = new Set<string>()
      const expressionRe = new RegExp(TEMPLATE_EXPRESSION_RE.source, "g")
      for (const expressionMatch of value.matchAll(expressionRe)) {
        const scopedRe = new RegExp(TEMPLATE_SCOPED_REF_RE.source, "g")
        for (const refMatch of expressionMatch[1].matchAll(scopedRe)) {
          forbidden.add(refMatch[1])
        }
      }
      if (forbidden.size === 0) {
        continue
      }
      violations.push({
        ruleId: "R061",
        path: doc.path,
        line: _templateMappingFieldLine(doc, "defaults", entryName, "value"),
        message: `spec.defaults.${entryName}.value renders before defaults/inputs exist and may only use built-in platform variables and functions (SEALOS_*, random, base64); it cannot reference ${Array.from(forbidden).sort().join(", ")}`,
      })
    }
  }
  return violations
}

function _findBranchSections(lines: string[], startIndex: number): [number, number | null] {
  let depth = 0
  let elseIndex: number | null = null
  for (const index of asIterable(Array.from({ length: Math.max(0, (((() => { const __v = lines as any; if (__v == null) return 0; if (typeof __v.length === "number") return __v.length; if (__v instanceof Set || __v instanceof Map) return __v.size; if (typeof __v === "object") return Object.keys(__v).length; return 0 })())) - (startIndex)) }, (_, i) => i + (startIndex)))) {
    let line = lines[index]
    if (TEMPLATE_IF_RE.exec(String(line))) {
      depth += 1
    }
    if ((TEMPLATE_ELSE_RE.exec(String(line)) && (depth === 1) && (elseIndex === null))) {
      elseIndex = index
    }
    if (TEMPLATE_ENDIF_RE.exec(String(line))) {
      depth -= 1
      if ((depth <= 0)) {
        return [index, elseIndex]
      }
    }
  }
  return [Math.min(((() => { const __v = lines as any; if (__v == null) return 0; if (typeof __v.length === "number") return __v.length; if (__v instanceof Set || __v instanceof Map) return __v.size; if (typeof __v === "object") return Object.keys(__v).length; return 0 })()), (startIndex + 80)), elseIndex]
}

function _findBranchEnd(lines: string[], startIndex: number): number {
  return _findBranchSections(lines, startIndex)[0]
}

function _branchUsesObjectStorage(branchText: string): boolean {
  return (OBJECT_STORAGE_BRANCH_MARKER_RE.exec(String(branchText)) !== null)
}

function _branchUsesObjectStorageWiring(branchText: string): boolean {
  return ((OBJECT_STORAGE_BRANCH_MARKER_RE.exec(String(branchText)) !== null) && (OBJECT_STORAGE_WIRING_BRANCH_MARKER_RE.exec(String(branchText)) !== null))
}

function _branchHasConfiguration(branchText: string): boolean {
  return Array.from(splitLines(String(branchText)) as any).some((line) => (Boolean((String(line).trim() && (!String(String(line).trimStart()).startsWith("#"))))))
}

function _branchUsesLocalStorageMode(branchText: string): boolean {
  return (new RegExp("\\b(?:local|sqlite|filesystem|file[-_ ]?system|file[-_ ]?storage|persistentvolumeclaim|pvc|disabled?|disable|off)\\b|\\b(?:storage|object_storage|s3)[_-]?(?:mode|backend|provider|enabled?)\\s*[:=]\\s*(?:['\\\"]?(?:false|local|disabled|off))", "i").exec(String(branchText)) !== null)
}

function _conditionInputRefs(condition: string): string[] {
  return Array.from(Array.from(String(condition).matchAll(new RegExp(TEMPLATE_INPUT_REF_RE.source, TEMPLATE_INPUT_REF_RE.flags.includes('g') ? TEMPLATE_INPUT_REF_RE.flags : TEMPLATE_INPUT_REF_RE.flags + 'g'))) as any).map((match) => ((match as RegExpMatchArray)[1]))
}

function _conditionUsesTrueComparison(condition: string, inputName: string): boolean {
  let escaped = escapeRegExp(inputName)
  return (new RegExp('^(?:' + (`\\s*inputs\\.${escaped}\\s*===\\s*['\\"]true['\\"]\\s*`) + ')$', "").exec(String(condition)) !== null)
}

function _boundedObjectStorageInputText(inputSpec: Record<string, unknown>, includeDescription: boolean): string {
  let values: string[] = []
  let unsafeInput = false
  let totalChars = 0
  function appendScalar(value: unknown): null {
    /* nonlocal total_chars, unsafe_input */
    if ((!((typeof value === "string") || (typeof value === "number" && Number.isInteger(value)) || (typeof value === "number") || (typeof value === "boolean")))) {
      if ((value !== null)) {
        unsafeInput = true
      }
      return
    }
    let remaining = (OBJECT_STORAGE_INPUT_TEXT_MAX_CHARS - totalChars)
    if ((remaining <= 0)) {
      unsafeInput = true
      return
    }
    let text = String(value)
    let allowed = Math.min(OBJECT_STORAGE_INPUT_TEXT_MAX_VALUE_CHARS, remaining)
    if ((((() => { const __v = text as any; if (__v == null) return 0; if (typeof __v.length === "number") return __v.length; if (__v instanceof Set || __v instanceof Map) return __v.size; if (typeof __v === "object") return Object.keys(__v).length; return 0 })()) > allowed)) {
      unsafeInput = true
    }
    let boundedText = text.slice(0, allowed)
    values.push(boundedText)
    totalChars += ((() => { const __v = boundedText as any; if (__v == null) return 0; if (typeof __v.length === "number") return __v.length; if (__v instanceof Set || __v instanceof Map) return __v.size; if (typeof __v === "object") return Object.keys(__v).length; return 0 })())
  }

  if (includeDescription) {
    appendScalar(((inputSpec as any)?.["description"]))
  }
  appendScalar(((inputSpec as any)?.["default"]))
  let options = ((inputSpec as any)?.["options"])
  if (Array.isArray(options)) {
    if ((((() => { const __v = options as any; if (__v == null) return 0; if (typeof __v.length === "number") return __v.length; if (__v instanceof Set || __v instanceof Map) return __v.size; if (typeof __v === "object") return Object.keys(__v).length; return 0 })()) > OBJECT_STORAGE_INPUT_TEXT_MAX_ITEMS)) {
      unsafeInput = true
    }
    for (const item of asIterable(options.slice(0, OBJECT_STORAGE_INPUT_TEXT_MAX_ITEMS))) {
      appendScalar(item)
    }
  } else {
    appendScalar(options)
  }
  if (unsafeInput) {
    values.splice(0, 0, OBJECT_STORAGE_UNSAFE_INPUT_MARKER)
  }
  return String((values as any).join(" ")).replace(new RegExp("[_-]+", 'g'), " " as any).slice(0, OBJECT_STORAGE_INPUT_TEXT_MAX_CHARS)
}

function _objectStorageInputText(inputSpec: Record<string, unknown>): string {
  return _boundedObjectStorageInputText(inputSpec, true)
}

function _objectStorageInputValueText(inputSpec: Record<string, unknown>): string {
  return _boundedObjectStorageInputText(inputSpec, false)
}

function _tokensHaveObjectStorageIdentity(tokens: Set<string>): boolean {
  return (Boolean(setIntersection(tokens, new Set(["S3", "MINIO", "OBJECTSTORAGE"]))) || isSubset(new Set(["OBJECT", "STORAGE"]), tokens))
}

function _containerHasObjectStorageEnv(container: Record<string, unknown>): boolean {
  let env = ((container as any)?.["env"])
  if ((!Array.isArray(env))) {
    return false
  }
  for (const item of asIterable(env)) {
    if ((!isRecord(item))) {
      continue
    }
    let name = ((item as any)?.["name"])
    if ((!(typeof name === "string"))) {
      continue
    }
    let tokens = new Set(String(_normalizeTemplateInputName(name)).split("_") as any)
    if (_tokensHaveObjectStorageIdentity(tokens)) {
      return true
    }
  }
  return false
}

function _isObjectStorageProviderSelector(inputName: string, inputSpec: Record<string, unknown>): boolean {
  let normalized = _normalizeTemplateInputName(inputName)
  let tokens = new Set(String(normalized).split("_") as any)
  let rawInputType = ((inputSpec as any)?.["type"])
  let inputType = ((typeof rawInputType === "string") ? String(String(rawInputType).trim()).toLowerCase() : "")
  let hasSelectorName = Boolean(setIntersection(tokens, OBJECT_STORAGE_SELECTOR_TOKENS))
  let hasObjectStorageName = (contains("S3", tokens) || contains("MINIO", tokens) || contains("OBJECTSTORAGE", tokens) || isSubset(new Set(["OBJECT", "STORAGE"]), tokens))
  let isProviderDecision = (hasObjectStorageName && (Boolean(setIntersection(tokens, new Set(["MANAGED", "SEALOS"]))) || (contains("AWS", tokens) && Boolean(setIntersection(tokens, OBJECT_STORAGE_PROVIDER_DECISION_TOKENS)))))
  if (isProviderDecision) {
    return true
  }
  if ((setIntersection(tokens, OBJECT_STORAGE_CONFIG_TOKENS) && (!hasSelectorName))) {
    return false
  }
  let isNumericCapacity = (contains(inputType, new Set(["integer", "number"])) && (Boolean(setIntersection(tokens, new Set(["CAPACITY", "SIZE"]))) || isSubset(new Set(["MINIO", "STORAGE"]), tokens)))
  if ((isNumericCapacity && (!hasSelectorName))) {
    return false
  }
  if ((contains("MINIO", tokens) && ((((() => { const __v = tokens as any; if (__v == null) return 0; if (typeof __v.length === "number") return __v.length; if (__v instanceof Set || __v instanceof Map) return __v.size; if (typeof __v === "object") return Object.keys(__v).length; return 0 })()) === 1) || Boolean(setIntersection(tokens, OBJECT_STORAGE_PROVIDER_DECISION_TOKENS))))) {
    return true
  }
  if ((hasSelectorName && hasObjectStorageName)) {
    return true
  }
  if ((hasSelectorName && contains("STORAGE", tokens))) {
    return true
  }
  let inputText = _objectStorageInputText(inputSpec)
  let inputValueText = _objectStorageInputValueText(inputSpec)
  let hasObjectStorageText = (OBJECT_STORAGE_PROVIDER_VALUE_RE.exec(String(inputText)) !== null)
  let hasObjectStorageValue = (OBJECT_STORAGE_PROVIDER_VALUE_RE.exec(String(inputValueText)) !== null)
  if ((hasSelectorName && hasObjectStorageText)) {
    return true
  }
  if ((contains("USE", tokens) && (OBJECT_STORAGE_PROVIDER_DECISION_VALUE_RE.exec(String(inputText)) !== null))) {
    return true
  }
  if ((contains(inputType, new Set(["choice", "select"])) && hasObjectStorageValue)) {
    return true
  }
  if ((contains(inputType, new Set(["integer", "number"])) && contains("STORAGE", tokens) && hasObjectStorageText)) {
    return true
  }
  return ((inputType === "string") && contains("STORAGE", tokens) && hasObjectStorageValue)
}

function _isMinioServerImage(image: string): boolean {
  return (MINIO_SERVER_IMAGE_RE.exec(String(String(image).trim())) !== null)
}

function _isValidObjectStorageHostname(hostname: string): boolean {
  try {
    ((() => { if (!isIP(hostname)) throw new Error('invalid ip'); return hostname })())
    return true
  } catch (_err) {
    /* pass */
  }
  try {
    let asciiHostname = hostname.encode("idna").decode("ascii")
  } catch (_err) {
    return false
  }
  if (((((() => { const __v = asciiHostname as any; if (__v == null) return 0; if (typeof __v.length === "number") return __v.length; if (__v instanceof Set || __v instanceof Map) return __v.size; if (typeof __v === "object") return Object.keys(__v).length; return 0 })()) > 253) || (String(asciiHostname).replace(new RegExp(`^[${"."}]+|[${"."}]+$`, 'g'), '') !== asciiHostname))) {
    return false
  }
  let labels = String(asciiHostname).split(".")
  return Array.from(labels as any).every((label) => (Boolean((new RegExp('^(?:' + ("[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?") + ')$', "").exec(String(label)) !== null))))
}

function _isSensitiveObjectStorageSourceKey(key: string): boolean {
  let separatedKey = String(key).replace(new RegExp("(?<=[a-z0-9])(?=[A-Z])", 'g'), "_" as any)
  let normalizedKey = String(String(String(separatedKey).toLowerCase()).replace(new RegExp("[^a-z0-9]+", 'g'), "_" as any)).replace(new RegExp(`^[${"_"}]+|[${"_"}]+$`, 'g'), '')
  let queryTokens = new Set(String(normalizedKey).split("_") as any)
  let compactKey = String(normalizedKey).split("_").join("")
  return Boolean((setIntersection(queryTokens, OBJECT_STORAGE_SOURCE_SENSITIVE_QUERY_TOKENS) || contains(compactKey, OBJECT_STORAGE_SOURCE_SENSITIVE_QUERY_TOKENS)))
}

function _objectStorageSourceParameterKeys(component: string, requireAssignment: boolean = false): string[] {
  let fields = String(unquotePlus(component)).split(new RegExp("[&;]", ""))
  if ((((() => { const __v = fields as any; if (__v == null) return 0; if (typeof __v.length === "number") return __v.length; if (__v instanceof Set || __v instanceof Map) return __v.size; if (typeof __v === "object") return Object.keys(__v).length; return 0 })()) > 64)) {
    throw new Error("too many URL parameters")
  }
  return Array.from(fields as any).filter((field) => ((field && ((!requireAssignment) || contains("=", field))))).map((field) => (field.partition("=")[0]))
}

function _isValidObjectStorageSourceEvidence(value: string): boolean {
  value = String(value).trim()
  if (((!value) || (((() => { const __v = value as any; if (__v == null) return 0; if (typeof __v.length === "number") return __v.length; if (__v instanceof Set || __v instanceof Map) return __v.size; if (typeof __v === "object") return Object.keys(__v).length; return 0 })()) > OBJECT_STORAGE_SOURCE_EVIDENCE_MAX_CHARS) || Array.from(value as any).some((character) => (Boolean(character.isspace()))))) {
    return false
  }
  if (((() => { const __re = OBJECT_STORAGE_USER_REQUEST_EVIDENCE_RE; const __s = String(value); const __m = new RegExp('^(?:' + __re.source + ')$', __re.flags).exec(__s); return __m })())) {
    return true
  }
  try {
    let parsed = urlsplit(value)
    let hostname = parsed.hostname
    if (((String(parsed.scheme).toLowerCase() !== "https") || (!hostname))) {
      return false
    }
    if ((!_isValidObjectStorageHostname(hostname))) {
      return false
    }
    if (((parsed.username !== null) || (parsed.password !== null))) {
      return false
    }
    let _ = parsed.port
    let parameterKeys = (_objectStorageSourceParameterKeys(parsed.query) + _objectStorageSourceParameterKeys(parsed.fragment, true))
  } catch (_err) {
    return false
  }
  for (const key of asIterable(parameterKeys)) {
    if (_isSensitiveObjectStorageSourceKey(key)) {
      return false
    }
  }
  return true
}

function _compatibilityProxyImage(doc: YamlDocument): string | null {
  let metadata = (isRecord(doc.data) ? ((doc.data as any)?.["metadata"]) : null)
  let resourceName = (isRecord(metadata) ? ((metadata as any)?.["name"]) : null)
  let normalizedName = ((typeof resourceName === "string") ? _normalizeTemplateInputName(resourceName) : "")
  let nameTokens = new Set(String(normalizedName).split("_") as any)
  let containers = Array.from(iterContainers(doc.data) as any)
  let resourceHasRole = Boolean(setIntersection(nameTokens, OBJECT_STORAGE_PROXY_ROLE_TOKENS))
  let resourceHasObjectStorage = _tokensHaveObjectStorageIdentity(nameTokens)
  for (const container of asIterable(containers)) {
    let image = ((container as any)?.["image"])
    let containerName = ((container as any)?.["name"])
    let containerTokens = ((typeof containerName === "string") ? new Set(String(_normalizeTemplateInputName(containerName)).split("_") as any) : new Set())
    if (setIntersection(containerTokens, OBJECT_STORAGE_PROXY_HELPER_TOKENS)) {
      continue
    }
    let hasRole = (resourceHasRole || Boolean(setIntersection(containerTokens, OBJECT_STORAGE_PROXY_ROLE_TOKENS)))
    let hasObjectStorage = (resourceHasObjectStorage || _tokensHaveObjectStorageIdentity(containerTokens) || _containerHasObjectStorageEnv(container))
    if ((hasRole && hasObjectStorage && (typeof image === "string") && String(image).trim())) {
      return image
    }
  }
  return null
}

function _compatibilityProxyUsesPersistentStorage(data: Record<string, unknown>): boolean {
  let spec = ((data as any)?.["spec"])
  if (isRecord(spec)) {
    let claimTemplates = ((spec as any)?.["volumeClaimTemplates"])
    if ((Array.isArray(claimTemplates) && claimTemplates)) {
      return true
    }
  }
  let templateSpec = getTemplateSpec(data)
  if ((!isRecord(templateSpec))) {
    return false
  }
  let volumes = ((templateSpec as any)?.["volumes"])
  if ((!Array.isArray(volumes))) {
    return false
  }
  return Array.from(volumes as any).some((volume) => (Boolean((isRecord(volume) && Boolean(setIntersection(new Set(volume as any), PERSISTENT_VOLUME_SOURCE_KEYS))))))
}

export function checkObjectStorageInputContract(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  let inputsByPath = _templateInputsByPath(context)
  let inputSpecsByPath = _templateInputSpecsByPath(context)
  let providerInputsByPath: Record<string, Set<string>> = {  }
  for (const doc of asIterable(_iterTemplateArtifactDocuments(context))) {
    let inputSpecs = ((inputSpecsByPath as any)?.[doc.path] ?? {  })
    let providerInputs = ((() => { const __o = providerInputsByPath as any; if (__o[doc.path] === undefined) __o[doc.path] = new Set(); return __o[doc.path] })())
    for (const [inputName, inputSpec] of asIterable(Object.entries(inputSpecs as any))) {
      if ((!_isObjectStorageProviderSelector(inputName, inputSpec))) {
        continue
      }
      providerInputs.add(inputName)
      violations.push({ ruleId: "R044", path: doc.path, line: findLine(doc, `^\\s*${escapeRegExp(inputName)}\\s*:`), message: `object storage provider/backend selector inputs.${inputName} must be resolved during conversion; expose only an application-level enable/disable boolean` })
    }
  }
  for (const path of asIterable(_iterTemplateArtifactPaths(context))) {
    let text = ((context.fileTexts as any)?.[path] ?? "")
    let lines = splitLines(String(text))
    let inputTypes = ((inputsByPath as any)?.[path] ?? {  })
    let seen: unknown = new Set()
    let bucketConditions: Set<string> = new Set()
    let wiringConditions: Set<string> = new Set()
    let conditionLines: Record<string, number> = {  }
    for (const [index, line] of asIterable(Array.from(lines as any, (v: any, i: number) => [i + (0), v] as const))) {
      let match = TEMPLATE_IF_RE.exec(String(line))
      if ((match === null)) {
        continue
      }
      let condition = (match as RegExpMatchArray)[1]
      let inputNames = _conditionInputRefs(condition)
      if ((!inputNames)) {
        continue
      }
      let [branchEnd, elseIndex] = _findBranchSections(lines, index)
      let trueBranchEnd = ((elseIndex !== null) ? elseIndex : branchEnd)
      let trueBranchText = (lines.slice((index + 1), trueBranchEnd) as any).join("\n")
      let normalizedCondition = String(String(condition).trim()).replace(new RegExp("\\s+", 'g'), " " as any)
      ((() => { const __o = conditionLines as any; if (__o[normalizedCondition] === undefined) __o[normalizedCondition] = (index + 1); return __o[normalizedCondition] })())
      if (new RegExp("\\bObjectStorageBucket\\b|objectstorage\\.sealos", "i").exec(String(trueBranchText))) {
        bucketConditions.add(normalizedCondition)
      } else if (_branchUsesObjectStorageWiring(trueBranchText)) {
        wiringConditions.add(normalizedCondition)
      }
      if ((!_branchUsesObjectStorage(trueBranchText))) {
        continue
      }
      if ((!Array.from(inputNames as any).some((inputName) => (Boolean(contains(inputName, ((providerInputsByPath as any)?.[path] ?? new Set()))))))) {
        let falseBranchText = ((elseIndex !== null) ? (lines.slice((elseIndex + 1), branchEnd) as any).join("\n") : "")
        if (((elseIndex === null) || (!_branchHasConfiguration(falseBranchText)) || (!_branchUsesLocalStorageMode(falseBranchText)))) {
          let marker = [path, (index + 1), "__false_branch__"]
          if ((!contains(marker, seen))) {
            seen.add(marker)
            violations.push({ ruleId: "R044", path: path, line: (index + 1), message: "optional object storage/S3 branch must define an explicit else() with the documented storage-disabled or local-filesystem mode" })
          }
        }
      }
      for (const inputName of asIterable(inputNames)) {
        if (contains(inputName, ((providerInputsByPath as any)?.[path] ?? new Set()))) {
          continue
        }
        let inputType = ((inputTypes as any)?.[inputName])
        if (((inputType === "boolean") && _conditionUsesTrueComparison(condition, inputName))) {
          continue
        }
        marker = [path, (index + 1), inputName]
        if (contains(marker, seen)) {
          continue
        }
        seen.add(marker)
        if ((inputType === "boolean")) {
          let detail = "but the condition must test inputs.<name> === 'true'"
        } else {
          detail = "but binary object storage choices must be declared as type: boolean and tested with inputs.<name> === 'true'"
        }
        violations.push({ ruleId: "R044", path: path, line: (index + 1), message: `optional object storage/S3 branch uses inputs.${inputName}, ${detail}` })
      }
    }
    let mismatchedWiring = (wiringConditions - bucketConditions)
    if ((bucketConditions && mismatchedWiring)) {
      let firstCondition = [...asIterable(mismatchedWiring)].sort((a, b) => { const ka = (((value) => ((conditionLines as any)?.[value] ?? 0)))(a); const kb = (((value) => ((conditionLines as any)?.[value] ?? 0)))(b); return ka < kb ? -1 : ka > kb ? 1 : 0 })[0]
      violations.push({ ruleId: "R044", path: path, line: ((conditionLines as any)?.[firstCondition] ?? 1), message: ("object storage Bucket, provider, Secret, and initialization branches must share the same boolean condition; mismatched condition: " + firstCondition) })
    }
  }
  let artifactPaths = new Set(_iterTemplateArtifactPaths(context) as any)
  let objectStoragePaths = new Set(Array.from(context.yamlDocuments as any).filter((doc) => (((!doc.skipChecks) && isRecord(doc.data) && (((doc.data as any)?.["kind"]) === "ObjectStorageBucket") && contains(doc.path, artifactPaths)))).map((doc) => (doc.path)))
  let reportedMinioPaths: Set<string> = new Set()
  for (const doc of asIterable(context.yamlDocuments)) {
    if (((!contains(doc.path, objectStoragePaths)) || contains(doc.path, reportedMinioPaths))) {
      continue
    }
    if ((doc.skipChecks || (!isRecord(doc.data)))) {
      continue
    }
    if ((!contains(((doc.data as any)?.["kind"]), DATABASE_RAW_WORKLOAD_KINDS))) {
      continue
    }
    for (const container of asIterable(iterContainers(doc.data))) {
      let image = ((container as any)?.["image"])
      if (((!(typeof image === "string")) || (!_isMinioServerImage(image)))) {
        continue
      }
      reportedMinioPaths.add(doc.path)
      violations.push({ ruleId: "R044", path: doc.path, line: findLine(doc, `^\\s*image\\s*:\\s*['\\"]?${escapeRegExp(image)}['\\"]?\\s*$`), message: `managed ObjectStorageBucket must be the sole object-store data plane; remove bundled MinIO server image ${image}` })
      break
    }
  }
  let compatibilityProxySources = Object.fromEntries(Array.from(_iterTemplateArtifactDocuments(context) as any).map((doc) => [doc.path, ((_metadataAnnotations(doc.data) as any)?.[OBJECT_STORAGE_COMPATIBILITY_PROXY_SOURCE_ANNOTATION] ?? "")] as const))
  for (const doc of asIterable(context.yamlDocuments)) {
    if (((!contains(doc.path, artifactPaths)) || doc.skipChecks || (!isRecord(doc.data)))) {
      continue
    }
    if ((!contains(((doc.data as any)?.["kind"]), DATABASE_RAW_WORKLOAD_KINDS))) {
      continue
    }
    let proxyImage = _compatibilityProxyImage(doc)
    if ((proxyImage === null)) {
      continue
    }
    let source = ((compatibilityProxySources as any)?.[doc.path] ?? "")
    if (((!(typeof source === "string")) || (!_isValidObjectStorageSourceEvidence(source)))) {
      violations.push({ ruleId: "R044", path: doc.path, line: findLine(doc, `^\\s*image\\s*:\\s*['\\"]?${escapeRegExp(proxyImage)}['\\"]?\\s*$`), message: `object-storage compatibility proxies require metadata.annotations.${OBJECT_STORAGE_COMPATIBILITY_PROXY_SOURCE_ANNOTATION} with a credential-free HTTPS source URL or user-request:<reference> evidence` })
      continue
    }
    if (_compatibilityProxyUsesPersistentStorage(doc.data)) {
      violations.push({ ruleId: "R044", path: doc.path, line: findLine(doc, "^\\s*(?:persistentVolumeClaim|volumeClaimTemplates)\\s*:"), message: "object-storage compatibility proxies must remain stateless and must not use persistent storage" })
    }
  }
  return violations
}

function _normalizeTemplateInputName(value: string): string {
  let separated = String(value).replace(new RegExp("(?<=[a-z0-9])(?=[A-Z])", 'g'), "_" as any)
  separated = String(separated).replace(new RegExp("(?<=[A-Z])(?=[A-Z][a-z])", 'g'), "_" as any)
  return String(String(String(separated).toUpperCase()).replace(new RegExp("[^A-Z0-9]+", 'g'), "_" as any)).replace(new RegExp(`^[${"_"}]+|[${"_"}]+$`, 'g'), '')
}

function _tokensHaveExternalObjectStorageConfig(tokens: Set<string>): boolean {
  return Boolean(setIntersection(tokens, EXTERNAL_OBJECT_STORAGE_CONFIG_TOKENS))
}

function _isExplicitExternalObjectStorageInputName(normalized: string): boolean {
  let tokens = new Set(String(normalized).split("_") as any)
  let hasObjectStorage = _tokensHaveObjectStorageIdentity(tokens)
  return (hasObjectStorage && (contains("EXTERNAL", tokens) || _tokensHaveExternalObjectStorageConfig(tokens)))
}

function _isDescribedExternalObjectStorageInput(inputName: string, inputSpec: unknown): boolean {
  let inputText = _templateInputText(inputName, inputSpec)
  if ((EXTERNAL_OBJECT_STORAGE_DESCRIPTION_RE.exec(String(inputText)) === null)) {
    return false
  }
  let tokens = new Set(String(_normalizeTemplateInputName(inputName)).split("_") as any)
  return _tokensHaveExternalObjectStorageConfig(tokens)
}

function _externalObjectStorageInputNames(doc: YamlDocument): string[] {
  let spec = (isRecord(doc.data) ? ((doc.data as any)?.["spec"]) : null)
  let inputs = (isRecord(spec) ? ((spec as any)?.["inputs"]) : null)
  if ((!isRecord(inputs))) {
    return []
  }
  let inputItems = Array.from(Object.entries(inputs as any) as any).filter(([key, value]) => ((typeof key === "string"))).map(([key, value]) => ([key, value]))
  let explicitNames: Set<string> = new Set()
  for (const [key, inputSpec] of asIterable(inputItems)) {
    let normalized = _normalizeTemplateInputName(key)
    if (contains(normalized, MANAGED_OBJECT_STORAGE_TOGGLE_NAMES)) {
      continue
    }
    if ((_isExplicitExternalObjectStorageInputName(normalized) || _isDescribedExternalObjectStorageInput(key, inputSpec))) {
      explicitNames.add(key)
    }
  }
  let hasAwsNamedS3Context = false
  for (const [key, _1] of asIterable(inputItems)) {
    normalized = _normalizeTemplateInputName(key)
    if ((((() => { const __re = AWS_OBJECT_STORAGE_INPUT_RE; const __s = String(normalized); const __m = new RegExp('^(?:' + __re.source + ')$', __re.flags).exec(__s); return __m })()) && contains("S3", new Set(String(normalized).split("_") as any)))) {
      hasAwsNamedS3Context = true
      break
    }
  }
  let hasAwsDescribedS3Context = Array.from(inputItems as any).some(([key, inputSpec]) => (Boolean((((() => { const __re = AWS_OBJECT_STORAGE_INPUT_RE; const __s = String(_normalizeTemplateInputName(key)); const __m = new RegExp('^(?:' + __re.source + ')$', __re.flags).exec(__s); return __m })()) && (AWS_OBJECT_STORAGE_CONTEXT_RE.exec(String(_templateInputText(key, inputSpec))) !== null)))))
  let hasAwsObjectStorageContext = (Boolean(explicitNames) || hasAwsNamedS3Context || hasAwsDescribedS3Context)
  let names: string[] = []
  for (const [key, _2] of asIterable(inputItems)) {
    normalized = _normalizeTemplateInputName(key)
    if (contains(normalized, MANAGED_OBJECT_STORAGE_TOGGLE_NAMES)) {
      continue
    }
    if ((contains(key, explicitNames) || (hasAwsObjectStorageContext && ((() => { const __re = AWS_OBJECT_STORAGE_INPUT_RE; const __s = String(normalized); const __m = new RegExp('^(?:' + __re.source + ')$', __re.flags).exec(__s); return __m })())))) {
      names.push(key)
    }
  }
  return names
}

function _externalObjectStorageSource(doc: YamlDocument): string {
  let annotations = (isRecord(doc.data) ? _metadataAnnotations(doc.data) : {  })
  let value = ((annotations as any)?.[EXTERNAL_OBJECT_STORAGE_SOURCE_ANNOTATION])
  return ((typeof value === "string") ? String(value).trim() : "")
}

function *_iterTemplateInputs(spec: Record<string, unknown>): Generator<[string, unknown], void, unknown> {
  let inputs = ((spec as any)?.["inputs"])
  if (isRecord(inputs)) {
    for (const [name, inputSpec] of asIterable(Object.entries(inputs as any))) {
      if ((typeof name === "string")) {
        yield [name, inputSpec]
      }
    }
    return
  }
  if (Array.isArray(inputs)) {
    for (const item of asIterable(inputs)) {
      if ((!isRecord(item))) {
        continue
      }
      name = ((item as any)?.["name"])
      if ((typeof name === "string")) {
        yield [name, item]
      }
    }
  }
}

function _templateInputText(name: string, inputSpec: unknown): string {
  let parts = [name]
  if (isRecord(inputSpec)) {
    for (const key of asIterable(["label", "title", "description", "default", "value"])) {
      let value = ((inputSpec as any)?.[key])
      if ((typeof value === "string")) {
        parts.push(value)
      }
    }
  } else if ((typeof inputSpec === "string")) {
    parts.push(inputSpec)
  }
  return (parts as any).join("\n")
}

function _objectStorageBranchInputsByPath(context: ScanContext): Record<string, unknown> {
  let inputsByPath: Record<string, unknown> = {  }
  for (const path of asIterable(_iterTemplateArtifactPaths(context))) {
    let text = ((context.fileTexts as any)?.[path] ?? "")
    let lines = splitLines(String(text))
    for (const [index, line] of asIterable(Array.from(lines as any, (v: any, i: number) => [i + (0), v] as const))) {
      let match = TEMPLATE_IF_RE.exec(String(line))
      if ((match === null)) {
        continue
      }
      let inputNames = _conditionInputRefs((match as RegExpMatchArray)[1])
      if ((!inputNames)) {
        continue
      }
      let [branchEnd, elseIndex] = _findBranchSections(lines, index)
      let trueBranchEnd = ((elseIndex !== null) ? elseIndex : branchEnd)
      let trueBranchText = (lines.slice((index + 1), trueBranchEnd) as any).join("\n")
      if ((!_branchUsesObjectStorage(trueBranchText))) {
        continue
      }
      ((() => { const __o = ((() => { const __o = inputsByPath as any; if (__o[path] === undefined) __o[path] = new Set(); return __o[path] })()); if (__o instanceof Set) { for (const __x of inputNames as any) __o.add(__x) } else { Object.assign(__o, inputNames) } })())
    }
  }
  return inputsByPath
}

function _inputDeclarationLine(doc: YamlDocument, inputName: string): number {
  let escaped = escapeRegExp(inputName)
  let inputsLine = String(doc.lineLocator).indexOf("^\\s*inputs\\s*:")
  let listNameLine = String(doc.lineLocator).indexOf(`^\\s*name\\s*:\\s*['\\"]?${escaped}['\\"]?\\s*$`)
  return String(doc.lineLocator).indexOf(`^\\s*${escaped}\\s*:`)
}

export function checkLicenseGatedObjectStorageOptions(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  let objectStorageBranchInputs = _objectStorageBranchInputsByPath(context)
  for (const doc of asIterable(_iterTemplateArtifactDocuments(context))) {
    let spec = (isRecord(doc.data) ? ((doc.data as any)?.["spec"]) : null)
    if ((!isRecord(spec))) {
      continue
    }
    let branchInputs = ((objectStorageBranchInputs as any)?.[doc.path] ?? new Set())
    for (const [inputName, inputSpec] of asIterable(_iterTemplateInputs(spec))) {
      let inputText = _templateInputText(inputName, inputSpec)
      if ((LICENSE_GATED_TEXT_RE.exec(String(inputText)) === null)) {
        continue
      }
      let normalizedName = _normalizeTemplateInputName(inputName)
      let isObjectStorageInput = (contains(inputName, branchInputs) || contains(normalizedName, MANAGED_OBJECT_STORAGE_TOGGLE_NAMES) || _isExplicitExternalObjectStorageInputName(normalizedName) || (OBJECT_STORAGE_INPUT_TEXT_RE.exec(String(inputText)) !== null))
      if ((!isObjectStorageInput)) {
        continue
      }
      violations.push({ ruleId: "R049", path: doc.path, line: _inputDeclarationLine(doc, inputName), message: "license-gated object storage/S3 features must not be exposed as standard public-template inputs; use the community-supported filesystem/PVC mode or create a dedicated enterprise template only when explicitly requested" })
    }
  }
  return violations
}

export function checkExternalObjectStorageInputs(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  let objectStoragePaths = new Set(Array.from(context.yamlDocuments as any).filter((doc) => (((!doc.skipChecks) && isRecord(doc.data) && (((doc.data as any)?.["kind"]) === "ObjectStorageBucket")))).map((doc) => (doc.path)))
  for (const doc of asIterable(_iterTemplateArtifactDocuments(context))) {
    let inputNames = _externalObjectStorageInputNames(doc)
    if ((!inputNames)) {
      continue
    }
    if (contains(doc.path, objectStoragePaths)) {
      addDocViolation(violations, { ruleId: "R047", doc: doc, pattern: `^\\s*${escapeRegExp(inputNames[0])}\\s*:`, defaultPattern: "^\\s*inputs\\s*:", message: "templates with managed ObjectStorageBucket resources must not expose external S3/object-storage credential inputs" })
      continue
    }
    let source = _externalObjectStorageSource(doc)
    if ((source && _isValidObjectStorageSourceEvidence(source))) {
      continue
    }
    addDocViolation(violations, { ruleId: "R047", doc: doc, pattern: `^\\s*${escapeRegExp(inputNames[0])}\\s*:`, defaultPattern: "^\\s*inputs\\s*:", message: `external S3/object-storage input ${inputNames[0]} requires metadata.annotations.${EXTERNAL_OBJECT_STORAGE_SOURCE_ANNOTATION} with a credential-free HTTPS source URL or user-request:<reference> evidence` })
  }
  return violations
}

function _extractPostgresDatabaseNamesFromValue(rawValue: string): string[] {
  let names: string[] = []
  for (const match of asIterable(Array.from(String(rawValue).matchAll(new RegExp(POSTGRES_URL_DATABASE_RE.source, POSTGRES_URL_DATABASE_RE.flags.includes('g') ? POSTGRES_URL_DATABASE_RE.flags : POSTGRES_URL_DATABASE_RE.flags + 'g'))))) {
    let dbName = String((match as RegExpMatchArray)[1]).trim()
    if ((!dbName)) {
      continue
    }
    let normalized = String(dbName).toLowerCase()
    if (contains(normalized, DEFAULT_POSTGRES_DATABASE_NAMES)) {
      continue
    }
    names.push(dbName)
  }
  return names
}

function _extractRequiredPostgresDatabases(doc: any): unknown {
  let names: unknown = new Set()
  let templateSpec = getTemplateSpec(doc.data)
  if ((!isRecord(templateSpec))) {
    return names
  }
  for (const container of asIterable(iterContainers(templateSpec))) {
    let envList = ((container as any)?.["env"])
    if ((!Array.isArray(envList))) {
      continue
    }
    for (const envItem of asIterable(envList)) {
      if ((!isRecord(envItem))) {
        continue
      }
      let value = ((envItem as any)?.["value"])
      if ((!(typeof value === "string"))) {
        continue
      }
      ((() => { const __o = names; if (__o instanceof Set) { for (const __x of _extractPostgresDatabaseNamesFromValue(value) as any) __o.add(__x) } else { Object.assign(__o, _extractPostgresDatabaseNamesFromValue(value)) } })())
    }
  }
  return names
}

function _isPostgresClusterDocument(doc: any): boolean {
  if (((!isRecord(doc.data)) || (((doc.data as any)?.["kind"]) !== "Cluster"))) {
    return false
  }
  let spec = (isRecord(((doc.data as any)?.["spec"])) ? ((doc.data as any)?.["spec"]) : {  })
  let metadata = (isRecord(((doc.data as any)?.["metadata"])) ? ((doc.data as any)?.["metadata"]) : {  })
  let labels = (isRecord(((metadata as any)?.["labels"])) ? ((metadata as any)?.["labels"]) : {  })
  let clusterDefinition = ((spec as any)?.["clusterDefinitionRef"])
  if (((typeof clusterDefinition === "string") && (String(String(clusterDefinition).trim()).toLowerCase() === "postgresql"))) {
    return true
  }
  let labelDefinition = ((labels as any)?.["clusterdefinition.kubeblocks.io/name"])
  if (((typeof labelDefinition === "string") && (String(String(labelDefinition).trim()).toLowerCase() === "postgresql"))) {
    return true
  }
  let dbLabel = ((labels as any)?.["kb.io/database"])
  if (((typeof dbLabel === "string") && String(String(String(dbLabel).trim()).toLowerCase()).startsWith("postgresql"))) {
    return true
  }
  return false
}

function _collectPostgresExpectedConnSecrets(artifactDocs: any): Record<string, unknown> {
  let expectedByPath: Record<string, unknown> = {  }
  for (const doc of asIterable(artifactDocs)) {
    if ((!_isPostgresClusterDocument(doc))) {
      continue
    }
    let metadata = (isRecord(doc.data) ? ((doc.data as any)?.["metadata"]) : null)
    let clusterName = (isRecord(metadata) ? ((metadata as any)?.["name"]) : null)
    if (((!(typeof clusterName === "string")) || (!String(clusterName).trim()))) {
      continue
    }
    ((() => { const __o = expectedByPath as any; if (__o[doc.path] === undefined) __o[doc.path] = new Set(); return __o[doc.path] })()).add(`${String(clusterName).trim()}-conn-credential`)
  }
  return expectedByPath
}

export function checkPostgresSecretRefsMatchClusterName(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  let artifactDocs = Array.from(context.yamlDocuments as any).filter((doc) => (_isTemplateArtifactDocument(doc))).map((doc) => (doc))
  if ((!artifactDocs)) {
    return violations
  }
  let expectedByPath = _collectPostgresExpectedConnSecrets(artifactDocs)
  if ((!expectedByPath)) {
    return violations
  }
  let seen: unknown = new Set()
  for (const doc of asIterable(artifactDocs)) {
    if ((!isRecord(doc.data))) {
      continue
    }
    let expected = ((expectedByPath as any)?.[doc.path])
    if ((!expected)) {
      continue
    }
    for (const [_3, secretName, _4, secretKey] of asIterable(iterWorkloadSecretRefs(doc.data))) {
      if (((!(typeof secretName === "string")) || (!String(secretName).endsWith("-pg-conn-credential")))) {
        continue
      }
      if (contains(secretName, expected)) {
        continue
      }
      if (((secretKey !== null) && (!contains(secretKey, new Set(["host", "port", "username", "password", "endpoint"]))))) {
        continue
      }
      let marker = [doc.path, secretName]
      if (contains(marker, seen)) {
        continue
      }
      seen.add(marker)
      let expectedList = ([...asIterable(expected)].sort() as any).join(", ")
      addDocViolation(violations, { ruleId: "R037", doc: doc, pattern: `^\\s*name\\s*:\\s*${escapeRegExp(secretName)}\\s*$`, defaultPattern: "^\\s*env\\s*:", message: `PostgreSQL secret reference '${secretName}' must match the Cluster metadata.name-derived secret (${expectedList})` })
    }
  }
  return violations
}

function _extractJobScript(doc: any): string {
  if ((!isRecord(doc.data))) {
    return ""
  }
  let templateSpec = getTemplateSpec(doc.data)
  if ((!isRecord(templateSpec))) {
    return ""
  }
  let scriptParts: string[] = []
  let containers = ((templateSpec as any)?.["containers"])
  if ((!Array.isArray(containers))) {
    return ""
  }
  for (const container of asIterable(containers)) {
    if ((!isRecord(container))) {
      continue
    }
    for (const key of asIterable(["command", "args"])) {
      let value = ((container as any)?.[key])
      if ((typeof value === "string")) {
        scriptParts.push(value)
        continue
      }
      if (Array.isArray(value)) {
        scriptParts.push((Array.from(value as any).map((item) => (String(item))) as any).join("\n"))
      }
    }
  }
  return (scriptParts as any).join("\n")
}

function _scriptTargetsDatabase(script: string, databaseName: string): boolean {
  let escaped = escapeRegExp(databaseName)
  let patterns = [`datname\\s*=\\s*['\\"]${escaped}['\\"]`, `\\bcreatedb\\b[\\s\\\\\\n\\"'\\$()\\-A-Za-z0-9_./]*\\b${escaped}\\b`, `CREATE\\s+DATABASE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?\\"?${escaped}\\"?`]
  return Array.from(patterns as any).some((pattern) => (Boolean(new RegExp(pattern, "i").exec(String(script)))))
}

function _isRobustPgInitScript(script: string): boolean {
  let hasReadinessWait = (Boolean(new RegExp("\\bpg_isready\\b", "").exec(String(script))) || Boolean(new RegExp("\\buntil\\s+psql\\b", "").exec(String(script))))
  let hasExistsCheck = (Boolean(new RegExp("SELECT\\s+1\\s+FROM\\s+pg_database", "i").exec(String(script))) && contains("datname=", script))
  let hasCreate = (Boolean(new RegExp("\\bcreatedb\\b", "").exec(String(script))) || Boolean(new RegExp("CREATE\\s+DATABASE", "i").exec(String(script))))
  return (hasReadinessWait && hasExistsCheck && hasCreate)
}

export function checkPostgresCustomDbInitJob(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  let artifactDocs = Array.from(context.yamlDocuments as any).filter((doc) => (_isTemplateArtifactDocument(doc))).map((doc) => (doc))
  if ((!artifactDocs)) {
    return violations
  }
  if ((!Array.from(artifactDocs as any).some((doc) => (Boolean(_isPostgresClusterDocument(doc)))))) {
    return violations
  }
  let requiredDatabases: unknown = new Set()
  let workloadDocs = Array.from(artifactDocs as any).filter((doc) => ((isAppWorkloadDocument(doc) && hasManagedWorkloadMarker(doc.data)))).map((doc) => (doc))
  for (const doc of asIterable(workloadDocs)) {
    ((() => { const __o = requiredDatabases; if (__o instanceof Set) { for (const __x of _extractRequiredPostgresDatabases(doc) as any) __o.add(__x) } else { Object.assign(__o, _extractRequiredPostgresDatabases(doc)) } })())
  }
  if ((!requiredDatabases)) {
    return violations
  }
  let jobDocs = Array.from(artifactDocs as any).filter((doc) => ((isRecord(doc.data) && (((doc.data as any)?.["kind"]) === "Job")))).map((doc) => (doc))
  let pgInitJobs = []
  for (const doc of asIterable(jobDocs)) {
    let metadata = (isRecord(doc.data) ? ((doc.data as any)?.["metadata"]) : null)
    let name = (isRecord(metadata) ? ((metadata as any)?.["name"]) : null)
    if (((typeof name === "string") && contains("pg-init", name))) {
      pgInitJobs.push([doc, _extractJobScript(doc)])
    }
  }
  for (const databaseName of asIterable([...asIterable(requiredDatabases)].sort())) {
    let matchingJob = null
    for (const [doc, script] of asIterable(pgInitJobs)) {
      if (_scriptTargetsDatabase(script, databaseName)) {
        matchingJob = [doc, script]
        break
      }
    }
    if ((matchingJob === null)) {
      let targetDoc = (workloadDocs ? workloadDocs[0] : artifactDocs[0])
      addDocViolation(violations, { ruleId: "R027", doc: targetDoc, pattern: "postgres(?:ql)?://", defaultPattern: "^\\s*env\\s*:", message: `non-default PostgreSQL database '${databaseName}' requires a \${{ defaults.app_name }}-pg-init Job in template artifacts` })
      continue
    }
    let jobDoc
    [jobDoc, script] = matchingJob
    if (_isRobustPgInitScript(script)) {
      continue
    }
    addDocViolation(violations, { ruleId: "R027", doc: jobDoc, pattern: "^\\s*command\\s*:", defaultPattern: "^\\s*containers\\s*:", message: "pg-init Job for non-default PostgreSQL databases must include readiness wait (for example pg_isready) and idempotent create logic (exists check before create)" })
  }
  return violations
}

function _isWorkerArgs(args: unknown): boolean {
  if (((!Array.isArray(args)) || (!args))) {
    return false
  }
  let first = String(String(String(args[0])).trim()).toLowerCase()
  return (first === "worker")
}

function _probeHasHttpPath(probe: unknown, expectedPath: string, expectedPort: number | null = null): boolean {
  if ((!isRecord(probe))) {
    return false
  }
  let httpGet = ((probe as any)?.["httpGet"])
  if ((!isRecord(httpGet))) {
    return false
  }
  if ((((httpGet as any)?.["path"]) !== expectedPath)) {
    return false
  }
  let port = ((httpGet as any)?.["port"])
  if (((!((typeof port === "number" && Number.isInteger(port)) || (typeof port === "string"))) || (!String(String(port)).trim()))) {
    return false
  }
  if ((expectedPort === null)) {
    return true
  }
  return (String(String(port)).trim() === String(expectedPort))
}

function _probeHasExecCommand(probe: unknown, expectedFragment: string): boolean {
  if ((!isRecord(probe))) {
    return false
  }
  let execProbe = ((probe as any)?.["exec"])
  if ((!isRecord(execProbe))) {
    return false
  }
  let command = ((execProbe as any)?.["command"])
  if (((!Array.isArray(command)) || (!command))) {
    return false
  }
  let merged = (Array.from(command as any).map((item) => (String(item))) as any).join(" ")
  return contains(expectedFragment, merged)
}

export function checkOfficialHealthProbes(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(context.yamlDocuments)) {
    if ((doc.skipChecks || (!isRecord(doc.data)))) {
      continue
    }
    if ((!isAppWorkloadDocument(doc))) {
      continue
    }
    if ((!hasManagedWorkloadMarker(doc.data))) {
      continue
    }
    let templateSpec = getTemplateSpec(doc.data)
    let containers = (isRecord(templateSpec) ? ((templateSpec as any)?.["containers"]) : null)
    if (((!Array.isArray(containers)) || (!containers))) {
      continue
    }
    if ((!isRecord(containers[0]))) {
      continue
    }
    let container = containers[0]
    let image = ((container as any)?.["image"])
    if (((!(typeof image === "string")) || (!String(image).trim()))) {
      continue
    }
    let imageLower = String(String(image).trim()).toLowerCase()
    let workerMarker = ((Array.from(OFFICIAL_HEALTH_WORKER_EXEC_EXPECTATIONS as any).filter((m) => (contains(m, imageLower))).map((m) => (m)))[0] ?? null)
    if ((workerMarker && _isWorkerArgs(((container as any)?.["args"])))) {
      let expected = OFFICIAL_HEALTH_WORKER_EXEC_EXPECTATIONS[workerMarker]
      let liveness = ((container as any)?.["livenessProbe"])
      let readiness = ((container as any)?.["readinessProbe"])
      let startup = ((container as any)?.["startupProbe"])
      if ((!_probeHasExecCommand(liveness, expected["liveness_command"]))) {
        addDocViolation(violations, { ruleId: "R024", doc: doc, pattern: "^\\s*livenessProbe\\s*:", defaultPattern: "^\\s*containers\\s*:", message: "workloads with official health checks must define livenessProbe; expected exec command containing 'ak healthcheck'" })
      }
      if ((!_probeHasExecCommand(readiness, expected["readiness_command"]))) {
        addDocViolation(violations, { ruleId: "R024", doc: doc, pattern: "^\\s*readinessProbe\\s*:", defaultPattern: "^\\s*containers\\s*:", message: "workloads with official health checks must define readinessProbe; expected exec command containing 'ak healthcheck'" })
      }
      if ((!_probeHasExecCommand(startup, expected["startup_command"]))) {
        addDocViolation(violations, { ruleId: "R024", doc: doc, pattern: "^\\s*startupProbe\\s*:", defaultPattern: "^\\s*containers\\s*:", message: "workloads with slow startup and official health checks must define startupProbe; expected exec command containing 'ak healthcheck'" })
      }
      continue
    }
    let httpMarker = ((Array.from(OFFICIAL_HEALTH_HTTP_EXPECTATIONS as any).filter((m) => (contains(m, imageLower))).map((m) => (m)))[0] ?? null)
    if ((!httpMarker)) {
      continue
    }
    expected = OFFICIAL_HEALTH_HTTP_EXPECTATIONS[httpMarker]
    liveness = ((container as any)?.["livenessProbe"])
    readiness = ((container as any)?.["readinessProbe"])
    startup = ((container as any)?.["startupProbe"])
    let expectedPort = ((expected as any)?.["port"])
    if ((!_probeHasHttpPath(liveness, expected["liveness_path"], expectedPort))) {
      addDocViolation(violations, { ruleId: "R024", doc: doc, pattern: "^\\s*livenessProbe\\s*:", defaultPattern: "^\\s*containers\\s*:", message: "workloads with official health checks must define livenessProbe with the official endpoint path and port" })
    }
    if ((!_probeHasHttpPath(readiness, expected["readiness_path"], expectedPort))) {
      addDocViolation(violations, { ruleId: "R024", doc: doc, pattern: "^\\s*readinessProbe\\s*:", defaultPattern: "^\\s*containers\\s*:", message: "workloads with official health checks must define readinessProbe with the official endpoint path and port" })
    }
    if ((!_probeHasHttpPath(startup, expected["startup_path"], expectedPort))) {
      addDocViolation(violations, { ruleId: "R024", doc: doc, pattern: "^\\s*startupProbe\\s*:", defaultPattern: "^\\s*containers\\s*:", message: "workloads with slow startup and official health checks must define startupProbe with the official endpoint path and port" })
    }
  }
  return violations
}

export function checkRuntimeBundleConsistency(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  let templates = _templateArtifactsByName(context)
  for (const doc of asIterable(_iterRuntimeBundleEvidenceDocuments(context))) {
    let spec = _runtimeBundleSpec(doc)
    let source = ((spec as any)?.[RUNTIME_BUNDLE_SOURCE_FIELD])
    if (((!(typeof source === "string")) || (!String(source).trim()))) {
      addDocViolation(violations, { ruleId: "R046", doc: doc, pattern: `^\\s*${escapeRegExp(RUNTIME_BUNDLE_SOURCE_FIELD)}\\s*:`, defaultPattern: "^\\s*spec\\s*:", message: "runtime bundle evidence must declare spec.source" })
      continue
    }
    let appName = ((spec as any)?.["appName"])
    if (((!(typeof appName === "string")) || (!String(appName).trim()))) {
      addDocViolation(violations, { ruleId: "R046", doc: doc, pattern: "^\\s*appName\\s*:", defaultPattern: "^\\s*spec\\s*:", message: "runtime bundle evidence must declare spec.appName matching Template metadata.name" })
      continue
    }
    let templateDoc = ((templates as any)?.[String(appName).trim()])
    if ((templateDoc === null)) {
      addDocViolation(violations, { ruleId: "R046", doc: doc, pattern: "^\\s*appName\\s*:", defaultPattern: "^\\s*spec\\s*:", message: "runtime bundle evidence spec.appName must match a Template metadata.name in the scanned artifacts" })
      continue
    }
    let state = _collectRuntimeBundleState(context, templateDoc.path)
    let expectedImages = _splitRuntimeBundleValues(((spec as any)?.[RUNTIME_BUNDLE_IMAGES_FIELD]))
    let expectedComponents = _splitRuntimeBundleValues(((spec as any)?.[RUNTIME_BUNDLE_COMPONENTS_FIELD]))
    let expectedRoutes = _parseRuntimeBundleRoutes(((spec as any)?.[RUNTIME_BUNDLE_ROUTES_FIELD]))
    let expectedEnvs = _splitRuntimeBundleValues(((spec as any)?.[RUNTIME_BUNDLE_ENVS_FIELD]))
    if ((!([expectedImages, expectedComponents, expectedRoutes, expectedEnvs] as any).some(Boolean))) {
      addDocViolation(violations, { ruleId: "R046", doc: doc, pattern: "^\\s*spec\\s*:", message: "runtime bundle evidence must declare expected images, components, routes, or env vars" })
      continue
    }
    let missingImages = Array.from(expectedImages as any).filter((image) => ((!contains(image, state["images"])))).map((image) => (image))
    if (missingImages) {
      addDocViolation(violations, { ruleId: "R046", doc: doc, pattern: `^\\s*${escapeRegExp(RUNTIME_BUNDLE_IMAGES_FIELD)}\\s*:`, defaultPattern: "^\\s*spec\\s*:", message: `runtime bundle image versions must match one official compose/release source; missing expected image(s): ${(missingImages as any).join(", ")}` })
    }
    let missingComponents = Array.from(expectedComponents as any).filter((component) => ((!contains(component, state["workloads"])))).map((component) => (component))
    if (missingComponents) {
      addDocViolation(violations, { ruleId: "R046", doc: doc, pattern: `^\\s*${escapeRegExp(RUNTIME_BUNDLE_COMPONENTS_FIELD)}\\s*:`, defaultPattern: "^\\s*spec\\s*:", message: `runtime bundle components must be emitted as explicit managed workloads; missing component(s): ${(missingComponents as any).join(", ")}` })
    }
    let missingRoutes: string[] = []
    for (const [routePath, serviceName] of asIterable(expectedRoutes)) {
      if (((!routePath) || (!serviceName))) {
        missingRoutes.push(`${(routePath || "<missing-path>")}=<missing-service>`)
        continue
      }
      if (((!contains(serviceName, state["services"])) || (!contains([routePath, serviceName], state["routes"])))) {
        missingRoutes.push(`${routePath}=${serviceName}`)
      }
    }
    if (missingRoutes) {
      addDocViolation(violations, { ruleId: "R046", doc: doc, pattern: `^\\s*${escapeRegExp(RUNTIME_BUNDLE_ROUTES_FIELD)}\\s*:`, defaultPattern: "^\\s*spec\\s*:", message: `runtime bundle routes must expose official entry paths through matching Services and Ingress rules; missing route(s): ${(missingRoutes as any).join(", ")}` })
    }
    let missingEnvs = Array.from(expectedEnvs as any).filter((envName) => ((!contains(envName, state["envs"])))).map((envName) => (envName))
    if (missingEnvs) {
      addDocViolation(violations, { ruleId: "R046", doc: doc, pattern: `^\\s*${escapeRegExp(RUNTIME_BUNDLE_ENVS_FIELD)}\\s*:`, defaultPattern: "^\\s*spec\\s*:", message: `runtime bundle critical env vars must remain present on managed workloads; missing env var(s): ${(missingEnvs as any).join(", ")}` })
    }
  }
  return violations
}

export function checkTopologyEvidenceConsistency(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  let templates = _templateArtifactsByName(context)
  for (const doc of asIterable(_iterTopologyEvidenceDocuments(context))) {
    let spec = _runtimeBundleSpec(doc)
    let appName = ((spec as any)?.["appName"])
    let source = ((spec as any)?.["source"])
    if (((!(typeof appName === "string")) || (!String(appName).trim()))) {
      addDocViolation(violations, { ruleId: "R050", doc: doc, pattern: "^\\s*appName\\s*:", defaultPattern: "^\\s*spec\\s*:", message: "TopologyEvidence must declare spec.appName matching Template metadata.name" })
      continue
    }
    appName = String(appName).trim()
    let expectedPath = ((dirname(doc.path).name === TOPOLOGY_EVIDENCE_DIR) && (dirname(doc.path).parent.name === ".sealos"))
    if (((!expectedPath) || (pathName(doc.path) !== `${appName}.yaml`))) {
      violations.push({ ruleId: "R050", path: doc.path, line: doc.startLine, message: `TopologyEvidence must use .sealos/topology-evidence/<appName>.yaml; expected .sealos/topology-evidence/${appName}.yaml` })
    }
    if (((!(typeof source === "string")) || (!String(source).trim()))) {
      addDocViolation(violations, { ruleId: "R050", doc: doc, pattern: "^\\s*source\\s*:", defaultPattern: "^\\s*spec\\s*:", message: "TopologyEvidence must declare a non-empty spec.source" })
    }
    let templateDoc = ((templates as any)?.[appName])
    if ((templateDoc === null)) {
      addDocViolation(violations, { ruleId: "R050", doc: doc, pattern: "^\\s*appName\\s*:", defaultPattern: "^\\s*spec\\s*:", message: "TopologyEvidence spec.appName must match a Template in the scanned artifacts" })
      continue
    }
    let expectedRecords = _parseTopologyEvidenceResources(doc, ((spec as any)?.["resources"]), violations)
    let [actualRecords, docsByRecord] = _collectTopologyRecords(context, templateDoc.path, violations)
    if ((!expectedRecords)) {
      continue
    }
    let expectedCounter = new Counter(expectedRecords as any)
    let actualCounter = new Counter(actualRecords as any)
    for (const [record, count] of asIterable(Object.entries((expectedCounter - actualCounter) as any))) {
      addDocViolation(violations, { ruleId: "R050", doc: doc, pattern: "^\\s*resources\\s*:", defaultPattern: "^\\s*spec\\s*:", message: `topology evidence resource is missing or changed in the template: ${_topologyRecordLabel(record)} (count=${count})` })
    }
    for (const [record, count] of asIterable(Object.entries((actualCounter - expectedCounter) as any))) {
      let resourceDoc = docsByRecord[record]
      violations.push({ ruleId: "R050", path: resourceDoc.path, line: resourceDoc.startLine, message: `template contains a topology resource absent from evidence: ${_topologyRecordLabel(record)} (count=${count})` })
    }
  }
  return violations
}

export function checkCronjobRequiredLabels(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(iterDocumentsByKind(context, "CronJob"))) {
    let metadata = (isRecord(doc.data) ? ((doc.data as any)?.["metadata"]) : null)
    if ((!isRecord(metadata))) {
      continue
    }
    let name = ((metadata as any)?.["name"])
    if (((!(typeof name === "string")) || (!String(name).trim()))) {
      continue
    }
    let labels = ((metadata as any)?.["labels"])
    if ((!isRecord(labels))) {
      addDocViolation(violations, { ruleId: "R036", doc: doc, pattern: "^\\s*labels\\s*:", defaultPattern: "^\\s*metadata\\s*:", message: "CronJob metadata.labels must define cloud.sealos.io/cronjob, cronjob-launchpad-name, and cronjob-type" })
      continue
    }
    let cronjobLabelValue = ((labels as any)?.[CRONJOB_LABEL_KEY])
    if ((cronjobLabelValue !== name)) {
      addDocViolation(violations, { ruleId: "R036", doc: doc, pattern: escapeRegExp(CRONJOB_LABEL_KEY), defaultPattern: "^\\s*labels\\s*:", message: "CronJob label cloud.sealos.io/cronjob must exist and exactly match metadata.name" })
    }
    for (const [labelKey, expectedValue] of asIterable(Object.entries(CRONJOB_REQUIRED_LABELS as any))) {
      if ((((labels as any)?.[labelKey]) === expectedValue)) {
        continue
      }
      addDocViolation(violations, { ruleId: "R036", doc: doc, pattern: escapeRegExp(labelKey), defaultPattern: "^\\s*labels\\s*:", message: `CronJob label ${labelKey} must exist and be set to ${JSON.stringify(expectedValue)}` })
    }
  }
  return violations
}

export function checkRevisionHistoryLimit(context: ScanContext): Violation[] {
  return checkManagedWorkloadSetting(context, { ruleId: "R009", valueExtractor: ((data) => (isRecord(((data as any)?.["spec"])) ? ((((data as any)?.["spec"] ?? {  }) as any)?.["revisionHistoryLimit"]) : null)), expected: 1, valuePattern: "^\\s*revisionHistoryLimit\\s*:", fallbackPattern: "^\\s*spec\\s*:", missingMessage: "managed app workloads must explicitly set revisionHistoryLimit: 1", mismatchMessage: "revisionHistoryLimit must be set to 1 for managed app workloads" })
}

const SERVICE_ACCOUNT_TOKEN_REASON_ANNOTATION = "sealos.io/service-account-token-reason"
const SERVICE_ACCOUNT_TOKEN_REASON_RE = new RegExp("\\b(k8s|kubernetes|service\\s*account|serviceaccount|token|api)\\b")
function _extractAutomountServiceAccountToken(data: Record<string, unknown>): unknown {
  let templateSpec = getTemplateSpec(data)
  if ((!isRecord(templateSpec))) {
    return null
  }
  return ((templateSpec as any)?.["automountServiceAccountToken"])
}

function _serviceAccountTokenReason(data: Record<string, unknown>): string {
  let metadata = ((data as any)?.["metadata"])
  let annotations = (isRecord(metadata) ? ((metadata as any)?.["annotations"]) : null)
  let reason = (isRecord(annotations) ? ((annotations as any)?.[SERVICE_ACCOUNT_TOKEN_REASON_ANNOTATION]) : null)
  return ((typeof reason === "string") ? String(reason).trim() : "")
}

function _hasServiceAccountTokenUsageEvidence(data: Record<string, unknown>): boolean {
  let reason = _serviceAccountTokenReason(data)
  if ((reason && SERVICE_ACCOUNT_TOKEN_REASON_RE.exec(String(reason)))) {
    return true
  }
  let templateSpec = getTemplateSpec(data)
  if ((!isRecord(templateSpec))) {
    return false
  }
  if (((typeof ((templateSpec as any)?.["serviceAccountName"]) === "string") && String(templateSpec["serviceAccountName"]).trim())) {
    return true
  }
  let commandTextParts: string[] = []
  for (const container of asIterable(iterContainers(data))) {
    if ((!isRecord(container))) {
      continue
    }
    for (const key of asIterable(["command", "args"])) {
      let value = ((container as any)?.[key])
      if (Array.isArray(value)) {
        commandTextParts.push(...(Array.from(value as any).map((item) => (String(item))) as any))
      } else if ((typeof value === "string")) {
        commandTextParts.push(value)
      }
    }
    for (const envItem of asIterable((Array.isArray(((container as any)?.["env"])) ? ((container as any)?.["env"] ?? []) : []))) {
      if ((!isRecord(envItem))) {
        continue
      }
      let envName = ((envItem as any)?.["name"])
      let envValue = ((envItem as any)?.["value"])
      if ((typeof envName === "string")) {
        commandTextParts.push(envName)
      }
      if ((typeof envValue === "string")) {
        commandTextParts.push(envValue)
      }
    }
  }
  let commandText = String((commandTextParts as any).join("\n")).toLowerCase()
  return Array.from(["kubernetes.default.svc", "/var/run/secrets/kubernetes.io/serviceaccount", "serviceaccount", "service_account", "kubeconfig"] as any).some((marker) => (Boolean(contains(marker, commandText))))
}

export function checkAutomountServiceAccountToken(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(context.yamlDocuments)) {
    if ((doc.skipChecks || (!isAppWorkloadDocument(doc)) || (!hasManagedWorkloadMarker(doc.data)))) {
      continue
    }
    if ((!isRecord(doc.data))) {
      continue
    }
    let value = _extractAutomountServiceAccountToken(doc.data)
    if ((value === false)) {
      continue
    }
    if (((value === true) && _hasServiceAccountTokenUsageEvidence(doc.data))) {
      continue
    }
    if ((value === true)) {
      let message = `automountServiceAccountToken may be true only when Kubernetes API/service account token usage is evidenced by integration settings, serviceAccountName, or ${SERVICE_ACCOUNT_TOKEN_REASON_ANNOTATION}`
    } else {
      message = "managed app workloads must explicitly set automountServiceAccountToken: false"
    }
    addDocViolation(violations, { ruleId: "R010", doc: doc, pattern: "^\\s*automountServiceAccountToken\\s*:", defaultPattern: "^\\s*template\\s*:", message: message })
  }
  return violations
}

export function checkImagePullSecretRefs(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(context.yamlDocuments)) {
    if ((doc.skipChecks || (!isAppWorkloadDocument(doc)) || (!hasManagedWorkloadMarker(doc.data)))) {
      continue
    }
    if ((!isRecord(doc.data))) {
      continue
    }
    let templateSpec = getTemplateSpec(doc.data)
    let imagePullSecrets = (isRecord(templateSpec) ? ((templateSpec as any)?.["imagePullSecrets"]) : null)
    let referencedNames: string[] = []
    if (Array.isArray(imagePullSecrets)) {
      for (const item of asIterable(imagePullSecrets)) {
        if ((!isRecord(item))) {
          continue
        }
        let name = ((item as any)?.["name"])
        if (((typeof name === "string") && String(name).trim())) {
          referencedNames.push(String(name).trim())
        }
      }
    }
    let hasPullSecret = (((() => { const __v = referencedNames as any; if (__v == null) return 0; if (typeof __v.length === "number") return __v.length; if (__v instanceof Set || __v instanceof Map) return __v.size; if (typeof __v === "object") return Object.keys(__v).length; return 0 })()) > 0)
    let hasOnlyAppPullSecret = (referencedNames === ["${{ defaults.app_name }}"])
    if ((!hasPullSecret)) {
      continue
    }
    if ((!hasOnlyAppPullSecret)) {
      let message = "registry-authenticated workloads may reference only the app-scoped image pull secret `${{ defaults.app_name }}` via template.spec.imagePullSecrets"
    } else {
      let imageRepositories = new Set(Array.from(iterContainers(doc.data) as any).filter((container) => ((typeof ((container as any)?.["image"]) === "string"))).map((container) => (_imageRepository(String(((container as any)?.["image"]))))))
      if (((!imageRepositories) || (!Array.from(imageRepositories as any).every((repository) => (Boolean(contains(repository, KNOWN_PUBLIC_IMAGE_REPOSITORIES))))))) {
        continue
      }
      message = "known public-image managed app workloads must omit template.spec.imagePullSecrets"
    }
    addDocViolation(violations, { ruleId: "R035", doc: doc, pattern: "^\\s*imagePullSecrets\\s*:", defaultPattern: "^\\s*template\\s*:", message: message })
  }
  return violations
}

function _artifactText(context: ScanContext, path: string): string {
  return String((Array.from(context.yamlDocuments as any).filter((doc) => (((doc.path === path) && isRecord(doc.data)))).map((doc) => (String(doc.data))) as any).join("\n")).toLowerCase()
}

function _runtimeSecretContractRequirements(text: string): string[] {
  text = String(String(text).split("\\n").join("\n")).split("\\t").join("\t")
  text = (Array.from(splitLines(String(text)) as any).filter((line) => ((!String(String(line).trimStart()).startsWith("#")))).map((line) => (line)) as any).join("\n")
  let formatShape = new RegExp("\\[[0-9a-f].*\\]|\\bhex\\b|\\b64\\b")
  let formatPositions = Array.from(Array.from(String(text).matchAll(new RegExp("\\b(?:grep|case|test|wc|expr)\\b", 'g'))) as any).filter((match) => (formatShape.exec(String(text.slice(((match as RegExpMatchArray).index ?? 0), (((match as RegExpMatchArray).index ?? 0) + 256)))))).map((match) => (((match as RegExpMatchArray).index ?? 0)))
  let entropyPosition = String(text).indexOf("/dev/urandom")
  let umaskMatch = new RegExp("\\bumask\\s+0*77\\b", "").exec(String(text))
  let chmodMatch = new RegExp("\\bchmod\\s+(?:0*600|[\\\"']?0600[\\\"']?)\\b", "").exec(String(text))
  let moveMatch = new RegExp("\\bmv\\b", "").exec(String(text))
  let tempMatch = new RegExp("\\b(?:mktemp|tmp)\\b", "").exec(String(text))
  let orderRequirements = [["umask before entropy", ((umaskMatch !== null) && (entropyPosition >= 0) && (((umaskMatch as RegExpMatchArray).index ?? 0) < entropyPosition))], ["format validation before replacement", ((moveMatch !== null) && Array.from(formatPositions as any).some((position) => (Boolean(((entropyPosition < position) && (position < ((moveMatch as RegExpMatchArray).index ?? 0)))))))], ["temporary file before replacement", ((moveMatch !== null) && (tempMatch !== null) && (((tempMatch as RegExpMatchArray).index ?? 0) < ((moveMatch as RegExpMatchArray).index ?? 0)))], ["0600 permissions before replacement", ((moveMatch !== null) && (chmodMatch !== null) && (((chmodMatch as RegExpMatchArray).index ?? 0) < ((moveMatch as RegExpMatchArray).index ?? 0)))]]
  let requirements: [string, boolean][] = [["/dev/urandom", contains("/dev/urandom", text)], ["umask 077", (new RegExp("\\bumask\\s+0*77\\b", "").exec(String(text)) !== null)], ["format validation", Boolean(formatPositions)], ["temporary file", (new RegExp("\\b(?:mktemp|tmp)\\b", "").exec(String(text)) !== null)], ["0600 permissions", (new RegExp("\\bchmod\\s+(?:0*600|[\\\"']?0600[\\\"']?)\\b", "").exec(String(text)) !== null)], ["atomic replacement", (new RegExp("\\bmv\\b", "").exec(String(text)) !== null)], ["persistent data path", (new RegExp("/app/data|persistentvolumeclaim|volumeclaimtemplates|claimname", "").exec(String(text)) !== null)], ["read and export", ((new RegExp("\\b(?:cat|read|source|awk|sed)\\b", "").exec(String(text)) !== null) && (new RegExp("\\bexport\\b", "").exec(String(text)) !== null))], ["secret redaction", (new RegExp("(?m)^[ \\t]*(?:echo|printf|logger)\\b(?![^\\n]*(?:2)?>>?\\s*(?:[\\\"'/]|[$A-Za-z_.-]))[^\\n]*\\$[A-Za-z_][A-Za-z0-9_]*", "").exec(String(text)) === null)], ["exec", (new RegExp("\\bexec\\b", "").exec(String(text)) !== null)]]
  requirements.push(...(orderRequirements as any))
  return Array.from(requirements as any).filter(([label, present]) => ((!present))).map(([label, present]) => (label))
}

export function checkPersistedRuntimeSecretContract(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(context.yamlDocuments)) {
    if ((doc.skipChecks || (!isRecord(doc.data)))) {
      continue
    }
    let annotations = _metadataAnnotations(doc.data)
    if ((((annotations as any)?.[RUNTIME_SECRET_CONTRACT_ANNOTATION]) !== "persisted")) {
      continue
    }
    let artifactText = _artifactText(context, doc.path)
    let missing = _runtimeSecretContractRequirements(artifactText)
    let highAvailability = (new RegExp("replicas\\s*['\\\"]?\\s*:\\s*['\\\"]?(?:[2-9]|[1-9][0-9]+)", "").exec(String(artifactText)) !== null)
    let perPodStorage = (contains("volumeclaimtemplates", artifactText) || contains("persistentvolumeclaim", artifactText))
    let sharedSource = (new RegExp("secretkeyref|external|shared|clustersecret|secretname", "").exec(String(artifactText)) !== null)
    if ((highAvailability && perPodStorage && (!sharedSource))) {
      missing.push("shared secret source for high-availability per-Pod storage")
    }
    if (missing) {
      addDocViolation(violations, { ruleId: "R058", doc: doc, pattern: `^\\s*${escapeRegExp(RUNTIME_SECRET_CONTRACT_ANNOTATION)}\\s*:`, defaultPattern: "^\\s*metadata\\s*:", message: ("persisted runtime-secret contract is missing: " + (missing as any).join(", ")) })
    }
  }
  return violations
}

export function checkOptionalDatabaseBranchContract(context: ScanContext): Violation[] {
  let violations: Violation[] = []
  for (const doc of asIterable(context.yamlDocuments)) {
    if ((doc.skipChecks || (!isRecord(doc.data)))) {
      continue
    }
    let annotations = _metadataAnnotations(doc.data)
    if ((((annotations as any)?.[DATABASE_MODE_ANNOTATION]) !== "optional-managed")) {
      continue
    }
    let artifactText = String(((_artifactText(context, doc.path) + "\n") + ((context.fileTexts as any)?.[doc.path] ?? ""))).toLowerCase()
    let hasBooleanBranch = (contains("inputs.", artifactText) && contains("true", artifactText) && contains("else", artifactText))
    let hasLocalMode = Array.from(["sqlite", "local", "filesystem", "disabled"] as any).some((marker) => (Boolean(contains(marker, artifactText))))
    let hasManagedMode = (contains("cluster", artifactText) || contains("kubeblocks", artifactText))
    let branchConditions: Set<string> = new Set()
    let wiringConditions: Set<string> = new Set()
    let invalidCondition = false
    let lines = splitLines(String(artifactText))
    let conditionMatches = Array.from(Array.from(String(artifactText).matchAll(new RegExp("\\$\\{\\{\\s*if\\s*\\((.*?)\\)\\s*\\}\\}", 'g'))) as any)
    for (const match of asIterable(conditionMatches)) {
      let condition = String((match as RegExpMatchArray)[1]).trim()
      let start = ((String(artifactText.slice(0, ((match as RegExpMatchArray).index ?? 0))).match(new RegExp(escapeRegExp(String("\n")), 'g')) || []).length)
      let [branchEnd, elseIndex] = _findBranchSections(lines, start)
      let trueEnd = ((elseIndex !== null) ? elseIndex : branchEnd)
      let trueBranch = (lines.slice((start + 1), trueEnd) as any).join("\n")
      let managedBranch = (new RegExp("\\b(?:cluster|kubeblocks|database)\\b", "").exec(String(trueBranch)) !== null)
      let wiringBranch = (new RegExp("\\b(?:database[_-]?(?:dsn|url|uri|connection(?:string)?|host|port|user(?:name)?|password)|db[_-]?(?:dsn|url|uri|connection(?:string)?|host|port|user(?:name)?|password)|secretkeyref|postgres|mysql|mongodb|redis)\\b", "").exec(String(trueBranch)) !== null)
      if (((!managedBranch) && (!wiringBranch))) {
        continue
      }
      let refs = _conditionInputRefs(condition)
      if (((((() => { const __v = refs as any; if (__v == null) return 0; if (typeof __v.length === "number") return __v.length; if (__v instanceof Set || __v instanceof Map) return __v.size; if (typeof __v === "object") return Object.keys(__v).length; return 0 })()) !== 1) || (!_conditionUsesTrueComparison(condition, refs[0])))) {
        invalidCondition = true
      } else {
        if (managedBranch) {
          branchConditions.add(condition)
        }
        if (wiringBranch) {
          wiringConditions.add(condition)
        }
      }
      if (((elseIndex === null) || (!_branchUsesLocalStorageMode((lines.slice((elseIndex + 1), branchEnd) as any).join("\n"))))) {
        if (managedBranch) {
          invalidCondition = true
        }
      }
    }
    if ((new RegExp("\\b(?:database[_-]?(?:dsn|url|uri|connection(?:string)?|host|port|user(?:name)?|password)|db[_-]?(?:dsn|url|uri|connection(?:string)?|host|port|user(?:name)?|password)|secretkeyref)\\b", "").exec(String(artifactText)) && (!wiringConditions))) {
      invalidCondition = true
    }
    if ((conditionMatches && hasManagedMode && (!branchConditions))) {
      invalidCondition = true
    }
    let sameCondition = (((() => { const __v = new Set([...branchConditions, ...wiringConditions]) as any; if (__v == null) return 0; if (typeof __v.length === "number") return __v.length; if (__v instanceof Set || __v instanceof Map) return __v.size; if (typeof __v === "object") return Object.keys(__v).length; return 0 })()) <= 1)
    if ((branchConditions && (!hasBooleanBranch))) {
      invalidCondition = true
    }
    if ((!(hasBooleanBranch && hasLocalMode && hasManagedMode && sameCondition && (!invalidCondition)))) {
      addDocViolation(violations, { ruleId: "R059", doc: doc, pattern: `^\\s*${escapeRegExp(DATABASE_MODE_ANNOTATION)}\\s*:`, defaultPattern: "^\\s*metadata\\s*:", message: "optional-managed database contracts must include a boolean true branch for the managed Cluster path and an explicit false branch for SQLite or documented local storage" })
    }
  }
  return violations
}

export const APP_RULES: Record<string, Rule> = { R001: { ruleId: "R001", check: checkNoLatestTags }, R016: { ruleId: "R016", check: checkNoFloatingImageTags }, R018: { ruleId: "R018", check: checkNoComposeImageVariables }, R002: { ruleId: "R002", check: checkAppNoSpecTemplate }, R003: { ruleId: "R003", check: checkAppHasSpecDataUrl }, R032: { ruleId: "R032", check: checkAppDisplayTypeNormal }, R033: { ruleId: "R033", check: checkAppTypeLink }, R004: { ruleId: "R004", check: checkTemplateNameIsHardcodedLowercase }, R012: { ruleId: "R012", check: checkTemplateRequiredMetadataFields }, R013: { ruleId: "R013", check: checkTemplateFolderMatchesName }, R014: { ruleId: "R014", check: checkTemplateIconPaths }, R025: { ruleId: "R025", check: checkTemplateReadmePaths }, R021: { ruleId: "R021", check: checkTemplateI18nZhDescriptionChinese }, R022: { ruleId: "R022", check: checkTemplateI18nZhTitleAbsent }, R023: { ruleId: "R023", check: checkTemplateCategoriesAllowed }, R024: { ruleId: "R024", check: checkOfficialHealthProbes }, R053: { ruleId: "R053", check: checkRuntimeEnvValueConstraints }, R054: { ruleId: "R054", check: checkRuntimeProviderCredentials }, R055: { ruleId: "R055", check: checkRuntimeStartupGates }, R058: { ruleId: "R058", check: checkPersistedRuntimeSecretContract }, R059: { ruleId: "R059", check: checkOptionalDatabaseBranchContract }, R046: { ruleId: "R046", check: checkRuntimeBundleConsistency }, R050: { ruleId: "R050", check: checkTopologyEvidenceConsistency }, R036: { ruleId: "R036", check: checkCronjobRequiredLabels }, R015: { ruleId: "R015", check: checkOriginImageNameMatchesContainer }, R020: { ruleId: "R020", check: checkServicePortsHaveNames }, R029: { ruleId: "R029", check: checkServiceLabelsMatchSelectorApp }, R030: { ruleId: "R030", check: checkConfigmapLabelsMatchName }, R043: { ruleId: "R043", check: checkConfigmapFileMountContract }, R044: { ruleId: "R044", check: checkObjectStorageInputContract }, R045: { ruleId: "R045", check: checkTemplateInputReferencesDeclared }, R052: { ruleId: "R052", check: checkTemplateDefaultScalarTypes }, R060: { ruleId: "R060", check: checkTemplateFirstDocumentContract }, R061: { ruleId: "R061", check: checkTemplateDefaultsExpressionScope }, R047: { ruleId: "R047", check: checkExternalObjectStorageInputs }, R049: { ruleId: "R049", check: checkLicenseGatedObjectStorageOptions }, R031: { ruleId: "R031", check: checkIngressNameMatchesBackends }, R051: { ruleId: "R051", check: checkRootIngressBackendPortNumbers }, R026: { ruleId: "R026", check: checkHttpIngressAnnotations }, R048: { ruleId: "R048", check: checkWebsocketIngressAnnotations }, R027: { ruleId: "R027", check: checkPostgresCustomDbInitJob }, R037: { ruleId: "R037", check: checkPostgresSecretRefsMatchClusterName }, R039: { ruleId: "R039", check: checkDatabaseServicesUseClusters }, R042: { ruleId: "R042", check: checkMainContainerStartupContract }, R008: { ruleId: "R008", check: checkDeployManagerLabelMatchName }, R034: { ruleId: "R034", check: checkAppLabelMatchName }, R028: { ruleId: "R028", check: checkContainerNamesMatchWorkloadName }, R009: { ruleId: "R009", check: checkRevisionHistoryLimit }, R010: { ruleId: "R010", check: checkAutomountServiceAccountToken }, R035: { ruleId: "R035", check: checkImagePullSecretRefs } }
