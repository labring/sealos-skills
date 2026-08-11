/** Shared constants for Docker Compose → Sealos template conversion. */

export const DB_TYPE_PATTERNS: Record<string, readonly string[]> = {
  postgres: ['postgres', 'postgresql', 'postgis', 'timescaledb'],
  mysql: ['mysql', 'mariadb', 'apecloud-mysql'],
  mongodb: [
    'mongo',
    'mongodb',
    'mongodb-community-server',
    'mongodb-sharded',
    'percona-server-mongodb',
  ],
  redis: ['redis', 'valkey'],
  kafka: ['kafka'],
}

export const SPECIAL_DB_RESOURCE_TYPES = new Set([
  'postgres',
  'mysql',
  'mongodb',
  'redis',
  'kafka',
])

export const EDGE_GATEWAY_SERVICE_HINTS = ['traefik'] as const
export const EDGE_GATEWAY_IMAGE_HINTS = ['traefik'] as const
export const EDGE_GATEWAY_PORT_HINTS = new Set([80, 443])
export const EDGE_GATEWAY_COMMAND_HINTS = [
  '--entrypoints.',
  '--providers.',
  '--api.dashboard',
  '--ping',
  'traefik',
] as const

export const DB_FQDN_BY_TYPE: Record<string, string> = {
  postgres:
    '${{ defaults.app_name }}-pg-postgresql.${{ SEALOS_NAMESPACE }}.svc.cluster.local',
  mysql: '${{ defaults.app_name }}-mysql-mysql.${{ SEALOS_NAMESPACE }}.svc.cluster.local',
  mongodb:
    '${{ defaults.app_name }}-mongo-mongodb.${{ SEALOS_NAMESPACE }}.svc.cluster.local',
  redis:
    '${{ defaults.app_name }}-redis-redis-redis.${{ SEALOS_NAMESPACE }}.svc.cluster.local',
  kafka: '${{ defaults.app_name }}-broker-kafka.${{ SEALOS_NAMESPACE }}.svc.cluster.local',
}

export const DB_SECRET_NAME_BY_TYPE: Record<string, string> = {
  postgres: '${{ defaults.app_name }}-pg-conn-credential',
  mysql: '${{ defaults.app_name }}-mysql-conn-credential',
  mongodb: '${{ defaults.app_name }}-mongo-mongodb-account-root',
  redis: '${{ defaults.app_name }}-redis-redis-account-default',
  kafka: '${{ defaults.app_name }}-broker-account-admin',
}

export const DB_ENV_HINTS_BY_TYPE: Record<string, readonly string[]> = {
  postgres: ['POSTGRES', 'POSTGRESQL', 'PG'],
  mysql: ['MYSQL', 'MARIADB'],
  mongodb: ['MONGO', 'MONGODB'],
  redis: ['REDIS'],
  kafka: ['KAFKA'],
}

export const OBJECT_STORAGE_BASE_ENV_NAMES = new Set([
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'BACKEND_STORAGE_MINIO_EXTERNAL_ENDPOINT',
])
export const OBJECT_STORAGE_BUCKET_ENV_NAME = 'S3_BUCKET'

export const COMPOSE_REFERENCE_RE = /\$\{[^}]+\}/
export const INVALID_NAME_RE = /[^a-z0-9]+/g
export const MODE_SUFFIXES = new Set(['ro', 'rw', 'z', 'Z', 'cached', 'delegated', 'consistent'])
export const TLS_TERMINATION_PORT = 443
export const TLS_CERT_DIR_NAMES = new Set(['ssl', 'cert', 'certs', 'tls'])
export const TLS_CERT_MOUNT_EXACT_PATHS = new Set([
  '/etc/nginx/ssl',
  '/etc/ssl',
  '/etc/certs',
  '/etc/tls',
  '/ssl',
  '/certs',
  '/tls',
])

export const WEBSOCKET_FIELD_HINTS = [
  'websocket',
  'web-socket',
  'web_socket',
  'ws',
  'wss',
  'devtools',
  'chrome_devtools',
  'cdp',
  'debugger',
  'socketio',
] as const

