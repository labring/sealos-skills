/** KubeBlocks database Cluster resource builders. */

import {
  DB_COMPONENT_RESOURCE_LIMITS,
  DB_COMPONENT_RESOURCE_REQUESTS,
} from './compose-to-template-constants.ts'

export function dbComponentResources(): {
  limits: Record<string, string>
  requests: Record<string, string>
} {
  return {
    limits: { ...DB_COMPONENT_RESOURCE_LIMITS },
    requests: { ...DB_COMPONENT_RESOURCE_REQUESTS },
  }
}

export function buildPostgresResources(): Record<string, unknown>[] {
  const name = '${{ defaults.app_name }}-pg'
  const labels = {
    'sealos-db-provider-cr': name,
    'app.kubernetes.io/instance': name,
    'app.kubernetes.io/managed-by': 'kbcli',
  }
  return [
    {
      apiVersion: 'v1',
      kind: 'ServiceAccount',
      metadata: { name, labels },
    },
    {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'Role',
      metadata: { name, labels },
      rules: [{ apiGroups: ['*'], resources: ['*'], verbs: ['*'] }],
    },
    {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'RoleBinding',
      metadata: { name, labels },
      roleRef: {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'Role',
        name,
      },
      subjects: [{ kind: 'ServiceAccount', name }],
    },
    {
      apiVersion: 'apps.kubeblocks.io/v1alpha1',
      kind: 'Cluster',
      metadata: {
        name,
        labels: {
          'sealos-db-provider-cr': name,
          'app.kubernetes.io/instance': name,
          'kb.io/database': 'postgresql-16.4.0',
          'clusterdefinition.kubeblocks.io/name': 'postgresql',
          'clusterversion.kubeblocks.io/name': 'postgresql-16.4.0',
        },
      },
      spec: {
        affinity: {
          podAntiAffinity: 'Preferred',
          tenancy: 'SharedNode',
        },
        clusterDefinitionRef: 'postgresql',
        clusterVersionRef: 'postgresql-16.4.0',
        terminationPolicy: 'Delete',
        componentSpecs: [
          {
            name: 'postgresql',
            componentDefRef: 'postgresql',
            disableExporter: true,
            enabledLogs: ['running'],
            replicas: 1,
            serviceAccountName: name,
            switchPolicy: { type: 'Noop' },
            resources: dbComponentResources(),
            volumeClaimTemplates: [
              {
                name: 'data',
                spec: {
                  accessModes: ['ReadWriteOnce'],
                  resources: { requests: { storage: '1Gi' } },
                  storageClassName: 'openebs-backup',
                },
              },
            ],
          },
        ],
      },
    },
  ]
}

export function buildMysqlResources(): Record<string, unknown>[] {
  const name = '${{ defaults.app_name }}-mysql'
  const labels = {
    'sealos-db-provider-cr': name,
    'app.kubernetes.io/instance': name,
    'app.kubernetes.io/managed-by': 'kbcli',
  }
  return [
    {
      apiVersion: 'v1',
      kind: 'ServiceAccount',
      metadata: { name, labels },
    },
    {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'Role',
      metadata: { name, labels },
      rules: [{ apiGroups: ['*'], resources: ['*'], verbs: ['*'] }],
    },
    {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'RoleBinding',
      metadata: { name, labels },
      roleRef: {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'Role',
        name,
      },
      subjects: [{ kind: 'ServiceAccount', name }],
    },
    {
      apiVersion: 'apps.kubeblocks.io/v1alpha1',
      kind: 'Cluster',
      metadata: {
        name,
        labels: {
          'sealos-db-provider-cr': name,
          'app.kubernetes.io/instance': name,
          'kb.io/database': 'ac-mysql-8.0.30-1',
          'clusterdefinition.kubeblocks.io/name': 'apecloud-mysql',
          'clusterversion.kubeblocks.io/name': 'ac-mysql-8.0.30-1',
        },
      },
      spec: {
        affinity: {
          nodeLabels: {},
          podAntiAffinity: 'Preferred',
          tenancy: 'SharedNode',
          topologyKeys: ['kubernetes.io/hostname'],
        },
        clusterDefinitionRef: 'apecloud-mysql',
        clusterVersionRef: 'ac-mysql-8.0.30-1',
        componentSpecs: [
          {
            name: 'mysql',
            componentDefRef: 'mysql',
            monitor: true,
            noCreatePDB: false,
            replicas: 1,
            serviceAccountName: name,
            switchPolicy: { type: 'Noop' },
            resources: dbComponentResources(),
            volumeClaimTemplates: [
              {
                name: 'data',
                spec: {
                  accessModes: ['ReadWriteOnce'],
                  resources: { requests: { storage: '1Gi' } },
                  storageClassName: 'openebs-backup',
                },
              },
            ],
          },
        ],
        terminationPolicy: 'Delete',
        tolerations: [],
      },
    },
  ]
}

