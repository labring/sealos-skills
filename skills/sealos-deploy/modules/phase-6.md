# Phase 6: Deploy to Sealos Cloud

Submit **one** real create request using the unresolved template and `CONFIG.args`
confirmed in Phase 5. Deploy precheck is Phase 5 server-side dry-run only. Do not
repeat precheck here with different template bytes or parameters. Do not fall back
to kubectl create. Do not write `.sealos/state.json` here — that is Phase 7.

## Inputs

| Input | Source |
|-------|--------|
| Template | `.sealos/template/index.yaml` (same bytes as Phase 5) |
| Prepare result | `.sealos/phase-5/prepare-result.json` |
| Template inputs | Phase 5 `CONFIG.args` (private args file) |
| Namespace | Phase 0 kubeconfig (`local`) |
| Image pull needs | Phase 3 `pull_access` / Phase 4 template when GHCR private |

## Outputs

| Output | Path / form |
|--------|-------------|
| Live resources | App, workloads, network, storage, dependencies |
| `APP_NAME` | Allowlisted Template API `name`, or unique live Instance match |
| Pull secret | Same namespace, named `$APP_NAME`, when private GHCR requires it |
| Deploy result | `.sealos/phase-6/deploy-result.json` |

## Path dependency gate

Ask once to install; refuse or recheck failure → **STOP**.

| Need | Tools |
|------|-------|
| Always | `kubectl` and a usable Sealos kubeconfig |
| Template API helper | Node.js (`deploy-template.mjs`) — Node is entry-required, so this is always available |

## Phase constraints

| ID | Constraint |
|----|------------|
| P6-01 | Deploy precheck completed in Phase 5 (server-side dry-run). Do not re-run Template API `dryRun` or server-dry-run here with different bytes/args |
| P6-02 | Invalid / empty / mismatched namespace → **STOP**. Never fall back to `default` |
| P6-03 | Create timeout or 5xx → unknown. Do not auto-retry. Do not kubectl-fallback create |
| P6-04 | Exactly one real create request using Phase 5 template + `CONFIG.args` |

## Procedure

### 1. Namespace gate

```bash
NAMESPACE=$(KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  config view --minify -o jsonpath='{.contexts[0].context.namespace}')
```

Empty, invalid, or mismatched with the active workspace → **STOP**.

Confirm Phase 5 prepare-result exists and still matches the delivery template:

```bash
node "<SKILL_DIR>/scripts/validate-phase-5.mjs" --dir "$WORK_DIR"
```

Recompute `template_sha256` of `.sealos/template/index.yaml`. It must equal
`prepare-result.json` → `template_sha256`. Mismatch → **STOP** (do not create).

### 2. Construct deploy URL and create once

```bash
REGION=$(jq -r '.region' ~/.sealos/auth.json)
REGION_DOMAIN=$(printf '%s' "$REGION" | sed -E 's#^https?://##; s#/$##')
DEPLOY_URL="https://template.${REGION_DOMAIN}/api/v2alpha/templates/raw"
```

Do not post to a literal `template.<region-domain>` placeholder. Prefer
`deploy-template.mjs` (reads auth/kubeconfig, allowlists the response):

```bash
DEPLOY_ARGS_FILE=$(mktemp "${TMPDIR:-/tmp}/sealos-template-args.XXXXXX")
chmod 600 "$DEPLOY_ARGS_FILE"
trap 'rm -f "$DEPLOY_ARGS_FILE"' EXIT

# Serialize Phase 5 CONFIG.args into DEPLOY_ARGS_FILE without printing values.
node "<SKILL_DIR>/scripts/deploy-template.mjs" \
  "$WORK_DIR/.sealos/template/index.yaml" --args-file "$DEPLOY_ARGS_FILE"

rm -f "$DEPLOY_ARGS_FILE"
trap - EXIT
```

Use `--args-json` only for confirmed non-sensitive values. Passwords, tokens, API
keys, emails, and account values must use `--args-file` (mode `0600`).

Do **not** pass `--dry-run` in this phase. Template API `dryRun` is not a Phase 5
substitute and is not the Phase 6 create.

Always use `deploy-template.mjs` for the create — it owns response redaction,
args-file permission checks, and the request timeout. Do not hand-roll the
POST with curl.

### 3. Handle the create response

