# Project Agent Instructions

This file provides guidance to AI coding agents when working with code in this repository.

## What This Project Is

Sealos Skills is a plugin-first skills repository for Sealos Cloud. It supports the `skills.sh` ecosystem, Codex plugins, Claude Code-compatible plugins, Gemini/Qwen context extensions, and other AI-tool distribution surfaces.

The repository contains one root-level skills pack plus supporting helper scripts, manifests, and eval fixtures. The landing site lives in a separate site repository.

## Commands

This repo does not have a single top-level app build.

- Most work happens directly under `skills/**`.
- Run helper scripts with `node <path-to-script>.mjs`.
- Keep `skills/sealos-deploy/evals/` in sync when skill behavior changes.
- Validate distribution metadata when adding or renaming skills, commands, or manifests.
- Run `python3 scripts/validate-codex-plugin.py` when Codex plugin metadata changes.

## Architecture

### Skill dependency graph

```text
sealos plugin entry points ($sealos, /sealos)
  ├→ sealos-deploy (direct skills.sh entry point: /sealos-deploy)
  │   ├→ cloud-native-readiness   (Phase 1: score 0-12)
  │   ├→ dockerfile-skill         (Phase 3: generate Dockerfile)
  │   └→ docker-to-sealos         (Phase 5: Compose → Sealos template)
  ├→ sealos-database (direct skills.sh entry point: /sealos-database)
  └→ sealos-s3       (direct skills.sh entry point: /sealos-s3)
```

`sealos-app-builder` is an adjacent skill for Sealos Desktop app work. `sealos-canvas` is an adjacent skill for read-only deployed-resource visualization after `/sealos-deploy` has created `.sealos/state.json`.

### Skill module pattern

Each skill follows the same structure:

- `SKILL.md` — entry point with YAML frontmatter (name, version, allowed-tools, compatibility)
- `modules/*.md` — phased execution logic (preflight, assess, generate, build, deploy)
- `scripts/*.mjs` — Node.js executables (auth, scoring, image detection, build)
- `knowledge/*.md` — error patterns, best practices, scoring criteria
- `config.json` — runtime config (OAuth, regions)

Skills reference paths with `<SKILL_DIR>` for self and `<SKILL_DIR>/../other-skill/` for siblings.

### Distribution layout

Root `skills/**` is the only skill source for every host. Do not add a second packaged skill copy.

- `.codex-plugin/plugin.json` — Codex plugin manifest pointing to root `skills/`.
- `.agents/plugins/marketplace.json` — local Codex marketplace entry for the Sealos plugin.
- `.claude-plugin/plugin.json` — Claude Code-compatible plugin manifest.
- `marketplace.json` and `.claude-plugin/marketplace.json` — Claude-compatible marketplace entries.
- `.codebuddy-plugin/marketplace.json` — CodeBuddy marketplace entry.
- `commands/sealos.md` — `/sealos` plugin command entry for Claude-compatible hosts.
- `gemini-extension.json` — Gemini CLI extension manifest using `CLAUDE.md` as context.
- `qwen-extension.json` — Qwen Code extension manifest using `CLAUDE.md` as context.
- `openclaw.plugin.json` — OpenClaw / ClawHub bundle pointer.
- `distribution/platforms.json` — platform support registry and support-claim scope.
- `marketplaces/README.md` — maintainer notes for marketplace files.
- `scripts/validate-codex-plugin.py` — Codex plugin validation script.
- `CLAUDE.md` — shared context file for Claude-compatible and context-only hosts.

Plugin usage examples must use `$sealos` for Codex and `/sealos` for Claude Code-compatible hosts. Keep `/sealos-deploy`, `/sealos-database`, and `/sealos-s3` examples only in direct `skills.sh` sections.

### Deployment pipeline (sealos-deploy)

```text
Preflight → Mode Detection → DEPLOY or UPDATE

DEPLOY: Assess → Detect image → Dockerfile → Build & Push → Template → Deploy
UPDATE: Build & Push → kubectl set image → Verify rollout (auto-rollback on failure)
```

Mode detection reads `.sealos/state.json` `last_deploy` field. If a running deployment is found (verified via kubectl), the skill enters UPDATE mode and skips assess/template/deploy phases. If not, it runs the full DEPLOY pipeline.

