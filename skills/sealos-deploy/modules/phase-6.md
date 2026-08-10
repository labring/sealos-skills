# Phase 6: Deploy to Sealos Cloud

## Path dependency gate

Before Template API or kubectl fallback deploy, ensure deferred tools are available.
Ask once to install; refuse or recheck failure → **STOP**.

| Need | Tools |
|------|-------|
| Always (this phase) | `kubectl` and a usable Sealos kubeconfig |
| Scripted Template API helpers | Node.js preferred; otherwise `curl` + `jq` (+ Python URL-encoding fallback) |

### 6.1 Construct Deploy URL

The template deploy API uses a fixed `template.` subdomain prefix on the region domain:

```
Region example:     https://usw-1.sealos.io
Deploy URL example: https://template.usw-1.sealos.io/api/v2alpha/templates/raw
```

Do not send requests to the literal placeholder form `https://template.<region-domain>/...`.
Always derive `REGION_DOMAIN` first, then build `DEPLOY_URL` from the real value.

Extract the region from `~/.sealos/auth.json` (saved during preflight auth):
```bash
REGION=$(jq -r '.region' ~/.sealos/auth.json)
REGION_DOMAIN=$(printf '%s' "$REGION" | sed -E 's#^https?://##; s#/$##')
DEPLOY_URL="https://template.${REGION_DOMAIN}/api/v2alpha/templates/raw"
```

### 6.2 Deploy Template

Read kubeconfig, **encode it with `encodeURIComponent`**, and send as `Authorization` header.

Request body fields:
- `yaml` (required) — the full template YAML string
- `args` (optional) — template variable key-value pairs that override or supply `spec.inputs` fields. Values from Phase 5 `CONFIG.args`.
- `dryRun` (optional, boolean) — if true, validates resources against K8s API without creating anything. Returns 200 with preview.

`deploy-template.mjs` sends the original args to Template API and emits only `args_supplied` plus an allowlisted response. Credential values, raw response messages, nested response details, and request exception text stay out of stdout/stderr.

**With Node.js (preferred):**
```bash
node "<SKILL_DIR>/scripts/deploy-template.mjs" ".sealos/template/index.yaml" --dry-run

DEPLOY_ARGS_FILE=$(mktemp "${TMPDIR:-/tmp}/sealos-template-args.XXXXXX")
chmod 600 "$DEPLOY_ARGS_FILE"
trap 'rm -f "$DEPLOY_ARGS_FILE"' EXIT

# Serialize Phase 5 CONFIG.args directly to this file without printing values.
node "<SKILL_DIR>/scripts/deploy-template.mjs" \
  ".sealos/template/index.yaml" --args-file "$DEPLOY_ARGS_FILE"

rm -f "$DEPLOY_ARGS_FILE"
trap - EXIT
```

This script is the preferred execution path because it:
- reads `~/.sealos/auth.json` directly instead of fragile shell parsing
- derives `REGION_DOMAIN` from the real `region` value
- always posts to the concrete `DEPLOY_URL`
- emits structured JSON on success or failure

Use `--args-json` only for values confirmed to be non-sensitive. Passwords, tokens, API keys, email addresses, and other account values use the private `--args-file` path. On POSIX systems, the helper rejects argument files that grant access to group or other users.

