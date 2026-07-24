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

## Branch Merge Policy: `main` → `brain-deploy-preview`

Apply this policy whenever changes from `main` are merged into the branch named exactly `brain-deploy-preview`.

`brain-deploy-preview` is a prepare-only branch. A merge may carry shared fixes forward, but it must not turn that branch into the full deploy/runtime and plugin-distribution workflow used by `main`.

### Update from `main`

- Merge repository-wide engineering rules that remain valid for both workflows, including editing discipline, language and style conventions, secret handling, and validation expectations for shared code.
- Keep these skill directories aligned with `main`: `skills/cloud-native-readiness/`, `skills/sealos-app-builder/`, `skills/sealos-database/`, `skills/sealos-s3/`, and `skills/docker-to-sealos/`. Merge their implementation, documentation, references, tests, and eval fixtures together. After the merge, these directories should have no intentional differences from the `main` commit being merged.
- Keep `skills/dockerfile-skill/` aligned with `main` as its baseline, while preserving the additional Railpack rules required by `brain-deploy-preview`. The only intentional differences from `main` in this skill should be the rules that consume normalized `analysis.json.build_environment` evidence, preserve explicit config/README/Dockerfile/lockfile precedence, reject direct use of raw Railpack JSON, and forbid replacing the Dockerfile plus Kaniko path with `railpack build`.
- Evaluate every `skills/sealos-deploy/` change manually. Adopt shared fixes only when they fit the prepare-only workflow; by default preserve the `brain-deploy-preview` pipeline and its artifact contracts instead of taking the `main` implementation.

### Keep the `brain-deploy-preview` Skill Flow Unchanged

- Keep `skills/sealos-deploy/` on the prepare-only flow: assess, optional Railpack probe, image detection, Dockerfile preparation, `build-request.json`, sandbox Kaniko build or image reuse, template generation, and `delivery-manifest.json`.
- Keep `skills/k8s-kaniko-job/` on the `brain-deploy-preview` branch's own flow. Do not replace it with a `main` build path during a merge.
- Do not merge `skills/sealos-canvas/` into `brain-deploy-preview`. Also keep Sealos OAuth and Template API deployment, UPDATE mode, rollout/rollback, and runtime smoke verification out of the branch.
- Preserve the absence of `skills/k8s-buildkit-job/`; Kaniko remains the build executor for this branch.

### Files Outside `skills/`

- Keep the target branch's `AGENTS.md` project identity, prepare-only architecture, dependency graph, branch-specific constraints, pipeline description, artifact contract, commands, and key paths. Do not replace the file wholesale with the `main` version. Copy generic engineering guidance into the appropriate target section only when it remains accurate there.
- Keep the target branch's `README.md` and `CLAUDE.md`. They describe the `skills.sh` prepare-only product and must not be replaced by `main` plugin-first documentation or by the `main` `CLAUDE.md` symlink.
- Merge `.gitignore` manually. Adopt generic ignore patterns when useful, preserve preview-specific generated-document rules, and do not add exceptions that exist only to track main's plugin metadata.
- Review `.agents/sealos-deploy-containerize.mmd` manually and keep it accurate for the preview prepare flow. Do not overwrite it automatically with a diagram for the full deploy/runtime pipeline.
- Do not merge main's plugin and marketplace surfaces: `.codex-plugin/`, `.claude-plugin/`, `.codebuddy-plugin/`, `.agents/plugins/`, `commands/`, `distribution/`, `marketplaces/`, `plugins/`, `plugin.json`, `marketplace.json`, `gemini-extension.json`, `qwen-extension.json`, or `openclaw.plugin.json`.
- Do not merge main's current `assets/`; they contain plugin branding and Codex usage media. Evaluate future non-plugin assets separately.
- Do not merge main's `.planning/` history. If the preview branch has planning artifacts of its own, preserve the target branch's versions.
- Evaluate root `scripts/` files manually. Merge a script only when it validates behavior intentionally shared with the preview branch. Do not merge `scripts/validate-codex-plugin.py` or `scripts/test-sealos-deploy-template-references.mjs`, because they validate main-only plugin or full-deploy behavior.

### Merge Procedure

- Record both the source `main` commit and the pre-merge `brain-deploy-preview` commit before resolving conflicts.
- Resolve branch-owned files in favor of the target branch, synchronize the five main-aligned skills listed above, preserve only the documented Railpack delta in `dockerfile-skill`, and manually evaluate every `sealos-deploy` change. Do not use a repository-wide "ours" or "theirs" strategy.
- Review the final diff for accidental additions of main-only files and accidental deletion of brain-only files.
- Confirm that the five main-aligned skill directories have no remaining diff from the recorded source `main` commit, and that `dockerfile-skill` differs from that commit only by the documented Railpack rules.
- Validate every shared skill that changed, run the `docker-to-sealos` quality gate when its rules or converter changed, and run the Kaniko and deploy helper tests when the prepare pipeline changed.
- In the merge commit or pull request, list which `main` changes were adopted, which were adapted, and which were intentionally excluded under this policy.

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

DEPLOY: Assess (including the obvious-impossibility entry judgment) → Official template lookup
  ├→ unique safe exact match: reuse official YAML → Resolve inputs → Dry-run → Deploy → Runtime Truth
  └→ otherwise: Discover README/CI/Compose images and full topology → per-service reuse or Dockerfile/Build & Push → digest-pinned Template → Configure → Dry-run → Deploy → Runtime Truth
UPDATE: Build & Push → resolve digest → kubectl set image → Verify rollout (auto-rollback on failure)
```

Mode detection reads `.sealos/state.json` `last_deploy` field. If a running deployment is found (verified via kubectl), the skill enters UPDATE mode and skips assess/template/deploy phases. If not, it runs the full DEPLOY pipeline.

State is tracked in `.sealos/state.json` (deployment state), `.sealos/analysis.json` (project analysis snapshot), `.sealos/template-references.json` plus `.sealos/template-references/` (exact catalog decision and provenance), and `.sealos/config.json` (optional user overrides). A unique, source-aligned official match is copied verbatim to `.sealos/template/index.yaml` and skips Phases 2–5.5; every other result follows the standard build-and-generate route. Similar-template reference matching is a documented TODO and is not executed.

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
- For template catalog reference behavior, run `node scripts/test-sealos-deploy-template-references.mjs`.
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
