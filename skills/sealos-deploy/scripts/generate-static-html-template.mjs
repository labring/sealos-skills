#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { inspectSourceReadyStaticSite } from './static-site.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const SKILL_DIR = path.dirname(SCRIPT_DIR)
function parseArgs(argv) {
  if (argv.length === 0 || argv[0].startsWith('-')) {
    throw new Error('Usage: node generate-static-html-template.mjs <work-dir> [--app-name <name>] [--title <title>] [--git-repo <url>]')
  }

  const args = { workDir: argv[0] }
  for (let index = 1; index < argv.length; index += 1) {
    const option = argv[index]
    const value = argv[index + 1]
    if (!['--app-name', '--title', '--git-repo'].includes(option) || value == null) {
      throw new Error(`Unknown or incomplete option: ${option}`)
    }
    args[option.slice(2).replaceAll('-', '_')] = value
    index += 1
  }
  return args
}

function normalizeName(value) {
  const normalized = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  if (!normalized) throw new Error('Unable to derive a valid application name')
  return normalized
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function pathToVn(value) {
  const normalized = String(value).replace(/^\//, '')
  const readable = normalized.replace(/[^a-zA-Z0-9]+/g, '-').replace(/-$/, '').toLowerCase().slice(0, 40)
  const digest = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 10)
  return `vn-${readable}-${digest}`
}

function resolveGitRepo(workDir, explicit) {
  if (explicit) return explicit
  const gitConfig = path.resolve(workDir, '.git', 'config')
  if (!fs.existsSync(gitConfig)) return 'https://github.com/labring/sealos-skills'
  const match = fs.readFileSync(gitConfig, 'utf8').match(/url\s*=\s*(?:git@github\.com:|https:\/\/github\.com\/)([^\s]+?)(?:\.git)?\s*$/m)
  return match ? `https://github.com/${match[1].replace(/\.git$/, '')}` : 'https://github.com/labring/sealos-skills'
}

function generateTemplate({ appName, assets, gitRepo, image, port, title }) {
  const icon = `https://raw.githubusercontent.com/labring-actions/templates/kb-0.9/template/${appName}/logo.svg`
  const readme = `https://raw.githubusercontent.com/labring-actions/templates/kb-0.9/template/${appName}/README.md`
  const readmeZh = `https://raw.githubusercontent.com/labring-actions/templates/kb-0.9/template/${appName}/README_zh.md`

  const configMapEntries = assets.map(({ absolutePath, relativePath }) => {
    const mountPath = `/usr/share/nginx/html/${relativePath}`
    return `  ${pathToVn(mountPath)}: '${fs.readFileSync(absolutePath).toString('base64')}'`
  }).join('\n')
  const volumeMounts = assets.map(({ relativePath }) => {
    const mountPath = `/usr/share/nginx/html/${relativePath}`
    const key = pathToVn(mountPath)
    return `            - name: \${{ defaults.app_name }}-cm
              mountPath: ${mountPath}
              subPath: ${key}`
  }).join('\n')

  return `apiVersion: app.sealos.io/v1
kind: Template
metadata:
  name: ${appName}
spec:
  title: ${quote(title)}
  url: ${quote(gitRepo)}
  gitRepo: ${quote(gitRepo)}
  author: 'labring'
  description: 'A source-ready static HTML site deployed without a custom image build.'
  readme: ${quote(readme)}
  icon: ${quote(icon)}
  templateType: inline
  locale: en
  i18n:
    zh:
      description: '无需构建自定义镜像即可部署的纯静态 HTML 网站。'
      readme: ${quote(readmeZh)}
  categories:
    - frontend
    - tool
  defaults:
    app_name:
      type: string
      value: '${appName}-\${{ random(8) }}'
    app_host:
      type: string
      value: '${appName}-\${{ random(8) }}'
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: \${{ defaults.app_name }}
  labels:
    app: \${{ defaults.app_name }}
    cloud.sealos.io/app-deploy-manager: \${{ defaults.app_name }}
binaryData:
${configMapEntries}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: \${{ defaults.app_name }}
  annotations:
    originImageName: ${image}
    deploy.cloud.sealos.io/minReplicas: '1'
    deploy.cloud.sealos.io/maxReplicas: '1'
  labels:
    app: \${{ defaults.app_name }}
    cloud.sealos.io/app-deploy-manager: \${{ defaults.app_name }}
spec:
  replicas: 1
  revisionHistoryLimit: 1
  selector:
    matchLabels:
      app: \${{ defaults.app_name }}
  template:
    metadata:
      labels:
        app: \${{ defaults.app_name }}
        cloud.sealos.io/app-deploy-manager: \${{ defaults.app_name }}
    spec:
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 101
        runAsGroup: 101
        fsGroup: 101
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: \${{ defaults.app_name }}
          image: ${image}
          imagePullPolicy: IfNotPresent
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop:
                - ALL
          ports:
            - name: http
              containerPort: ${port}
              protocol: TCP
          readinessProbe:
            httpGet:
              path: /
              port: ${port}
            initialDelaySeconds: 2
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /
              port: ${port}
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests:
              cpu: 10m
              memory: 12Mi
            limits:
              cpu: 100m
              memory: 128Mi
          volumeMounts:
${volumeMounts}
      volumes:
        - name: \${{ defaults.app_name }}-cm
          configMap:
            name: \${{ defaults.app_name }}
---
apiVersion: v1
kind: Service
metadata:
  name: \${{ defaults.app_name }}
  labels:
    app: \${{ defaults.app_name }}
    cloud.sealos.io/app-deploy-manager: \${{ defaults.app_name }}
spec:
  selector:
    app: \${{ defaults.app_name }}
  ports:
    - name: http
      protocol: TCP
      port: ${port}
      targetPort: ${port}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: \${{ defaults.app_name }}
  labels:
    app: \${{ defaults.app_name }}
    cloud.sealos.io/app-deploy-manager: \${{ defaults.app_name }}
    cloud.sealos.io/app-deploy-manager-domain: \${{ defaults.app_host }}
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/proxy-body-size: 32m
    nginx.ingress.kubernetes.io/server-snippet: |
      client_header_buffer_size 64k;
      large_client_header_buffers 4 128k;
    nginx.ingress.kubernetes.io/ssl-redirect: 'true'
    nginx.ingress.kubernetes.io/backend-protocol: HTTP
    nginx.ingress.kubernetes.io/client-body-buffer-size: 64k
    nginx.ingress.kubernetes.io/proxy-buffer-size: 64k
    nginx.ingress.kubernetes.io/proxy-send-timeout: '300'
    nginx.ingress.kubernetes.io/proxy-read-timeout: '300'
    nginx.ingress.kubernetes.io/configuration-snippet: |
      if ($request_uri ~* \\.(js|css|gif|jpe?g|png)) {
        expires 30d;
        add_header Cache-Control "public";
      }
spec:
  rules:
    - host: \${{ defaults.app_host }}.\${{ SEALOS_CLOUD_DOMAIN }}
      http:
        paths:
          - pathType: Prefix
            path: /
            backend:
              service:
                name: \${{ defaults.app_name }}
                port:
                  number: ${port}
  tls:
    - hosts:
        - \${{ defaults.app_host }}.\${{ SEALOS_CLOUD_DOMAIN }}
      secretName: \${{ SEALOS_CERT_SECRET_NAME }}
---
apiVersion: app.sealos.io/v1
kind: App
metadata:
  name: \${{ defaults.app_name }}
  labels:
    cloud.sealos.io/app-deploy-manager: \${{ defaults.app_name }}
spec:
  data:
    url: https://\${{ defaults.app_host }}.\${{ SEALOS_CLOUD_DOMAIN }}
  displayType: normal
  icon: ${quote(icon)}
  name: ${quote(title)}
  type: link
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const workDir = fs.realpathSync(path.resolve(args.workDir))
  const config = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'config.json'), 'utf8'))
  const maxBytes = config.static_html_fast_path.max_encoded_config_map_bytes
  const staticSite = inspectSourceReadyStaticSite(workDir, { maxEncodedBytes: maxBytes })
  if (!staticSite.eligible) {
    throw new Error(`Static site fast path is not applicable (${staticSite.classification}): ${[...staticSite.blockers, ...staticSite.routeSignals, ...staticSite.evidence].join('; ')}`)
  }

  const encodedBytes = staticSite.encodedBytes

  const appName = normalizeName(args.app_name || path.basename(workDir))
  const title = args.title || appName
  const gitRepo = resolveGitRepo(workDir, args.git_repo)
  const outputDir = path.join(workDir, '.sealos', 'template')
  const outputPath = path.join(outputDir, 'index.yaml')
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(outputPath, generateTemplate({
    appName,
    gitRepo,
    assets: staticSite.assets,
    image: config.static_html_fast_path.image,
    port: config.static_html_fast_path.port,
    title,
  }))

  console.log(JSON.stringify({
    success: true,
    strategy: 'static-html-configmap',
    image: config.static_html_fast_path.image,
    port: config.static_html_fast_path.port,
    asset_count: staticSite.assets.length,
    source_bytes: staticSite.totalBytes,
    encoded_bytes: encodedBytes,
    ignored_metadata_files: staticSite.ignoredFiles,
    output: outputPath,
    skipped_phases: ['detect-image', 'dockerfile', 'build-push'],
  }))
}

try {
  main()
} catch (error) {
  console.error(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }))
  process.exitCode = 1
}
