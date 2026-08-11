# Update Path

**This file runs only in UPDATE mode** (entered via `modules/mode.md`), plus the
**Live config update** section for the configure intent on a deployed app.

The update path skips Assess, Discover, and Template generation — it reuses the existing deployment and only pushes new images or applies config changes.

All kubectl commands use the Sealos kubeconfig:
```
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify
```

**Reminder:** `kubectl delete` requires user confirmation — see Safety in `SKILL.md`.

## Context from Mode Detection

These values are already known from `.sealos/state.json` `last_deploy` section:

```
APP_NAME      = last_deploy.app_name       (e.g., "evershop-uvbp0n0n")
NAMESPACE     = last_deploy.namespace      (e.g., "ns-qiqovyrm")
REGION        = last_deploy.region         (e.g., "gzg.sealos.run")
CURRENT_IMAGE = last_deploy.image          (e.g., "zhujingyang/evershop:20260309")
DOCKER_HUB_USER = last_deploy.docker_hub_user
REPO_NAME     = last_deploy.repo_name
APP_URL       = last_deploy.url
SERVICES      = last_deploy.services       (multi-service map; may be absent)
```

## Phase U0: Scope the update

Single-service deploys (`services` absent or one entry): continue to U1 with
the primary Deployment `APP_NAME`.

Multi-service deploys (`services` has more than one entry, or the Phase 2 plan
recorded multiple `build_targets`): list the services and ask which to update.
"All" rebuilds every build target and rolls each workload. Each service maps to
its own workload and image:

```
SERVICES = { "<service-key>": { "workload": "<deployment-name>", "image": "<current image>" } }
```

If `state.json` predates the `services` field and the app is multi-service,
reconstruct the map from the live footprint
(`sealos-footprint.mjs --namespace $NAMESPACE --app $APP_NAME`) and confirm it
with the user before continuing.

## Phase U1: Build & Push

Ask the user what changed:

```
What would you like to update?

  1. Code changed — rebuild and push new image (default)
  2. Just restart the current deployment (no rebuild)
```

### Option 1: Rebuild

Reuse the **exact same build logic as Phase 3** — same Dockerfile per service,
same registry rules (`local`: GHCR default or Docker Hub public; `sandbox`:
Kaniko GHCR), same `build-push.mjs` modes or `k8s-kaniko-job`.
Default to the registry used by `CURRENT_IMAGE`, but let the user switch if they want
(local profile only).

```bash
# Per service (local profile). Single-service: one call with $REPO_NAME.
node "<SKILL_DIR>/scripts/build-push.mjs" "$WORK_DIR" "$REPO_NAME" --mode all --registry ghcr
node "<SKILL_DIR>/scripts/build-push.mjs" "$WORK_DIR" "$REPO_NAME" --mode all --registry dockerhub
```

For multi-service updates, run one build per selected service with that
service's `--context` / `--dockerfile` from the Phase 2 plan (`build_targets`).
Record each `NEW_IMAGE` from the output.

If a build fails, treat it like Phase 3: read the error, consult
`<SKILL_DIR>/../dockerfile-skill/knowledge/error-patterns.md`, fix the
Dockerfile or build inputs, and retry. If it still fails after bounded
remediation → **STOP** (do not roll anything out).

### Option 2: Restart only

No build needed. Use the current image:
```
NEW_IMAGE = CURRENT_IMAGE
```

Will trigger a rollout restart in Phase U2.

## Phase U2: Apply Update

### Image update (Option 1 — new image built):

If any `NEW_IMAGE` starts with `ghcr.io/`, create or refresh the app-scoped pull Secret and make sure the existing Deployment references it before swapping images:

```bash
node "<SKILL_DIR>/scripts/ensure-image-pull-secret.mjs" "$NAMESPACE" "$APP_NAME" "$NEW_IMAGE" "$APP_NAME"
```

Single-service (container name equals the workload name in generated templates
— confirm with `kubectl get deploy/$APP_NAME -o jsonpath='{.spec.template.spec.containers[*].name}'`
when unsure):

```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  set image deployment/$APP_NAME \
  $APP_NAME=$NEW_IMAGE \
  -n $NAMESPACE
```

Multi-service: repeat per selected service with that service's workload and
container name:

```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  set image deployment/<workload> <container>=<new-image> -n $NAMESPACE
```

### Restart only (Option 2 — no new image):

```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  rollout restart deployment/$APP_NAME \
  -n $NAMESPACE
```

## Phase U3: Verify Rollout

### Wait for new pods to be ready (per updated workload):

```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  rollout status deployment/$APP_NAME \
  -n $NAMESPACE --timeout=120s
```

**On timeout, inspect before rolling back.** A cold image pull can exceed 120s
without anything being wrong:

```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  get pods -n $NAMESPACE -l app=$APP_NAME \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.containerStatuses[*].state}{"\n"}{end}'
```

| Pod state after timeout | Action |
|--------------------------|--------|
| `ContainerCreating` / image pulling | Extend the wait once (total 300s), then re-check |
| `CrashLoopBackOff` / `Error` | Roll back now (below) |
| `ImagePullBackOff` after the pull Secret exists | Roll back now — the image reference is wrong |

