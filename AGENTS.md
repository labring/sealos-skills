# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What This Project Is

Seakills is a skills repository for Sealos Cloud in the `skills.sh` ecosystem. This repo contains the skills pack plus supporting helper scripts and eval fixtures. This branch keeps `/sealos-deploy` as a lite prepare-only workflow while also exposing database and S3 helper skills.

## Commands

This repo does not have a single top-level app build.

- Most work happens directly under `skills/**`
- Run helper scripts with `node <path-to-script>.mjs`
- Keep `skills/*/evals/` in sync when skill behavior changes

## Branch Merge Policy: `main` → `brain-deploy-preview`

Apply this policy whenever content from `main` is synchronized into the branch named
exactly `brain-deploy-preview`.

`brain-deploy-preview` is a prepare-only branch. Shared fixes may be carried forward,
but they must not turn this branch into the full deploy/runtime or plugin-distribution
workflow used by `main`.

### Content ownership

- Keep `skills/cloud-native-readiness/`, `skills/sealos-app-builder/`,
  `skills/sealos-database/`, `skills/sealos-s3/`, and `skills/docker-to-sealos/`
  aligned with the selected `main` source tree. These directories have no intentional
  preview-specific differences.
- Keep `skills/dockerfile-skill/` aligned with `main` as its baseline while preserving
  only the documented Railpack rules: consume normalized
  `analysis.json.build_environment`, preserve config/README/Dockerfile/lockfile
  precedence, reject direct use of raw Railpack JSON, and keep the Dockerfile plus
  Kaniko build path instead of `railpack build`.
- Evaluate every `skills/sealos-deploy/` difference manually. Adopt shared fixes only
  when they fit the prepare-only workflow and preserve its artifact contracts.
- Keep `skills/k8s-kaniko-job/` and the optional Railpack probe. Keep
  `skills/sealos-canvas/`, `skills/k8s-buildkit-job/`, Sealos OAuth and Template API
  deployment, UPDATE mode, rollout/rollback, and runtime smoke verification out of
  this branch.

### Files outside `skills/`

- Preserve this branch's `AGENTS.md`, `README.md`, `CLAUDE.md`, prepare-only diagram,
  and generated-document ignore rules. Adapt shared engineering guidance manually.
- Do not copy plugin, marketplace, distribution, branding asset, or `.planning/`
  surfaces from `main`.
- Evaluate root `scripts/` manually. Do not copy main-only plugin validation or
  template-fast-path tests.

### Synchronization checks

- Record the source `main` tree and the pre-sync preview tree.
- Confirm that the five main-aligned skill directories have no content difference
  from the selected source tree.
- Confirm that `dockerfile-skill` differs only by the documented Railpack rules.
- Review the final content inventory for accidental main-only additions or deletion
  of preview-owned files.
- Validate every shared skill that changed, run the `docker-to-sealos` quality gate,
  and run deploy and Kaniko helper tests when the prepare pipeline changes.

## Architecture

### Skill dependency graph
```text
direct skills.sh entry points
  ├→ sealos-deploy (prepare-only entry point: /sealos-deploy)
  │   ├→ cloud-native-readiness   (Phase 0.4: eligibility; Phase 1: score 0-12)
  │   ├→ dockerfile-skill         (Phase 3: generate Dockerfile)
  │   ├→ k8s-kaniko-job           (Phase 4: sandbox kaniko build)
  │   └→ docker-to-sealos         (Phase 5: Sealos template)
  ├→ sealos-database (direct entry point: /sealos-database)
  └→ sealos-s3       (direct entry point: /sealos-s3)
```

### Branch-specific constraints
- **BRAIN-C1:** The `brain-deploy` and `brain-deploy-preview` branches are prepare-only branches and must not include `skills/sealos-canvas/`. If an agent finds `skills/sealos-canvas/` on either branch, stop and tell the user that the canvas skill belongs to the full deploy/runtime workflow, not the prepare-only branch.
- **BRAIN-C2:** Railpack probing is specific to the `brain-deploy` and `brain-deploy-preview` prepare flow. Do not copy the Railpack probe step into `main` unless the user explicitly decides to add it to the full deploy/runtime workflow. In brain branches, Railpack output may only be consumed through normalized `analysis.json.build_environment` evidence; do not use raw `.sealos/railpack-info.json` or `.sealos/railpack-plan.json`, and do not replace the Dockerfile plus `k8s-kaniko-job` build path with `railpack build`.

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
Preflight → Eligibility → Assess → Optional Railpack Probe → Detect Image
          → Dockerfile → Build/Reuse Image → Template → Finish

