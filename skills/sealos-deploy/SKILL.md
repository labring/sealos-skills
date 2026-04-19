---
name: sealos-deploy
description: Prepare and build a GitHub project for Sealos Cloud inside a sandboxed workflow. Requires a GitHub URL, assesses readiness, detects reusable images, reuses or generates Dockerfiles, resolves image builds through a sandbox BuildKit daemon when needed, and creates Sealos templates. Use when user says "deploy to sealos", "prepare this GitHub project for sealos", or asks to containerize a GitHub project for Sealos. Also triggers on "/sealos-deploy".
compatibility: git is required. Node.js 18+ is recommended for helper scripts. buildctl, kubectl, and GITHUB_TOKEN are required only when the pipeline needs a Kubernetes BuildKit build. This version does not require Sealos auth prompts, local Docker daemon access, or direct deploy access.
metadata:
  author: labring
---

# Sealos Deploy

Prepare a GitHub project for Sealos Cloud without requiring direct Sealos login or local Docker builds.

This version of `sealos-deploy` is a sandbox-first workflow:

1. inspect and score the project
2. detect reusable container images
3. reuse, repair, or generate a Dockerfile
4. write `.sealos/build-request.json`
5. either reuse an existing image or run a sandbox BuildKit build through `k8s-buildkit-job`
6. generate `.sealos/template/index.yaml`

It does not:

- perform Sealos auth
- switch region, workspace, or namespace
- build or push images locally
- deploy directly to Sealos

## kubectl Safety Rules

If any future phase or downstream skill uses `kubectl`, it must use the sandbox-provided permissions and kubeconfig. This version may create one-shot build Jobs, but it still must not mutate Sealos application resources directly.

## Usage

```text
/sealos-deploy <github-url>
```

The entrypoint only accepts GitHub URLs. Local paths and implicit current-directory runs are intentionally unsupported because the downstream BuildKit executor builds from a GitHub ref, not from local files.

## Quick Start

Execute the modules in order:

1. `modules/preflight.md` — environment checks and project resolution
2. `modules/pipeline.md` — build-and-prepare pipeline (Phase 1–6)

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
| `score-model.mjs` | `node score-model.mjs <repo-dir>` | Deterministic readiness scoring (0-12) |
| `detect-image.mjs` | `node detect-image.mjs <github-url> [work-dir]` or `node detect-image.mjs <work-dir>` | Detect existing Docker Hub or GHCR images |
| `validate-artifacts.mjs` | `node validate-artifacts.mjs --dir <work-dir>` | Validate `.sealos` JSON artifacts against enforced schemas |

All scripts output JSON. Run via Bash and parse the result.

## Internal Skill Dependencies

This skill references co-installed internal skills on demand:

```text
<SKILL_DIR>/../
├── sealos-deploy/           ← this skill (user entry point)
├── dockerfile-skill/        ← Phase 3: Dockerfile generation knowledge
├── k8s-buildkit-job/        ← Phase 4: sandbox BuildKit execution
├── cloud-native-readiness/  ← Phase 1: assessment criteria
└── docker-to-sealos/        ← Phase 5: Sealos template rules
```

## Phase Overview

| Phase | Action | Skip When |
|-------|--------|-----------|
| 0 — Preflight | Capability scan, project resolution, sandbox assumptions | Entry blockers resolved |
| 1 — Assess | Analyze deployability and write `analysis.json` | Score too low → stop |
| 2 — Detect | Find reusable amd64 image | Found → build job can be skipped later |
| 3 — Dockerfile | Reuse or generate Dockerfile | Existing valid Dockerfile can be reused |
| 4 — Build | Write `build-request.json` and resolve `build-result.json` | Existing image writes `status=skipped` without a Job |
| 5 — Template | Generate `.sealos/template/index.yaml` from the resolved image | Existing valid template can be reused |
| 6 — Finish | Write `delivery-manifest.json` and present outputs | — |

## Decision Flow

```text
Input (GitHub URL)
  │
  ▼
[Phase 0] Preflight ── fail → explain blocker and STOP
  │ pass
  ▼
[Phase 1] Assess ── not suitable → STOP with reason
  │ suitable
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

Execution rule: this version must never require Docker daemon access, Sealos auth, GitHub auth prompts, workspace switching, or direct deploy as entry prerequisites. It may require `buildctl`, `kubectl`, and `GITHUB_TOKEN` later, but only if `mode=build-required`.
