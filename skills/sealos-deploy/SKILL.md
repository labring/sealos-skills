---
name: sealos-deploy
description: Deploy workloads from GitHub or local source to Sealos Cloud. In DEPLOY mode, Phase 1 stops only when AI is certain the project cannot run on Sealos; every uncertain case continues silently into readiness scoring. Use when the user asks to deploy a repository to Sealos or another cloud platform, or invokes "/sealos-deploy".
metadata:
  author: labring
  compatibility: Sealos auth/workspace and kubectl access to the selected workspace are required before cloud resources are created. Docker, buildx, and gh CLI are required only when the selected path needs local build/push. git is required when cloning from a GitHub URL or when git metadata is needed. Phase 6 requires either Node.js 18+ or jq. Phase 5 requires Python 3.8+ with PyYAML; root Compose conversion also requires kompose and may require crane when image tags are floating.
---

# Sealos Deploy

## Compatibility

Sealos auth/workspace and kubectl access to the selected workspace are required
before cloud resources are created. Docker, buildx, and gh CLI are required
only when the selected path needs local build/push. git is required when cloning
from a GitHub URL or when git metadata is needed. Phase 6 requires either
Node.js 18+ or jq. Phase 5 requires Python 3.8+ with PyYAML; root Compose
conversion also requires kompose and may require crane when image tags are
floating.


Deploy cloud workloads to Sealos Cloud. Phase 1 begins with an internal AI
judgment that has no separate artifact or report: obvious impossibility stops,
everything else proceeds into readiness scoring.

## kubectl Safety Rules (all phases)

All kubectl commands MUST use the Sealos kubeconfig:
```
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify
```

System tool installation requires user confirmation. If `docker`, `gh`, or `kubectl` is missing and the skill can install it for the current platform, ask first and only run the install command after the user explicitly replies `y`.

**`kubectl delete` requires user confirmation.** Before deleting any resource (deployment, service, ingress, PVC, database, etc.), always ask:
```
WARNING: About to delete <resource kind>/<resource name>. This data cannot be recovered. Confirm? (y/n)
```
Only proceed after user confirms. This applies even if the pipeline logic suggests deletion — always ask first.

**Template API cleanup must include Instance CRs.** Deployments created through `scripts/deploy-template.mjs` create `instances.app.sealos.io/<app-name>` in addition to App/workload resources. A cleanup is incomplete until `instances.app.sealos.io`, `apps.app.sealos.io`, workloads, Services, Ingresses, PVCs, and Pods are all checked.

Use this check when cleaning Template API test deployments:
```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify -n "$NS" \
  get instances.app.sealos.io,app,statefulset,deployment,svc,ingress,pvc,pod | grep "$APP"
```

Delete in this order after confirmation:
```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify -n "$NS" delete instances.app.sealos.io "$APP" --ignore-not-found --wait=false
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify -n "$NS" delete app "$APP" --ignore-not-found --wait=false
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify -n "$NS" delete statefulset "$APP" --ignore-not-found --wait=false
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify -n "$NS" delete deployment "$APP" --ignore-not-found --wait=false
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify -n "$NS" delete ingress "$APP" --ignore-not-found --wait=false
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify -n "$NS" delete svc "$APP" --ignore-not-found --wait=false
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify -n "$NS" get pvc -o name | grep "$APP" | while read -r PVC; do
  KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify -n "$NS" delete "$PVC" --ignore-not-found --wait=false
done
```

Anti-example: do not report cleanup complete after only checking `app,statefulset,svc,ingress,pvc,pod`; that misses `instances.app.sealos.io/<app-name>` and leaves the Sealos Instance layer dirty.

## Usage

```
/sealos-deploy <github-url>
/sealos-deploy                    # deploy current project
/sealos-deploy <local-path>
```

## Quick Start

Execute the modules in order:

1. `modules/preflight.md` — Environment checks & Sealos auth
2. `modules/pipeline.md` — Full deployment pipeline (Phase 1–6)
3. `modules/runtime-truth.md` — Post-deploy Runtime Truth Pass (Phase 6.5)

## Logging

Every run MUST write a log file at `~/.sealos/logs/deploy-<YYYYMMDD-HHmmss>.log`.

