---
name: sealos-deploy
description: >-
  Deploy or update compatible server, static-web, worker, scheduled-job, or
  reviewed remote-desktop workloads from GitHub or local source to Sealos Cloud.
  Run the default Runtime Truth Pass on the App URL, public route, auth flow,
  logs, database state, and resource footprint. Reject unsupported desktop,
  mobile, CLI, library, extension, hardware-dependent, mixed, and unidentified
  targets before readiness scoring or build. Use for deploy, update, Runtime
  Truth verify, footprint or log debug, env configure, or cleanup of a Sealos
  deploy after user confirmation, and when the user invokes "/sealos-deploy".
compatibility: >-
  Sealos auth/workspace are required for deploys. Docker, buildx, and gh CLI are
  required only when the selected path needs local build/push. git is required
  when cloning from a GitHub URL or when git metadata is needed. Node.js 18+
  remains an optional accelerator. Phase 5 requires Python 3.8+ with PyYAML.
  Root Compose conversion also requires kompose. Floating image tags can also
  require crane.
metadata:
  author: labring
---

# Sealos Deploy

This skill deploys compatible cloud workloads to Sealos Cloud. It stops unsupported targets before build or deploy.

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

Select the intent before you run preflight. Load only the files for that intent.

| Intent | User asks for | Load | Do not load by default |
|--------|---------------|------|------------------------|
| **deploy** | deploy, ship, `/sealos-deploy` | `modules/preflight.md` → `modules/pipeline.md` (deploy chain) | — |
| **update** | update the running app, rebuild and roll out | `modules/preflight.md` → `modules/mode.md` → `modules/update.md` → `modules/runtime-truth.md` | eligibility and full assess, unless the Update Path requires them |
| **verify** | Runtime Truth, accept the App URL, smoke test | Sealos auth and kubectl as needed → `modules/runtime-truth.md` | Phase modules in the deploy chain |
| **debug** | logs, footprint, why it failed | `references/scripts.md` helpers plus relevant parts of `modules/runtime-truth.md` | rebuild or redeploy, unless the user asks to fix and redeploy |
| **configure** | env vars, ports, template inputs | `modules/configure.md` | Phase 1–4 modules, unless config forces a rebuild |
| **cleanup** | delete this deploy or test instance | Safety above → `references/cleanup.md` (run footprint first) | the deploy path |

Routing rules:

1. Select the intent before you run preflight.
2. If the intent is not clear, ask one question.
3. If the user does not answer, use **deploy**.
4. If the request needs deploy and verify, run **deploy**, then Runtime Truth.
5. Load one module first. Load a second file only when the task needs it.
6. For deploy and update logging detail, read `references/logging.md`.

## When to run preflight

| Intent | Preflight |
|--------|-----------|
| **deploy** / **update** | Full `modules/preflight.md` |
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
node "<SKILL_DIR>/scripts/sealos-auth.mjs" check
node "<SKILL_DIR>/scripts/workload-eligibility.mjs" "$WORK_DIR"
node "<SKILL_DIR>/scripts/detect-image.mjs" "$WORK_DIR"
node "<SKILL_DIR>/scripts/build-push.mjs" "$WORK_DIR" "$REPO"
node "<SKILL_DIR>/scripts/deploy-template.mjs" "$WORK_DIR/.sealos/template/index.yaml"
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
| `<SKILL_DIR>/../cloud-native-readiness/` | Phase 0.4 eligibility and Phase 1 assess |
| `<SKILL_DIR>/../dockerfile-skill/` | Phase 3 Dockerfile |
| `<SKILL_DIR>/../docker-to-sealos/` | Phase 5 Sealos template |

## Phase map (deploy intent)

This map applies to **deploy** (DEPLOY mode). For other intents, use the Intent routing table.

| Phase | Module | Skip when |
|-------|--------|-----------|
| 0 — Preflight | `modules/preflight.md` | Entry blockers are clear |
| 0.4 — Eligibility | `modules/eligibility.md` | Any non-eligible result → stop |
| — Artifacts / mode | `modules/artifacts.md`, `modules/mode.md` | UPDATE → `modules/update.md` |
| 0.5 — Template Fast Path | `modules/template-fast-path.md` | No match, or template YAML cannot materialize |
| 1 — Assess | `modules/assess.md` | Score too low → stop |
| 2 — Detect | `modules/detect-image.md` | Existing amd64 image → jump to Phase 5 |
| 3 — Dockerfile | `modules/dockerfile.md` | Dockerfile already exists → skip |
| 4 — Build & Push | `modules/build-push.md` | — |
| 5 — Template | `modules/template.md` | — |
| 5.5 — Configure | `modules/configure.md` | No inputs needed |
| 6 — Deploy | `modules/deploy.md` | — |
| 6.5 — Runtime Truth | `modules/runtime-truth.md` | User asks for deploy-only output |

Load order and UPDATE branching live in `modules/pipeline.md`.

```
Input (GitHub URL / local path)
  │
  ▼
[Phase 0] Preflight ── fail → guide user to fix and STOP
  │ pass
  ▼
[Phase 0.5] Template fast path
  │
  ├── materialized template match ───────┐
  │                                      │
  ▼                                      │
[Phase 1] Assess ── not suitable → STOP  │
  │ suitable                             │
  ▼                                      │
[Phase 2] Detect existing image          │
  │                                      │
  ├── found (amd64) ────────────────────┐│
  │                                     ││
  ▼                                     ││
[Phase 3] Dockerfile                    ││
  │                                     ││
  ▼                                     ││
[Phase 4] Build & Push                  ││
  │                                     ││
  ◄─────────────────────────────────────┘│
  │                                      │
  ▼                                      │
[Phase 5] Generate Sealos Template       │
  ◄──────────────────────────────────────┘
  │
  ▼
[Phase 5.5] Configure
  │
  ▼
[Phase 6] Deploy ── 401 → re-auth / 409 → instance exists
  │
  ▼
[Phase 6.5] Runtime Truth Pass
  │
  ▼
Done
```

Do not start Phase 1 while Phase 0 still has unresolved entry blockers. Report Docker, `gh`, builder, and registry failures early. Treat them as hard blockers only when the run needs local build or push.

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
| `modules/preflight.md` | Phase 0 preflight |
| `modules/pipeline.md` | Deploy/update load-order orchestrator |
| `modules/eligibility.md` | Phase 0.4 |
| `modules/artifacts.md` | `.sealos/` layout and schemas |
| `modules/mode.md` | DEPLOY vs UPDATE, resume |
| `modules/template-fast-path.md` | Phase 0.5 |
| `modules/assess.md` | Phase 1 |
| `modules/detect-image.md` | Phase 2 |
| `modules/dockerfile.md` | Phase 3 |
| `modules/build-push.md` | Phase 4 |
| `modules/template.md` | Phase 5 |
| `modules/configure.md` | Phase 5.5 |
| `modules/deploy.md` | Phase 6, state, success output |
| `modules/update.md` | UPDATE path |
| `modules/runtime-truth.md` | Phase 6.5 acceptance |
| `references/logging.md` | Full deploy log examples |
| `references/scripts.md` | Full script catalog and Event rules |
| `references/cleanup.md` | Delete order and Instance CR rules |
| `schemas/` | `.sealos` artifact schemas |