export function buildMongodbResources(): Record<string, unknown>[] {
  const name = '${{ defaults.app_name }}-mongo'
  const labels = {
    'sealos-db-provider-cr': name,
    'app.kubernetes.io/instance': name,
    'app.kubernetes.io/managed-by': 'kbcli',
  }
  return [
    {
      apiVersion: 'v1',
      kind: 'ServiceAccount',
      metadata: { name, labels },
    },
    {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'Role',
      metadata: { name, labels },
      rules: [{ apiGroups: ['*'], resources: ['*'], verbs: ['*'] }],
    },
    {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'RoleBinding',
      metadata: { name, labels },
      roleRef: {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'Role',
        name,
      },
      subjects: [{ kind: 'ServiceAccount', name }],
    },
    {
      apiVersion: 'apps.kubeblocks.io/v1alpha1',
      kind: 'Cluster',
      metadata: {
        name,
        labels: {
          'sealos-db-provider-cr': name,
          'kb.io/database': 'mongodb-8.0.4',
          'clusterdefinition.kubeblocks.io/name': 'mongodb',
          'app.kubernetes.io/instance': name,
        },
      },
      spec: {
        affinity: {
          podAntiAffinity: 'Preferred',
          tenancy: 'SharedNode',
          topologyKeys: ['kubernetes.io/hostname'],
        },
        componentSpecs: [
          {
            name: 'mongodb',
            componentDef: 'mongodb',
            serviceVersion: '8.0.4',
            replicas: 1,
            serviceAccountName: name,
            resources: dbComponentResources(),
            volumeClaimTemplates: [
              {
                name: 'data',
                spec: {
                  accessModes: ['ReadWriteOnce'],
                  resources: { requests: { storage: '1Gi' } },
                  storageClassName: 'openebs-backup',
                },
              },
            ],
          },
        ],
        terminationPolicy: 'Delete',
      },
    },
  ]
}

export function buildRedisResources(): Record<string, unknown>[] {
  const name = '${{ defaults.app_name }}-redis'
  const labels = {
    'sealos-db-provider-cr': name,
    'app.kubernetes.io/instance': name,
    'app.kubernetes.io/managed-by': 'kbcli',
  }
  return [
    {
      apiVersion: 'v1',
      kind: 'ServiceAccount',
      metadata: { name, labels },
    },
    {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'Role',
      metadata: { name, labels },
      rules: [{ apiGroups: ['*'], resources: ['*'], verbs: ['*'] }],
    },
    {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'RoleBinding',
      metadata: { name, labels },
      roleRef: {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'Role',
        name,
      },
      subjects: [{ kind: 'ServiceAccount', name }],
    },
    {
      apiVersion: 'apps.kubeblocks.io/v1alpha1',
      kind: 'Cluster',
      metadata: {
        name,
        labels: {
          'sealos-db-provider-cr': name,
          'kb.io/database': 'redis-7.2.7',
          'app.kubernetes.io/instance': name,
          'app.kubernetes.io/version': '7.2.7',
          'clusterversion.kubeblocks.io/name': 'redis-7.2.7',
          'clusterdefinition.kubeblocks.io/name': 'redis',
        },
      },
      spec: {
        affinity: {
          podAntiAffinity: 'Preferred',
          tenancy: 'SharedNode',
          topologyKeys: ['kubernetes.io/hostname'],
        },
        clusterDefinitionRef: 'redis',
        componentSpecs: [
          {
            name: 'redis',
            componentDef: 'redis-7',
            serviceVersion: '7.2.7',
            replicas: 1,
            serviceAccountName: name,
            enabledLogs: ['running'],
            env: [{ name: 'CUSTOM_SENTINEL_MASTER_NAME' }],
            switchPolicy: { type: 'Noop' },
            resources: dbComponentResources(),
            volumeClaimTemplates: [
              {
                name: 'data',
                spec: {
                  accessModes: ['ReadWriteOnce'],
                  resources: { requests: { storage: '1Gi' } },
                  storageClassName: 'openebs-backup',
                },
              },
            ],
          },
          {
            name: 'redis-sentinel',
            componentDef: 'redis-sentinel-7',
            serviceVersion: '7.2.7',
            replicas: 1,
            serviceAccountName: name,
            resources: dbComponentResources(),
            volumeClaimTemplates: [
              {
                name: 'data',
                spec: {
                  accessModes: ['ReadWriteOnce'],
                  resources: { requests: { storage: '1Gi' } },
                },
              },
            ],
          },
        ],
        terminationPolicy: 'Delete',
        topology: 'replication',
      },
    },
  ]
}