export const WEBSOCKET_VALUE_HINTS = [
  'ws://',
  'wss://',
  'websocket',
  'web-socket',
  'chrome devtools',
  'devtools',
  'cdp',
  'socket.io',
] as const

export const EXPLICIT_VERSION_TAG_RE =
  /^v?(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:[-+](?<suffix>[0-9A-Za-z][0-9A-Za-z._-]*))?$/
export const FLOATING_NUMERIC_TAG_RE = /^v?\d+(?:\.\d+)?$/
export const FLOATING_ALIAS_TAGS = new Set([
  'latest',
  'stable',
  'main',
  'master',
  'edge',
  'nightly',
  'dev',
])
export const COMPOSE_BRACED_VAR_RE = /\$\{([^}]+)\}/g
export const COMPOSE_SIMPLE_VAR_RE = /\$([A-Za-z_][A-Za-z0-9_]*)/g

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

export const DEFAULT_RESOURCE_LIMITS = { cpu: '200m', memory: '256Mi' }
export const DEFAULT_RESOURCE_REQUESTS = {
  cpu: SEALOS_CPU_REQUEST_BY_LIMIT[DEFAULT_RESOURCE_LIMITS.cpu],
  memory: SEALOS_MEMORY_REQUEST_BY_LIMIT[DEFAULT_RESOURCE_LIMITS.memory],
}
export const DB_COMPONENT_RESOURCE_LIMITS = { cpu: '500m', memory: '512Mi' }
export const DB_COMPONENT_RESOURCE_REQUESTS = {
  cpu: SEALOS_CPU_REQUEST_BY_LIMIT[DB_COMPONENT_RESOURCE_LIMITS.cpu],
  memory: SEALOS_MEMORY_REQUEST_BY_LIMIT[DB_COMPONENT_RESOURCE_LIMITS.memory],
}

export const ZH_CHAR_RE = /[\u3400-\u4DBF\u4E00-\u9FFF]/
export const EN_DESCRIPTION_REWRITE_PATTERNS: Array<[RegExp, string]> = [
  [
    /\bopen[- ]source identity and access management platform for authentication and authorization\b/,
    '开源身份与访问管理平台，提供认证与授权能力',
  ],
]
export const EN_DESCRIPTION_TERM_REPLACEMENTS: Array<[string, string]> = [
  ['identity and access management', '身份与访问管理'],
  ['authentication and authorization', '认证与授权'],
  ['open-source', '开源'],
  ['open source', '开源'],
  ['self-hosted', '可自托管'],
  ['platform', '平台'],
  ['service', '服务'],
  ['application', '应用'],
  ['tool', '工具'],
  ['database', '数据库'],
  ['monitoring', '监控'],
  ['analytics', '分析'],
  ['authentication', '认证'],
  ['authorization', '授权'],
  ['for', '用于'],
  ['with', '支持'],
  ['and', '与'],
]

export const ALLOWED_TEMPLATE_CATEGORIES = new Set([
  'tool',
  'ai',
  'game',
  'database',
  'low-code',
  'monitor',
  'dev-ops',
  'blog',
  'storage',
  'frontend',
  'backend',
])

export const CATEGORY_ALIASES: Record<string, string> = {
  security: 'backend',
  devops: 'dev-ops',
  'dev-ops': 'dev-ops',
  dev_ops: 'dev-ops',
  ml: 'ai',
  'machine-learning': 'ai',
}

export const TEMPLATE_README_BASE =
  'https://raw.githubusercontent.com/labring-actions/templates/kb-0.9/template'
export const SVGL_API_BASE = 'https://api.svgl.app'
export const SVGL_REQUEST_TIMEOUT_MS = 10_000
export const SVGL_LOGO_EXT = 'svg'