### On success:

Do **not** write success into `.sealos/state.json`. Do **not** report COMPLETE.

Keep these values for Phase 7:

```
UPDATE_ACTION = set-image   # Option 1
UPDATE_ACTION = restart     # Option 2
NEW_IMAGE      = <image after U1>            # or per-service map
PREVIOUS_IMAGE = CURRENT_IMAGE
```

Then load `modules/phase-7.md`. Phase 7 runs the hard accept, writes `state.json`
(including the success history entry), runs `validate-phase-7.mjs`, and reports COMPLETE.

### On failure:

Auto-rollback every workload updated in this run:
```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  rollout undo deployment/$APP_NAME \
  -n $NAMESPACE
```

Append a **failed** entry to `history` in `.sealos/state.json` (see Update History below).

Report to user:
```
✗ Rollout failed — automatically rolled back to previous version.

Debug:
  kubectl logs deployment/<APP_NAME> -n <NAMESPACE> --tail=50
```

Do NOT update `last_deploy.image` on failure — it stays at the old value.
Do **not** load Phase 7 after a failed rollout.

## Live config update (configure intent on a deployed app)

Use this section when the user wants to change env vars on an app that is
already deployed, without a rebuild. (Pre-deploy configuration lives in
`modules/phase-5.md`.)

1. Show the current values first (mask anything matching secret patterns):

```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  set env deployment/$APP_NAME --list -n $NAMESPACE
```

2. Apply the change. Non-secret values may go directly on the Deployment;
   secret values belong in a Secret referenced by `secretKeyRef`:

```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  set env deployment/$APP_NAME KEY=VALUE -n $NAMESPACE
```

3. `kubectl set env` triggers a rollout. Verify it with the same Phase U3
   procedure (timeout, inspect, rollback on crash).
4. On success, run the Phase 7 hard accept, then append a `set-env` history
   entry with masked `changes` (schema: `action: set-env`,
   `method: kubectl-set-env`). On failure after rollback, append a failed
   entry.
5. Warn the user that live env edits drift from `.sealos/template/index.yaml`;
   the next full DEPLOY from template will not include them unless the
   template or `.sealos/config.json` `env_overrides` is updated too.

## Update History

Every update (successful or failed) appends an entry to `history` in `.sealos/state.json`. This provides a traceable log of all changes to the deployment.

```json
{
  "version": "1.0",
  "last_deploy": {
    "app_name": "morphic-dc21ad72",
    "image": "zhujingyang/morphic:20260310-143022"
  },
  "history": [
    {
      "at": "2026-03-09T18:37:30Z",
      "action": "deploy",
      "image": "ghcr.io/miurla/morphic:668daf0e",
      "method": "template-api",
      "status": "success",
      "note": "Initial deployment"
    },
    {
      "at": "2026-03-09T20:15:00Z",
      "action": "set-env",
      "changes": ["OPENAI_API_KEY=sk-***", "OPENAI_BASE_URL=https://..."],
      "method": "kubectl-set-env",
      "status": "success",
      "note": "Fix: default openai provider not enabled"
    },
    {
      "at": "2026-03-10T14:30:22Z",
      "action": "set-image",
      "previous_image": "ghcr.io/miurla/morphic:668daf0e",
      "image": "zhujingyang/morphic:20260310-143022",
      "method": "kubectl-set-image",
      "status": "success"
    },
    {
      "at": "2026-03-11T09:00:00Z",
      "action": "set-image",
      "previous_image": "zhujingyang/morphic:20260310-143022",
      "image": "zhujingyang/morphic:20260311-090000",
      "method": "kubectl-set-image",
      "status": "failed",
      "note": "CrashLoopBackOff — rolled back"
    }
  ]
}
```

### History entry fields

| Field | Required | Description |
|-------|----------|-------------|
| `at` | yes | ISO 8601 timestamp of the operation |
| `action` | yes | What changed: `deploy`, `set-image`, `set-env`, `patch`, `restart` |
| `status` | yes | `success` or `failed` |
| `method` | yes | Mechanism used: `template-api` or `kubectl-apply` for `deploy`; `kubectl-set-image`, `kubectl-set-env`, `kubectl-patch`, `kubectl-rollout-restart` for the others |
| `image` | if image changed | New image reference |
| `previous_image` | if image changed | Image before the update |
| `changes` | if env/config changed | Array of changes (mask sensitive values: `sk-***`) |
| `note` | no | Free-text reason or context for the change |

### Rules

- **Always append, never rewrite** — history is append-only. Never delete or modify previous entries.
- **Mask secrets** — API keys, passwords, tokens: show only first 3 chars + `***` (e.g., `sk-***`).
- **Initial deploy counts** — the first entry should be `action: "deploy"` written by Phase 7 after first deploy.
- **Failed updates count** — record failures so the user can see what was attempted and why it didn't work.
- **Keep it bounded** — if history exceeds 50 entries, trim the oldest entries (keep the first `deploy` entry and the most recent 49).
