# Preflight

Confirm that the sandbox can create a temporary kaniko Job and that the DevBox runtime exposes a VersityGW S3 endpoint.

## Inputs

- `WORK_DIR`: project directory containing `.sealos/build-request.json`
- `NAMESPACE`: optional namespace override. If unset, resolve the active namespace from the sandbox context. Do not assume `default`.
- `GITHUB_TOKEN`: required for GHCR push in this MVP
- `S3_ENDPOINT` or `AWS_ENDPOINT_URL_S3`: required local VersityGW endpoint for runtime self-checks
- `KANIKO_JOB_S3_ENDPOINT`: optional S3 endpoint override reachable from the kaniko Job Pod
- `AWS_SECRET_ACCESS_KEY`, `SEALOS_DEVBOX_JWT_SECRET`, or `DEVBOX_JWT_SECRET`: required S3 secret source
- `SKILL_DIR`: directory containing this skill

## Step 1: Start Log

```bash
mkdir -p ~/.sealos/logs
LOG_FILE=~/.sealos/logs/build-$(date +%Y%m%d-%H%M%S).log
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Kaniko build run started" > "$LOG_FILE"
```

Append all phase boundaries and non-secret decisions to this file.

## Step 2: Resolve Active Kubernetes Context

Resolve namespace, pod name, service account, kubeconfig path, and current kubectl context from the active sandbox:

```bash
node "$SKILL_DIR/scripts/resolve-kube-context.mjs" ${NAMESPACE:+--namespace "$NAMESPACE"}
```

Persist the JSON result for later phases:

```bash
node "$SKILL_DIR/scripts/resolve-kube-context.mjs" ${NAMESPACE:+--namespace "$NAMESPACE"} \
  > "$WORK_DIR/.sealos/kube-context.json"
NAMESPACE="$(node -e 'const r=require(process.argv[1]); process.stdout.write(r.namespace || "")' "$WORK_DIR/.sealos/kube-context.json")"
SERVICE_ACCOUNT_NAME="$(node -e 'const r=require(process.argv[1]); process.stdout.write(r.service_account_name || "")' "$WORK_DIR/.sealos/kube-context.json")"
```

The resolver should use this precedence:

1. explicit `NAMESPACE`
2. active kubectl context namespace
3. `/var/run/secrets/kubernetes.io/serviceaccount/namespace`

After resolution, confirm:

```bash
kubectl version --client 2>/dev/null
```

Stop if:

- namespace cannot be resolved
- `kubectl` is unavailable through the active sandbox kubeconfig

Do not fall back to `sudo kubectl --kubeconfig /etc/kubernetes/admin.conf`. This workflow must stay inside the sandbox-provided kubeconfig and its mounted identity.

## Step 3: Check Permissions

Run:

```bash
kubectl auth can-i create jobs -n "$NAMESPACE"
kubectl auth can-i delete jobs -n "$NAMESPACE"
kubectl auth can-i get jobs -n "$NAMESPACE"
kubectl auth can-i create secrets -n "$NAMESPACE"
kubectl auth can-i delete secrets -n "$NAMESPACE"
kubectl auth can-i get pods -n "$NAMESPACE"
kubectl auth can-i get pods/log -n "$NAMESPACE"
```

Stop if Jobs or Secrets cannot be created.

Do not require cluster-scoped `get namespace` access. Namespaced service accounts often cannot read Namespace objects even when they can create Jobs in their own namespace.

If `SERVICE_ACCOUNT_NAME` is resolved, the generated kaniko Job must set `serviceAccountName: $SERVICE_ACCOUNT_NAME` so the temporary Pod inherits the current sandbox service account instead of the namespace `default` service account.

## Step 4: Resolve S3 Settings

Resolve:

```bash
S3_ENDPOINT="${S3_ENDPOINT:-${AWS_ENDPOINT_URL_S3:-${AWS_ENDPOINT_URL:-}}}"
AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-admin}"
AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-${SEALOS_DEVBOX_JWT_SECRET:-${DEVBOX_JWT_SECRET:-}}}"
AWS_REGION="${AWS_REGION:-sealos-internal}"
S3_FORCE_PATH_STYLE="${S3_FORCE_PATH_STYLE:-true}"
AWS_EC2_METADATA_DISABLED="${AWS_EC2_METADATA_DISABLED:-true}"
KANIKO_CONTEXT_S3_BUCKET="${KANIKO_CONTEXT_S3_BUCKET:-kaniko-contexts}"
KANIKO_CONTEXT_S3_PREFIX="${KANIKO_CONTEXT_S3_PREFIX:-contexts}"
KANIKO_CONTEXT_S3_BASE="${KANIKO_CONTEXT_S3_BASE:-s3://$KANIKO_CONTEXT_S3_BUCKET/$KANIKO_CONTEXT_S3_PREFIX}"
KANIKO_CONTEXT_POSIX_DIR="${KANIKO_CONTEXT_POSIX_DIR:-${VERSITYGW_ROOT:-${CODEX_GATEWAY_CWD:-/home/devbox/workspace}/.versitygw-s3}/$KANIKO_CONTEXT_S3_BUCKET/$KANIKO_CONTEXT_S3_PREFIX}"
DEVBOX_NAME="${SEALOS_DEVBOX_NAME:-${DEVBOX_NAME:-${HOSTNAME:-devbox}}}"
```

Stop if `S3_ENDPOINT` or `AWS_SECRET_ACCESS_KEY` is missing. Do not try to discover `devbox.status.network.uniqueID` by querying Sealos internals; the runtime should inject the local endpoint.

Validate local VersityGW reachability without logging credentials:

```bash
curl -sS --connect-timeout 5 --max-time 10 -o /dev/null "$S3_ENDPOINT"
```

Do not require this unauthenticated request to return an S3 success payload; some S3 endpoints return an auth error. Treat connection refusal, DNS failure, or timeout as blockers.

Resolve the endpoint that the kaniko Job Pod will use:

```bash
KANIKO_JOB_S3_ENDPOINT="${KANIKO_JOB_S3_ENDPOINT:-}"
if [ -z "$KANIKO_JOB_S3_ENDPOINT" ]; then
  case "$S3_ENDPOINT" in
    http://127.0.0.1:*|http://localhost:*|http://[::1]:*|https://127.0.0.1:*|https://localhost:*|https://[::1]:*)
      POD_IP="$(node -e 'const r=require(process.argv[1]); process.stdout.write(r.pod_ip || "")' "$WORK_DIR/.sealos/kube-context.json")"
      S3_SCHEME="$(node -e 'const u=new URL(process.argv[1]); process.stdout.write(u.protocol.replace(\":\", \"\"))' "$S3_ENDPOINT")"
      S3_PORT="$(node -e 'const u=new URL(process.argv[1]); process.stdout.write(u.port || "1319")' "$S3_ENDPOINT")"
      test -n "$POD_IP" || { echo "KANIKO_JOB_S3_ENDPOINT is required when S3_ENDPOINT is loopback and pod IP cannot be resolved" >&2; exit 1; }
      KANIKO_JOB_S3_ENDPOINT="$S3_SCHEME://$POD_IP:$S3_PORT"
      ;;
    *)
      KANIKO_JOB_S3_ENDPOINT="$S3_ENDPOINT"
      ;;
  esac
fi
```

`S3_ENDPOINT=http://127.0.0.1:1319` is valid for the DevBox process itself, but it must not be passed to the separate kaniko Job Pod. The Job needs a Pod IP, Service address, or another cluster-reachable endpoint.

## Step 5: Check GITHUB_TOKEN and GHCR Scopes

```bash
node "$SKILL_DIR/scripts/check-ghcr-token.mjs" \
  --token-env GITHUB_TOKEN \
  --require-scope write:packages \
  --target-image "$(node -e 'const r=require(process.argv[1]); process.stdout.write(r.image.target_image || r.image.image_ref || "")' "$WORK_DIR/.sealos/build-request.json")"
```

Stop if `GITHUB_TOKEN` is missing or the response headers do not include `write:packages`. Record whether the `ghcr.io/<owner>/...` target owner differs from the authenticated GitHub login; organization namespace pushes are valid only when the token is authorized for that namespace. Do this before creating the kaniko Job so common GHCR auth failures are caught in preflight instead of after a long build.

## Step 6: Record Capability Summary

Report:

- namespace
- namespace resolution source
- current kubectl context
- current pod name when known
- current pod IP when known
- current service account name when known
- whether `S3_ENDPOINT` is present
- S3 region, bucket, prefix, and kaniko Job endpoint host
- whether `GITHUB_TOKEN` passed scope preflight
- whether Job and Secret creation are allowed
- whether `build-request.json` exists

Do not print token values, S3 secret values, Docker auth JSON, or Secret data.
