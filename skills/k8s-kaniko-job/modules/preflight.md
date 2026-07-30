# Preflight

Run this module only when the aggregate request contains at least one
`build-required` service.

## Required Inputs

- the sandbox-provided `kubectl` context
- injected `GITHUB_TOKEN`
- `S3_ENDPOINT` or `AWS_ENDPOINT_URL_S3`
- `AWS_SECRET_ACCESS_KEY`, `SEALOS_DEVBOX_JWT_SECRET`, or
  `DEVBOX_JWT_SECRET`
- the DevBox VersityGW context directory

No browser login, `gh auth`, Sealos OAuth, region, workspace, or administrator
kubeconfig is part of this flow.

## Resolve the Current Sandbox Identity

```bash
node "$SKILL_DIR/scripts/resolve-kube-context.mjs" \
  ${NAMESPACE:+--namespace "$NAMESPACE"} \
  > "$WORK_DIR/.sealos/kube-context.json"

NAMESPACE="$(node -e 'const r=require(process.argv[1]); process.stdout.write(r.namespace || "")' "$WORK_DIR/.sealos/kube-context.json")"
SERVICE_ACCOUNT_NAME="$(node -e 'const r=require(process.argv[1]); process.stdout.write(r.service_account_name || "")' "$WORK_DIR/.sealos/kube-context.json")"
POD_IP="$(node -e 'const r=require(process.argv[1]); process.stdout.write(r.pod_ip || "")' "$WORK_DIR/.sealos/kube-context.json")"
```

Use namespace precedence:

1. an explicit caller-provided namespace
2. the active kube context namespace
3. the mounted service-account namespace

Stop if the namespace, current service account, or usable kubectl context
cannot be resolved. Never default either identity and never use
`/etc/kubernetes/admin.conf`.

Require only namespaced capabilities needed by the build:

```bash
kubectl auth can-i create jobs -n "$NAMESPACE"
kubectl auth can-i get jobs -n "$NAMESPACE"
kubectl auth can-i watch jobs -n "$NAMESPACE"
kubectl auth can-i create secrets -n "$NAMESPACE"
kubectl auth can-i get pods -n "$NAMESPACE"
kubectl auth can-i list pods -n "$NAMESPACE"
kubectl auth can-i get pods/log -n "$NAMESPACE"
```

Carry the resolved current service account onto every generated Job.

## Resolve VersityGW

Use the injected runtime contract:

```bash
S3_ENDPOINT="${S3_ENDPOINT:-${AWS_ENDPOINT_URL_S3:-${AWS_ENDPOINT_URL:-}}}"
AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-admin}"
AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-${SEALOS_DEVBOX_JWT_SECRET:-${DEVBOX_JWT_SECRET:-}}}"
AWS_REGION="${AWS_REGION:-sealos-internal}"
KANIKO_CONTEXT_S3_BUCKET="${KANIKO_CONTEXT_S3_BUCKET:-kaniko-contexts}"
KANIKO_CONTEXT_S3_PREFIX="${KANIKO_CONTEXT_S3_PREFIX:-contexts}"
KANIKO_CONTEXT_POSIX_DIR="${KANIKO_CONTEXT_POSIX_DIR:-${VERSITYGW_ROOT:-${CODEX_GATEWAY_CWD:-/home/devbox/workspace}/.versitygw-s3}/$KANIKO_CONTEXT_S3_BUCKET/$KANIKO_CONTEXT_S3_PREFIX}"
DEVBOX_NAME="${SEALOS_DEVBOX_NAME:-${DEVBOX_NAME:-${HOSTNAME:-devbox}}}"
```

Confirm local endpoint reachability without printing credentials. If the local
endpoint is loopback, use `KANIKO_JOB_S3_ENDPOINT` or derive the current Pod IP
plus the same scheme and port. Never give a separate Kaniko Pod a loopback
endpoint.

```bash
KANIKO_JOB_S3_ENDPOINT="${KANIKO_JOB_S3_ENDPOINT:-}"
if [ -z "$KANIKO_JOB_S3_ENDPOINT" ]; then
  case "$S3_ENDPOINT" in
    http://127.0.0.1:*|http://localhost:*|https://127.0.0.1:*|https://localhost:*)
      test -n "$POD_IP" || {
        echo "KANIKO_JOB_S3_ENDPOINT is required when the Pod IP cannot be resolved" >&2
        exit 1
      }
      S3_SCHEME="$(node -e 'const u=new URL(process.argv[1]); process.stdout.write(u.protocol.replace(":", ""))' "$S3_ENDPOINT")"
      S3_PORT="$(node -e 'const u=new URL(process.argv[1]); process.stdout.write(u.port || "1319")' "$S3_ENDPOINT")"
      KANIKO_JOB_S3_ENDPOINT="$S3_SCHEME://$POD_IP:$S3_PORT"
      ;;
    *)
      KANIKO_JOB_S3_ENDPOINT="$S3_ENDPOINT"
      ;;
  esac
fi
```

## Validate GHCR Push Access

For every distinct build target owner, run:

```bash
node "$SKILL_DIR/scripts/check-ghcr-token.mjs" \
  --token-env GITHUB_TOKEN \
  --require-scope write:packages \
  --target-image "$TARGET_IMAGE"
```

Target owners and repository components must be lowercase. Stop before
creating a Job if token identity, scope, or target authorization cannot be
established.

Record only non-secret capability facts in logs.