export function buildKafkaResources(): Record<string, unknown>[] {
  const name = '${{ defaults.app_name }}-broker'
  const labels = {
    'sealos-db-provider-cr': name,
    'app.kubernetes.io/instance': name,
    'app.kubernetes.io/managed-by': 'kbcli',
  }
  return [
    {
      apiVersion: 'v1',
      kind: 'ServiceAccount',
      metadata: { name, labels },
    },
    {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'Role',
      metadata: { name, labels },
      rules: [{ apiGroups: ['*'], resources: ['*'], verbs: ['*'] }],
    },
    {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'RoleBinding',
      metadata: { name, labels },
      roleRef: {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'Role',
        name,
      },
      subjects: [{ kind: 'ServiceAccount', name }],
    },
    {
      apiVersion: 'apps.kubeblocks.io/v1alpha1',
      kind: 'Cluster',
      metadata: {
        name,
        finalizers: ['cluster.kubeblocks.io/finalizer'],
        labels: {
          'sealos-db-provider-cr': name,
          'app.kubernetes.io/instance': name,
          'kb.io/database': 'kafka-3.3.2',
          'clusterdefinition.kubeblocks.io/name': 'kafka',
          'clusterversion.kubeblocks.io/name': 'kafka-3.3.2',
        },
        annotations: {
          'kubeblocks.io/extra-env':
            '{"KB_KAFKA_ENABLE_SASL":"false","KB_KAFKA_BROKER_HEAP":"-XshowSettings:vm ' +
            '-XX:MaxRAMPercentage=100 -Ddepth=64","KB_KAFKA_CONTROLLER_HEAP":"-XshowSettings:vm ' +
            '-XX:MaxRAMPercentage=100 -Ddepth=64","KB_KAFKA_PUBLIC_ACCESS":"false"}',
        },
      },
      spec: {
        terminationPolicy: 'Delete',
        componentSpecs: [
          {
            name: 'broker',
            componentDef: 'kafka-broker',
            tls: false,
            replicas: 1,
            affinity: {
              podAntiAffinity: 'Preferred',
              topologyKeys: ['kubernetes.io/hostname'],
              tenancy: 'SharedNode',
            },
            tolerations: [
              {
                key: 'kb-data',
                operator: 'equal',
                value: 'true',
                effect: 'NoSchedule',
              },
            ],
            resources: dbComponentResources(),
            volumeClaimTemplates: [
              {
                name: 'data',
                spec: {
                  accessModes: ['ReadWriteOnce'],
                  resources: { requests: { storage: '1Gi' } },
                },
              },
              {
                name: 'metadata',
                spec: {
                  storageClassName: null,
                  accessModes: ['ReadWriteOnce'],
                  resources: { requests: { storage: '1Gi' } },
                },
              },
            ],
          },
          {
            name: 'controller',
            componentDefRef: 'controller',
            componentDef: 'kafka-controller',
            tls: false,
            replicas: 1,
            resources: dbComponentResources(),
            volumeClaimTemplates: [
              {
                name: 'metadata',
                spec: {
                  storageClassName: null,
                  accessModes: ['ReadWriteOnce'],
                  resources: { requests: { storage: '1Gi' } },
                },
              },
            ],
          },
          {
            name: 'metrics-exp',
            componentDef: 'kafka-exporter',
            replicas: 1,
            resources: dbComponentResources(),
          },
        ],
      },
    },
  ]
}

export function buildDatabaseResources(dbType: string): Record<string, unknown>[] {
  if (dbType === 'postgres') return buildPostgresResources()
  if (dbType === 'mysql') return buildMysqlResources()
  if (dbType === 'mongodb') return buildMongodbResources()
  if (dbType === 'redis') return buildRedisResources()
  if (dbType === 'kafka') return buildKafkaResources()
  return []
}

export function buildObjectStorageBucket(): Record<string, unknown> {
  return {
    apiVersion: 'objectstorage.sealos.io/v1',
    kind: 'ObjectStorageBucket',
    metadata: { name: '${{ defaults.app_name }}' },
    spec: { policy: 'private' },
  }
}
