# Phase 7: Post-deploy wrap-up

Judge success from the **live public App URL**, then record `.sealos/state.json`.
Do not treat Template API return codes alone as deploy success (P7-01).

Phase 7 is mandatory after:

- every Phase 6 create, and
- every UPDATE Path U3 rollout **success**

Creating or updating resources without this wrap-up is not success.

## Hard acceptance (only)

For apps with a public App URL:

1. Wait the **20-second** settle window after rollout waits complete (Phase 6 or
   UPDATE U3).
2. Open the live public App URL (exact URL from the live App resource or Template
   API response — never invent from `app_host` + control-plane region).
3. The response must load successfully **and** must **not** contain browser
   failure text such as:
   - `Application error`
   - `server-side exception`
   - `Internal Server Error`
   - `Unhandled Runtime Error`

That is the entire runtime pass. Launchpad, login, footprint, object-storage,
deep log review, and Event convergence are **optional diagnostics** when the URL
check fails or the user asks — they do **not** block `state.json` or success.

For workloads with **no** public Ingress / App URL: accept when the primary
workloads are Ready after the same 20-second settle window.

Write `.sealos/state.json` only after this hard pass. Report **COMPLETE** only
after validate-phase-7 passes (P7-03).

## Inputs

| Input | Source |
|-------|--------|
| Live identity (DEPLOY) | `.sealos/phase-6/deploy-result.json` → `app_name` |
| Live identity (UPDATE) | Existing `.sealos/state.json` → `last_deploy` plus `NEW_IMAGE` / `UPDATE_ACTION` from U3 |
| App URL | Live App / Template API (when public) |

## Outputs

| Output | Path / form |
|--------|-------------|
| Verified deploy or update | Report success only after hard pass + state validation |
| Deploy state | `.sealos/state.json` |

## Path dependency gate

| Need | Tools |
|------|-------|
| Always | `kubectl` and a usable Sealos kubeconfig |
| Public URL check | Node `sealos-live-smoke.mjs` preferred; else `curl` |

## Phase constraints

| ID | Constraint |
|----|------------|
| P7-01 | Do not judge success from API return codes alone — open the live URL (or Ready for private-only) |
| P7-02 | On architecture mismatch, do not guess images or floating tags |
| P7-03 | Write `state.json` and pass validate-phase-7 before reporting success |

## Procedure

### 1. Resolve identity and URL

**DEPLOY path** (after Phase 6):

```bash
APP_NAME="<app-name from deploy-result>"
```

**UPDATE path** (after U3 success):

```bash
APP_NAME="<last_deploy.app_name from existing state.json>"
# NEW_IMAGE and UPDATE_ACTION come from modules/update.md U3
```

```bash
APP_URL=$(KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  get apps.app.sealos.io/"$APP_NAME" -n "$NAMESPACE" \
  -o jsonpath='{.spec.data.url}' 2>/dev/null)
```

If the live App has no URL, use the Template API response URL when present
(DEPLOY). On UPDATE, keep `last_deploy.url` when the live App has no URL and a
prior URL exists.

### 2. Settle window (20 seconds)

```bash
STABILITY_SECONDS=20
sleep "$STABILITY_SECONDS"
```

Do not require Event-convergence `ok: true` for acceptance. Optional diagnostic
log comparison may use `--min-window-seconds 20`.

### 3. Public URL check (hard gate)

```bash
node "<SKILL_DIR>/scripts/sealos-live-smoke.mjs" --url "$APP_URL"
```

Accept when the entry loads and the body has no browser failure text listed
above. A login / first-run page counts as success. Do not require completing
login or a deeper user workflow.

If the smoke helper is unavailable:

```bash
curl -k -sS -L "$APP_URL" | head -c 200000
```

Same rule: HTTP success path without browser failure text.

Private-only (no App URL): make sure that primary Pods/Deployments are Ready,
then continue.

### 4. Failure handling (when the hard gate fails)

**DEPLOY path — architecture mismatch** (`no matching manifest`, `exec format error`,
and more): when buildable source exists, fix in Phases 2–4, redeploy from Phase 5,
re-run Phase 7. Without buildable source, report the service/image/error. Do **not**
guess other images or floating tags (P7-02).