**Without Node.js (curl + jq fallback):**
```bash
umask 077
DEPLOY_ARGS_FILE=$(mktemp "${TMPDIR:-/tmp}/sealos-template-args.XXXXXX")
DEPLOY_BODY_FILE=$(mktemp "${TMPDIR:-/tmp}/sealos-template-body.XXXXXX")
DEPLOY_RESPONSE_FILE=$(mktemp "${TMPDIR:-/tmp}/sealos-template-response.XXXXXX")
trap 'rm -f "$DEPLOY_ARGS_FILE" "$DEPLOY_BODY_FILE" "$DEPLOY_RESPONSE_FILE"' EXIT

# Serialize Phase 5 CONFIG.args directly to DEPLOY_ARGS_FILE without printing values.
# encodeURIComponent via Python.
KUBECONFIG_ENCODED=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.stdin.read(), safe=''))" < ~/.sealos/kubeconfig)

jq -n \
  --rawfile yaml .sealos/template/index.yaml \
  --slurpfile args "$DEPLOY_ARGS_FILE" \
  '{yaml: $yaml, args: $args[0], dryRun: false}' > "$DEPLOY_BODY_FILE"

if ! HTTP_STATUS=$(curl -sS -o "$DEPLOY_RESPONSE_FILE" -w '%{http_code}' -X POST "$DEPLOY_URL" \
  -H "Authorization: $KUBECONFIG_ENCODED" \
  -H "Content-Type: application/json" \
  --data-binary @"$DEPLOY_BODY_FILE"); then
  jq -n '{success: false, response: {details_omitted: true}}'
  exit 1
fi

if jq -e . "$DEPLOY_RESPONSE_FILE" >/dev/null 2>&1; then
  jq --arg status "$HTTP_STATUS" '
    ($status | tonumber) as $statusCode |
    . as $body |
    {
      success: ($statusCode >= 200 and $statusCode < 300),
      status: $statusCode,
      response:
        (({
          ok: $body.ok,
          success: $body.success,
          name: $body.name,
          uid: $body.uid,
          resourceType: $body.resourceType,
          createdAt: $body.createdAt
        } | with_entries(select(.value != null)))
        + (if ($body.resources | type) == "array" then {
            resources: [$body.resources[] as $resource | ({
              name: $resource.name,
              uid: $resource.uid,
              resourceType: $resource.resourceType,
              kind: $resource.kind,
              quota: (($resource.quota // {}) | ({
                cpu,
                memory,
                storage,
                replicas
              } | with_entries(select(.value != null))))
            } | with_entries(select(.value != null)))]
          } else {} end)
        + (if ($body.error | type) == "object" then {
            error: ({
              type: $body.error.type,
              code: $body.error.code,
              details_omitted: true
            } | with_entries(select(.value != null)))
          } else {} end))
    }
  ' "$DEPLOY_RESPONSE_FILE"
else
  jq -n --arg status "$HTTP_STATUS" \
    '{success: false, status: ($status | tonumber), response: {details_omitted: true}}'
fi

rm -f "$DEPLOY_ARGS_FILE" "$DEPLOY_BODY_FILE" "$DEPLOY_RESPONSE_FILE"
trap - EXIT
```

This fallback requires `jq` so request construction and response allowlisting stay structured. Use the Node.js helper when `jq` is unavailable.

### 6.3 Handle Response

Template API error bodies may contain a message and nested details. `deploy-template.mjs` exposes only the safe diagnostic fields:
```json
{
  "success": false,
  "status": 400,
  "args_supplied": 2,
  "response": {
    "error": { "type": "ValidationError", "code": "INVALID_VALUE", "details_omitted": true }
  }
}
```

| Status | Meaning | Action |
|--------|---------|--------|
| 201 | Deployed successfully | Extract instance name and resources from response |
| 200 | Dry-run preview (`dryRun: true`) | Show resource preview and quota |
| 400 | Validation error — `INVALID_PARAMETER` (missing yaml/name) or `INVALID_VALUE` (bad YAML, missing required args) | Use `error.type/code`, rerun the local quality gate, compare required inputs with `args_supplied`, inspect the selected release's schema, then repair and retry |
| 401 | `AUTHENTICATION_REQUIRED` — missing or invalid kubeconfig | Re-run `sealos-cli login <region>`, or `sealos-cli workspace switch <ns>` |
| 403 | `FORBIDDEN` — insufficient permissions | Inform user, check kubeconfig namespace permissions |
| 409 | `ALREADY_EXISTS` — instance already exists | Inform user, suggest different app name |
| 422 | `RESOURCE_ERROR` — K8s rejected resource spec | Use `error.type/code`, rerun the local quality gate, inspect rendered resource fields and server-side dry-run through the redacted helper, then repair the template |
| 503 | `SERVICE_UNAVAILABLE` — K8s cluster unreachable | **Fall back to kubectl (6.4)** |

On 201 success, the helper's allowlisted response contains:
```json
{
  "name": "myapp-abcdefgh",
  "uid": "...",
  "resourceType": "instance",
  "displayName": "...",
  "createdAt": "...",
  "resources": [
    { "name": "myapp-abcdefgh", "uid": "...", "resourceType": "deployment", "quota": { "cpu": 0.1, "memory": 0.25, "storage": 0, "replicas": 1 } }
  ]
}
```
Extract the instance name and present to user.

### 6.3.1 Create the Pull Secret Using the Real Instance Name

