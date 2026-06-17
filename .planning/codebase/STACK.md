# Technology Stack

**Analysis Date:** 2026-06-15

## Languages

**Primary:**
- Markdown - Skill entrypoints, workflow modules, references, marketplace documentation, and agent instructions under `skills/**`, `commands/sealos.md`, `README.md`, `CLAUDE.md`, and `marketplaces/README.md`.
- JavaScript (ES modules) - Runtime helper scripts under `skills/**/scripts/*.mjs`, especially `skills/sealos-deploy/scripts/`, `skills/sealos-canvas/scripts/generate-canvas.mjs`, `skills/sealos-database/scripts/analyze-project-database.mjs`, and `skills/sealos-s3/scripts/analyze-project-s3.mjs`.

**Secondary:**
- Python 3 - Plugin and template validation utilities in `scripts/validate-codex-plugin.py` and `skills/docker-to-sealos/scripts/*.py`.
- JSON - Plugin, marketplace, extension, eval, and runtime config files such as `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `.claude-plugin/plugin.json`, `distribution/platforms.json`, `gemini-extension.json`, `qwen-extension.json`, `openclaw.plugin.json`, `skills/sealos-deploy/config.json`, and `skills/**/evals/evals.json`.
- YAML - Generated/declarative target format for Sealos templates described in `skills/docker-to-sealos/SKILL.md`, `skills/docker-to-sealos/references/sealos-specs.md`, and deployment pipeline docs.

## Runtime

**Environment:**
- Node.js 18+ - Required by `.mjs` helper scripts that use ESM, built-in `fetch`, `node:http`, `node:fs`, `node:path`, `child_process`, and `readline/promises`; `skills/sealos-deploy/SKILL.md` names Node.js 18+ as an optional accelerator for deployments.
- Python 3.8+ - Required for validation and conversion scripts; `skills/sealos-deploy/SKILL.md` names Python 3.8+ as an optional accelerator.
- Agent host runtime - Codex, Claude Code-compatible hosts, OpenClaw/ClawHub, CodeBuddy, Gemini CLI, Qwen Code, skills.sh, and generic repo importers consume the same root `skills/**` source through manifests.

**Package Manager:**
- No repository-level package manager manifest detected (`package.json`, `pyproject.toml`, `requirements.txt`, `go.mod`, and `Cargo.toml` are absent at the root).
- Runtime installs are host-driven through `npx plugins add ...` and `npx skills add ...` as documented in `README.md`.
- Lockfile: missing.

## Frameworks

**Core:**
- Codex plugin manifest - `.codex-plugin/plugin.json` exposes the plugin as `sealos` and points `skills` to `./skills/`.
- Claude-compatible plugin manifest - `.claude-plugin/plugin.json`, `marketplace.json`, `.claude-plugin/marketplace.json`, `.codebuddy-plugin/marketplace.json`, and `commands/sealos.md` expose command and skill entries for compatible hosts.
- skills.sh-compatible skill pack - Root `skills/**/SKILL.md` files are the single source for direct skill installs.
- Context-only extensions - `gemini-extension.json` and `qwen-extension.json` use `CLAUDE.md` as the context file.
- Sealos template conversion framework - `skills/docker-to-sealos/SKILL.md` defines Docker Compose/docs to Sealos template conversion rules and expects output under `template/<app-name>/index.yaml`.

**Testing:**
- Python unittest - `skills/docker-to-sealos/scripts/test_*.py` uses `unittest` for conversion and rule checks.
- Eval fixtures - `skills/sealos-deploy/evals/evals.json`, `skills/sealos-database/evals/evals.json`, `skills/sealos-s3/evals/evals.json`, and `skills/sealos-canvas/evals/evals.json` define skill behavior checks.
- Script validation - `scripts/validate-codex-plugin.py` validates Codex plugin metadata, marketplace metadata, platform registry entries, and asset paths.

**Build/Dev:**
- Node scripts - Use `node <path-to-script>.mjs` for analyzers, auth helpers, build/push automation, deployment, artifact validation, live smoke checks, and canvas generation.
- Python scripts - Use `python3 scripts/validate-codex-plugin.py` for Codex plugin validation and `python3 skills/docker-to-sealos/scripts/*.py` for template conversion checks.
- External CLIs - `docker`, `kubectl`, `gh`, `sealos-cli`, `npx plugins`, and `npx skills` are part of the operational workflow rather than vendored dependencies.

## Key Dependencies

**Critical:**
- `node:fs`, `node:path`, `node:child_process`, `node:http`, `node:os`, `node:url`, `readline/promises` - Built-in Node modules used by scripts in `skills/sealos-deploy/scripts/`, `skills/sealos-canvas/scripts/generate-canvas.mjs`, `skills/sealos-database/scripts/analyze-project-database.mjs`, and `skills/sealos-s3/scripts/analyze-project-s3.mjs`.
- Built-in `fetch` - Used by `skills/sealos-deploy/scripts/sealos-auth.mjs`, `skills/sealos-deploy/scripts/deploy-template.mjs`, `skills/sealos-deploy/scripts/detect-image.mjs`, `skills/sealos-deploy/scripts/build-push.mjs`, and `skills/sealos-deploy/scripts/sealos-live-smoke.mjs`.
- Python `json`, `sys`, `pathlib` - Used by `scripts/validate-codex-plugin.py`.
- Python `yaml` - Used by `skills/docker-to-sealos/scripts/compose_to_template.py`, `skills/docker-to-sealos/scripts/check_consistency*.py`, and related tests; this implies PyYAML is required when running those scripts.

**Infrastructure:**
- Sealos Cloud - Deployment, auth, workspace, database, object storage, and template API target across `skills/sealos-deploy`, `skills/sealos-database`, and `skills/sealos-s3`.
- Kubernetes / kubectl - Deploy verification, update flows, canvas generation, and cleanup use `kubectl` with `KUBECONFIG=~/.sealos/kubeconfig`.
- Docker / Docker Buildx - Build and push flow in `skills/sealos-deploy/scripts/build-push.mjs` and Dockerfile generation/validation in `skills/dockerfile-skill`.
- GitHub CLI / GHCR - `skills/sealos-deploy/scripts/gh-auth-utils.mjs`, `skills/sealos-deploy/scripts/gh-refresh-scopes.mjs`, `skills/sealos-deploy/scripts/build-push.mjs`, and `skills/sealos-deploy/scripts/ensure-image-pull-secret.mjs` support GHCR publishing and image pull secrets.
- `sealos-cli` - Database and S3 skills use `sealos-cli database` and `sealos-cli s3` commands in `skills/sealos-database/SKILL.md` and `skills/sealos-s3/SKILL.md`.
- `kompose` - `skills/docker-to-sealos/SKILL.md` prefers `scripts/compose_to_template.py --kompose-mode always` and requires `kompose` for deterministic workload shaping.

## Configuration

**Environment:**
- Sealos auth state is stored outside the repository in `~/.sealos/auth.json` and `~/.sealos/kubeconfig` by `skills/sealos-deploy/scripts/sealos-auth.mjs`.
- Deployment state for target projects is stored in `.sealos/state.json`, `.sealos/analysis.json`, and `.sealos/config.json` as described in `AGENTS.md` and `skills/sealos-deploy/SKILL.md`.
- `SEALOS_REGION` can override the default login region in `skills/sealos-deploy/scripts/sealos-auth.mjs`.
- `KUBECONFIG` defaults to `~/.sealos/kubeconfig` in kubectl helpers such as `skills/sealos-deploy/scripts/ensure-image-pull-secret.mjs`, `skills/sealos-deploy/scripts/sealos-footprint.mjs`, and `skills/sealos-canvas/scripts/generate-canvas.mjs`.
- `SEALOS_CANVAS_KUBE_FIXTURE` can make `skills/sealos-canvas/scripts/generate-canvas.mjs` read fixture data instead of live kubectl output.

**Build:**
- No top-level application build config detected.
- Codex plugin validation is configured by `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, and `distribution/platforms.json`.
- Sealos OAuth and region config lives in `skills/sealos-deploy/config.json` with `client_id`, `default_region`, and `regions`.
- Platform distribution support is recorded in `distribution/platforms.json`.
- Skill evals live under `skills/*/evals/evals.json`.

## Platform Requirements

**Development:**
- Use Node.js 18+ for `.mjs` scripts under `skills/**/scripts/`.
- Use Python 3.8+ for `scripts/validate-codex-plugin.py` and `skills/docker-to-sealos/scripts/*.py`.
- Install host CLIs as needed: `docker`, `kubectl`, `gh`, `sealos-cli`, `kompose`, `npx plugins`, and `npx skills`.
- Validate Codex metadata with `python3 scripts/validate-codex-plugin.py` when `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, or `distribution/platforms.json` changes.

**Production:**
- Distribution target is a plugin/skill repository consumed from GitHub by Codex, Claude Code-compatible hosts, OpenClaw/ClawHub, CodeBuddy, Gemini CLI, Qwen Code, skills.sh, and generic repo importers.
- Runtime deployment target for generated workloads is Sealos Cloud regions listed in `skills/sealos-deploy/config.json`.
- Root `skills/**` is the only skill source for all distribution surfaces; do not create a second packaged copy.

---

*Stack analysis: 2026-06-15*