**At the very start of execution**, create the log file **once**:
```bash
mkdir -p ~/.sealos/logs
LOG_FILE=~/.sealos/logs/deploy-$(date +%Y%m%d-%H%M%S).log
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deploy started" > "$LOG_FILE"
```

**Important: create the log file ONLY ONCE at the start. All subsequent writes MUST append (`>>`) to this same `$LOG_FILE`. Do NOT create a second log file.**

**At each phase boundary**, append a log entry to the same file with Bash `>>`:
```
[2026-03-05 14:30:01] === Phase 0: Preflight ===
[2026-03-05 14:30:01] Docker: ✓ 27.5.1
[2026-03-05 14:30:01] Node.js: ✓ 22.12.0
[2026-03-05 14:30:02] Sealos auth: ✓ (region: <REGION from config.json>)
[2026-03-05 14:30:02] Project: /Users/dev/myapp (github: https://github.com/owner/repo)

[2026-03-05 14:30:03] === Phase 1: Assess ===
[2026-03-05 14:30:03] Score: 9/12 (good)
[2026-03-05 14:30:03] Language: python, Framework: fastapi, Port: 8000
[2026-03-05 14:30:03] Decision: CONTINUE

[2026-03-05 14:30:04] === Phase 1.5: Official Template Fast Path ===
[2026-03-05 14:30:04] Catalog: labring-actions/templates@kb-0.9
[2026-03-05 14:30:04] Exact: 0
[2026-03-05 14:30:04] Route: continue_standard_pipeline → Phase 2

[2026-03-05 14:30:04] === Phase 2: Detect Image ===
[2026-03-05 14:30:05] Docker Hub: owner/repo:latest (arm64 only, no amd64)
[2026-03-05 14:30:05] GHCR: not found
[2026-03-05 14:30:05] Decision: no amd64 image → continue to Phase 3

[2026-03-05 14:30:06] === Phase 3: Dockerfile ===
[2026-03-05 14:30:06] Existing Dockerfile: none
[2026-03-05 14:30:07] Generated: python-fastapi template, port 8000

[2026-03-05 14:30:08] === Phase 4: Build & Push ===
[2026-03-05 14:30:08] Registry: ghcr (auto-detected via gh CLI)
[2026-03-05 14:30:30] Build: ✓ ghcr.io/zhujingyang/repo:20260305-143022
[2026-03-05 14:30:32] GHCR pullability: private package detected — deploy will auto-create image pull Secret from gh CLI
[2026-03-05 14:30:33] IMAGE_REF=ghcr.io/zhujingyang/repo:20260305-143022

[2026-03-05 14:30:34] === Phase 5: Template ===
[2026-03-05 14:30:35] Output: .sealos/template/index.yaml

[2026-03-05 14:30:36] === Phase 5.5: Configure ===
[2026-03-05 14:30:37] Final template gate: ✓; deployment confirmed

[2026-03-05 14:30:38] === Phase 6: Deploy ===
[2026-03-05 14:30:38] Dry-run: ✓
[2026-03-05 14:30:40] Status: 201 — resources created; runtime verification pending
[2026-03-05 14:30:41] === Phase 6.5: Runtime Truth Pass ===
[2026-03-05 14:31:42] Status: verified — app is usable
[2026-03-05 14:31:42] === DONE ===
```

When Phase 1.5 selects a unique official template, log the short route instead:
```
[2026-03-05 14:30:04] Exact: 1
[2026-03-05 14:30:04] Route: deploy_official_template → Phase 6
[2026-03-05 14:30:04] Template: <name>@<catalog-commit>
```

**On error**, log the error details before stopping:
```
[2026-03-05 14:30:10] === ERROR ===
[2026-03-05 14:30:10] Phase: 4 (Build & Push)
[2026-03-05 14:30:10] Error: docker buildx build failed — "npm ERR! Missing script: build"
[2026-03-05 14:30:10] Retry: 1/3
```

**At the very end**, tell the user where the log is:
```
Log saved to: ~/.sealos/logs/deploy-20260305-143001.log
```

## Scripts

Located in `scripts/` within this skill directory (`<SKILL_DIR>/scripts/`):