**DEPLOY path — resource exhaustion** (OOMKilled, crash loops blocking the URL):
raise CPU or memory to the next Sealos step, regenerate template, redeploy from
Phase 5, re-run Phase 7. Official-template path cannot edit verified official YAML —
disable reuse and return to the standard path when resources cannot pass.

**UPDATE path:** do not rewrite the template here. Roll back the Deployment image or
restart to the prior known-good image when needed, append a **failed** history
entry, and stop. Do not report COMPLETE.

Optional diagnostics while debugging (not acceptance gates):

```bash
node "<SKILL_DIR>/scripts/sealos-footprint.mjs" --namespace "$NAMESPACE" --app "$APP_NAME"
node "<SKILL_DIR>/scripts/sealos-launchpad-network.mjs" --app "$APP_NAME" --app-url "$APP_URL" --expected-port "$PUBLIC_PORT"
node "<SKILL_DIR>/scripts/sealos-log-scan.mjs" --namespace "$NAMESPACE" --app "$APP_NAME" --since 10m --tail 300
```

App-specific playbooks: `<SKILL_DIR>/references/live-smoke-playbooks.md`.

### 5. Write `state.json`

Only after the hard acceptance pass. Full field contract:
docs `pipeline/state-and-completion` / `en/pipeline/state-and-completion`.

**DEPLOY path** — write a full new state object (first history entry `action: "deploy"`):

```json
{
  "version": "1.0",
  "last_deploy": {
    "app_name": "<must match deploy-result.app_name>",
    "app_host": "<ingress host prefix>",
    "namespace": "<kubeconfig namespace>",
    "region": "<control-plane region domain>",
    "image": "<IMAGE_REF>",
    "docker_hub_user": "<user or null>",
    "repo_name": "<analysis.json repo_name>",
    "url": "<exact verified APP_URL, or omit only when no public entry>",
    "deployed_at": "<ISO timestamp>",
    "last_updated_at": "<ISO timestamp>"
  },
  "history": [
    {
      "at": "<ISO timestamp>",
      "action": "deploy",
      "image": "<IMAGE_REF>",
      "method": "template-api",
      "status": "success",
      "note": "Initial deployment"
    }
  ]
}
```

**UPDATE path** — edit the existing `.sealos/state.json`:

1. Set `last_deploy.image` to `NEW_IMAGE`
2. Set `last_deploy.last_updated_at` to the current ISO timestamp
3. When a public URL was verified, set `last_deploy.url` to that exact URL
4. Append a success history entry (`action`: `set-image` or `restart`; see
   `modules/update.md` Update History)

`url` must be the exact verified App URL when public. After write, run schema
validation. For GitHub URL sources, update bridge persistence before deleting a
temp checkout. Do not delete the user's local project directory.

### 6. Validate

```bash
node "<SKILL_DIR>/scripts/validate-phase-7.mjs" --dir "$WORK_DIR"
```

| ID | Check |
|----|-------|
| P7-V01 | `.sealos/state.json` exists and passes schema |
| P7-V02 | `last_deploy.app_name` is non-empty; when `.sealos/phase-6/deploy-result.json` exists, it must match that `app_name` |

### 7. Final summary (only after validate passes)

**DEPLOY:**

```
✓ Deployed to Sealos Cloud ({region})
App URL: https://<app-access-url>
To update later: /sealos-deploy
```

**UPDATE:**

```
✓ Updated: <APP_NAME>
✓ Image: <PREVIOUS_IMAGE> → <NEW_IMAGE>
App URL: https://<app-access-url>
To update again later: /sealos-deploy
```

Mask secrets. Official-template path may also show template name / catalog version.
Omit the App URL line when there is no public entry.

## Stop conditions

| Result | Condition |
|--------|-----------|
| **STOP** | Hard URL/Ready check fails after bounded remediation; state validation fails |
| **COMPLETE** | Hard pass, `state.json` written, validate-phase-7 passes |
