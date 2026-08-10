---
name: sealos-deploy
description: >-
  Deploy or update cloud workloads from GitHub or local source to Sealos Cloud.
  Run Phase 1 blacklist (STOP only when both cloud-deploy blockers are 100%
  confirmed) and official-template exact match. Run the default Runtime Truth
  Pass on the App URL, public route, auth flow, logs, database state, and
  resource footprint. Use for deploy, update, Runtime Truth verify, footprint or
  log debug, env configure, or cleanup of a Sealos deploy after user
  confirmation, and when the user invokes "/sealos-deploy".
compatibility: >-
  Sealos auth/workspace are required for deploys. Docker, buildx, and gh CLI are
  required only when the selected path needs local build/push. git is required
  when cloning from a GitHub URL or when git metadata is needed. Node.js 22+
  is required for Phase 5 (`server-dry-run.ts`; run `npm install` under
  `skills/sealos-deploy`). Root Compose conversion also requires Python/PyYAML
  and kompose. Floating image tags can also require crane.
metadata:
  author: labring
---

# Sealos Deploy

This skill deploys cloud workloads to Sealos Cloud. Phase 1 stops only when the blacklist is 100% confirmed.

`<SKILL_DIR>` is the directory that contains this `SKILL.md`.

## Usage

```
/sealos-deploy <github-url>
/sealos-deploy                    # deploy current project
/sealos-deploy <local-path>
```

## Safety

All `kubectl` commands must use the Sealos kubeconfig:

```
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify
```

If `docker`, `gh`, or `kubectl` is missing and this skill can install it, ask the user first. Run the install only after the user replies `y`.

WARNING: Before you delete any cluster resource, ask the user to reply `y` or `n`.

```
WARNING: About to delete <resource kind>/<resource name>. This data cannot be recovered. Confirm? (y/n)
```

If the user does not reply `y`, stop.

Template API deploys create `instances.app.sealos.io/<app-name>`. Cleanup must include that Instance CR. For delete order and inventory commands, read `references/cleanup.md`.

## Intent routing

Select the intent before you run Phase 0. Load only the files for that intent.

| Intent | User asks for | Load | Do not load by default |
|--------|---------------|------|------------------------|
| **deploy** | deploy, ship, `/sealos-deploy` | `modules/pipeline.md` (deploy chain from Phase 0) | — |
| **update** | update the running app, rebuild and roll out | `modules/phase-0.md` → `modules/mode.md` → `modules/update.md` → `modules/phase-7.md` | Phase 1 assess, unless the Update Path requires it |
| **verify** | Runtime Truth, accept the App URL, smoke test | Sealos auth and kubectl as needed → `modules/phase-7.md` | Phase 1–6 modules |
| **debug** | logs, footprint, why it failed | `references/scripts.md` helpers plus relevant parts of `modules/phase-7.md` | rebuild or redeploy, unless the user asks to fix and redeploy |
| **configure** | env vars, ports, template inputs | `modules/phase-5.md` | Phase 1–4 modules, unless config forces a rebuild |
| **cleanup** | delete this deploy or test instance | Safety above → `references/cleanup.md` (run footprint first) | the deploy path |

Routing rules:

1. Select the intent before you run Phase 0.
2. If the intent is not clear, ask one question.
3. If the user does not answer, use **deploy**.
4. If the request needs deploy and verify, run **deploy**, then Phase 7.
5. Load one module first. Load a second file only when the task needs it.
6. For deploy and update logging detail, read `references/logging.md`.

## When to run Phase 0

| Intent | Phase 0 |
|--------|-----------|
| **deploy** / **update** | Full `modules/phase-0.md` |
| **verify** / **debug** / **cleanup** | Sealos auth and kubeconfig or kubectl only as the task needs |
| **configure** | Auth plus enough state to read or write the needed config |

## Logging (short)

For **deploy** and **update**:

1. Create one log at `~/.sealos/logs/deploy-<YYYYMMDD-HHmmss>.log` at the start.
2. Append with `>>` to that same file. Do not create a second log.
3. Append a short line at each phase boundary.
4. At the end, tell the user the log path.

Full examples live in `references/logging.md`.

## Common operations

Scripts live in `<SKILL_DIR>/scripts/`. They print JSON. Run them with Bash, then parse stdout.

```bash
node "<SKILL_DIR>/scripts/phase-0/check-running-environment.mjs"
node "<SKILL_DIR>/scripts/validate-phase-0.mjs" --dir "$WORK_DIR"
npx -y sealos-cli@latest whoami
node "<SKILL_DIR>/scripts/validate-phase-1.mjs" --dir "$WORK_DIR"
node "<SKILL_DIR>/scripts/validate-phase-2.mjs" --dir "$WORK_DIR"
node "<SKILL_DIR>/scripts/build-push.mjs" "$WORK_DIR" "$REPO" --mode build
node "<SKILL_DIR>/scripts/build-push.mjs" "$WORK_DIR" "$REPO" --mode push --registry ghcr
node "<SKILL_DIR>/scripts/validate-phase-3.mjs" --dir "$WORK_DIR"
node "<SKILL_DIR>/scripts/validate-phase-4.mjs" --dir "$WORK_DIR"
node "<SKILL_DIR>/scripts/validate-phase-5.mjs" --dir "$WORK_DIR"
# Phase 5 precheck (requires TARGET_* and cloud domain / cert secret; npm install in skills/sealos-deploy):
# node --experimental-strip-types "<SKILL_DIR>/scripts/server-dry-run.ts" --template ... --context ... --namespace ...
node "<SKILL_DIR>/scripts/deploy-template.mjs" "$WORK_DIR/.sealos/template/index.yaml" --args-file "$DEPLOY_ARGS_FILE"
node "<SKILL_DIR>/scripts/validate-phase-6.mjs" --dir "$WORK_DIR"
node "<SKILL_DIR>/scripts/sealos-footprint.mjs" --namespace "$NS" --app "$APP"
node "<SKILL_DIR>/scripts/sealos-launchpad-network.mjs" --app "$APP" --app-url "$URL"
node "<SKILL_DIR>/scripts/sealos-live-smoke.mjs" --url "$URL"
node "<SKILL_DIR>/scripts/sealos-log-scan.mjs" --namespace "$NS" --app "$APP"
```