| Status | Meaning | Action |
|--------|---------|--------|
| 201 | Created | Extract `APP_NAME` from allowlisted `name` |
| 400 | Validation | Repair inputs/template via Phase 4/5 path; do not kubectl-create |
| 401 | Auth | Re-run `sealos-cli login` / workspace switch, then **STOP** this attempt |
| 403 | Forbidden | Inform user → **STOP** |
| 409 | Already exists | Inform user → **STOP** (or UPDATE path outside this phase) |
| 422 | Resource rejected | Repair via Phase 4/5 + server-dry-run; do not kubectl-create |
| 5xx / timeout (`unknown_create: true` in helper output) | Unknown create | **Do not retry. Do not kubectl apply.** Go to step 3.1 |
| Connection failure before send (DNS, refused; `unknown_create: false`) | Request never reached the API | Fix connectivity, then retry the single create |

Allowlisted success fields include `name`, `uid`, `resourceType`, `createdAt`, and
redacted `resources[]`. Credential values and raw admission bodies stay out of
stdout/stderr.

#### 3.1 Unknown create (timeout / 5xx)

Read-only check recent Instance / App scope in `$NAMESPACE`. Continue only when
exactly one matching Instance exists and can supply `APP_NAME`. Otherwise **STOP**.

### 4. Resolve `APP_NAME` and pull secret

1. Prefer Template API response `name` as `APP_NAME` / `REAL_APP_NAME`.
2. On unique live discovery only, use that Instance name.
3. Never guess from the repository name.

For locally built private GHCR images, create the pull Secret **after** create,
named exactly `$APP_NAME`, before readiness waits:

```bash
node "<SKILL_DIR>/scripts/ensure-image-pull-secret.mjs" \
  "$NAMESPACE" "$APP_NAME" "$IMAGE_REF"
```

Short initial `ErrImagePull` / `ImagePullBackOff` is expected until the Secret
exists. Do not delete/recreate Pods, change package visibility, or replace the
image. Skip when Phase 2 reused a public image or Docker Hub public-image flow.

Secret creation failure → **STOP**.

### 5. Wait for rollout and public endpoints (bounded)

Wait **in dependency order** with explicit timeouts — never open-ended.
Databases start slowest (KubeBlocks PostgreSQL needs ~2-3 minutes cold);
waiting on the app rollout first produces false timeouts while everything is
actually healthy.

```bash
# 1. KubeBlocks database clusters first (when the template has any)
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  wait --for=jsonpath='{.status.phase}'=Running \
  clusters.apps.kubeblocks.io/<name> -n "$NAMESPACE" --timeout=600s

# 2. Template Jobs (database init / migrations)
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  wait --for=condition=complete job/<name> -n "$NAMESPACE" --timeout=600s

# 3. App workloads last — repeat per Deployment AND StatefulSet in the
# template (kompose emits StatefulSets for volume-backed services)
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  rollout status deployment/<name> -n "$NAMESPACE" --timeout=300s
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  rollout status statefulset/<name> -n "$NAMESPACE" --timeout=300s
```

Generated templates gate app start on database readiness with
initContainers, so app pods should reach Ready with **zero restarts** shortly
after their databases run; a handful of early restarts only appears on
templates without gates.

On a rollout timeout, inspect Pod state before treating it as failure — a slow
image pull or a still-running init gate is not a crash (same table as UPDATE
U3). Before Ingress / App URL probes, require non-empty public Service
Endpoints.

On not-ready workloads, read Pod status, events, and logs (init/previous as needed).
Common signatures: OOM/`137`, permission denied on mounts, bootstrap/password
policy failures. Repair through Phase 5 credential contract or template regeneration
when required — do not invent floating tags or alternate images here.

API success means resources exist, not that the app is usable.

### 6. Write `deploy-result.json`

```bash
mkdir -p "$WORK_DIR/.sealos/phase-6"
```

```json
{
  "template_sha256": "<same lowercase hex as Phase 5 prepare-result.json>",
  "app_name": "<APP_NAME>"
}
```

`template_sha256` must equal Phase 5. `app_name` must be non-empty.

### 7. Validate

```bash
node "<SKILL_DIR>/scripts/validate-phase-6.mjs" --dir "$WORK_DIR"
```

| ID | Check |
|----|-------|
| P6-V01 | `.sealos/phase-6/deploy-result.json` passes schema |
| P6-V02 | `template_sha256` matches Phase 5 `prepare-result.json` |
| P6-V03 | `app_name` is non-empty |

On failure, do not **CONTINUE → Phase 7**.

## Stop conditions

| Result | Condition |
|--------|-----------|
| **STOP** | Namespace invalid, prepare/template mismatch, create fails, secret creation fails, unknown create without unique match, validate-phase-6 fails |
| **CONTINUE → Phase 7** | Resources created, rollout waits complete, deploy-result validated |

## Notes for Phase 7

- Runtime hard accept (public URL or Ready) and `.sealos/state.json` belong in
  `modules/phase-7.md`.
- Do not report deploy success to the user until Phase 7 completes.
