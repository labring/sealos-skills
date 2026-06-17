# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

Seakills is a skills repository for Sealos Cloud in the `skills.sh` ecosystem. This repo contains the skills pack plus supporting helper scripts and eval fixtures. This branch keeps `/sealos-deploy` as a lite prepare-only workflow while also exposing database and S3 helper skills.

## Commands

This repo does not have a single top-level app build.

- Most work happens directly under `skills/**`
- Run helper scripts with `node <path-to-script>.mjs`
- Keep `skills/*/evals/` in sync when skill behavior changes

## Architecture

### Skill dependency graph
```text
direct skills.sh entry points
  ├→ sealos-deploy (prepare-only entry point: /sealos-deploy)
  │   ├→ cloud-native-readiness   (Phase 1: score 0-12)
  │   ├→ dockerfile-skill         (Phase 3: generate Dockerfile)
  │   ├→ k8s-kaniko-job           (Phase 4: sandbox kaniko build)
  │   └→ docker-to-sealos         (Phase 5: Sealos template)
  ├→ sealos-database (direct entry point: /sealos-database)
  └→ sealos-s3       (direct entry point: /sealos-s3)
```

### Skill module pattern
Each skill follows the same structure:
- `SKILL.md` — entry point with YAML frontmatter (name, version, allowed-tools, compatibility)
- `modules/*.md` — phased execution logic (preflight, assess, generate, build, template, finish)
- `scripts/*.mjs` — Node.js executables (scoring, image detection, artifact validation, build helpers)
- `knowledge/*.md` — error patterns, best practices, scoring criteria
- `config.json` — runtime config for prepare/build defaults

Skills reference paths with `<SKILL_DIR>` for self and `<SKILL_DIR>/../other-skill/` for siblings.

### Prepare pipeline (sealos-deploy)
```text
Preflight → Assess → Detect Image → Dockerfile → Build/Reuse Image → Template → Finish

Build/Reuse Image:
  - reusable public image found → write build-result.json with status=skipped
  - no reusable image → write build-request.json and delegate to k8s-kaniko-job
```

State for the prepare workflow is tracked through `.sealos/analysis.json`, `.sealos/build-request.json`, `.sealos/build-result.json`, `.sealos/template/index.yaml`, and `.sealos/delivery-manifest.json`. `.sealos/config.json` remains an optional user override file. Database and S3 skills operate through `sealos-cli` and local env files, not through the prepare artifact state.

## Key paths
- `skills/sealos-deploy/SKILL.md` — primary entry point for the prepare workflow
- `skills/sealos-deploy/config.json` — prepare/build defaults
- `skills/sealos-deploy/scripts/` — scoring, image detection, and artifact validation scripts
- `skills/sealos-deploy/evals/evals.json` — eval prompts and assertions
- `skills/k8s-kaniko-job/` — sandbox kaniko executor used when a new image is required
- `skills/sealos-database/SKILL.md` — cloud database development workflow
- `skills/sealos-s3/SKILL.md` — S3-compatible object storage workflow