| Script | Usage | Purpose |
|--------|-------|---------|
| `score-model.mjs` | `node score-model.mjs <repo-dir>` | Deterministic readiness scoring (0-12) |
| `find-template-references.mjs` | `node find-template-references.mjs --work-dir <repo-dir> --skill-dir <SKILL_DIR> --analysis <analysis.json> --reuse-official-template <true\|false> [--github-url <url>] [--catalog-dir <dir>]` | Select a remotely verified unique exact official template for the Phase 6 fast path, or continue the standard pipeline; `--catalog-dir` is matching-only for tests/offline inspection |
| `validate-artifacts.mjs` | `node validate-artifacts.mjs --dir <work-dir>` | Validate `.sealos` JSON artifacts against enforced schemas |
| `detect-image.mjs` | `node detect-image.mjs <github-url> [work-dir]` or `node detect-image.mjs <work-dir>` | Detect existing Docker/GHCR images |
| `build-push.mjs` | `node build-push.mjs <work-dir> <repo> [--registry ghcr\|dockerhub] [--user <user>]` | Build amd64 image & push to the selected registry (Docker Hub path assumes a public image at deploy time; omitting `--registry` keeps auto-detect behavior) |
| `ensure-image-pull-secret.mjs` | `node ensure-image-pull-secret.mjs <namespace> <secret-name> <image-ref> [deployment-name]` | Create/update app-scoped GHCR pull Secret and optionally patch an existing Deployment to reference it |
| `gh-refresh-scopes.mjs` | `node gh-refresh-scopes.mjs write:packages` | Refresh GHCR package access in the current TTY; `write:packages` is sufficient for both push and private pull in this workflow |
| `deploy-template.mjs` | `node deploy-template.mjs <template-path> [--dry-run] [--args-file <mode-0600-file>]` (`--args-json` only for confirmed non-sensitive values) | Resolve the current region from `~/.sealos/auth.json`, build the correct Template API URL, and post a local template YAML |
| `sealos-launchpad-network.mjs` | `node sealos-launchpad-network.mjs --app <app> --app-url <url> [--expected-port <port>] [--region <url>] [--kubeconfig <path>]` | Read-only Launchpad public-network discovery check with App URL and Service port matching |
| `sealos-footprint.mjs` | `node sealos-footprint.mjs --namespace <ns> --app <app>` | Read-only inventory of Instance/App/workloads/Jobs/KubeBlocks/PVCs for deploy debug and cleanup planning |
| `sealos-live-smoke.mjs` | `node sealos-live-smoke.mjs --url <url> [--captcha-path <path>] [--login-method json-token\|cookie-json] [--login-path <path>] [--username <user>] [--password <pass>] [--auth-path <path>]` | Read-only or credentialed HTTP smoke test for the real Sealos App entry URL |
| `sealos-log-scan.mjs` | `node sealos-log-scan.mjs --namespace <ns> --app <app> [--since 10m] [--tail 300] [--baseline <report.json\|json>] [--min-window-seconds 60]` | Read-only JSON scan of Pod/init/main logs plus Warning Event convergence after readiness, login, and random 404 checks |
| `sealos-auth.mjs` | `node sealos-auth.mjs check\|login\|list\|switch` | Sealos Cloud authentication & workspace switching |

All scripts output JSON. Run via Bash and parse the result.

For public web applications, run `sealos-launchpad-network.mjs` before HTTP smoke. Acceptance requires `ok: true`, an open public network, the expected Service port, and an App URL host match. The script emits an allowlisted network summary and excludes raw Launchpad application data, environment variables, Secrets, and kubeconfig content.

Runtime Event acceptance uses two scans. Capture the first report after readiness with no baseline, wait at least 60 seconds, then pass that report through `--baseline` for the final scan. Extend `--min-window-seconds` to cover one full known reconciliation, probe, or scheduled-work period. An initial Warning Event is an observation; a Warning that advances after the baseline, an unresolved referenced Secret, a Ready transition, a Pod replacement, or a restart delta is an active failure.

For intentional fault injection, retain a pre-injection report as evidence. After recovery reaches Ready, capture a fresh recovery baseline and compare the final scan against that recovery baseline after the full stability window.

