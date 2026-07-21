---
name: sealos-deploy
description: Prepare and build compatible server, static-web, worker, scheduled-job, or reviewed remote-desktop workloads for Sealos Cloud inside a sandboxed workflow. Reject unsupported desktop, mobile, CLI, library, extension, hardware-dependent, mixed, and unidentified targets before readiness scoring or build. For eligible workloads, optionally use Railpack to strengthen build-environment detection, detect reusable images, reuse or generate Dockerfiles, resolve image builds through a sandbox kaniko Job when needed, and create Sealos templates. Use when user says "deploy to sealos", "prepare this project for sealos", or asks to containerize a project for Sealos. Also triggers on "/sealos-deploy".
compatibility: git is required. Node.js 18+ is recommended for helper scripts. railpack is an optional build-environment detector. kubectl, VersityGW S3 settings, and GITHUB_TOKEN are required when the pipeline needs a Kubernetes kaniko build. Build-time Kubernetes access uses the sandbox-provided kubeconfig and current service account in the active namespace.
metadata:
  author: labring
---

# Sealos Deploy

Prepare a compatible cloud workload from the current workspace or a GitHub project
for Sealos Cloud, stopping unsupported targets before generating project artifacts.

Workflow:

1. confirm that the requested repository root is an eligible cloud workload
2. inspect and score the project
3. optionally run Railpack to strengthen build environment detection
4. detect reusable container images
5. reuse, repair, or generate a Dockerfile
6. write `.sealos/build-request.json`
7. either reuse an existing image or run a sandbox kaniko build through `k8s-kaniko-job`
8. generate `.sealos/template/index.yaml`

## kubectl Safety Rules

Build phases that use `kubectl` use the sandbox-provided permissions, kubeconfig, namespace, and current service account.

## Usage

```text
/sealos-deploy [github-url]
```

If the argument is omitted, resolve the current workspace first. When the current workspace is already the target git repository, build from that sandbox-local path instead of recloning. If a GitHub URL is provided explicitly, clone it to a temporary working directory and continue from there.

The downstream kaniko executor packages the sandbox-local Docker context from `source.work_dir` and exposes it through the DevBox VersityGW S3 endpoint. GitHub URL, repo, and ref fields are still recorded for traceability and image naming, but the build does not pull Dockerfiles from GitHub at execution time.

## Quick Start

Execute the modules in order:

1. `modules/preflight.md` — environment checks and project resolution
2. `modules/pipeline.md` — eligibility and build-and-prepare pipeline (Phase 0.4–6)

## Logging

Every run should write a log file at `~/.sealos/logs/deploy-<YYYYMMDD-HHmmss>.log`.

At the start of execution:

```bash
mkdir -p ~/.sealos/logs
LOG_FILE=~/.sealos/logs/deploy-$(date +%Y%m%d-%H%M%S).log
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Prepare run started" > "$LOG_FILE"
```

Append phase boundaries and key decisions to the same file with `>>`.

## Scripts

Located in `scripts/` within this skill directory (`<SKILL_DIR>/scripts/`):

| Script | Usage | Purpose |
|--------|-------|---------|
| `workload-eligibility.mjs` | `node workload-eligibility.mjs <repo-dir>` | Read-only fail-closed workload classification; decision is stdout-only |
| `score-model.mjs` | `node score-model.mjs <repo-dir>` | Deterministic readiness scoring (0-12) |
| `run-railpack-probe.mjs` | `node run-railpack-probe.mjs --work-dir <repo-dir> --analysis <repo-dir>/.sealos/analysis.json` | Optional Railpack build-environment probe and normalized `analysis.json.build_environment` writer |
| `detect-image.mjs` | `node detect-image.mjs <github-url> [work-dir]` or `node detect-image.mjs <work-dir>` | Detect existing Docker Hub or GHCR images |
| `validate-artifacts.mjs` | `node validate-artifacts.mjs --dir <work-dir>` | Validate `.sealos` JSON artifacts against enforced schemas |
| `patch-template-pull-secret.mjs` | `node patch-template-pull-secret.mjs --template <index.yaml> --build-result <build-result.json>` | POC: inline GHCR pull Secret and `imagePullSecrets` into the Sealos template |

All scripts output JSON. Run via Bash and parse the result.

## Internal Skill Dependencies

This skill references co-installed internal skills on demand:

```text
<SKILL_DIR>/../
├── sealos-deploy/           ← this skill (user entry point)
├── dockerfile-skill/        ← Phase 3: Dockerfile generation knowledge
├── k8s-kaniko-job/        ← Phase 4: sandbox kaniko execution
├── cloud-native-readiness/  ← Phase 0.4 eligibility policy + Phase 1 assessment criteria
└── docker-to-sealos/        ← Phase 5: Sealos template rules
```

## Phase Overview

| Phase | Action | Skip When |
|-------|--------|-----------|
| 0 — Preflight | Capability scan, project resolution, sandbox assumptions | Entry blockers resolved |
| 0.4 — Eligibility | Confirm the requested repository root is a supported cloud workload | Any non-eligible result → stop |
| 1 — Assess | Analyze deployability and write `analysis.json` | Score too low → stop |
| 1.5 — Railpack Probe | Optional build environment detection | Railpack missing or Phase 1 stopped |
| 2 — Detect | Find reusable amd64 image | Found → build job can be skipped later |
| 3 — Dockerfile | Reuse or generate Dockerfile | Existing valid Dockerfile can be reused |
| 4 — Build | Write `build-request.json` and resolve `build-result.json` | Existing image writes `status=skipped` without a Job |
| 5 — Template | Generate `.sealos/template/index.yaml` from the resolved image | Existing valid template can be reused |
| 6 — Finish | Write `delivery-manifest.json` and present outputs | — |

## Decision Flow

```text
Input (current workspace or GitHub URL)
  │
  ▼
[Phase 0] Preflight ── fail → explain blocker and STOP
  │ pass
  ▼
[Phase 0.4] Eligibility ── ineligible or unresolved → report evidence and STOP
  │ eligible
  ▼
[Phase 1] Assess ── not suitable → STOP with reason
  │ suitable
  ▼
[Phase 1.5] Railpack build environment probe ── unavailable → continue with existing heuristics
  │
  ▼
[Phase 2] Detect existing image
  │
  ├── found reusable image ───────────────┐
  │                                       │
  ▼                                       │
[Phase 3] Dockerfile                      │
  │                                       │
  ▼                                       │
[Phase 4] Build / reuse image             │
  ◄───────────────────────────────────────┘
  │
  ▼
[Phase 5] Generate Sealos template
  │
  ▼
[Phase 6] Finish with .sealos artifacts
  │
  ▼
Done — build artifacts and template ready for a later deploy step
```

Execution rule: `kubectl`, VersityGW S3 settings, and `GITHUB_TOKEN` are required only when `mode=build-required`. When that happens, use the active sandbox namespace and current service account instead of assuming `default`.
