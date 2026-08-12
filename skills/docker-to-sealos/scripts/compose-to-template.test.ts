/**
 * TypeScript converter behavior tests (node --experimental-strip-types --test).
 * Covers the deploy-hardening behaviors added on top of the Python parity
 * port: env semantics guards, family binding, bootstrap inputs, generated
 * secrets, public URL derivation, DB wait gates, init Jobs, probe floors,
 * securityContext, and resource tiers.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAppResource,
  buildDbWaitInitContainers,
  buildDocuments,
  buildEnvEntries,
  buildEnvFamilyDbTypes,
  buildPodSecurityContext,
  buildProbePair,
  buildProbePairFromComposeHealthcheck,
  buildZhDescription,
  deployProfileDocLinks,
  deriveRequestsFromLimits,
  envKeyForbidsHostRewrite,
  inferResourceTier,
  mapComposeEnvValue,
  normalizeCpuToLadder,
  normalizeMemoryToLadder,
  validateImages,
  type ConversionReport,
  type MetadataOptions,
} from './compose-to-template-lib.ts'

const META: MetadataOptions = {
  appName: 'demo',
  title: 'Demo',
  description: 'Demo app.',
  url: 'https://demo.example.dev',
  gitRepo: 'https://github.com/acme/demo',
  author: 'Sealos',
  categories: ['tool'],
  repoRawBase: 'https://raw.githubusercontent.com/labring-actions/templates/kb-0.9',
  logoExt: 'png',
}

const DB_SERVICES = { db: 'postgres', cache: 'redis' }
const DB_HOSTS = {
  db: '${{ defaults.app_name }}-pg-postgresql.${{ SEALOS_NAMESPACE }}.svc.cluster.local',
  cache: '${{ defaults.app_name }}-redis-redis-redis.${{ SEALOS_NAMESPACE }}.svc.cluster.local',
}

function emptyReport(): ConversionReport {
  return { generated_at: 'test', profile: 'deploy', items: [], inputs_added: [], defaults_added: [] }
}

test('driver-name env keys are never host-rewritten', () => {
  assert.equal(envKeyForbidsHostRewrite('NODEBB_DB'), true)
  assert.equal(envKeyForbidsHostRewrite('DB_NAME'), true)
  assert.equal(envKeyForbidsHostRewrite('DB_DIALECT'), true)
  assert.equal(envKeyForbidsHostRewrite('DB_HOST'), false)
  assert.equal(envKeyForbidsHostRewrite('DATABASE_HOSTNAME'), false)

  // NODEBB_DB=postgres must stay literal even when a service is named postgres.
  const hosts = { postgres: DB_HOSTS.db }
  assert.equal(mapComposeEnvValue('postgres', hosts, 'NODEBB_DB'), 'postgres')
  assert.equal(mapComposeEnvValue('postgres', hosts, 'DB_NAME'), 'postgres')
  assert.equal(mapComposeEnvValue('postgres', hosts, 'DB_HOST'), DB_HOSTS.db)
})

test('generic DB_* family binds to one db via its host member', () => {
  const envPairs: Array<[string, string]> = [
    ['DB_HOST', 'db'],
    ['DB_PORT', '5432'],
    ['DB_PASSWORD', 'secret'],
    ['REDIS_HOST', 'cache'],
  ]
  const families = buildEnvFamilyDbTypes(envPairs, DB_SERVICES)
  assert.equal(families['DB'], 'postgres')

  const service = {
    environment: [
      'DB_HOST=db',
      'DB_PORT=5432',
      'DB_PASSWORD=secret',
    ],
  }
  const result = buildEnvEntries(service, DB_HOSTS, DB_SERVICES, { serviceName: 'app' })
  const byName = Object.fromEntries(result.entries.map((e) => [e.name, e]))
  const password = byName.DB_PASSWORD as Record<string, any>
  assert.ok(password.valueFrom, 'DB_PASSWORD must use secretKeyRef with two db types present')
  assert.equal(
    password.valueFrom.secretKeyRef.name,
    '${{ defaults.app_name }}-pg-conn-credential',
  )
  const port = byName.DB_PORT as Record<string, any>
  assert.ok(port.valueFrom, 'DB_PORT must use secretKeyRef')
})

test('bootstrap admin credentials become required inputs', () => {
  const service = {
    environment: ['ADMIN_USERNAME=admin', 'ADMIN_PASSWORD=test123'],
  }
  const result = buildEnvEntries(service, {}, {}, { serviceName: 'app' })
  assert.deepEqual(Object.keys(result.inputs).sort(), ['admin_password', 'admin_username'])
  assert.equal(result.inputs.admin_username.required, true)
  assert.equal(result.inputs.admin_username.default, undefined)
  const byName = Object.fromEntries(result.entries.map((e) => [e.name, e]))
  assert.equal(byName.ADMIN_USERNAME.value, '${{ inputs.admin_username }}')
  assert.equal(byName.ADMIN_PASSWORD.value, '${{ inputs.admin_password }}')
})

test('placeholder secrets become random defaults', () => {
  const service = { environment: ['JWT_SECRET=changeme', 'APP_KEY='] }
  const result = buildEnvEntries(service, {}, {}, { serviceName: 'app' })
  assert.deepEqual(Object.keys(result.defaults).sort(), ['app_key', 'jwt_secret'])
  assert.equal(result.defaults.jwt_secret.value, '${{ random(32) }}')
  const byName = Object.fromEntries(result.entries.map((e) => [e.name, e]))
  assert.equal(byName.JWT_SECRET.value, '${{ defaults.jwt_secret }}')
})

test('public URL and host-only envs derive from the app ingress', () => {
  const service = {
    environment: ['BASE_URL=http://localhost:3000', 'DEFAULT_DOMAIN=localhost:3000'],
  }
  const result = buildEnvEntries(service, {}, {}, { serviceName: 'app' })
  const byName = Object.fromEntries(result.entries.map((e) => [e.name, e]))
  assert.equal(
    byName.BASE_URL.value,
    'https://${{ defaults.app_host }}.${{ SEALOS_CLOUD_DOMAIN }}',
  )
  assert.equal(
    byName.DEFAULT_DOMAIN.value,
    '${{ defaults.app_host }}.${{ SEALOS_CLOUD_DOMAIN }}',
  )
})

test('composed database URL always carries host and port refs', () => {
  const service = {
    environment: ['DATABASE_URL=postgres://app:pw@db/appdb?sslmode=disable'],
  }
  const result = buildEnvEntries(service, DB_HOSTS, DB_SERVICES, { serviceName: 'app' })
  const url = result.entries.find((e) => e.name === 'DATABASE_URL') as Record<string, any>
  assert.ok(String(url.value).includes(':$(SEALOS_DATABASE_POSTGRES_PORT)'))
  assert.equal(result.dbDatabases.postgres, 'appdb')
})

test('custom postgres database upgrades the wait gate to db existence', () => {
  const generic = buildDbWaitInitContainers(['postgres'], {})
  assert.equal(generic.length, 1)
  assert.match(String((generic[0].command as string[])[2]), /pg_isready/)

  const custom = buildDbWaitInitContainers(['postgres'], { postgres: 'appdb' })
  assert.equal(custom.length, 1)
  assert.match(String((custom[0].command as string[])[2]), /pg_database WHERE datname/)
})

test('compose start_period keeps a 120s startup floor', () => {
  const service = {
    healthcheck: {
      test: ['CMD', 'true'],
      interval: '30s',
      start_period: '30s',
    },
  }
  const probes = buildProbePairFromComposeHealthcheck(service, [8080])
  const startup = probes.startupProbe as Record<string, number>
  assert.ok(
    startup.failureThreshold * startup.periodSeconds >= 120,
    `startup window ${startup.failureThreshold * startup.periodSeconds}s must be >= 120s`,
  )
})

test('no healthcheck evidence falls back to TCP readiness/startup probes', () => {
  const probes = buildProbePair({}, 'acme/demo:1.2.3', [8080], [])
  assert.ok(probes.readinessProbe)
  assert.ok(probes.startupProbe)
  assert.equal(probes.livenessProbe, undefined)
  assert.deepEqual((probes.readinessProbe as any).tcpSocket, { port: 8080 })
})

test('pod securityContext follows image user and volume presence', () => {
  assert.equal(buildPodSecurityContext('1000', false).context, null)
  assert.equal(buildPodSecurityContext('', true).context, null)
  assert.equal(buildPodSecurityContext('root', true).context, null)
  const numeric = buildPodSecurityContext('1000', true)
  assert.deepEqual(numeric.context, {
    runAsNonRoot: true,
    runAsUser: 1000,
    runAsGroup: 1000,
    fsGroup: 1000,
    fsGroupChangePolicy: 'OnRootMismatch',
  })
  const symbolic = buildPodSecurityContext('nodebb', true)
  assert.equal(symbolic.context, null)
  assert.equal(symbolic.unresolvedUser, 'nodebb')
})

test('resource tiers: compose limits, fingerprints, hints, requests derivation', () => {
  assert.equal(normalizeMemoryToLadder('1G'), '1024Mi')
  assert.equal(normalizeMemoryToLadder('900m'), '1024Mi')
  assert.equal(normalizeMemoryToLadder('not-a-size'), null)
  assert.equal(normalizeCpuToLadder('0.75'), '1')

  const fromCompose = inferResourceTier('acme/demo:1', {
    deploy: { resources: { limits: { cpus: '1', memory: '1G' } } },
  })
  assert.deepEqual(fromCompose.limits, { cpu: '1', memory: '1024Mi' })

  const heavy = inferResourceTier('nodebb/docker:4.0.0', {})
  assert.deepEqual(heavy.limits, { cpu: '1', memory: '2048Mi' })

  const hinted = inferResourceTier('acme/demo:1', {}, { cpu: '2', memory: '4096Mi' })
  assert.deepEqual(hinted.limits, { cpu: '2', memory: '4096Mi' })

  assert.deepEqual(deriveRequestsFromLimits({ cpu: '1', memory: '2048Mi' }), {
    cpu: '100m',
    memory: '204Mi',
  })
})

test('deploy profile rewrites readme and icon to live URLs', () => {
  const links = deployProfileDocLinks(META)
  assert.ok(links)
  assert.equal(links?.readme, 'https://raw.githubusercontent.com/acme/demo/HEAD/README.md')
  assert.equal(links?.icon, 'https://github.com/acme.png')
})

test('bare tags on KubeBlocks-replaced database services are tolerated', () => {
  const normalized = validateImages({
    services: {
      app: { image: 'acme/demo:1.2.3' },
      db: { image: 'postgres' },
      cache: { image: 'redis' },
    },
  })
  assert.equal(normalized.db, 'postgres')
  assert.equal(normalized.cache, 'redis')
  assert.throws(() => validateImages({ services: { app: { image: 'acme/demo' } } }))
})

test('wait gates use type-prefixed env names for R017 exemptions', () => {
  const redis = buildDbWaitInitContainers(['redis'], {})[0]
  const redisEnvNames = (redis.env as Array<{ name: string }>).map((e) => e.name)
  assert.deepEqual(redisEnvNames, ['REDIS_GATE_HOST', 'REDIS_GATE_PORT'])
  assert.match(String((redis.command as string[])[2]), /\$REDIS_GATE_HOST/)

  const mongo = buildDbWaitInitContainers(['mongodb'], {})[0]
  const mongoEnvNames = (mongo.env as Array<{ name: string }>).map((e) => e.name)
  assert.deepEqual(mongoEnvNames, ['MONGODB_GATE_HOST', 'MONGODB_GATE_PORT'])

  // Kafka secret carries host/port keys, so its gate uses secretKeyRef.
  const kafka = buildDbWaitInitContainers(['kafka'], {})[0]
  const kafkaEnv = kafka.env as Array<Record<string, any>>
  assert.equal(kafkaEnv[0].name, 'KAFKA_GATE_HOST')
  assert.ok(kafkaEnv[0].valueFrom?.secretKeyRef)
})

test('App CR icon follows the deploy profile', () => {
  const deployApp = buildAppResource(META, { profile: 'deploy' }) as Record<string, any>
  assert.equal(deployApp.spec.icon, 'https://github.com/acme.png')
  const repoApp = buildAppResource(META) as Record<string, any>
  assert.match(String(repoApp.spec.icon), /labring-actions\/templates/)
})

test('zh description placeholder never half-translates', () => {
  assert.equal(
    buildZhDescription('Demo', 'Generated Sealos template for Demo from Docker Compose.'),
    'Demo 的 Sealos 模板。',
  )
})

test('buildDocuments end-to-end: gates, init job, inputs, resolution map', () => {
  const composeData = {
    services: {
      app: {
        image: 'acme/demo:latest',
        ports: ['8080:8080'],
        depends_on: ['db'],
        environment: [
          'DATABASE_URL=postgres://app:pw@db/appdb',
          'ADMIN_PASSWORD=test123',
        ],
        volumes: ['data:/srv/data'],
      },
      db: {
        image: 'postgres:16',
        environment: ['POSTGRES_PASSWORD=pw'],
      },
    },
    volumes: { data: {} },
  }
  const report = emptyReport()
  const docs = buildDocuments(composeData, META, null, null, {
    profile: 'deploy',
    report,
    imageResolution: {
      'acme/demo:latest': {
        resolved: 'acme/demo@sha256:1111111111111111111111111111111111111111111111111111111111111111',
        digest: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
        version_tag: null,
        platforms: ['linux/amd64'],
        config: { user: '1000', exposed_ports: [8080] },
      },
    },
  })

  const kinds = docs.map((d) => `${d.kind}${(d.metadata as any)?.name ? `/${(d.metadata as any).name}` : ''}`)
  assert.ok(kinds.some((k) => k.startsWith('Job/')), `pg-init job expected in ${kinds.join(', ')}`)

  const workload = docs.find((d) => d.kind === 'StatefulSet') as Record<string, any>
  assert.ok(workload, 'volume-backed app must be a StatefulSet')
  const podSpec = workload.spec.template.spec
  assert.equal(podSpec.securityContext.fsGroup, 1000)
  assert.equal(podSpec.initContainers.length, 1)
  assert.match(podSpec.initContainers[0].name, /wait-for-postgres/)
  assert.match(String(podSpec.initContainers[0].command[2]), /pg_database WHERE datname/)
  assert.equal(
    podSpec.containers[0].image,
    'acme/demo@sha256:1111111111111111111111111111111111111111111111111111111111111111',
  )

  const template = docs[0] as Record<string, any>
  assert.equal(template.kind, 'Template')
  assert.ok(template.spec.inputs.admin_password)
  assert.equal(template.spec.readme, 'https://raw.githubusercontent.com/acme/demo/HEAD/README.md')

  assert.ok(report.items.some((item) => item.code === 'pg-init-job'))
  assert.ok(report.items.some((item) => item.code === 'db-wait-gate'))
  assert.deepEqual(report.inputs_added, ['admin_password'])
})
