# Database Template Reference

This document contains complete Sealos template configurations for various databases, intended as a reference during conversion.

## Database Workload Rule

Supported database services should be represented by KubeBlocks `Cluster`
resources whenever the current templates can preserve their runtime contract.
Compose database services such as PostgreSQL, MySQL, MongoDB, Redis, or Kafka
use this path by default. For Compose, rendered Helm, and native Kubernetes
sources, preserve a raw database workload when its source-defined startup,
initialization, replica, mount, engine-variant, or network semantics cannot be
represented losslessly; annotate that workload and its Service with a non-empty
`docker-to-sealos.kubeblocks-fallback-reason`. `StatefulSet` remains valid for
stateful application components. Preserve one Cluster and connection identity
per source database service; two services using the same engine are still two
database instances unless the source explicitly proves they are aliases of one
instance.

Do not discard the source database service after image classification. First
account for its initialization env, database names, application users,
password sources, grants, scripts, mounts, command/entrypoint, data path,
engine variant, replicas, and consumers. A KubeBlocks Cluster is equivalent
only when every item is translated or explicitly superseded.

The `500m/512Mi` limits shown below are the per-component KubeBlocks floor, not
the only valid database size. Preserve higher source or documented
requirements and let the AI select a larger Sealos ladder tier when the
database engine, heap, workload, or runtime evidence requires it. Derive
requests from the selected limits.

## PostgreSQL Full Template

```yaml
apiVersion: apps.kubeblocks.io/v1alpha1
kind: Cluster
metadata:
  labels:
    kb.io/database: postgresql-16.4.0
    clusterdefinition.kubeblocks.io/name: postgresql
    clusterversion.kubeblocks.io/name: postgresql-16.4.0
  name: ${{ defaults.app_name }}-pg
spec:
  affinity:
    podAntiAffinity: Preferred
    tenancy: SharedNode
  clusterDefinitionRef: postgresql
  clusterVersionRef: postgresql-16.4.0
  componentSpecs:
    - componentDefRef: postgresql
      disableExporter: true
      enabledLogs:
        - running
      name: postgresql
      replicas: 1
      resources:
        limits:
          cpu: 500m
          memory: 512Mi
        requests:
          cpu: 50m
          memory: 51Mi
      serviceAccountName: ${{ defaults.app_name }}-pg
      switchPolicy:
        type: Noop
      volumeClaimTemplates:
        - name: data
          spec:
            accessModes:
              - ReadWriteOnce
            resources:
              requests:
                storage: 1Gi
            storageClassName: openebs-backup
  terminationPolicy: Delete

---
apiVersion: v1
kind: ServiceAccount
metadata:
  labels:
    sealos-db-provider-cr: ${{ defaults.app_name }}-pg
    app.kubernetes.io/instance: ${{ defaults.app_name }}-pg
    app.kubernetes.io/managed-by: kbcli
  name: ${{ defaults.app_name }}-pg

---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  labels:
    sealos-db-provider-cr: ${{ defaults.app_name }}-pg
    app.kubernetes.io/instance: ${{ defaults.app_name }}-pg
    app.kubernetes.io/managed-by: kbcli
  name: ${{ defaults.app_name }}-pg
rules:
  - apiGroups:
      - '*'
    resources:
      - '*'
    verbs:
      - '*'

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  labels:
    sealos-db-provider-cr: ${{ defaults.app_name }}-pg
    app.kubernetes.io/instance: ${{ defaults.app_name }}-pg
    app.kubernetes.io/managed-by: kbcli
  name: ${{ defaults.app_name }}-pg
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: ${{ defaults.app_name }}-pg
subjects:
  - kind: ServiceAccount
    name: ${{ defaults.app_name }}-pg
```

