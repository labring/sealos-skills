---
name: sealos-deploy
description: Deploy workloads from GitHub or local source to Sealos Cloud. In DEPLOY mode, Phase 1 stops only when AI is certain the project cannot run on Sealos; every uncertain case continues silently into readiness scoring. Use when the user asks to deploy a repository to Sealos or another cloud platform, or invokes "/sealos-deploy".
metadata:
  author: labring
  compatibility: Sealos auth/workspace and kubectl access to the selected workspace are required before cloud resources are created. Docker, buildx, Node.js 18+, and gh CLI are required only when Phase 4 must build and push a local image to GHCR. git is required when cloning from a GitHub URL or when git metadata is needed. Repository-declared source materialization tools are conditional and installed only when the current checkout requires them. A complete Phase 6/6.5 run requires Node.js 18+; jq is needed only for the documented curl transport fallback. Phase 5 requires Python 3.8+ with PyYAML. kompose is required only for a Compose source; Helm CLI (Helm 3+) is required only for a Helm source.
---

# Sealos Deploy

## Compatibility

Sealos auth/workspace and kubectl access to the selected workspace are required
before cloud resources are created. Docker, buildx, Node.js 18+, and gh CLI are
required only when Phase 4 must build and push a local image to GHCR. git is
required when cloning from a GitHub URL or when git metadata is needed.
Repository-declared source materialization tools are conditional and installed
only when the current checkout requires them. A complete Phase 6/6.5 run
requires Node.js 18+; jq is needed only for the documented curl transport
fallback. Phase 5 requires Python 3.8+ with PyYAML. A Compose source
additionally requires kompose; a Helm source additionally requires Helm 3 or
newer. Native Kubernetes sources use the existing Python/PyYAML parser and do
not require another YAML CLI.


Deploy cloud workloads to Sealos Cloud. Phase 1 begins with an internal AI
judgment that has no separate artifact or report: obvious impossibility stops,
everything else proceeds into readiness scoring.

Treat the repository as the source boundary, not necessarily as one deployable
root application. Use project-owned evidence to find a reasonable online form,
including a child application, static site, documentation site, Storybook, or
example. Deterministic detectors and adapters provide evidence and common
transformations; they do not replace AI judgment or define which projects are
deployable.

After Phase 1 continues, a missing root runtime or a failed image, Dockerfile,
adapter, or build attempt rejects only that route, not the project. When
buildable source remains, inspect other project-backed routes and follow the
bounded Phase 4 → Phase 3 → Phase 4 repair loop before stopping.

## kubectl Safety Rules (all phases)

All kubectl commands MUST use the Sealos kubeconfig:
```
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify
```

Invoking this skill authorizes installation and configuration of dependencies
required by the selected deployment path. If a required tool is missing and
the skill can install it for the current platform, install it, re-run the
capability check, and stop only if installation or verification fails. Do not
install path-specific tools such as `kompose` or Helm until the deployment
source that requires them has been selected.

This also applies to tools required to materialize repository content. Do not
preinstall them for every run. After resolving the project, use repository
metadata and actual checkout state to discover the required mechanism, install
a trustworthy missing tool, obtain the current commit's content, and verify the
checkout before Phase 1. Git LFS and Git submodules are examples of this
general rule, not a closed support list.

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

1. `modules/preflight.md` — Environment checks, source materialization & Sealos auth
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
[2026-03-05 14:30:02] Source: ✓ current commit fully materialized (conditional tools: <none or tool names>)

[2026-03-05 14:30:03] === Phase 1: Assess ===
[2026-03-05 14:30:03] Score: 9/12 (good)
[2026-03-05 14:30:03] Language: python, Framework: fastapi, Port: 8000
[2026-03-05 14:30:03] Decision: CONTINUE

[2026-03-05 14:30:04] === Phase 1.5: Official Template Fast Path ===
[2026-03-05 14:30:04] Catalog: labring-actions/templates@kb-0.9
[2026-03-05 14:30:04] Exact: 0
[2026-03-05 14:30:04] Route: continue_standard_pipeline → Phase 2

[2026-03-05 14:30:04] === Phase 2: Discover Images and Topology ===
[2026-03-05 14:30:05] README: owner/frontend:latest → owner/frontend@sha256:<digest>
[2026-03-05 14:30:05] Compose: frontend + build-only api + postgres + redis retained
[2026-03-05 14:30:05] Decision: build api only → Phase 3

[2026-03-05 14:30:06] === Phase 3: Prepare Per-Service Build ===
[2026-03-05 14:30:06] Service: api; context: services/api
[2026-03-05 14:30:06] Dockerfile: services/api/Dockerfile (existing, preserved)