Build/Reuse Image:
  - reusable public image found → write build-result.json with status=skipped
  - no reusable image → write build-request.json and delegate to k8s-kaniko-job
```

State for the prepare workflow is tracked through `.sealos/analysis.json`, `.sealos/build-request.json`, `.sealos/build-result.json`, `.sealos/template/index.yaml`, and `.sealos/delivery-manifest.json`. `.sealos/config.json` remains an optional user override file. The deployment eligibility decision is read-only, remains in the current execution context, and is not written as a project artifact. Database and S3 skills operate through `sealos-cli` and local env files, not through the prepare artifact state.

## Key paths
- `skills/sealos-deploy/SKILL.md` — primary entry point for the prepare workflow
- `skills/cloud-native-readiness/knowledge/deployment-eligibility.md` — canonical supported-workload policy
- `skills/sealos-deploy/scripts/workload-eligibility.mjs` — deterministic, read-only workload classifier
- `skills/sealos-deploy/config.json` — prepare/build defaults
- `skills/sealos-deploy/scripts/` — scoring, image detection, and artifact validation scripts
- `skills/sealos-deploy/evals/evals.json` — eval prompts and assertions
- `skills/k8s-kaniko-job/` — sandbox kaniko executor used when a new image is required
- `skills/sealos-database/SKILL.md` — cloud database development workflow
- `skills/sealos-s3/SKILL.md` — S3-compatible object storage workflow

## Engineering Rules

### Editing Discipline

- Treat root `skills/**` as the canonical implementation.
- Make the smallest content change that satisfies the request and keep behavior in
  the owning skill.
- Inspect status and relevant diffs before editing. Preserve unrelated user changes
  and untracked files.
- Remove imports, variables, fixtures, and generated files made obsolete by the
  current change.
- Keep durable project rules here; keep milestone narratives in history or planning
  artifacts rather than operational skill files.

### Language and Style

- Write code, code comments, commit messages, and pull request text in English.
- Match each file's existing conventions before introducing a new pattern.
- Python uses four-space indentation, snake_case names, explicit imports, useful type
  hints, and `unittest` for the existing validator suite.
- Node.js helpers use ESM, two-space indentation, camelCase names, structured JSON on
  stdout, and human-facing diagnostics on stderr.
- Keep Markdown operational and concise. Put detailed examples and protocol
  specifications in the owning skill's `references/`, `knowledge/`, or `modules/`
  directory.

### Targeted Validation

- Run the narrowest relevant checks first, then the owning skill's complete gate.
- For `docker-to-sealos` rule, converter, or reference changes, run
  `DOCKER_TO_SEALOS_ALLOW_EMPTY_ARTIFACTS=1 python3 skills/docker-to-sealos/scripts/quality_gate.py`
  when no generated template fixture is available, plus its consistency, converter,
  coverage, and quality-gate tests.
- For changed `sealos-deploy` JavaScript helpers, run `node --check` and the matching
  test file.
- Run `node skills/sealos-deploy/scripts/test-workload-eligibility.mjs` whenever the
  eligibility policy, classifier, or gate semantics change.
- Run the preview artifact-validator, image-detection, Railpack-probe, and
  `k8s-kaniko-job` helper tests when the prepare pipeline changes.
- Keep `skills/sealos-deploy/evals/` aligned with user-visible prepare behavior.

### Runtime Safety

- Obtain explicit user confirmation before Kubernetes, database, or bucket deletion;
  public-access changes; credential rotation; or system tool installation.
- Keep passwords, tokens, kubeconfig contents, S3 secrets, `.env` values, and complete
  connection strings out of committed files and user-facing output.
- Scope Kubernetes operations to the selected namespace and named application. Build
  phases use the sandbox-provided kubeconfig, namespace, and service account.