### PostgreSQL Database Initialization Job

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: ${{ defaults.app_name }}-pg-init
spec:
  backoffLimit: 3
  template:
    spec:
      containers:
        - name: pgsql-init
          image: postgres@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
          imagePullPolicy: IfNotPresent
          env:
            - name: PG_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: ${{ defaults.app_name }}-pg-conn-credential
                  key: password
            - name: PG_ENDPOINT
              valueFrom:
                secretKeyRef:
                  name: ${{ defaults.app_name }}-pg-conn-credential
                  key: endpoint
            - name: PG_DATABASE
              value: <dbname>
          command:
            - /bin/sh
            - -c
            - |
              set -eu
              for i in $(seq 1 60); do
                if pg_isready -h "${PG_ENDPOINT%:*}" -p "${PG_ENDPOINT##*:}" -U postgres -d postgres >/dev/null 2>&1; then
                  break
                fi
                sleep 2
              done
              pg_isready -h "${PG_ENDPOINT%:*}" -p "${PG_ENDPOINT##*:}" -U postgres -d postgres >/dev/null 2>&1
              if ! psql "postgresql://postgres:$(PG_PASSWORD)@$(PG_ENDPOINT)/postgres" -tAc "SELECT 1 FROM pg_database WHERE datname='$(PG_DATABASE)'" | grep -q 1; then
                psql "postgresql://postgres:$(PG_PASSWORD)@$(PG_ENDPOINT)/postgres" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$(PG_DATABASE)\";"
              fi
      restartPolicy: OnFailure
  ttlSecondsAfterFinished: 300
```

## MySQL Full Template

```yaml
apiVersion: apps.kubeblocks.io/v1alpha1
kind: Cluster
metadata:
  labels:
    kb.io/database: ac-mysql-8.0.30-1
    clusterdefinition.kubeblocks.io/name: apecloud-mysql
    clusterversion.kubeblocks.io/name: ac-mysql-8.0.30-1
  name: ${{ defaults.app_name }}-mysql
spec:
  affinity:
    nodeLabels: {}
    podAntiAffinity: Preferred
    tenancy: SharedNode
    topologyKeys:
      - kubernetes.io/hostname
  clusterDefinitionRef: apecloud-mysql
  clusterVersionRef: ac-mysql-8.0.30-1
  componentSpecs:
    - componentDefRef: mysql
      monitor: true
      name: mysql
      replicas: 1
      resources:
        limits:
          cpu: 500m
          memory: 512Mi
        requests:
          cpu: 50m
          memory: 51Mi
      serviceAccountName: ${{ defaults.app_name }}-mysql
      switchPolicy:
        type: Noop
      volumeClaimTemplates:
        - name: data
          spec:
            accessModes:
              - ReadWriteOnce
            resources:
              requests:
                storage: 1Gi
            storageClassName: openebs-backup
  terminationPolicy: Delete
  tolerations: []

---
apiVersion: v1
kind: ServiceAccount
metadata:
  labels:
    sealos-db-provider-cr: ${{ defaults.app_name }}-mysql
    app.kubernetes.io/instance: ${{ defaults.app_name }}-mysql
    app.kubernetes.io/managed-by: kbcli
  name: ${{ defaults.app_name }}-mysql

---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  labels:
    sealos-db-provider-cr: ${{ defaults.app_name }}-mysql
    app.kubernetes.io/instance: ${{ defaults.app_name }}-mysql
    app.kubernetes.io/managed-by: kbcli
  name: ${{ defaults.app_name }}-mysql
rules:
  - apiGroups:
      - '*'
    resources:
      - '*'
    verbs:
      - '*'

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  labels:
    sealos-db-provider-cr: ${{ defaults.app_name }}-mysql
    app.kubernetes.io/instance: ${{ defaults.app_name }}-mysql
    app.kubernetes.io/managed-by: kbcli
  name: ${{ defaults.app_name }}-mysql
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: ${{ defaults.app_name }}-mysql
subjects:
  - kind: ServiceAccount
    name: ${{ defaults.app_name }}-mysql
