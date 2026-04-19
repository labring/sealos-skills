# Preflight

Confirm that the sandbox can run `buildctl` and create a temporary BuildKit daemon Job + Service in the active namespace using the sandbox-mounted kubeconfig and service account.

## Inputs

- `WORK_DIR`: project directory containing `.sealos/build-request.json`
- `NAMESPACE`: optional namespace override. If unset, resolve the active namespace from the sandbox context. Do not assume `default`.
- `GITHUB_TOKEN`: required for GHCR push
- `SKILL_DIR`: directory containing this skill

## Step 1: Start Log

```bash
mkdir -p ~/.sealos/logs
LOG_FILE=~/.sealos/logs/build-$(date +%Y%m%d-%H%M%S).log
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Build run started" > "$LOG_FILE"
```

Append all phase boundaries and non-secret decisions to this file.

## Step 2: Resolve Active Kubernetes Context

Resolve namespace, pod name, service account, kubeconfig path, and current kubectl context from the active sandbox:

```bash
node "$SKILL_DIR/scripts/resolve-kube-context.mjs" ${NAMESPACE:+--namespace "$NAMESPACE"}
```

The resolver should use this precedence:

1. explicit `NAMESPACE`
2. active kubectl context namespace
3. `/var/run/secrets/kubernetes.io/serviceaccount/namespace`

After resolution, confirm the active tools:

```bash
kubectl version --client 2>/dev/null
buildctl --version 2>/dev/null
```

Stop if:

- namespace cannot be resolved
- `kubectl` is unavailable through the active sandbox kubeconfig
- `buildctl` is unavailable

Do not fall back to `sudo kubectl --kubeconfig /etc/kubernetes/admin.conf`. This workflow must stay inside the sandbox-provided kubeconfig and its mounted identity.

## Step 3: Check Permissions

Run:

```bash
kubectl auth can-i create jobs -n "$NAMESPACE"
kubectl auth can-i delete jobs -n "$NAMESPACE"
kubectl auth can-i create services -n "$NAMESPACE"
kubectl auth can-i delete services -n "$NAMESPACE"
kubectl auth can-i get jobs -n "$NAMESPACE"
kubectl auth can-i get services -n "$NAMESPACE"
kubectl auth can-i get endpoints -n "$NAMESPACE"
kubectl auth can-i create secrets -n "$NAMESPACE"
kubectl auth can-i get pods -n "$NAMESPACE"
kubectl auth can-i get pods/log -n "$NAMESPACE"
```

Stop if Jobs, Services, or Secrets cannot be created.

Do not require cluster-scoped `get namespace` access. Namespaced service accounts often cannot read Namespace objects even when they can create Jobs in their own namespace.

If `SERVICE_ACCOUNT_NAME` is resolved, the generated BuildKit Job must set `serviceAccountName: $SERVICE_ACCOUNT_NAME` so the temporary Pod inherits the current sandbox service account instead of the namespace `default` service account.

## Step 4: Check GITHUB_TOKEN and GHCR Scopes

```bash
node "$SKILL_DIR/scripts/check-ghcr-token.mjs" \
  --token-env GITHUB_TOKEN \
  --require-scope write:packages \
  --require-scope read:packages
```

Stop if `GITHUB_TOKEN` is missing or the response headers do not include `write:packages`. Do this before creating the BuildKit Job so GHCR auth failures are caught in preflight instead of after a long build.

## Step 5: Record Capability Summary

Report:

- namespace
- namespace resolution source
- current kubectl context
- current pod name when known
- current service account name when known
- kubectl command shape, without credentials
- whether `buildctl` exists
- whether `GITHUB_TOKEN` passed scope preflight
- whether Job, Service, and Secret creation are allowed
- whether `build-request.json` exists

Do not print token values, tokenized URLs, Docker auth JSON, or Secret data.