State is tracked in `.sealos/state.json` (deployment state), `.sealos/analysis.json` (project analysis snapshot), and `.sealos/config.json` (optional user overrides). The `last_deploy` section in `state.json` records app name, namespace, image, and URL so later deploys can update in place instead of starting over.

## Key paths

- `skills/sealos-deploy/SKILL.md` — primary entry point for the deploy workflow
- `skills/sealos-database/SKILL.md` — primary entry point for cloud database development workflow
- `skills/sealos-s3/SKILL.md` — primary entry point for S3-compatible object storage workflow
- `skills/sealos-deploy/config.json` — OAuth client_id, regional Sealos URLs
- `skills/sealos-deploy/scripts/` — auth, scoring, and helper automation scripts
- `skills/sealos-deploy/evals/evals.json` — eval prompts and assertions
- `skills/sealos-canvas/SKILL.md` — read-only resource canvas workflow
- `.codex-plugin/plugin.json` — Codex plugin manifest pointing to root `skills/`
- `.agents/plugins/marketplace.json` — local Codex marketplace entry for the Sealos plugin
- `.claude-plugin/plugin.json` — Claude Code-compatible plugin manifest
- `commands/sealos.md` — `/sealos` command route for plugin hosts
- `distribution/platforms.json` — platform support registry and evidence
- `marketplaces/README.md` — marketplace ownership and support-claim rules
- `scripts/validate-codex-plugin.py` — Codex plugin validation script

## Engineering Rules

### Editing Discipline

- Treat root `skills/**` as the canonical implementation. Host manifests and command adapters must reference that source.
- Make the smallest change that satisfies the request and keep behavior inside the owning skill.
- Inspect `git status --short` and the relevant diff before editing. Preserve every pre-existing modification and untracked user file.
- Keep edits scoped to named files. Leave unrelated cleanup as a separate task.
- Remove imports, variables, fixtures, and generated files made obsolete by the current change.
- Keep durable project rules here. Git history and `.planning/` own milestone narratives.

### Language and Style

- Write code, code comments, commit messages, and pull request text in English.
- Match each file's established conventions before introducing a new pattern.
- Python uses four-space indentation, snake_case names, explicit imports, type hints where they improve contracts, and `unittest` for the existing validator suite.
- Node.js helpers use ESM, two-space indentation, camelCase names, structured JSON on stdout, and human-facing diagnostics on stderr.
- Keep Markdown operational and concise. Put detailed examples and protocol specifications in the owning skill's `references/`, `knowledge/`, or `modules/` directory.

### Targeted Validation

- Run the narrowest relevant checks first, then the owning skill's complete gate.
- For `docker-to-sealos` rule, converter, or reference changes, run `python3 skills/docker-to-sealos/scripts/quality_gate.py --artifacts /abs/path/template/<app>/index.yaml`.
- For `docker-to-sealos` changes without a template artifact, run `DOCKER_TO_SEALOS_ALLOW_EMPTY_ARTIFACTS=1 python3 skills/docker-to-sealos/scripts/quality_gate.py`.
- Add or update `test_check_consistency.py`, `test_compose_to_template.py`, or `test_check_must_coverage.py` coverage with the behavior they enforce.
- For changed `sealos-deploy` JavaScript helpers, run `node --check <changed-script.mjs>` and the matching `test-*.mjs` file.
- Run `node skills/sealos-deploy/scripts/test-sealos-footprint.mjs` and `node skills/sealos-deploy/scripts/test-sealos-live-smoke.mjs` when their helpers or runtime contract changes.
- Keep `skills/sealos-deploy/evals/` aligned with user-visible deploy behavior.
- Run `python3 scripts/validate-codex-plugin.py` when manifests, commands, distribution metadata, assets, or skill inventory changes.

### Runtime Safety

- Obtain explicit user confirmation before Kubernetes, database, or bucket deletion; public-access changes; credential rotation; or system tool installation.
- Keep passwords, tokens, kubeconfig contents, S3 secrets, `.env` values, and complete connection strings out of committed files and user-facing output.
- Scope Kubernetes operations to the selected namespace and named application. Inspect the live footprint before every mutation.
- Use `KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify` for Sealos cluster access unless the active workflow supplies an equivalent explicit context.
- Accept a deployment after the actual App URL, required setup or login, relevant logs, workload readiness, and full resource footprint have been verified.
- For user-authorized test cleanup, include the named Instance, App, workloads, Jobs, Services, Ingresses, PVCs, and test-created KubeBlocks resources.