```

### MySQL/MariaDB Application Database Initialization

The official MySQL and MariaDB image variables `MYSQL_DATABASE` /
`MARIADB_DATABASE`, `MYSQL_USER` / `MARIADB_USER`, and `MYSQL_PASSWORD` /
`MARIADB_PASSWORD` describe first-start database state. KubeBlocks connection
Secrets do not apply these image entrypoint variables.

When those standard fields are present and the application accepts rewritten
connection credentials, generate:

1. `${{ defaults.app_name }}-mysql-app-credential` with the target database,
   application username, and a generated password;
2. `${{ defaults.app_name }}-mysql-init`, which waits with `mysqladmin ping`
   and idempotently creates the database and user, updates the password, and
   grants privileges by using the KubeBlocks `*-conn-credential` administrator
   Secret; and
3. an initContainer on every dependent application workload that connects to
   the target database with the application credential and runs `SELECT 1`
   before the business container starts.

For multiple MySQL services, derive all three names from the corresponding
per-service Cluster name. KubeBlocks administrator credentials are bootstrap
credentials, not the default long-lived business identity. If the source uses
custom init scripts, custom authentication, engine-specific behavior, or
another unhandled initialization field, use the annotated raw fallback rather
than silently dropping it.

## MongoDB Full Template

```yaml
apiVersion: apps.kubeblocks.io/v1alpha1
kind: Cluster
metadata:
  labels:
    kb.io/database: mongodb-8.0.4
    app.kubernetes.io/instance: ${{ defaults.app_name }}-mongo
  name: ${{ defaults.app_name }}-mongo
spec:
  affinity:
    podAntiAffinity: Preferred
    tenancy: SharedNode
    topologyKeys:
      - kubernetes.io/hostname
  componentSpecs:
    - componentDef: mongodb
      name: mongodb
      replicas: 1
      resources:
        limits:
          cpu: 500m
          memory: 512Mi
        requests:
          cpu: 50m
          memory: 51Mi
      serviceAccountName: ${{ defaults.app_name }}-mongo
      serviceVersion: 8.0.4
      volumeClaimTemplates:
        - name: data
          spec:
            accessModes:
              - ReadWriteOnce
            resources:
              requests:
                storage: 1Gi
            storageClassName: openebs-backup
  terminationPolicy: Delete

---
apiVersion: v1
kind: ServiceAccount
metadata:
  labels:
    sealos-db-provider-cr: ${{ defaults.app_name }}-mongo
    app.kubernetes.io/instance: ${{ defaults.app_name }}-mongo
    app.kubernetes.io/managed-by: kbcli
  name: ${{ defaults.app_name }}-mongo

---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  labels:
    sealos-db-provider-cr: ${{ defaults.app_name }}-mongo
    app.kubernetes.io/instance: ${{ defaults.app_name }}-mongo
    app.kubernetes.io/managed-by: kbcli
  name: ${{ defaults.app_name }}-mongo
rules:
  - apiGroups:
      - '*'
    resources:
      - '*'
    verbs:
      - '*'

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  labels:
    sealos-db-provider-cr: ${{ defaults.app_name }}-mongo
    app.kubernetes.io/instance: ${{ defaults.app_name }}-mongo
    app.kubernetes.io/managed-by: kbcli
  name: ${{ defaults.app_name }}-mongo
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: ${{ defaults.app_name }}-mongo
subjects:
  - kind: ServiceAccount
    name: ${{ defaults.app_name }}-mongo
```

## Redis Full Template

```yaml
apiVersion: apps.kubeblocks.io/v1alpha1
kind: Cluster
metadata:
  labels:
    kb.io/database: redis-7.2.7
    app.kubernetes.io/instance: ${{ defaults.app_name }}-redis
    app.kubernetes.io/version: 7.2.7
    clusterversion.kubeblocks.io/name: redis-7.2.7
    clusterdefinition.kubeblocks.io/name: redis
  name: ${{ defaults.app_name }}-redis
