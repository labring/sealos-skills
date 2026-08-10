# Update Path

**This file runs only in UPDATE mode** (entered via `modules/mode.md`).

The update path skips Assess, Discover, and Template generation — it reuses the existing deployment and only pushes a new image.

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
```

---

## Phase U1: Build & Push

Ask the user what changed:

```
What would you like to update?

  1. Code changed — rebuild and push new image (default)
  2. Just restart the current deployment (no rebuild)
```

### Option 1: Rebuild

Reuse the **exact same build logic as Phase 3** — same Dockerfile, same registry
rules (`local`: GHCR default or Docker Hub public; `sandbox`: Kaniko GHCR), same
`build-push.mjs` modes or `k8s-kaniko-job`.
Default to the registry used by `CURRENT_IMAGE`, but let the user switch if they want
(local profile only).

```bash
# With Node.js (local profile):
node "<SKILL_DIR>/scripts/build-push.mjs" "$WORK_DIR" "$REPO_NAME" --mode all --registry ghcr
node "<SKILL_DIR>/scripts/build-push.mjs" "$WORK_DIR" "$REPO_NAME" --mode all --registry dockerhub

# Without Node.js:
TAG=$(date +%Y%m%d-%H%M%S)
NEW_IMAGE="<selected-user>/$REPO_NAME:$TAG"
docker buildx build --platform linux/amd64 -t "$NEW_IMAGE" --push -f Dockerfile "$WORK_DIR"
```

Record `NEW_IMAGE` from the output.

If build fails → same error handling as Phase 3 (read error-patterns.md, fix Dockerfile, retry up to 3 times).

### Option 2: Restart only

No build needed. Use the current image:
```
NEW_IMAGE = CURRENT_IMAGE
```

Will trigger a rollout restart in Phase U2.

---

## Phase U2: Apply Update

### Image update (Option 1 — new image built):

If `NEW_IMAGE` starts with `ghcr.io/`, create or refresh the app-scoped pull Secret and make sure the existing Deployment references it before swapping images:

```bash
node "<SKILL_DIR>/scripts/ensure-image-pull-secret.mjs" "$NAMESPACE" "$APP_NAME" "$NEW_IMAGE" "$APP_NAME"
```

```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  set image deployment/$APP_NAME \
  $APP_NAME=$NEW_IMAGE \
  -n $NAMESPACE
```

### Restart only (Option 2 — no new image):

```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  rollout restart deployment/$APP_NAME \
  -n $NAMESPACE
```

---

## Phase U3: Verify Rollout

### Wait for new pods to be ready:

```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  rollout status deployment/$APP_NAME \
  -n $NAMESPACE --timeout=120s
```

### On success:

Update `.sealos/state.json`:
- Set `last_deploy.image` to `NEW_IMAGE`
- Set `last_deploy.last_updated_at` to current ISO timestamp
- Append an entry to `history` (see Update History below)

Present to user:
```
✓ Updated: <APP_NAME>
✓ Image: <CURRENT_IMAGE> → <NEW_IMAGE>
✓ Rollout: complete

App URL: <APP_URL>

To update again later, run: /sealos-deploy
```

### On failure:

Auto-rollback:
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

---

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
      "method": "kubectl-apply",
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
| `method` | yes | kubectl command used: `kubectl-apply`, `kubectl-set-image`, `kubectl-set-env`, `kubectl-patch`, `kubectl-rollout-restart` |
| `image` | if image changed | New image reference |
| `previous_image` | if image changed | Image before the update |
| `changes` | if env/config changed | Array of changes (mask sensitive values: `sk-***`) |
| `note` | no | Free-text reason or context for the change |

### Rules

- **Always append, never rewrite** — history is append-only. Never delete or modify previous entries.
- **Mask secrets** — API keys, passwords, tokens: show only first 3 chars + `***` (e.g., `sk-***`).
- **Initial deploy counts** — the first entry should be `action: "deploy"` written by Phase 6 checkpoint.
- **Failed updates count** — record failures so the user can see what was attempted and why it didn't work.
- **Keep it bounded** — if history exceeds 50 entries, trim the oldest entries (keep the first `deploy` entry and the most recent 49).