For the full script list, Launchpad network rules, and Event baseline rules, read `references/scripts.md`.

## Sibling skills

Load these on demand during pipeline phases. They are not separate user entry points.

| Path | Use for |
|------|---------|
| `<SKILL_DIR>/../dockerfile-skill/` | Phase 2 Dockerfile preparation |
| `<SKILL_DIR>/../k8s-kaniko-job/` | Phase 3 sandbox build+push to GHCR |
| `<SKILL_DIR>/../docker-to-sealos/` | Phase 4 Sealos template |

`cloud-native-readiness` is an adjacent standalone skill. It is not part of the
deploy Phase 1 path.

## Phase map (deploy intent)

This map applies to **deploy** (DEPLOY mode). For other intents, use the Intent routing table.

| Phase | Module | Skip when |
|-------|--------|-----------|
| 0 — Preflight | `modules/phase-0.md` | Entry blockers are clear |
| — Artifacts / mode | `modules/artifacts.md`, `modules/mode.md` | UPDATE → `modules/update.md` |
| 1 — Assess | `modules/phase-1.md` | Blacklist 100% STOP; official-template fast path may skip Phase 2–4 |
| 2 — Discover / image prep | `modules/phase-2.md` | Official fast path skipped Phase 2 |
| 3 — Build & Push | `modules/phase-3.md` | No build targets → pass through to Phase 4 |
| 4 — Template | `modules/phase-4.md` | Official fast path skipped Phase 4 |
| 5 — Prepare | `modules/phase-5.md` | Official fast path still runs prepare after template fetch |
| 6 — Deploy | `modules/phase-6.md` | — |
| 7 — Post-deploy | `modules/phase-7.md` | User asks for deploy-only output |

Load order and UPDATE branching live in `modules/pipeline.md`.

```
Input (GitHub URL / local path)
  │
  ▼
[Phase 0] Preflight ── fail → guide user to fix and STOP
  │ pass
  ▼
[Phase 1] Assess (blacklist + official_template)
  │
  ├── official fast path ────────────────┐
  │                                      │
  ▼                                      │
[Phase 2] Discover + deployment-plan     │
  │                                      │
  ▼                                      │
[Phase 3] Build & Push (or pass-through) │
  │                                      │
  ▼                                      │
[Phase 4] Generate Sealos Template       │
  ◄──────────────────────────────────────┘
  │
  ▼
[Phase 5] Pre-deploy preparation
  │
  ▼
[Phase 6] Deploy ── 401 → re-auth / 409 → instance exists
  │
  ▼
[Phase 7] Runtime Truth Pass
  │
  ▼
Done
```

Do not start Phase 1 while Phase 0 still has unresolved **entry** blockers (`missing_required`, identity, or source). Report Docker, `gh`, builder, registry, kubectl, and template-tool gaps early as deferred. Treat those as hard blockers only when the selected path needs them (local build/push, GHCR, Compose/Helm template generation, or deploy/verify).

## Composition

- **First deploy**: deploy intent end to end, then Runtime Truth.
- **Fix a failure**: debug (logs or footprint), then configure or update as needed, then verify.
- **Delete a test app**: cleanup only, after user confirmation.

Return one response that covers the steps you ran. Do not ask the user to invoke each step as a separate skill call.

## Response format

For operational replies, state:

1. What you did (action and scope).
2. The result (IDs, status, key output).
3. What to do next, or that the task is complete.

Keep the reply short. Include command evidence only when it helps the user.

## Pointers

| Path | Contents |
|------|----------|
| `modules/pipeline.md` | Deploy/update load-order orchestrator |
| `modules/phase-0.md` | Phase 0 preflight |
| `modules/artifacts.md` | `.sealos/` layout and schemas |
| `modules/mode.md` | DEPLOY vs UPDATE, resume |
| `modules/phase-1.md` | Phase 1 blacklist, official_template, fast path |
| `modules/phase-2.md` | Phase 2 scout, deployment-plan, image prep |
| `modules/phase-3.md` | Phase 3 build and push |
| `modules/phase-4.md` | Phase 4 template |
| `modules/phase-5.md` | Phase 5 pre-deploy preparation |
| `modules/phase-6.md` | Phase 6 deploy and deploy-result |
| `modules/phase-7.md` | Phase 7 Runtime Truth and state.json |
| `modules/update.md` | UPDATE path |
| `references/logging.md` | Full deploy log examples |
| `references/scripts.md` | Full script catalog and Event rules |
| `references/cleanup.md` | Delete order and Instance CR rules |
| `schemas/` | `.sealos` artifact schemas |