For a locally built GHCR image, do **not** create the pull Secret before the Template
API call. The requested repository/app name is not authoritative, and the API may
generate a different Instance, App, and Deployment identity.

Immediately after the `201` response:

1. Read `REAL_APP_NAME` from the top-level response `name`. This is the authoritative
   Secret name and the value resolved from `${{ defaults.app_name }}`.
2. Read `NAMESPACE` from the active kubeconfig context.
3. Create the Secret named exactly `$REAL_APP_NAME` before starting readiness waits:

```bash
REAL_APP_NAME="<response.name>"
NAMESPACE=$(KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  config view --minify -o jsonpath='{.contexts[0].context.namespace}')

node "<SKILL_DIR>/scripts/ensure-image-pull-secret.mjs" \
  "$NAMESPACE" "$REAL_APP_NAME" "$IMAGE_REF"
```

The Template may create a Pod before the Secret exists, so a short initial
`ErrImagePull` or `ImagePullBackOff` is expected. Do not delete or recreate the Pod,
do not change package visibility, and do not replace the image. Kubelet retries image
pulls automatically and should recover after the same-named Secret appears.

Secret creation is a blocking post-deploy step: verify the Secret exists and that
the live Deployment references `$REAL_APP_NAME` in `spec.template.spec.imagePullSecrets`
before accepting readiness. If `response.name` is missing, empty, or does not match
the rendered Secret reference, stop instead of guessing from the repository name.

Skip this subsection when Phase 2 reused an existing public image or the selected
registry was the Docker Hub public-image flow.

### 6.3.2 Post-Deploy Readiness Verification

After a 201 response, do not assume the app is usable. Verify Kubernetes readiness:

```bash
NAMESPACE=$(KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  config view --minify -o jsonpath='{.contexts[0].context.namespace}')

KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  get pod,svc,endpoints,ingress -n "$NAMESPACE" -l app=<app-name>
```

For the public app Service, endpoints must be non-empty before the Ingress can serve traffic. If the URL returns `no healthy upstream` or HTTP 503:

1. Check `endpoints/<app-name>`; empty endpoints means the backend Pod is not Ready.
2. Check Pod init container status and previous logs:
   ```bash
   KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
     logs pod/<pod> -n "$NAMESPACE" -c <init-container> --previous --tail=200
   ```
3. Look for common signatures:
   - `OOMKilled` or exit `137`: increase init container memory and recreate the Pod.
   - `Permission denied` on mounted paths: add `fsGroup` or a one-shot permission repair for existing PVCs.
   - Password policy, invalid bootstrap configuration, or root reconciliation validation: return to the account-mode classification and Phase 5 credential contract before changing resources.
   - App-specific migration/bootstrap errors: repair the failed bootstrap state, then rerun the init path.
4. Only report the app as usable after the endpoint exists and an HTTP request to the public URL returns a non-5xx response.
5. Continue to Phase 7 before writing deployment state or reporting success.

For templates with KubeBlocks-supported databases, runtime truth must include the database control plane and generated connection surface:

```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  get cluster,component,instanceset,secret,svc -n "$NAMESPACE" \
  | grep -E '<app-name>|redis|postgres|mysql|mongo|broker'
```

Acceptance requires the KubeBlocks `Cluster` to be Ready/Running, each expected `Component` and `InstanceSet` to converge, the account Secret to exist, and the application environment to point at the expected Service FQDN. For Redis, verify both `redis` and `redis-sentinel` components, `${APP_NAME}-redis-redis-account-default`, and `${APP_NAME}-redis-redis-redis.${NAMESPACE}.svc.cluster.local`. For MongoDB, verify `${APP_NAME}-mongo-mongodb-account-root` or the matching `mongodb` suffix variant before judging app initialization.

### 6.3.3 Runtime Truth Pass for Authenticated Apps

For web apps with login or registration, verify the authenticated runtime state after the readiness checks pass:

1. Complete login or registration through the real browser form or the documented login API.
2. Capture the final browser URL, document title, and key visible text from the authenticated page.
3. Record browser network requests with HTTP 4xx/5xx status, including method, URL path, status, and response summary.
4. Check backend logs for the same failing route paths and status codes.
5. Mark the runtime pass successful only when the authenticated page loads, expected post-login content is visible, and app API requests complete without new 4xx/5xx failures.