spec:
  affinity:
    podAntiAffinity: Preferred
    tenancy: SharedNode
    topologyKeys:
      - kubernetes.io/hostname
  clusterDefinitionRef: redis
  componentSpecs:
    - componentDef: redis-7
      name: redis
      replicas: 1
      enabledLogs:
        - running
      env:
        - name: CUSTOM_SENTINEL_MASTER_NAME
      resources:
        limits:
          cpu: 500m
          memory: 512Mi
        requests:
          cpu: 50m
          memory: 51Mi
      serviceAccountName: ${{ defaults.app_name }}-redis
      serviceVersion: 7.2.7
      switchPolicy:
        type: Noop
      volumeClaimTemplates:
        - name: data
          spec:
            accessModes:
              - ReadWriteOnce
            resources:
              requests:
                storage: 1Gi
            storageClassName: openebs-backup
    - componentDef: redis-sentinel-7
      name: redis-sentinel
      replicas: 1
      resources:
        limits:
          cpu: 500m
          memory: 512Mi
        requests:
          cpu: 50m
          memory: 51Mi
      serviceAccountName: ${{ defaults.app_name }}-redis
      serviceVersion: 7.2.7
      volumeClaimTemplates:
        - name: data
          spec:
            accessModes:
              - ReadWriteOnce
            resources:
              requests:
                storage: 1Gi
  terminationPolicy: Delete
  topology: replication

---
apiVersion: v1
kind: ServiceAccount
metadata:
  labels:
    sealos-db-provider-cr: ${{ defaults.app_name }}-redis
    app.kubernetes.io/instance: ${{ defaults.app_name }}-redis
    app.kubernetes.io/managed-by: kbcli
  name: ${{ defaults.app_name }}-redis

---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  labels:
    sealos-db-provider-cr: ${{ defaults.app_name }}-redis
    app.kubernetes.io/instance: ${{ defaults.app_name }}-redis
    app.kubernetes.io/managed-by: kbcli
  name: ${{ defaults.app_name }}-redis
rules:
  - apiGroups:
      - '*'
    resources:
      - '*'
    verbs:
      - '*'

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  labels:
    sealos-db-provider-cr: ${{ defaults.app_name }}-redis
    app.kubernetes.io/instance: ${{ defaults.app_name }}-redis
    app.kubernetes.io/managed-by: kbcli
  name: ${{ defaults.app_name }}-redis
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: ${{ defaults.app_name }}-redis
subjects:
  - kind: ServiceAccount
    name: ${{ defaults.app_name }}-redis
```

## Kafka Full Template

```yaml
apiVersion: apps.kubeblocks.io/v1alpha1
kind: Cluster
metadata:
  finalizers:
    - cluster.kubeblocks.io/finalizer
  labels:
    kb.io/database: kafka-3.3.2
    clusterdefinition.kubeblocks.io/name: kafka
    clusterversion.kubeblocks.io/name: kafka-3.3.2
  annotations:
    kubeblocks.io/extra-env: >-
      {"KB_KAFKA_ENABLE_SASL":"false","KB_KAFKA_BROKER_HEAP":"-XshowSettings:vm -XX:MaxRAMPercentage=100 -Ddepth=64","KB_KAFKA_CONTROLLER_HEAP":"-XshowSettings:vm -XX:MaxRAMPercentage=100 -Ddepth=64","KB_KAFKA_PUBLIC_ACCESS":"false"}
  name: ${{ defaults.app_name }}-broker
spec:
  terminationPolicy: Delete
  componentSpecs:
    - name: broker
      componentDef: kafka-broker
      tls: false
      replicas: 1
      affinity:
        podAntiAffinity: Preferred
        topologyKeys:
          - kubernetes.io/hostname
        tenancy: SharedNode
      tolerations:
        - key: kb-data
          operator: Equal
          value: 'true'
          effect: NoSchedule
      resources:
        limits:
          cpu: 500m
          memory: 512Mi
        requests:
          cpu: 50m
          memory: 51Mi
      volumeClaimTemplates:
        - name: data
          spec:
            accessModes:
              - ReadWriteOnce
            resources:
              requests:
                storage: 1Gi
        - name: metadata
          spec:
            storageClassName: null
            accessModes:
              - ReadWriteOnce
            resources:
              requests:
                storage: 1Gi
    - name: controller
      componentDefRef: controller
      componentDef: kafka-controller
      tls: false
      replicas: 1
      resources:
        limits:
          cpu: 500m
          memory: 512Mi
        requests:
          cpu: 50m
          memory: 51Mi
      volumeClaimTemplates:
        - name: metadata
          spec:
            storageClassName: null
            accessModes:
              - ReadWriteOnce
            resources:
              requests:
                storage: 1Gi
    - name: metrics-exp
      componentDef: kafka-exporter
      replicas: 1
      resources:
        limits:
          cpu: 500m
          memory: 512Mi
        requests:
          cpu: 50m
          memory: 51Mi