[2026-03-05 14:30:08] === Phase 4: Build & Push ===
[2026-03-05 14:30:08] Registry: ghcr.io (fixed; namespace: zhujingyang)
[2026-03-05 14:30:30] Build api: ✓ ghcr.io/zhujingyang/repo-api:20260305-143022-a1b2c3
[2026-03-05 14:30:32] Pull access: ghcr_secret_required — Phase 6 will create an app-scoped image pull Secret
[2026-03-05 14:30:33] IMAGE_REF=ghcr.io/zhujingyang/repo-api@sha256:<digest>

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
| `inspect-deployment-source.mjs` | `node inspect-deployment-source.mjs <work-dir>` | Select one Compose, Helm, Kubernetes, or implicit source route; safely render explicit Kubernetes topology and inventory its resources |
| `detect-image.mjs` | `node detect-image.mjs <github-url> [work-dir]` or `node detect-image.mjs <work-dir>` | Inventory declared images and explicit deployment-source topology, normalize declared per-service build plans, and resolve each exact selector to an immutable digest; an implicit result leaves service selection to AI |
| `build-push.mjs` | `node build-push.mjs <work-dir> <repo> [--service <name>] [--context <path>] [--dockerfile <path>] [--target <stage>] [--build-arg <NAME[=value]>]...` | Build one planned service for linux/amd64, push it to the lower-case current authenticated GitHub account namespace on GHCR, and write the Buildx digest plus pull-access handoff in its per-service result |
| `ensure-image-pull-secret.mjs` | `node ensure-image-pull-secret.mjs <namespace> <secret-name> <image-ref> [deployment-name]` | Create/update the app-scoped GHCR pull Secret after the lifecycle has proved that all non-anonymous service images share one GHCR namespace; the active GitHub account must match that namespace |
| `extract-deploy-app-name.mjs` | `printf '%s\n' "$DEPLOY_RESULT" \| node extract-deploy-app-name.mjs` | Extract and validate the server-generated Kubernetes application name from the sanitized Template API response before using it for Secret creation or runtime discovery |
| `sealos-state-bridge.mjs` | `node sealos-state-bridge.mjs restore\|persist --work-dir <dir> --github-url <url>` | Restore or persist a validated `state.json` for a temporary GitHub checkout without copying build artifacts or templates |
| `gh-refresh-scopes.mjs` | `node gh-refresh-scopes.mjs write:packages` | Refresh GHCR package access in the current TTY; `write:packages` is sufficient for both push and private pull in this workflow |
| `deploy-template.mjs` | `node deploy-template.mjs <template-path> [--dry-run] [--args-file <mode-0600-file>]` (`--args-json` only for confirmed non-sensitive values) | Resolve the current region from `~/.sealos/auth.json`, build the correct Template API URL, and post a local template YAML |
| `sealos-launchpad-network.mjs` | `node sealos-launchpad-network.mjs --app <app> --app-url <url> [--expected-port <port>] [--region <url>] [--kubeconfig <path>]` | Read-only Launchpad public-network discovery check with App URL and Service port matching |
| `sealos-footprint.mjs` | `node sealos-footprint.mjs --namespace <ns> --app <app>` | Read-only inventory of Instance/App/workloads/Jobs/KubeBlocks/PVCs for deploy debug and cleanup planning |
| `sealos-live-smoke.mjs` | `node sealos-live-smoke.mjs --url <url> [--captcha-path <path>] [--login-method json-token\|cookie-json] [--login-path <path>] [--username <user>] [--password <pass>] [--auth-path <path>]` | Read-only or credentialed HTTP smoke test for the real Sealos App entry URL |
| `sealos-log-scan.mjs` | `node sealos-log-scan.mjs --namespace <ns> --app <app> [--since 10m] [--tail 300] [--baseline <report.json\|json>] [--min-window-seconds 60]` | Read-only JSON scan of Pod/init/main logs, image pull and architecture signals, plus Warning Event convergence after readiness, login, and random 404 checks |
| `sealos-auth.mjs` | `node sealos-auth.mjs check\|login\|list\|switch` | Sealos Cloud authentication & workspace switching |

All scripts output JSON. Run via Bash and parse the result.

For public web applications, run `sealos-launchpad-network.mjs` before HTTP smoke. Acceptance requires `ok: true`, an open public network, the expected Service port, and an App URL host match. The script emits an allowlisted network summary and excludes raw Launchpad application data, environment variables, Secrets, and kubeconfig content.