For login success followed by 404, route mismatch, or SDK endpoint errors:

1. Record the exact failing URL and API path from browser network logs.
2. Compare the failing path with backend logs to confirm the service that answered it.
3. Compare the template against the official runtime bundle source: component image versions, console/frontend service, API service, gateway/Ingress path, and public URL env/config.
4. Repair the template by aligning the bundle versions, restoring the missing route/service, or correcting reverse-proxy path handling.
5. Redeploy and rerun the browser login pass.

### 6.4 Fallback: kubectl apply (when Template API is unavailable)

If the Template API returns 503/500 or is unreachable, deploy directly via kubectl using the local kubeconfig.

**Step 1 — Gather cluster context:**
```bash
# User namespace
NAMESPACE=$(KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify config view --minify -o jsonpath='{.contexts[0].context.namespace}')

# Cluster domain (from region URL)
CLOUD_DOMAIN=$(jq -r '.region' ~/.sealos/auth.json | sed -E 's#^https?://##; s#/$##')

# TLS secret name (from existing ingress, or default)
CERT_SECRET=$(KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify get ingress -n "$NAMESPACE" -o jsonpath='{.items[0].spec.tls[0].secretName}' 2>/dev/null || echo "wildcard-cert")
```

**Step 2 — Render template variables:**

The template YAML from Phase 5 contains `${{ }}` variables. The AI must replace them with actual values:

| Variable | Value |
|----------|-------|
| `${{ defaults.app_name }}` | Generate: `<app>-<random8>` (e.g., `edict-xn22k4ie`) |
| `${{ defaults.app_host }}` | Generate: `<app>-<random8>` (e.g., `edict-2v4jryz1`) |
| `${{ defaults.<key> }}` | Other defaults: generate per their `value` pattern |
| `${{ inputs.<key> }}` | User-provided values from Phase 5 `CONFIG.args` |
| `${{ random(N) }}` | Random alphanumeric string of length N |
| `${{ SEALOS_CLOUD_DOMAIN }}` | `CLOUD_DOMAIN` from Step 1 |
| `${{ SEALOS_CERT_SECRET_NAME }}` | `CERT_SECRET` from Step 1 |
| `${{ SEALOS_NAMESPACE }}` | `NAMESPACE` from Step 1 |

**Important:** `${{ inputs.xxx }}` values come from the user in Phase 5. If any required input was not provided, the AI must ask the user now before proceeding.

The AI reads the template YAML, performs all variable substitutions, and produces rendered K8s resource documents.

**Step 3 — Split and apply:**

The rendered YAML is a multi-document file (separated by `---`). Split it into individual resources:

1. **Skip** the first document (`kind: Template`) — this is the Sealos template metadata, not a K8s resource
2. **Apply** the remaining documents (Deployment, Service, Ingress, App, etc.) via kubectl:

```bash
# AI writes the rendered resources (without the Template CR) to a temp file
cat > /tmp/sealos-deploy-rendered.yaml << 'EOF'
<rendered Deployment + Service + Ingress + App YAML>
EOF

KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify apply -f /tmp/sealos-deploy-rendered.yaml -n "$NAMESPACE"
rm -f /tmp/sealos-deploy-rendered.yaml
```

For a locally built GHCR image, `${{ defaults.app_name }}` from the rendered
resources is the authoritative `REAL_APP_NAME` in this fallback path. Immediately
after `kubectl apply`, create the same-named pull Secret before starting readiness
waits:

```bash
REAL_APP_NAME="<rendered defaults.app_name>"
node "<SKILL_DIR>/scripts/ensure-image-pull-secret.mjs" \
  "$NAMESPACE" "$REAL_APP_NAME" "$IMAGE_REF"
```

The rendered Deployment must already reference `$REAL_APP_NAME` in
`spec.template.spec.imagePullSecrets`. Do not delete or recreate a Pod that entered
`ErrImagePull` or `ImagePullBackOff`; kubelet will retry after the Secret appears.
Skip this step for an existing public image or the Docker Hub public-image flow.

**Step 4 — Handle apply errors:**

| Error | Fix |
|-------|-----|
| `unknown field "spec.xxx"` in App CR | Remove the unknown field and retry |
| PodSecurity warnings | Deployment may proceed; fix compatible securityContext warnings before runtime acceptance when the image runs as non-root |
| `Forbidden` | Kubeconfig may be expired — re-run auth |
| `already exists` | Resource exists from a previous deploy — use `kubectl apply` (idempotent) |

