---
name: sealos-deploy
description: Prepare any GitHub project for Sealos Cloud inside a sandboxed workflow. Assesses readiness, detects reusable images, reuses or generates Dockerfiles, creates Sealos templates, and writes build handoff artifacts for a follow-up build job. Use when user says "deploy to sealos", "prepare this project for sealos", or asks to containerize a project for Sealos. Also triggers on "/sealos-deploy".
compatibility: git is required when cloning from a GitHub URL or when git metadata is needed. Node.js 18+ is recommended for helper scripts. This prepare-only version does not require Sealos auth, GitHub auth prompts, local Docker daemon access, or direct deploy access.
metadata:
  author: labring
---

# Sealos Deploy

Prepare any GitHub project for Sealos Cloud without requiring direct Sealos login or local image builds.

This version of `sealos-deploy` is a prepare-only workflow:

1. inspect and score the project
2. detect reusable container images
3. reuse, repair, or generate a Dockerfile
4. generate build handoff artifacts under `.sealos/`
5. generate `.sealos/template/index.yaml`

It does not:

- perform Sealos auth
- switch region, workspace, or namespace
- build or push images locally
- create or watch build jobs
- deploy directly to Sealos

## kubectl Safety Rules

If any future phase or downstream skill uses `kubectl`, it must use the sandbox-provided permissions and kubeconfig. This prepare-only version does not execute cluster mutations itself.

## Usage

```text
/sealos-deploy
/sealos-deploy <local-path>
/sealos-deploy <github-url>
```

## Quick Start

Execute the modules in order:

1. `modules/preflight.md` — environment checks and project resolution
2. `modules/pipeline.md` — prepare pipeline (Phase 1–6)

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
├── cloud-native-readiness/  ← Phase 1: assessment criteria
└── docker-to-sealos/        ← Phase 5: Sealos template rules
```

## Phase Overview

| Phase | Action | Skip When |
|-------|--------|-----------|
| 0 — Preflight | Capability scan, project resolution, sandbox assumptions | Entry blockers resolved |
| 1 — Assess | Analyze deployability and write `analysis.json` | Score too low → stop |
| 2 — Detect | Find reusable amd64 image | Found → build can be skipped later |
| 3 — Dockerfile | Reuse or generate Dockerfile | Existing valid Dockerfile can be reused |
| 4 — Build Handoff | Write `build-request.json` for a future build job | Existing image allows `reuse-image` mode |
| 5 — Template | Generate `.sealos/template/index.yaml` | Existing valid template can be reused |
| 6 — Finish | Write `delivery-manifest.json` and present outputs | — |

## Decision Flow

```text
Input (GitHub URL / local path / current project)
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
[Phase 4] Build handoff                   │
  ◄───────────────────────────────────────┘
  │
  ▼
[Phase 5] Generate Sealos template
  │
  ▼
[Phase 6] Finish with .sealos artifacts
  │
  ▼
Done — prepare artifacts ready for a later build/deploy step
```

Execution rule: this version must never require Docker daemon access, Sealos auth, GitHub auth prompts, workspace switching, or direct deploy as entry prerequisites.
