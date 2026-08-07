# Project Agent Instructions

This file provides guidance to AI coding agents when working with code in this repository.

## What This Project Is

Sealos Skills is a plugin-first skills repository for Sealos Cloud. It supports the `skills.sh` ecosystem, Codex plugins, Claude Code-compatible plugins, Gemini/Qwen context extensions, and other AI-tool distribution surfaces.

The repository contains one root-level skills pack plus supporting helper scripts, manifests, and eval fixtures. The landing site lives in a separate site repository.

`main` is the only maintained branch. The `brain-deploy-preview` workflow is archived.

## Commands

This repo does not have a single top-level app build.

- Most work happens directly under `skills/**`.
- Run helper scripts with `node <path-to-script>.mjs`.
- For validation commands, see **Targeted Validation** below.

## Architecture

### Skill dependency graph

```text
sealos plugin entry points ($sealos, /sealos)
  ├→ sealos-deploy (direct skills.sh entry point: /sealos-deploy)
  │   ├→ cloud-native-readiness   (Phase 0.4 eligibility + Phase 1 score 0-12)
  │   ├→ dockerfile-skill         (Phase 3: generate Dockerfile)
  │   └→ docker-to-sealos         (Phase 5: Compose → Sealos template)
  ├→ sealos-database (direct skills.sh entry point: /sealos-database)
  └→ sealos-s3       (direct skills.sh entry point: /sealos-s3)
```

`sealos-app-builder` is an adjacent skill for Sealos Desktop app work. `sealos-canvas` is an adjacent skill for read-only deployed-resource visualization after `/sealos-deploy` creates `.sealos/state.json`.

### Skill module pattern

All skills share two files:

- `SKILL.md` — entry point with YAML frontmatter (name, description, compatibility)
- `agents/openai.yaml` — agent metadata for the skill

Larger skills add directories as needed:

- `modules/*.md` — phased execution logic (sealos-deploy, dockerfile-skill, cloud-native-readiness)
- `knowledge/*.md` — error patterns, best practices, scoring criteria (sealos-deploy, dockerfile-skill, cloud-native-readiness)
- `scripts/` — executables: `.mjs` in most skills, `.py` in docker-to-sealos
- `config.json` — runtime config such as OAuth client and regions (sealos-deploy only)
- `references/`, `templates/`, `assets/`, `evals/`, `examples/` — supporting material where a skill needs it

Skills reference paths with `<SKILL_DIR>` for self and `<SKILL_DIR>/../other-skill/` for siblings.

### Distribution layout

Root `skills/**` is the only skill source for every host. Host manifests must reference that source directly. Do not copy skill files into plugin or extension directories.

- `.codex-plugin/plugin.json` — Codex plugin manifest pointing to root `skills/`.
- `.agents/plugins/marketplace.json` — local Codex marketplace entry for the Sealos plugin.
- `.claude-plugin/plugin.json` — Claude Code-compatible plugin manifest.
- `.qoder-plugin/plugin.json` — Qoder plugin manifest pointing to the complete root skill inventory.
- `marketplace.json` and `.claude-plugin/marketplace.json` — Claude-compatible marketplace entries.
- `.codebuddy-plugin/marketplace.json` — CodeBuddy marketplace entry.
- `commands/sealos.md` — `/sealos` plugin command entry for Claude-compatible hosts.
- `qoder.md` — Qoder plugin-level routing and safety instructions.
- `gemini-extension.json` — Gemini CLI extension manifest using `CLAUDE.md` as context.
- `qwen-extension.json` — Qwen Code extension manifest using `CLAUDE.md` as context.
- `openclaw.plugin.json` — OpenClaw / ClawHub bundle pointer.
- `distribution/platforms.json` — platform support registry and support-claim scope.
- `marketplaces/README.md` — maintainer notes for marketplace files.
- `scripts/validate-codex-plugin.py` — Codex plugin validation script.
- `scripts/package-qoder-plugin.py` — Qoder plugin ZIP packager.
- `CLAUDE.md` — shared context file for Claude-compatible and context-only hosts.

Plugin usage examples must use `$sealos` for Codex. Claude Code-compatible hosts and Qoder use `/sealos`. Show the direct entries `/sealos-deploy`, `/sealos-database`, and `/sealos-s3` only in `skills.sh` sections.

### Deployment pipeline (sealos-deploy)

```text
Preflight → Mode Detection → DEPLOY or UPDATE

DEPLOY: Assess → Detect image → Dockerfile → Build & Push → Template → Deploy
UPDATE: Build & Push → kubectl set image → Verify rollout (auto-rollback on failure)
```

Mode detection reads the `.sealos/state.json` `last_deploy` field. If kubectl confirms a running deployment, the skill enters UPDATE mode and skips the assess, template, and deploy phases. Otherwise it runs the full DEPLOY pipeline.

The skill tracks state in `.sealos/state.json` (deployment state), `.sealos/analysis.json` (project analysis snapshot), and `.sealos/config.json` (optional user overrides). The `last_deploy` section records app name, namespace, image, and URL, so later runs can update the deployment in place.

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
- `.qoder-plugin/plugin.json` — Qoder plugin manifest
- `commands/sealos.md` — `/sealos` command route for plugin hosts
- `qoder.md` — Qoder plugin routing and safety instructions
- `distribution/platforms.json` — platform support registry and evidence
- `marketplaces/README.md` — marketplace ownership and support-claim rules
- `scripts/validate-codex-plugin.py` — Codex plugin validation script
- `scripts/package-qoder-plugin.py` — Qoder plugin ZIP packager

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
- Add or update `test_check_consistency.py`, `test_compose_to_template.py`, `test_check_must_coverage.py`, or `test_quality_gate.py` coverage with the behavior they enforce.
- For changed `sealos-deploy` JavaScript helpers, run `node --check <changed-script.mjs>` and the matching `test-*.mjs` file.
- When helpers or the runtime contract change, run `node skills/sealos-deploy/scripts/test-sealos-footprint.mjs` and `node skills/sealos-deploy/scripts/test-sealos-live-smoke.mjs`.
- Keep `skills/sealos-deploy/evals/` aligned with user-visible deploy behavior.
- When manifests, commands, distribution metadata, assets, or the skill inventory change, run `python3 scripts/validate-codex-plugin.py`.

### Runtime Safety

- Obtain explicit user confirmation before any of these actions:
  - Kubernetes, database, or bucket deletion
  - public-access changes
  - credential rotation
  - system tool installation
- Keep passwords, tokens, kubeconfig contents, S3 secrets, `.env` values, and complete connection strings out of committed files and user-facing output.
- Scope Kubernetes operations to the selected namespace and named application. Inspect the live footprint before every mutation.
- Use `KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify` for Sealos cluster access unless the active workflow supplies an equivalent explicit context.
- Accept a deployment only after you verify the actual App URL, required setup or login, relevant logs, workload readiness, and the full resource footprint.
- For user-authorized test cleanup, include the named Instance, App, workloads, Jobs, Services, Ingresses, PVCs, and test-created KubeBlocks resources.