**Step 5 — Verify deployment:**
```bash
# Wait for pod to be ready (max 120s)
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  wait --for=condition=available deployment/<app-name> -n "$NAMESPACE" --timeout=120s

# Get pod status
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  get pods -l app=<app-name> -n "$NAMESPACE"
```

App URL: `https://<app_host>.<CLOUD_DOMAIN>`

### 6.5 Runtime Truth Pass

Execute `<SKILL_DIR>/modules/phase-7.md` after every Template API or kubectl fallback deploy. Complete its Launchpad network, App URL, login, log, Event convergence, object-storage, and footprint gates before writing deployment state or reporting success.

### Write state.json

**This is critical for enabling future updates.** After a successful deploy, write `.sealos/state.json`:

```json
{
  "version": "1.0",
  "last_deploy": {
    "app_name": "<instance name, e.g. evershop-uvbp0n0n>",
    "app_host": "<ingress host prefix, e.g. evershop-4ha6b4mh>",
    "namespace": "<K8s namespace from kubeconfig>",
    "region": "<Sealos control-plane region domain, e.g. usw-1.sealos.io>",
    "image": "<IMAGE_REF used in this deploy>",
    "docker_hub_user": "<DOCKER_HUB_USER, or null if existing image was used>",
    "repo_name": "<REPO_NAME>",
    "url": "<public app URL>",
    "deployed_at": "<current ISO timestamp>",
    "last_updated_at": "<current ISO timestamp>"
  },
  "history": [
    {
      "at": "<current ISO timestamp>",
      "action": "deploy",
      "image": "<IMAGE_REF>",
      "method": "<template-api or kubectl-apply>",
      "status": "success",
      "note": "Initial deployment"
    }
  ]
}
```

The `last_deploy` section is what **Deployment Mode Detection** reads on subsequent runs to decide between DEPLOY and UPDATE mode. Without it, every `/sealos-deploy` creates a new instance.

The `history` array is append-only — every subsequent update (via Update Path) adds an entry. See the **Update History** section at the end of this file for the full schema and rules.

Sources for each field:
- `app_name`: from Template API response `name` or the rendered `defaults.app_name` (kubectl apply)
- `app_host`: from the rendered `defaults.app_host` value, or parsed from the Ingress host
- `namespace`: from kubeconfig context
- `region`: control-plane/API region from `~/.sealos/auth.json` `region` field (strip `https://`); this may differ from the App runtime domain
- `image`: from Phase 3 `build_result.pushed` (primary app key) or Phase 4 digest-pinned image after template generation; never invent an `image_ref` field
- `docker_hub_user`: from Phase 4 `DOCKER_HUB_USER` (null if Phase 2 found existing image)
- `repo_name`: from `analysis.json` `project.repo_name`
- `url`: the exact `APP_URL` verified by the Runtime Truth Pass, read from the live App resource or deployment response; never reconstruct it from `app_host` and `region`

---

## Cleanup

If `WORK_DIR` was created via `mktemp` (remote GitHub URL clone), remove it:
```bash
rm -rf "$WORK_DIR"
```

Do NOT clean up if `WORK_DIR` is the user's local project directory.

For test deployments, delete the Sealos `Instance` and application resources before database RBAC. Keep KubeBlocks ServiceAccount, Role, and RoleBinding resources until the database `Cluster` finalizer has converged. When a `Cluster` or `Component` remains in `Deleting` after dependent pods and InstanceSets are gone, inspect the finalizers and use finalizer removal only as the last recovery step after recording the stuck resource and owner references.

---

## Output

On success, present to user:

```
✓ Assessed: {language} + {framework}
✓ Image: {IMAGE_REF} ({source: existing/built})
✓ Template: .sealos/template/index.yaml
✓ Configured: {N} inputs set ({M} required, {K} optional)
✓ Deployed to Sealos Cloud ({region})

App URL: https://<app-access-url>

To update this deployment later, run: /sealos-deploy
```

If any `inputs` were configured, also show:
```
Configuration applied:
  ADMIN_EMAIL: admin@example.com
  OPENAI_API_KEY: sk-***...*** (masked)
```
Mask sensitive values (API keys, passwords) — show only first 3 and last 3 characters.