## Internal Skill Dependencies

This skill references knowledge files from co-installed internal skills. These are **not** user-facing — they are loaded on-demand during specific phases.

`<SKILL_DIR>` refers to the directory containing this `SKILL.md`. Sibling skills are at `<SKILL_DIR>/../`:

```
<SKILL_DIR>/../
├── sealos-deploy/           ← this skill (user entry point) = <SKILL_DIR>
├── dockerfile-skill/        ← Phase 3: Dockerfile generation knowledge
├── cloud-native-readiness/  ← Phase 1 entry judgment + assessment criteria
└── docker-to-sealos/       ← Phase 5: Sealos template rules
```

Paths used in pipeline.md follow the pattern:
```
<SKILL_DIR>/../dockerfile-skill/knowledge/error-patterns.md
<SKILL_DIR>/../dockerfile-skill/templates/<lang>.dockerfile
<SKILL_DIR>/../docker-to-sealos/references/sealos-specs.md
```

## Phase Overview

| Phase | Action | Skip When |
|-------|--------|-----------|
| 0 — Preflight | Capability scan, path-specific warnings, Sealos auth | Initial blockers resolved |
| 1 — Assess | Stop only when AI is certain deployment is impossible; otherwise continue silently into readiness scoring and record risks | Existing deployment → UPDATE path; low score does not reject |
| 1.5 — Official Template | A unique, source-aligned official `spec.gitRepo` match is reused verbatim and jumps to Phase 6; otherwise continue | No safe unique exact match → Phase 2 |
| 2 — Detect | Find existing image (Docker Hub / GHCR / README) | Found → jump to Phase 5 |
| 3 — Dockerfile | Inspect and repair an existing Dockerfile, or generate one when missing | Phase 2 found a reusable image |
| 4 — Build & Push | `docker buildx` → GHCR (auto via gh CLI) or Docker Hub (fallback) | — |
| 5 — Template | Generate Sealos application template | — |
| 5.5 — Configure | Validate the generated template, resolve its configuration, summarize the deploy, and obtain confirmation | Official-template fast path |
| 6 — Deploy | Resolve any official-template inputs, dry-run, then deploy to Sealos Cloud | — |
| 6.5 — Runtime Truth Pass | Verify Launchpad public networking, the actual Sealos runtime, logs, Event convergence, App URL, login path, object-storage flow, and resource footprint | — |

## Decision Flow

```
Input (GitHub URL / local path)
  │
  ▼
[Phase 0] Preflight ── fail → guide user to fix and STOP
  │ pass
  ▼
[Mode Detection]
  ├── existing deployment → UPDATE path (U1–U3) → Done
  └── DEPLOY
  │
  ▼
[Phase 1] Assess
  ├── opening judgment: certainly impossible → STOP with a short reason
  └── otherwise: no separate output → score and record risks
  │ low score still continues
  │
  ▼
[Phase 1.5] Official template lookup
  ├── unique safe exact match
  │     └── reuse official YAML verbatim
  │         └── skip Phase 2, 3, 4, 5, and 5.5 ───────────┐
  │                                                        │
  └── no safe unique exact match                           │
        └── [Phase 2] Detect image                         │
              ├── found (amd64) ────────────────────┐      │
              └── not found                         │      │
                    ▼                               │      │
                  [Phase 3] Dockerfile              │      │
                    ▼                               │      │
                  [Phase 4] Build & Push            │      │
                    └───────────────────────────────┘      │
                              ▼                            │
                  [Phase 5] Generate Template              │
                              ▼                            │
                  [Phase 5.5] Configure                    │
                              └────────────────────────────┤
                                                           ▼
[Phase 6] Resolve template inputs → dry-run → deploy ── 401 → re-auth
│                                  409 → instance exists
▼
[Phase 6.5] Runtime Truth Pass ── network/runtime/log/login issue → debug template or runtime config
│
▼
Done — app deployed ✓
```

**Execution rule:** Phase 1 must never start while Phase 0 still has unresolved entry blockers. Docker, `gh`, builder, and registry failures must be reported early, but only become hard blockers if the run later requires local build/push.