Runtime Event acceptance uses two scans. Capture the first report after readiness with no baseline, wait at least 60 seconds, then pass that report through `--baseline` for the final scan. Extend `--min-window-seconds` to cover one full known reconciliation, probe, or scheduled-work period. An ordinary initial Warning Event is an observation; an image-architecture mismatch on a current unready workload or one that recurs after the baseline is blocking. After a successful rebuild, an unchanged old architecture Warning may converge to `historical-transient` against a fresh recovery baseline. A Warning that advances after the baseline, an unresolved referenced Secret, a Ready transition, a Pod replacement, or a restart delta is an active failure.

For intentional fault injection, retain a pre-injection report as evidence. After recovery reaches Ready, capture a fresh recovery baseline and compare the final scan against that recovery baseline after the full stability window.

## Internal Skill Dependencies

This skill references knowledge files from co-installed internal skills. These are **not** user-facing — they are loaded on-demand during specific phases.

`<SKILL_DIR>` refers to the directory containing this `SKILL.md`. Sibling skills are at `<SKILL_DIR>/../`:

```
<SKILL_DIR>/../
├── sealos-deploy/           ← this skill (user entry point) = <SKILL_DIR>
├── dockerfile-skill/        ← Phase 3: constrained Dockerfile analysis and generation knowledge
├── cloud-native-readiness/  ← Phase 1 entry judgment + assessment criteria
└── docker-to-sealos/       ← Phase 5: Sealos template rules
```

Paths used in pipeline.md follow the pattern:
```
<SKILL_DIR>/modules/dockerfile-integration.md
<SKILL_DIR>/../dockerfile-skill/knowledge/error-patterns.md
<SKILL_DIR>/../docker-to-sealos/references/sealos-specs.md
```

## Phase Overview

| Phase | Action | Skip When |
|-------|--------|-----------|
| 0 — Preflight | Capability scan, complete source materialization, path-specific warnings, Sealos auth | Initial blockers resolved |
| 1 — Assess | Find a reasonable project-backed online form; stop only when AI is certain deployment is impossible, otherwise continue silently into readiness scoring and record risks | Existing deployment → UPDATE path; low score does not reject |
| 1.5 — Official Template | A unique, source-aligned official `spec.gitRepo` match is reused verbatim and jumps to Phase 6; otherwise continue | No safe unique exact match → Phase 2 |
| 2 — Discover | Select the Compose, Helm, Kubernetes, or implicit source route; use detector output as evidence, let AI confirm the actual services, inventory the complete topology, and resolve reusable selectors to immutable digests | Every final container workload covered → Phase 5 |
| 3 — Prepare Build | Preserve or minimally prepare the exact context, Dockerfile, target, and build-argument names for each confirmed container workload still needing a build; do not assume the repository root is the application and do not build here | No final container workload needs a build |
| 4 — Build & Push | Build each missing final container workload for `linux/amd64` from its Phase 3 plan, route build-plan failures back to Phase 3, push successful results to the lower-case current GitHub account namespace on GHCR, and record the Buildx digest plus pull-access handoff | No final container workload needs a build |
| 5 — Template | Prefer the source adapter, or generate an equivalent canonical template when the adapter cannot express the confirmed deployment; preserve complete topology, prefer KubeBlocks for supported non-external databases, and pass the same quality gate | — |
| 5.5 — Configure | Validate the generated template, resolve its configuration, summarize the deploy, and obtain confirmation | Official-template fast path |
| 6 — Deploy | Resolve any official-template inputs, dry-run, then deploy to Sealos Cloud | — |
| 6.5 — Runtime Truth Pass | Verify Launchpad public networking, the actual Sealos runtime, logs, Event convergence, App URL, login path, object-storage flow, and resource footprint | — |

## Decision Flow

```
Input (GitHub URL / local path)
  │
  ▼
[Phase 0] Preflight + complete source materialization ── fail → guide user to fix and STOP
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
        └── [Phase 2] AI confirms services; inventory     │
                      images + full topology               │
              ├── every container has digest ─────┐      │
              └── one or more containers need build │      │
                    ▼                               │      │
                  [Phase 3] Build plan per service  │      │
                    ▼                               │      │
                  [Phase 4] Build, push, digest     │      │
                    │ build-plan failure → Phase 3  │      │
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
[Phase 6.5] Runtime Truth Pass ── network/runtime/log/login/rare image architecture issue → diagnose and recover
│
▼
Done — app deployed ✓
```

**Execution rule:** Phase 1 must never start while Phase 0 still has unresolved entry blockers or the current source is not fully materialized. Docker, Node.js 18+, `gh`, builder, and GHCR failures must be reported early, but only become hard blockers if the run later requires Phase 4 local build/push. An inaccessible declared image or Dockerfile base image is not by itself a project-level blocker while a trustworthy source build remains.
