# Preflight

Confirm that the sandbox can run a one-shot BuildKit Job.

## Inputs

- `WORK_DIR`: project directory containing `.sealos/build-request.json`
- `NAMESPACE`: Kubernetes namespace, default `default`
- `GITHUB_TOKEN`: required
- `SKILL_DIR`: directory containing this skill

## Step 1: Start Log

```bash
mkdir -p ~/.sealos/logs
LOG_FILE=~/.sealos/logs/build-$(date +%Y%m%d-%H%M%S).log
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Build run started" > "$LOG_FILE"
```

Append all phase boundaries and non-secret decisions to this file.

## Step 2: Resolve kubectl

Try the active environment first:

```bash
kubectl version --client 2>/dev/null
kubectl get namespace "$NAMESPACE" 2>/dev/null
```

If default kubectl access is unavailable and `/etc/kubernetes/admin.conf` exists, try:

```bash
sudo kubectl --kubeconfig /etc/kubernetes/admin.conf version --client
sudo kubectl --kubeconfig /etc/kubernetes/admin.conf get namespace "$NAMESPACE"
```

Use one command prefix consistently after detection:

```text
KUBECTL="kubectl"
```

or:

```text
KUBECTL="sudo kubectl --kubeconfig /etc/kubernetes/admin.conf"
```

Do not hardcode the sudo form unless detection proves it is needed.

## Step 3: Check Permissions

Run:

```bash
$KUBECTL auth can-i create jobs -n "$NAMESPACE"
$KUBECTL auth can-i get jobs -n "$NAMESPACE"
$KUBECTL auth can-i create secrets -n "$NAMESPACE"
$KUBECTL auth can-i get pods -n "$NAMESPACE"
$KUBECTL auth can-i get pods/log -n "$NAMESPACE"
```

Stop if Jobs or Secrets cannot be created.

## Step 4: Check GITHUB_TOKEN

```bash
test -n "${GITHUB_TOKEN:-}"
```

Stop if `GITHUB_TOKEN` is missing. The token is used for both GitHub clone and GHCR push.

Required capabilities:

- read access to the repository
- `write:packages` or equivalent GHCR package permission
- `read:packages` for package verification

## Step 5: Record Capability Summary

Report:

- namespace
- kubectl command shape, without credentials
- whether `GITHUB_TOKEN` exists
- whether Job and Secret creation are allowed
- whether `build-request.json` exists

Do not print token values, tokenized URLs, Docker auth JSON, or Secret data.
