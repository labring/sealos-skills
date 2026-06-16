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

<!-- GSD:project-start source:PROJECT.md -->

## Project

**Sealos Codex Plugin Installation Upgrade**

Sealos Skills is a plugin-first skill pack for deploying projects, connecting Sealos Cloud services, and building Sealos Desktop apps from AI agent workflows. This project improves the Codex plugin installation experience by using `phuryn/pm-skills` as the reference for native Codex marketplace installation copy, then aligning the README and required plugin metadata so Codex users can install and invoke Sealos with fewer decisions.

The work is for developers using Codex CLI or Codex App who want Sealos deployment, database, S3, canvas, and app-builder skills available as a managed plugin.

**Core Value:** Codex users can discover, install, and invoke the Sealos plugin through the most native Codex plugin flow, with README instructions and plugin metadata that match the actual repository layout.

### Constraints

- **Single skill source**: Root `skills/**` stays canonical for Codex, skills.sh, and every host manifest — prevents drift across packaged copies.
- **Codex accuracy**: README commands must match actual Codex plugin naming and repository marketplace behavior — users should be able to follow commands directly.
- **Support claims**: Codex plugin documentation must reflect current command and skill exposure semantics — prevents overclaiming unsupported slash-command behavior.
- **Validation**: Distribution-facing changes must pass `python3 scripts/validate-codex-plugin.py` and JSON syntax checks — keeps manifest and registry drift visible.
- **Scope**: The milestone optimizes install and README experience — deploy/runtime skill behavior stays stable.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- Markdown - Skill entrypoints, workflow modules, references, marketplace documentation, and agent instructions under `skills/**`, `commands/sealos.md`, `README.md`, `CLAUDE.md`, and `marketplaces/README.md`.
- JavaScript (ES modules) - Runtime helper scripts under `skills/**/scripts/*.mjs`, especially `skills/sealos-deploy/scripts/`, `skills/sealos-canvas/scripts/generate-canvas.mjs`, `skills/sealos-database/scripts/analyze-project-database.mjs`, and `skills/sealos-s3/scripts/analyze-project-s3.mjs`.
- Python 3 - Plugin and template validation utilities in `scripts/validate-codex-plugin.py` and `skills/docker-to-sealos/scripts/*.py`.
- JSON - Plugin, marketplace, extension, eval, and runtime config files such as `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `.claude-plugin/plugin.json`, `distribution/platforms.json`, `gemini-extension.json`, `qwen-extension.json`, `openclaw.plugin.json`, `skills/sealos-deploy/config.json`, and `skills/**/evals/evals.json`.
- YAML - Generated/declarative target format for Sealos templates described in `skills/docker-to-sealos/SKILL.md`, `skills/docker-to-sealos/references/sealos-specs.md`, and deployment pipeline docs.

## Runtime

- Node.js 18+ - Required by `.mjs` helper scripts that use ESM, built-in `fetch`, `node:http`, `node:fs`, `node:path`, `child_process`, and `readline/promises`; `skills/sealos-deploy/SKILL.md` names Node.js 18+ as an optional accelerator for deployments.
- Python 3.8+ - Required for validation and conversion scripts; `skills/sealos-deploy/SKILL.md` names Python 3.8+ as an optional accelerator.
- Agent host runtime - Codex, Claude Code-compatible hosts, OpenClaw/ClawHub, CodeBuddy, Gemini CLI, Qwen Code, skills.sh, and generic repo importers consume the same root `skills/**` source through manifests.
- No repository-level package manager manifest detected (`package.json`, `pyproject.toml`, `requirements.txt`, `go.mod`, and `Cargo.toml` are absent at the root).
- Runtime installs are host-driven through `npx plugins add ...` and `npx skills add ...` as documented in `README.md`.
- Lockfile: missing.

## Frameworks

- Codex plugin manifest - `.codex-plugin/plugin.json` exposes the plugin as `sealos` and points `skills` to `./skills/`.
- Claude-compatible plugin manifest - `.claude-plugin/plugin.json`, `marketplace.json`, `.claude-plugin/marketplace.json`, `.codebuddy-plugin/marketplace.json`, and `commands/sealos.md` expose command and skill entries for compatible hosts.
- skills.sh-compatible skill pack - Root `skills/**/SKILL.md` files are the single source for direct skill installs.
- Context-only extensions - `gemini-extension.json` and `qwen-extension.json` use `CLAUDE.md` as the context file.
- Sealos template conversion framework - `skills/docker-to-sealos/SKILL.md` defines Docker Compose/docs to Sealos template conversion rules and expects output under `template/<app-name>/index.yaml`.
- Python unittest - `skills/docker-to-sealos/scripts/test_*.py` uses `unittest` for conversion and rule checks.
- Eval fixtures - `skills/sealos-deploy/evals/evals.json`, `skills/sealos-database/evals/evals.json`, `skills/sealos-s3/evals/evals.json`, and `skills/sealos-canvas/evals/evals.json` define skill behavior checks.
- Script validation - `scripts/validate-codex-plugin.py` validates Codex plugin metadata, marketplace metadata, platform registry entries, and asset paths.
- Node scripts - Use `node <path-to-script>.mjs` for analyzers, auth helpers, build/push automation, deployment, artifact validation, live smoke checks, and canvas generation.
- Python scripts - Use `python3 scripts/validate-codex-plugin.py` for Codex plugin validation and `python3 skills/docker-to-sealos/scripts/*.py` for template conversion checks.
- External CLIs - `docker`, `kubectl`, `gh`, `sealos-cli`, `npx plugins`, and `npx skills` are part of the operational workflow rather than vendored dependencies.

## Key Dependencies

- `node:fs`, `node:path`, `node:child_process`, `node:http`, `node:os`, `node:url`, `readline/promises` - Built-in Node modules used by scripts in `skills/sealos-deploy/scripts/`, `skills/sealos-canvas/scripts/generate-canvas.mjs`, `skills/sealos-database/scripts/analyze-project-database.mjs`, and `skills/sealos-s3/scripts/analyze-project-s3.mjs`.
- Built-in `fetch` - Used by `skills/sealos-deploy/scripts/sealos-auth.mjs`, `skills/sealos-deploy/scripts/deploy-template.mjs`, `skills/sealos-deploy/scripts/detect-image.mjs`, `skills/sealos-deploy/scripts/build-push.mjs`, and `skills/sealos-deploy/scripts/sealos-live-smoke.mjs`.
- Python `json`, `sys`, `pathlib` - Used by `scripts/validate-codex-plugin.py`.
- Python `yaml` - Used by `skills/docker-to-sealos/scripts/compose_to_template.py`, `skills/docker-to-sealos/scripts/check_consistency*.py`, and related tests; this implies PyYAML is required when running those scripts.
- Sealos Cloud - Deployment, auth, workspace, database, object storage, and template API target across `skills/sealos-deploy`, `skills/sealos-database`, and `skills/sealos-s3`.
- Kubernetes / kubectl - Deploy verification, update flows, canvas generation, and cleanup use `kubectl` with `KUBECONFIG=~/.sealos/kubeconfig`.
- Docker / Docker Buildx - Build and push flow in `skills/sealos-deploy/scripts/build-push.mjs` and Dockerfile generation/validation in `skills/dockerfile-skill`.
- GitHub CLI / GHCR - `skills/sealos-deploy/scripts/gh-auth-utils.mjs`, `skills/sealos-deploy/scripts/gh-refresh-scopes.mjs`, `skills/sealos-deploy/scripts/build-push.mjs`, and `skills/sealos-deploy/scripts/ensure-image-pull-secret.mjs` support GHCR publishing and image pull secrets.
- `sealos-cli` - Database and S3 skills use `sealos-cli database` and `sealos-cli s3` commands in `skills/sealos-database/SKILL.md` and `skills/sealos-s3/SKILL.md`.
- `kompose` - `skills/docker-to-sealos/SKILL.md` prefers `scripts/compose_to_template.py --kompose-mode always` and requires `kompose` for deterministic workload shaping.

## Configuration

- Sealos auth state is stored outside the repository in `~/.sealos/auth.json` and `~/.sealos/kubeconfig` by `skills/sealos-deploy/scripts/sealos-auth.mjs`.
- Deployment state for target projects is stored in `.sealos/state.json`, `.sealos/analysis.json`, and `.sealos/config.json` as described in `AGENTS.md` and `skills/sealos-deploy/SKILL.md`.
- `SEALOS_REGION` can override the default login region in `skills/sealos-deploy/scripts/sealos-auth.mjs`.
- `KUBECONFIG` defaults to `~/.sealos/kubeconfig` in kubectl helpers such as `skills/sealos-deploy/scripts/ensure-image-pull-secret.mjs`, `skills/sealos-deploy/scripts/sealos-footprint.mjs`, and `skills/sealos-canvas/scripts/generate-canvas.mjs`.
- `SEALOS_CANVAS_KUBE_FIXTURE` can make `skills/sealos-canvas/scripts/generate-canvas.mjs` read fixture data instead of live kubectl output.
- No top-level application build config detected.
- Codex plugin validation is configured by `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, and `distribution/platforms.json`.
- Sealos OAuth and region config lives in `skills/sealos-deploy/config.json` with `client_id`, `default_region`, and `regions`.
- Platform distribution support is recorded in `distribution/platforms.json`.
- Skill evals live under `skills/*/evals/evals.json`.

## Platform Requirements

- Use Node.js 18+ for `.mjs` scripts under `skills/**/scripts/`.
- Use Python 3.8+ for `scripts/validate-codex-plugin.py` and `skills/docker-to-sealos/scripts/*.py`.
- Install host CLIs as needed: `docker`, `kubectl`, `gh`, `sealos-cli`, `kompose`, `npx plugins`, and `npx skills`.
- Validate Codex metadata with `python3 scripts/validate-codex-plugin.py` when `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, or `distribution/platforms.json` changes.
- Distribution target is a plugin/skill repository consumed from GitHub by Codex, Claude Code-compatible hosts, OpenClaw/ClawHub, CodeBuddy, Gemini CLI, Qwen Code, skills.sh, and generic repo importers.
- Runtime deployment target for generated workloads is Sealos Cloud regions listed in `skills/sealos-deploy/config.json`.
- Root `skills/**` is the only skill source for all distribution surfaces; do not create a second packaged copy.

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- Skill entry files are named `SKILL.md` and live directly under `skills/<skill-name>/`, for example `skills/sealos-deploy/SKILL.md`.
- Skill implementation scripts use kebab-case for executable CLIs, for example `skills/sealos-deploy/scripts/build-push.mjs`, `skills/sealos-deploy/scripts/detect-image.mjs`, and `skills/dockerfile-skill/scripts/validate-dockerfile.mjs`.
- Python modules use snake_case under `skills/docker-to-sealos/scripts/`, for example `skills/docker-to-sealos/scripts/compose_to_template.py` and `skills/docker-to-sealos/scripts/check_consistency_runner.py`.
- Python tests use `test_*.py` beside the implementation, for example `skills/docker-to-sealos/scripts/test_compose_to_template.py`.
- JSON schema artifacts use `<artifact>.schema.json` in `skills/sealos-deploy/schemas/`, for example `skills/sealos-deploy/schemas/state.schema.json`.
- Eval fixtures use `evals.json` under each skill with eval coverage, for example `skills/sealos-deploy/evals/evals.json` and `skills/sealos-canvas/evals/evals.json`.
- JavaScript functions use camelCase, for example `validateAgainstSchema`, `validateObjectSchema`, and `loadSchema` in `skills/sealos-deploy/scripts/artifact-validator.mjs`.
- Python functions use snake_case, for example `convert_compose_to_template`, `infer_metadata`, and `resolve_image_reference` in `skills/docker-to-sealos/scripts/compose_to_template.py`.
- Python CLI modules expose `parse_args(argv: Optional[Sequence[str]] = None)` and `main(argv: Optional[Sequence[str]] = None) -> int`, as shown in `skills/docker-to-sealos/scripts/check_consistency.py`.
- JavaScript constants use UPPER_SNAKE_CASE for configuration and thresholds, for example `SCHEMA_DIR`, `SCHEMA_FILES`, and `MAX_FILE_BYTES`.
- JavaScript local variables use camelCase, for example `childPointer`, `branchErrors`, and `validCount` in `skills/sealos-deploy/scripts/artifact-validator.mjs`.
- Python constants use UPPER_SNAKE_CASE with type annotations where useful, for example `DB_TYPE_PATTERNS`, `SPECIAL_DB_RESOURCE_TYPES`, and `DEFAULT_RESOURCE_LIMITS` in `skills/docker-to-sealos/scripts/compose_to_template.py`.
- Python locals use snake_case, for example `skill_path`, `references_dir`, and `additional_include_paths` in `skills/docker-to-sealos/scripts/check_consistency.py`.
- Python data containers use dataclasses for structured conversion state in `skills/docker-to-sealos/scripts/compose_to_template.py`.
- Python type aliases and annotations use `typing` generics such as `Dict[str, Tuple[str, ...]]`, `Optional[Sequence[str]]`, and `Mapping[str, Any]`.
- JavaScript scripts rely on plain objects and JSON schema validation rather than TypeScript types, for example `skills/sealos-deploy/scripts/artifact-validator.mjs`.

## Code Style

- Python uses 4-space indentation, module docstrings for CLI purpose, and explicit imports from the standard library before local imports.
- JavaScript `.mjs` scripts use ESM imports, 2-space indentation, semicolon-light style in newer scripts such as `skills/sealos-deploy/scripts/artifact-validator.mjs`, and semicolon style in older scripts such as `skills/dockerfile-skill/scripts/validate-dockerfile.mjs`.
- Markdown skill files use short sections and operational checklists, with implementation logic split into `modules/*.md`, `knowledge/*.md`, and `references/*.md`.
- JSON files are committed as readable two-space JSON, for example `.codex-plugin/plugin.json`, `distribution/platforms.json`, and `skills/sealos-deploy/evals/evals.json`.
- No top-level ESLint, Prettier, Biome, pyproject, or package manifest is detected.
- Use script-specific validation commands instead of a global lint command.
- Validate Codex plugin metadata with `python3 scripts/validate-codex-plugin.py` when editing `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, or `distribution/platforms.json`.
- Validate docker-to-sealos rules with `python3 skills/docker-to-sealos/scripts/check_consistency.py` and `python3 skills/docker-to-sealos/scripts/check_must_coverage.py` when editing `skills/docker-to-sealos/**`.

## Import Organization

- No project-wide path aliases are detected.
- Python scripts import sibling modules by filename from `skills/docker-to-sealos/scripts/`, for example `from check_consistency_runner import run_checks`.
- JavaScript scripts use relative imports for local helpers, for example `skills/sealos-deploy/scripts/build-push.mjs` importing `artifact-validator.mjs`.

## Error Handling

- Python CLIs print explicit `ERROR:` or failure text and return exit codes from `main()`, as in `skills/docker-to-sealos/scripts/check_consistency.py`.
- Python validator helpers raise domain exceptions such as `ValueError` for invalid inputs, then CLI wrappers convert them to exit code `2`.
- JavaScript CLIs throw `Error` inside reusable functions and convert top-level failures to JSON or stderr with non-zero exit codes, as in `skills/sealos-deploy/scripts/sealos-auth.mjs`.
- JSON-producing automation should return structured failure payloads such as `{ ok: false, error: ... }` or `{ success: false, error: ... }`, following `skills/sealos-s3/scripts/analyze-project-s3.mjs` and `skills/sealos-deploy/scripts/build-push.mjs`.
- Artifact validation returns path-addressed error objects `{ path, message }`, following `skills/sealos-deploy/scripts/artifact-validator.mjs`.

## Logging

- Machine-consumed Node scripts print JSON to stdout, for example `skills/sealos-database/scripts/analyze-project-database.mjs` and `skills/sealos-deploy/scripts/validate-artifacts.mjs`.
- Human-facing status or remediation text goes to stderr for interactive scripts, for example `skills/sealos-deploy/scripts/build-push.mjs` and `skills/sealos-deploy/scripts/gh-refresh-scopes.mjs`.
- Python validation scripts print `PASS`, `FAIL`, `ERROR`, `[RUN]`, and `[PASS]` messages directly, following `scripts/validate-codex-plugin.py` and `skills/docker-to-sealos/scripts/quality_gate.py`.

## Comments

- Use short comments to mark major algorithm sections in dense detection scripts, as in `skills/sealos-deploy/scripts/score-model.mjs`.
- Use comments for generated-template rules, production lessons, and operational constraints in Markdown knowledge files such as `skills/sealos-deploy/knowledge/lessons-learned.md`.
- Keep inline comments limited to decisions that affect rule behavior, fixture expectations, or platform compatibility.
- JSDoc is minimal and used for script-level orientation in `skills/sealos-deploy/scripts/score-model.mjs`.
- Python modules use concise module docstrings, for example `scripts/validate-codex-plugin.py` and `skills/docker-to-sealos/scripts/check_consistency.py`.

## Function Design

## Module Design

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Codex plugin manifest | Declares the Sealos plugin, points Codex to the root skills directory, and defines UI metadata. | `.codex-plugin/plugin.json` |
| Claude-compatible command | Routes `/sealos` requests to the specific underlying skill. | `commands/sealos.md` |
| Deploy skill | Owns end-to-end project deploy/update flow, safety rules, logging, internal skill dependencies, and runtime verification. | `skills/sealos-deploy/SKILL.md` |
| Deploy pipeline module | Defines artifact layout, deploy/update mode detection, resume behavior, and phase execution. | `skills/sealos-deploy/modules/pipeline.md` |
| Deploy helper scripts | Provide deterministic scoring, image detection, build/push, artifact validation, Template API deploy, auth, footprint, and live smoke checks. | `skills/sealos-deploy/scripts/*.mjs` |
| Cloud readiness skill | Scores cloud-native deployment readiness and routes missing Docker artifacts to Dockerfile generation. | `skills/cloud-native-readiness/SKILL.md` |
| Dockerfile skill | Generates and validates production Dockerfiles, `.dockerignore`, compose files, entrypoints, and Docker docs. | `skills/dockerfile-skill/SKILL.md` |
| Docker-to-Sealos skill | Converts Docker Compose or install docs into production Sealos templates using strict rule precedence. | `skills/docker-to-sealos/SKILL.md` |
| Database skill | Provisions, reuses, connects, and verifies Sealos Cloud databases through `sealos-cli database`. | `skills/sealos-database/SKILL.md` |
| S3 skill | Provisions, reuses, connects, and verifies Sealos S3-compatible object storage through `sealos-cli s3`. | `skills/sealos-s3/SKILL.md` |
| Canvas skill | Starts a read-only local topology UI for a project that already has `.sealos/state.json`. | `skills/sealos-canvas/SKILL.md` |
| App builder skill | Guides Sealos Desktop SDK integration, identity mapping, local iframe debugging, and publish readiness. | `skills/sealos-app-builder/SKILL.md` |
| Distribution registry | Records platform support claims, install commands, runtime types, and verification evidence. | `distribution/platforms.json` |
| Plugin validator | Validates Codex manifest, local marketplace entry, platform registry, and asset paths. | `scripts/validate-codex-plugin.py` |

## Pattern Overview

- `skills/**` is the only skill source for plugin installs, `skills.sh`, and context-only extensions.
- User-facing plugin entry points route to smaller task-specific skills instead of duplicating workflow logic.
- Long workflows are Markdown-orchestrated and script-assisted: `SKILL.md` defines routing and guardrails, `modules/*.md` defines phase logic, `scripts/*` supplies deterministic execution.
- Deployment state is written into the target project under `.sealos/`, while repository distribution state stays in manifest files at the repo root.

## Layers

- Purpose: Expose the same skills to Codex, Claude-compatible hosts, CodeBuddy, OpenClaw, Gemini, Qwen, and generic importers.
- Location: `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `.claude-plugin/plugin.json`, `.codebuddy-plugin/marketplace.json`, `marketplace.json`, `gemini-extension.json`, `qwen-extension.json`, `openclaw.plugin.json`, `distribution/platforms.json`
- Contains: Manifest metadata, install targets, command support claims, UI assets, and marketplace entries.
- Depends on: Root `skills/` and `assets/`.
- Used by: Plugin installers, marketplace flows, extension hosts, and `scripts/validate-codex-plugin.py`.
- Purpose: Route broad Sealos requests to the most specific skill.
- Location: `commands/sealos.md`
- Contains: Claude-compatible command frontmatter, route table, safety reminders, and examples.
- Depends on: `skills/sealos-deploy/SKILL.md`, `skills/sealos-database/SKILL.md`, `skills/sealos-s3/SKILL.md`, `skills/sealos-app-builder/SKILL.md`, `skills/cloud-native-readiness/SKILL.md`, `skills/dockerfile-skill/SKILL.md`, `skills/docker-to-sealos/SKILL.md`
- Used by: `/sealos` plugin command hosts.
- Purpose: Define task triggers, compatibility, safety rules, workflows, and output contracts.
- Location: `skills/*/SKILL.md`
- Contains: YAML frontmatter, usage, hard rules, quick starts, workflow diagrams, script contracts, and internal dependency notes.
- Depends on: Skill-local `modules/`, `references/`, `knowledge/`, `scripts/`, `templates/`, and sibling skills.
- Used by: Agent hosts and future maintainers adding or changing skill behavior.
- Purpose: Break large workflows into phase-level instructions.
- Location: `skills/sealos-deploy/modules/*.md`, `skills/cloud-native-readiness/modules/*.md`, `skills/dockerfile-skill/modules/*.md`
- Contains: Preflight, pipeline, assess, detect, route, analyze, generate, and build-fix instructions.
- Depends on: Skill-local scripts and rule references.
- Used by: `SKILL.md` quick-start sequences.
- Purpose: Hold detailed constraints, examples, Sealos specs, conversion mappings, scoring criteria, and error patterns.
- Location: `skills/*/knowledge/*.md`, `skills/*/references/*.md`, `skills/docker-to-sealos/references/*.yaml`
- Contains: Scoring models, Sealos template specs, database templates, conversion rules, live smoke playbooks, SDK guidance, and CLI usage references.
- Depends on: Current Sealos platform behavior and validation scripts.
- Used by: Workflow modules and helper scripts.
- Purpose: Provide deterministic helper behavior for analysis, validation, conversion, auth, build, deploy, and read-only visualization.
- Location: `skills/*/scripts/*`, `scripts/validate-codex-plugin.py`
- Contains: Node.js `.mjs` scripts for Sealos deploy/database/S3/canvas and Python scripts for Compose conversion and consistency validation.
- Depends on: Node.js, Python, external tools such as Docker, `gh`, `kubectl`, `sealos-cli`, `kompose`, and Sealos auth as required by each skill.
- Used by: Agents executing the workflows and maintainers validating distribution metadata.
- Purpose: Persist deployment analysis, config, build results, templates, state, and canvas output inside the project being operated on.
- Location: Target project `.sealos/` as defined in `skills/sealos-deploy/modules/pipeline.md` and `skills/sealos-canvas/SKILL.md`
- Contains: `.sealos/config.json`, `.sealos/analysis.json`, `.sealos/state.json`, `.sealos/build/build-result.json`, `.sealos/template/index.yaml`, `.sealos/canvas/index.html`
- Depends on: Deploy phases, schemas in `skills/sealos-deploy/schemas/*.json`, and read-only canvas generation.
- Used by: Resume detection, update mode detection, deploy verification, and canvas rendering.

## Data Flow

### Primary Request Path

### Deploy Support Skill Flow

### Database and Object Storage Flow

### Canvas Flow

- Repository state is declarative and file-backed through manifests, skills, modules, references, schemas, and scripts.
- Target deployment state is per-project and file-backed under `.sealos/state.json`, `.sealos/analysis.json`, `.sealos/config.json`, `.sealos/build/build-result.json`, and `.sealos/template/index.yaml`.
- Authentication and runtime state live outside this repo in user-local locations such as `~/.sealos/auth.json`, `~/.sealos/kubeconfig`, and `~/.sealos/logs/deploy-<timestamp>.log`.

## Key Abstractions

- Purpose: A self-contained task capability with frontmatter, triggers, workflow, safety rules, and local assets.
- Examples: `skills/sealos-deploy/SKILL.md`, `skills/sealos-database/SKILL.md`, `skills/sealos-s3/SKILL.md`, `skills/docker-to-sealos/SKILL.md`
- Pattern: Directory per skill, `SKILL.md` as entry point.
- Purpose: A reusable phase document loaded by a skill to keep long workflows maintainable.
- Examples: `skills/sealos-deploy/modules/pipeline.md`, `skills/dockerfile-skill/modules/analyze.md`, `skills/cloud-native-readiness/modules/route.md`
- Pattern: Markdown phase files referenced from `SKILL.md`.
- Purpose: Detailed rule content that should be loaded only when the active workflow needs it.
- Examples: `skills/docker-to-sealos/references/sealos-specs.md`, `skills/dockerfile-skill/knowledge/error-patterns.md`, `skills/sealos-deploy/references/live-smoke-playbooks.md`
- Pattern: Markdown or YAML rule files under skill-local `references/` or `knowledge/`.
- Purpose: Execute or validate parts of a workflow that benefit from code rather than free-form agent reasoning.
- Examples: `skills/sealos-deploy/scripts/score-model.mjs`, `skills/docker-to-sealos/scripts/compose_to_template.py`, `skills/sealos-canvas/scripts/generate-canvas.mjs`
- Pattern: Script stays with the owning skill; repo-level script exists only for cross-manifest validation.
- Purpose: Persist results of a deploy flow in the project being deployed.
- Examples: `.sealos/state.json`, `.sealos/analysis.json`, `.sealos/template/index.yaml` as defined in `skills/sealos-deploy/modules/pipeline.md`
- Pattern: Generated outside this repository during skill execution; schema-governed where applicable.
- Purpose: Adapt the root skill pack to a specific host without copying skill source.
- Examples: `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `gemini-extension.json`, `qwen-extension.json`, `openclaw.plugin.json`
- Pattern: Each manifest points at root context or root `skills/`.

## Entry Points

- Location: `.codex-plugin/plugin.json`
- Triggers: Installed plugin selected as `$sealos` in Codex.
- Responsibilities: Plugin identity, display metadata, default prompts, capabilities, logo paths, and `skills: "./skills/"`.
- Location: `commands/sealos.md`
- Triggers: `/sealos` command.
- Responsibilities: Route broad Sealos tasks to the specific skill and preserve destructive-operation guardrails.
- Location: `skills/sealos-deploy/SKILL.md`, `skills/sealos-database/SKILL.md`, `skills/sealos-s3/SKILL.md`, `skills/sealos-canvas/SKILL.md`, `skills/sealos-app-builder/SKILL.md`, `skills/cloud-native-readiness/SKILL.md`, `skills/dockerfile-skill/SKILL.md`, `skills/docker-to-sealos/SKILL.md`
- Triggers: Direct skill invocation such as `/sealos-deploy` or `/docker-to-sealos`.
- Responsibilities: Own the workflow for one task category.
- Location: `gemini-extension.json`, `qwen-extension.json`
- Triggers: Gemini CLI and Qwen Code extension installs.
- Responsibilities: Provide repository context through `CLAUDE.md` without claiming slash-command behavior.
- Location: `scripts/validate-codex-plugin.py`
- Triggers: Manual validation before publishing or manifest changes.
- Responsibilities: Validate Codex plugin metadata, local marketplace entry, platform registry consistency, and asset existence.

## Architectural Constraints

- **Threading:** The repository itself has no long-running application runtime. Helper scripts run as short-lived Node.js or Python processes; `skills/sealos-canvas/scripts/generate-canvas.mjs` starts a temporary local server for the current task.
- **Global state:** Deployment/auth state lives outside repo in `~/.sealos/auth.json`, `~/.sealos/kubeconfig`, and `~/.sealos/logs/`; generated target-project state lives under the target project `.sealos/`.
- **Canonical source:** Use root `skills/**` as the single skill source for every host. Distribution manifests must point to root skills or shared context instead of copying skills into host-specific directories.
- **Destructive operations:** Kubernetes deletes, database deletes, bucket deletes, public access changes, credential rotation, and system tool installation require explicit user confirmation as defined in `skills/sealos-deploy/SKILL.md`, `skills/sealos-database/SKILL.md`, and `skills/sealos-s3/SKILL.md`.
- **Secret handling:** Database passwords, S3 secrets, kubeconfig, Sealos auth files, `.env`, and full connection strings stay out of final user messages and committed files as required by `skills/sealos-database/SKILL.md` and `skills/sealos-s3/SKILL.md`.
- **Kubectl access:** Sealos deploy and canvas flows use `KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify` according to `skills/sealos-deploy/SKILL.md` and `skills/sealos-canvas/SKILL.md`.
- **Circular imports:** Not applicable for Markdown skill routing. Python helper modules under `skills/docker-to-sealos/scripts/` should keep imports within the same script package and validation pipeline.
- **Distribution claims:** Command support claims belong in `distribution/platforms.json` and marketplace docs; context-only hosts use `CLAUDE.md` without command claims.

## Anti-Patterns

### Duplicating Skill Source

### Bypassing the Route Skill

### Treating Deploy Completion as API Success Only

### Editing Generated Target Artifacts as Source Rules

## Error Handling

- Manifest validation uses `fail()` and `SystemExit(1)` in `scripts/validate-codex-plugin.py`.
- Deploy pipeline logs phase boundaries and errors to a single `~/.sealos/logs/deploy-<timestamp>.log` file as specified in `skills/sealos-deploy/SKILL.md`.
- Deploy artifacts are schema-validated with `skills/sealos-deploy/scripts/validate-artifacts.mjs`.
- Database and S3 flows parse `sealos-cli` JSON output and preserve existing env values before writing local config.
- Canvas flow stops when `.sealos/state.json`, kubeconfig, or live resource access is unavailable, per `skills/sealos-canvas/SKILL.md`.

## Cross-Cutting Concerns

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