---
apiVersion: v1
kind: ServiceAccount
metadata:
  labels:
    sealos-db-provider-cr: ${{ defaults.app_name }}-broker
    app.kubernetes.io/instance: ${{ defaults.app_name }}-broker
    app.kubernetes.io/managed-by: kbcli
  name: ${{ defaults.app_name }}-broker

---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  labels:
    sealos-db-provider-cr: ${{ defaults.app_name }}-broker
    app.kubernetes.io/instance: ${{ defaults.app_name }}-broker
    app.kubernetes.io/managed-by: kbcli
  name: ${{ defaults.app_name }}-broker
rules:
  - apiGroups:
      - '*'
    resources:
      - '*'
    verbs:
      - '*'

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  labels:
    sealos-db-provider-cr: ${{ defaults.app_name }}-broker
    app.kubernetes.io/instance: ${{ defaults.app_name }}-broker
    app.kubernetes.io/managed-by: kbcli
  name: ${{ defaults.app_name }}-broker
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: ${{ defaults.app_name }}-broker
subjects:
  - kind: ServiceAccount
    name: ${{ defaults.app_name }}-broker
```

## Database Connection Configuration

### Upgrade Baseline (Database Upgrade Documentation)

The following specifications are consistent with the database upgrade documentation:

- Database connection fields (`endpoint`/`host`/`port`/`username`/`password`) in application containers must be obtained via `secretKeyRef`; Redis host/port may use the Sealos Redis Service FQDN plus `6379` when the secret only exposes credentials, and MongoDB host/port or URLs may use the Sealos MongoDB Service FQDN plus `27017` when the secret only exposes credentials
- PostgreSQL Cluster uses `postgresql-16.4.0` and includes `kb.io/database`, `disableExporter: true`, `enabledLogs: [running]`
- Secret naming upgrades:
  - `xxx-redis-conn-credential` -> `xxx-redis-redis-account-default`
  - `xxx-mongo-conn-credential` -> `xxx-mongo-mongodb-account-root` (or `xxx-mongodb-mongodb-account-root` when the Cluster name uses `xxx-mongodb`)
  - `xxx-conn-credential` (kafka) -> `xxx-broker-account-admin`

### Secret Naming Conventions

- PostgreSQL: `<cluster-name>-conn-credential`; single-service default `${{ defaults.app_name }}-pg-conn-credential`
- MySQL: `<cluster-name>-conn-credential`; single-service default `${{ defaults.app_name }}-mysql-conn-credential`
- MongoDB: `<cluster-name>-mongodb-account-root`; single-service default `${{ defaults.app_name }}-mongo-mongodb-account-root`
- Redis: `<cluster-name>-redis-account-default`; single-service default `${{ defaults.app_name }}-redis-redis-account-default` (legacy `${{ defaults.app_name }}-redis-account-default` may be accepted for backward compatibility)
- Kafka: `<cluster-name>-account-admin`; single-service default `${{ defaults.app_name }}-broker-account-admin`

When more than one service uses the same engine, append the normalized Compose
service name to the standard Cluster base before applying these suffixes.

**Important — Redis naming pattern:**
The Redis secret and service names contain a "double redis" because Kubeblocks follows the pattern `<cluster>-<component>-account-default` for secrets and `<cluster>-<component>-<component>` for ClusterIP services:
- Cluster name: `${{ defaults.app_name }}-redis`
- Component name: `redis` (defined in `componentSpecs[].name`)
- Secret: `${{ defaults.app_name }}-redis` + `-redis-account-default` = `...-redis-redis-account-default`
- ClusterIP Service: `${{ defaults.app_name }}-redis` + `-redis` + `-redis` = `...-redis-redis-redis`
- Service FQDN: `${{ defaults.app_name }}-redis-redis-redis.${{ SEALOS_NAMESPACE }}.svc`

This same pattern applies to other databases (e.g., PostgreSQL service is `<app>-pg-postgresql`, MySQL is `<app>-mysql-mysql`).

### Keys Included in Secrets

PostgreSQL/MySQL/MongoDB/Kafka secrets usually contain:
- `endpoint`: Full connection endpoint (host:port)
- `host`: Hostname
- `password`: Password
- `port`: Port number
- `username`: Username

Redis default account secrets usually contain:
- `username`
- `password`

Redis and MongoDB account secrets can appear after the first component pods report progress. During deployment validation, wait for the KubeBlocks Cluster to reach `Running`/Ready and then poll for the expected account Secret before judging application initialization. For Redis, the Sentinel component may become ready before the primary `redis` component and `${{ defaults.app_name }}-redis-redis-account-default`; validate the final Redis Service FQDN `${{ defaults.app_name }}-redis-redis-redis.${{ SEALOS_NAMESPACE }}.svc.cluster.local` plus business registration/login behavior. For MongoDB, poll `${{ defaults.app_name }}-mongo-mongodb-account-root` or the matching `${{ defaults.app_name }}-mongodb-mongodb-account-root` name when the Cluster uses the `mongodb` suffix.

### Environment Variable Configuration Examples

```yaml
env:
  # PostgreSQL
  - name: POSTGRES_ENDPOINT
    valueFrom:
      secretKeyRef:
        name: ${{ defaults.app_name }}-pg-conn-credential
        key: endpoint
  - name: POSTGRES_HOST
    valueFrom:
      secretKeyRef:
        name: ${{ defaults.app_name }}-pg-conn-credential
        key: host
  - name: POSTGRES_PORT
    valueFrom:
      secretKeyRef:
        name: ${{ defaults.app_name }}-pg-conn-credential
        key: port
  - name: POSTGRES_USERNAME
    valueFrom:
      secretKeyRef:
        name: ${{ defaults.app_name }}-pg-conn-credential
        key: username
  - name: POSTGRES_PASSWORD
    valueFrom:
      secretKeyRef:
        name: ${{ defaults.app_name }}-pg-conn-credential
        key: password

  # MySQL
  - name: MYSQL_HOST
    valueFrom:
      secretKeyRef:
        name: ${{ defaults.app_name }}-mysql-conn-credential
        key: host
  - name: MYSQL_PASSWORD
    valueFrom:
      secretKeyRef:
        name: ${{ defaults.app_name }}-mysql-conn-credential
        key: password

  # MongoDB (credential secret + fixed Service FQDN)
  - name: MONGO_USERNAME
    valueFrom:
      secretKeyRef:
        name: ${{ defaults.app_name }}-mongo-mongodb-account-root
        key: username
  - name: MONGO_PASSWORD
    valueFrom:
      secretKeyRef:
        name: ${{ defaults.app_name }}-mongo-mongodb-account-root
        key: password
  - name: MONGODB_URI
    value: mongodb://$(MONGO_USERNAME):$(MONGO_PASSWORD)@${{ defaults.app_name }}-mongo-mongodb.${{ SEALOS_NAMESPACE }}.svc:27017/app?authSource=admin

  # Redis
  - name: REDIS_HOST
    value: ${{ defaults.app_name }}-redis-redis-redis.${{ SEALOS_NAMESPACE }}.svc.cluster.local
  - name: REDIS_PORT
    value: "6379"
  - name: REDIS_USERNAME
    valueFrom:
      secretKeyRef:
        name: ${{ defaults.app_name }}-redis-redis-account-default
        key: username
  - name: REDIS_PASSWORD
    valueFrom:
      secretKeyRef:
        name: ${{ defaults.app_name }}-redis-redis-account-default
        key: password
```