export const HTTP_INGRESS_ANNOTATIONS: Record<string, string> = {
  'kubernetes.io/ingress.class': 'nginx',
  'nginx.ingress.kubernetes.io/proxy-body-size': '32m',
  'nginx.ingress.kubernetes.io/server-snippet':
    'client_header_buffer_size 64k;\nlarge_client_header_buffers 4 128k;',
  'nginx.ingress.kubernetes.io/ssl-redirect': 'true',
  'nginx.ingress.kubernetes.io/backend-protocol': 'HTTP',
  'nginx.ingress.kubernetes.io/client-body-buffer-size': '64k',
  'nginx.ingress.kubernetes.io/proxy-buffer-size': '64k',
  'nginx.ingress.kubernetes.io/proxy-send-timeout': '300',
  'nginx.ingress.kubernetes.io/proxy-read-timeout': '300',
  'nginx.ingress.kubernetes.io/configuration-snippet':
    'if ($request_uri ~* \\.(js|css|gif|jpe?g|png)) {\n  expires 30d;\n  add_header Cache-Control "public";\n}',
}

export const WEBSOCKET_INGRESS_ANNOTATIONS: Record<string, string> = {
  'kubernetes.io/ingress.class': 'nginx',
  'nginx.ingress.kubernetes.io/proxy-body-size': '32m',
  'nginx.ingress.kubernetes.io/proxy-read-timeout': '3600',
  'nginx.ingress.kubernetes.io/proxy-send-timeout': '3600',
  'nginx.ingress.kubernetes.io/backend-protocol': 'WS',
  'nginx.ingress.kubernetes.io/ssl-redirect': 'true',
}

export const COMPOSE_DURATION_PART_RE = /(\d+)(ns|us|ms|s|m|h)/g
export const URL_IN_COMMAND_RE = /https?:\/\/[^\s"'`]+/

export type HealthHttpProfile = {
  liveness_path: string
  readiness_path: string
  startup_path: string
  preferred_port: number
  scheme: string
  initialDelaySeconds: number
  periodSeconds: number
  timeoutSeconds: number
  failureThreshold: number
  startupPeriodSeconds: number
  startupTimeoutSeconds: number
  startupFailureThreshold: number
}

export type HealthWorkerProfile = {
  command: string[]
  startup_command: string[]
  initialDelaySeconds: number
  periodSeconds: number
  timeoutSeconds: number
  failureThreshold: number
  startupPeriodSeconds: number
  startupTimeoutSeconds: number
  startupFailureThreshold: number
}

export const OFFICIAL_HEALTH_HTTP_PROFILES: Record<string, HealthHttpProfile> = {
  'goauthentik/server': {
    liveness_path: '/-/health/live/',
    readiness_path: '/-/health/ready/',
    startup_path: '/-/health/ready/',
    preferred_port: 9000,
    scheme: 'HTTP',
    initialDelaySeconds: 30,
    periodSeconds: 10,
    timeoutSeconds: 5,
    failureThreshold: 6,
    startupPeriodSeconds: 10,
    startupTimeoutSeconds: 5,
    startupFailureThreshold: 90,
  },
  'ghcr.io/danny-avila/librechat-rag-api-dev-lite': {
    liveness_path: '/health',
    readiness_path: '/health',
    startup_path: '/health',
    preferred_port: 8000,
    scheme: 'HTTP',
    initialDelaySeconds: 10,
    periodSeconds: 10,
    timeoutSeconds: 5,
    failureThreshold: 6,
    startupPeriodSeconds: 10,
    startupTimeoutSeconds: 5,
    startupFailureThreshold: 30,
  },
  'ghcr.io/clickhouse/librechat-admin-panel': {
    liveness_path: '/health',
    readiness_path: '/health',
    startup_path: '/health',
    preferred_port: 3000,
    scheme: 'HTTP',
    initialDelaySeconds: 10,
    periodSeconds: 10,
    timeoutSeconds: 5,
    failureThreshold: 6,
    startupPeriodSeconds: 10,
    startupTimeoutSeconds: 5,
    startupFailureThreshold: 30,
  },
}

export const OFFICIAL_HEALTH_WORKER_PROFILES: Record<string, HealthWorkerProfile> = {
  'goauthentik/server': {
    command: ['sh', '-c', 'ak healthcheck'],
    startup_command: ['sh', '-c', 'ak healthcheck'],
    initialDelaySeconds: 30,
    periodSeconds: 10,
    timeoutSeconds: 5,
    failureThreshold: 6,
    startupPeriodSeconds: 10,
    startupTimeoutSeconds: 5,
    startupFailureThreshold: 90,
  },
}
