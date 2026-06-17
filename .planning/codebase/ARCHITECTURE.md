<!-- refreshed: 2026-06-15 -->
# Architecture

**Analysis Date:** 2026-06-15

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                 Plugin and Skill Entry Layer                 │
├──────────────────┬──────────────────┬───────────────────────┤
│ Codex plugin     │ Claude command   │ skills.sh direct use   │
│ `.codex-plugin/` │ `commands/`      │ `skills/*/SKILL.md`    │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Root Skill Source Layer                     │
│ `skills/sealos-deploy`, `skills/sealos-database`,            │
│ `skills/sealos-s3`, `skills/sealos-canvas`, support skills   │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│        Execution Helpers, Rule References, and Artifacts      │
│ `skills/*/scripts`, `skills/*/modules`, `skills/*/references` │
│ target project `.sealos/*`, Sealos Cloud, Kubernetes, GHCR    │
└─────────────────────────────────────────────────────────────┘
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

**Overall:** Plugin-first skill pack with one canonical root `skills/` source and host-specific distribution manifests.

**Key Characteristics:**
- `skills/**` is the only skill source for plugin installs, `skills.sh`, and context-only extensions.
- User-facing plugin entry points route to smaller task-specific skills instead of duplicating workflow logic.
- Long workflows are Markdown-orchestrated and script-assisted: `SKILL.md` defines routing and guardrails, `modules/*.md` defines phase logic, `scripts/*` supplies deterministic execution.
- Deployment state is written into the target project under `.sealos/`, while repository distribution state stays in manifest files at the repo root.

## Layers

**Distribution Layer:**
- Purpose: Expose the same skills to Codex, Claude-compatible hosts, CodeBuddy, OpenClaw, Gemini, Qwen, and generic importers.
- Location: `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `.claude-plugin/plugin.json`, `.codebuddy-plugin/marketplace.json`, `marketplace.json`, `gemini-extension.json`, `qwen-extension.json`, `openclaw.plugin.json`, `distribution/platforms.json`
- Contains: Manifest metadata, install targets, command support claims, UI assets, and marketplace entries.
- Depends on: Root `skills/` and `assets/`.
- Used by: Plugin installers, marketplace flows, extension hosts, and `scripts/validate-codex-plugin.py`.

**Command Routing Layer:**
- Purpose: Route broad Sealos requests to the most specific skill.
- Location: `commands/sealos.md`
- Contains: Claude-compatible command frontmatter, route table, safety reminders, and examples.
- Depends on: `skills/sealos-deploy/SKILL.md`, `skills/sealos-database/SKILL.md`, `skills/sealos-s3/SKILL.md`, `skills/sealos-app-builder/SKILL.md`, `skills/cloud-native-readiness/SKILL.md`, `skills/dockerfile-skill/SKILL.md`, `skills/docker-to-sealos/SKILL.md`
- Used by: `/sealos` plugin command hosts.

**Skill Definition Layer:**
- Purpose: Define task triggers, compatibility, safety rules, workflows, and output contracts.
- Location: `skills/*/SKILL.md`
- Contains: YAML frontmatter, usage, hard rules, quick starts, workflow diagrams, script contracts, and internal dependency notes.
- Depends on: Skill-local `modules/`, `references/`, `knowledge/`, `scripts/`, `templates/`, and sibling skills.
- Used by: Agent hosts and future maintainers adding or changing skill behavior.

**Workflow Module Layer:**
- Purpose: Break large workflows into phase-level instructions.
- Location: `skills/sealos-deploy/modules/*.md`, `skills/cloud-native-readiness/modules/*.md`, `skills/dockerfile-skill/modules/*.md`
- Contains: Preflight, pipeline, assess, detect, route, analyze, generate, and build-fix instructions.
- Depends on: Skill-local scripts and rule references.
- Used by: `SKILL.md` quick-start sequences.

**Rule and Knowledge Layer:**
- Purpose: Hold detailed constraints, examples, Sealos specs, conversion mappings, scoring criteria, and error patterns.
- Location: `skills/*/knowledge/*.md`, `skills/*/references/*.md`, `skills/docker-to-sealos/references/*.yaml`
- Contains: Scoring models, Sealos template specs, database templates, conversion rules, live smoke playbooks, SDK guidance, and CLI usage references.
- Depends on: Current Sealos platform behavior and validation scripts.
- Used by: Workflow modules and helper scripts.

**Script Execution Layer:**
- Purpose: Provide deterministic helper behavior for analysis, validation, conversion, auth, build, deploy, and read-only visualization.
- Location: `skills/*/scripts/*`, `scripts/validate-codex-plugin.py`
- Contains: Node.js `.mjs` scripts for Sealos deploy/database/S3/canvas and Python scripts for Compose conversion and consistency validation.
- Depends on: Node.js, Python, external tools such as Docker, `gh`, `kubectl`, `sealos-cli`, `kompose`, and Sealos auth as required by each skill.
- Used by: Agents executing the workflows and maintainers validating distribution metadata.

**Generated Target-Project Artifact Layer:**
- Purpose: Persist deployment analysis, config, build results, templates, state, and canvas output inside the project being operated on.
- Location: Target project `.sealos/` as defined in `skills/sealos-deploy/modules/pipeline.md` and `skills/sealos-canvas/SKILL.md`
- Contains: `.sealos/config.json`, `.sealos/analysis.json`, `.sealos/state.json`, `.sealos/build/build-result.json`, `.sealos/template/index.yaml`, `.sealos/canvas/index.html`
- Depends on: Deploy phases, schemas in `skills/sealos-deploy/schemas/*.json`, and read-only canvas generation.
- Used by: Resume detection, update mode detection, deploy verification, and canvas rendering.

## Data Flow

### Primary Request Path

1. User invokes `$sealos`, `/sealos`, or a direct skill entry (`.codex-plugin/plugin.json`, `commands/sealos.md`, `skills/*/SKILL.md`).
2. Broad `/sealos` requests are routed to a specific skill by task category (`commands/sealos.md`).
3. Deploy requests enter preflight and pipeline modules (`skills/sealos-deploy/modules/preflight.md`, `skills/sealos-deploy/modules/pipeline.md`).
4. Pipeline creates target-project `.sealos/` artifacts and validates schemas (`skills/sealos-deploy/modules/pipeline.md`, `skills/sealos-deploy/scripts/validate-artifacts.mjs`, `skills/sealos-deploy/schemas/*.json`).
5. Pipeline scores readiness, detects images, generates/reuses Dockerfile artifacts, builds/pushes images, generates a Sealos template, deploys via Template API, and verifies runtime truth (`skills/sealos-deploy/scripts/score-model.mjs`, `skills/sealos-deploy/scripts/detect-image.mjs`, `skills/sealos-deploy/scripts/build-push.mjs`, `skills/sealos-deploy/scripts/deploy-template.mjs`, `skills/sealos-deploy/scripts/sealos-live-smoke.mjs`, `skills/sealos-deploy/scripts/sealos-footprint.mjs`).
6. Successful deploy writes `last_deploy` and history to target-project `.sealos/state.json` (`skills/sealos-deploy/modules/pipeline.md`).

### Deploy Support Skill Flow

1. Readiness assessment evaluates six dimensions and produces a score (`skills/cloud-native-readiness/SKILL.md`, `skills/cloud-native-readiness/modules/assess.md`).
2. Docker artifact detection decides whether containerization is already available (`skills/cloud-native-readiness/modules/detect.md`).
3. Missing Docker artifacts route to Dockerfile generation (`skills/cloud-native-readiness/modules/route.md`, `skills/dockerfile-skill/SKILL.md`).
4. Dockerfile generation analyzes the project, emits packaging files, and runs build/fix cycles (`skills/dockerfile-skill/modules/analyze.md`, `skills/dockerfile-skill/modules/generate.md`, `skills/dockerfile-skill/modules/build-fix.md`).
5. Compose-to-template conversion applies Sealos MUST rules and validates generated templates (`skills/docker-to-sealos/SKILL.md`, `skills/docker-to-sealos/scripts/check_consistency.py`, `skills/docker-to-sealos/scripts/quality_gate.py`).

### Database and Object Storage Flow

1. User request routes to database or S3 skill (`commands/sealos.md`, `skills/sealos-database/SKILL.md`, `skills/sealos-s3/SKILL.md`).
2. Analyzer detects project integration signals without printing secrets (`skills/sealos-database/scripts/analyze-project-database.mjs`, `skills/sealos-s3/scripts/analyze-project-s3.mjs`).
3. Skill uses `sealos-cli` JSON output to list, create, inspect, connect, and verify resources (`skills/sealos-database/references/sealos-cli-database.md`, `skills/sealos-s3/references/sealos-cli-s3.md`).
4. Local env wiring follows the environment integration references and preserves existing values (`skills/sealos-database/references/env-integration.md`, `skills/sealos-s3/references/env-integration.md`).

### Canvas Flow

1. User invokes `/sealos-canvas` for an already deployed target project (`skills/sealos-canvas/SKILL.md`).
2. Script reads target-project `.sealos/state.json` and Kubernetes resources using read-only `kubectl get` commands (`skills/sealos-canvas/scripts/generate-canvas.mjs`).
3. Script writes local HTML output and starts a temporary loopback server (`skills/sealos-canvas/assets/canvas-template.html`, target-project `.sealos/canvas/index.html`).
4. User receives `http://127.0.0.1:<port>/index.html` plus resource graph counts (`skills/sealos-canvas/SKILL.md`).

**State Management:**
- Repository state is declarative and file-backed through manifests, skills, modules, references, schemas, and scripts.
- Target deployment state is per-project and file-backed under `.sealos/state.json`, `.sealos/analysis.json`, `.sealos/config.json`, `.sealos/build/build-result.json`, and `.sealos/template/index.yaml`.
- Authentication and runtime state live outside this repo in user-local locations such as `~/.sealos/auth.json`, `~/.sealos/kubeconfig`, and `~/.sealos/logs/deploy-<timestamp>.log`.

## Key Abstractions

**Skill:**
- Purpose: A self-contained task capability with frontmatter, triggers, workflow, safety rules, and local assets.
- Examples: `skills/sealos-deploy/SKILL.md`, `skills/sealos-database/SKILL.md`, `skills/sealos-s3/SKILL.md`, `skills/docker-to-sealos/SKILL.md`
- Pattern: Directory per skill, `SKILL.md` as entry point.

**Workflow Module:**
- Purpose: A reusable phase document loaded by a skill to keep long workflows maintainable.
- Examples: `skills/sealos-deploy/modules/pipeline.md`, `skills/dockerfile-skill/modules/analyze.md`, `skills/cloud-native-readiness/modules/route.md`
- Pattern: Markdown phase files referenced from `SKILL.md`.

**Reference/Knowledge File:**
- Purpose: Detailed rule content that should be loaded only when the active workflow needs it.
- Examples: `skills/docker-to-sealos/references/sealos-specs.md`, `skills/dockerfile-skill/knowledge/error-patterns.md`, `skills/sealos-deploy/references/live-smoke-playbooks.md`
- Pattern: Markdown or YAML rule files under skill-local `references/` or `knowledge/`.

**Deterministic Helper Script:**
- Purpose: Execute or validate parts of a workflow that benefit from code rather than free-form agent reasoning.
- Examples: `skills/sealos-deploy/scripts/score-model.mjs`, `skills/docker-to-sealos/scripts/compose_to_template.py`, `skills/sealos-canvas/scripts/generate-canvas.mjs`
- Pattern: Script stays with the owning skill; repo-level script exists only for cross-manifest validation.

**Target Project Artifact:**
- Purpose: Persist results of a deploy flow in the project being deployed.
- Examples: `.sealos/state.json`, `.sealos/analysis.json`, `.sealos/template/index.yaml` as defined in `skills/sealos-deploy/modules/pipeline.md`
- Pattern: Generated outside this repository during skill execution; schema-governed where applicable.

**Distribution Manifest:**
- Purpose: Adapt the root skill pack to a specific host without copying skill source.
- Examples: `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `gemini-extension.json`, `qwen-extension.json`, `openclaw.plugin.json`
- Pattern: Each manifest points at root context or root `skills/`.

## Entry Points

**Codex Plugin:**
- Location: `.codex-plugin/plugin.json`
- Triggers: Installed plugin selected as `$sealos` in Codex.
- Responsibilities: Plugin identity, display metadata, default prompts, capabilities, logo paths, and `skills: "./skills/"`.

**Claude-Compatible Command:**
- Location: `commands/sealos.md`
- Triggers: `/sealos` command.
- Responsibilities: Route broad Sealos tasks to the specific skill and preserve destructive-operation guardrails.

**Direct skills.sh Entries:**
- Location: `skills/sealos-deploy/SKILL.md`, `skills/sealos-database/SKILL.md`, `skills/sealos-s3/SKILL.md`, `skills/sealos-canvas/SKILL.md`, `skills/sealos-app-builder/SKILL.md`, `skills/cloud-native-readiness/SKILL.md`, `skills/dockerfile-skill/SKILL.md`, `skills/docker-to-sealos/SKILL.md`
- Triggers: Direct skill invocation such as `/sealos-deploy` or `/docker-to-sealos`.
- Responsibilities: Own the workflow for one task category.

**Context-Only Extensions:**
- Location: `gemini-extension.json`, `qwen-extension.json`
- Triggers: Gemini CLI and Qwen Code extension installs.
- Responsibilities: Provide repository context through `CLAUDE.md` without claiming slash-command behavior.

**Codex Distribution Validation:**
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

**What happens:** A host-specific plugin directory gets its own copy of a skill.
**Why it's wrong:** Root `skills/**` is the canonical source used by Codex, Claude-compatible hosts, `skills.sh`, and context-only extensions; duplicate copies drift.
**Do this instead:** Add or edit the canonical skill under `skills/<skill-name>/` and update manifests such as `.codex-plugin/plugin.json` only to point at root `skills/`.

### Bypassing the Route Skill

**What happens:** Broad plugin examples tell users to call `/sealos-deploy`, `/sealos-database`, or `/sealos-s3` from plugin flows.
**Why it's wrong:** Plugin entry usage is `$sealos` for Codex and `/sealos` for Claude-compatible hosts; direct skill entries are for `skills.sh`.
**Do this instead:** Put plugin examples in `README.md` and `commands/sealos.md` using `$sealos` or `/sealos`, and keep direct skill examples in `skills.sh` sections.

### Treating Deploy Completion as API Success Only

**What happens:** A deployment is reported usable after Template API success without checking actual runtime.
**Why it's wrong:** `skills/sealos-deploy/SKILL.md` defines Phase 6.5 Runtime Truth Pass for App URL, logs, login/setup path, and resource footprint.
**Do this instead:** Use `skills/sealos-deploy/scripts/sealos-live-smoke.mjs` and `skills/sealos-deploy/scripts/sealos-footprint.mjs` before reporting a deployment as usable.

### Editing Generated Target Artifacts as Source Rules

**What happens:** `.sealos/template/index.yaml` or `.sealos/state.json` in a target project is treated as the source of repository rules.
**Why it's wrong:** `.sealos/*` artifacts are generated per target project; repository behavior belongs in `skills/**`, `skills/sealos-deploy/schemas/*.json`, and validation scripts.
**Do this instead:** Change the owning skill, module, schema, reference, or script in this repository, then regenerate target artifacts through the workflow.

## Error Handling

**Strategy:** Fail early on missing prerequisites or unsafe ambiguity; use deterministic scripts where available; validate generated artifacts before trusting resume/update state; require confirmation for destructive actions.

**Patterns:**
- Manifest validation uses `fail()` and `SystemExit(1)` in `scripts/validate-codex-plugin.py`.
- Deploy pipeline logs phase boundaries and errors to a single `~/.sealos/logs/deploy-<timestamp>.log` file as specified in `skills/sealos-deploy/SKILL.md`.
- Deploy artifacts are schema-validated with `skills/sealos-deploy/scripts/validate-artifacts.mjs`.
- Database and S3 flows parse `sealos-cli` JSON output and preserve existing env values before writing local config.
- Canvas flow stops when `.sealos/state.json`, kubeconfig, or live resource access is unavailable, per `skills/sealos-canvas/SKILL.md`.

## Cross-Cutting Concerns

**Logging:** Deploy runs append to `~/.sealos/logs/deploy-<YYYYMMDD-HHmmss>.log`; other scripts return JSON or validation status on stdout.
**Validation:** Use `scripts/validate-codex-plugin.py` for Codex distribution metadata, `skills/sealos-deploy/scripts/validate-artifacts.mjs` for deploy artifacts, and `skills/docker-to-sealos/scripts/check_consistency.py` plus `skills/docker-to-sealos/scripts/quality_gate.py` for Sealos template conversion.
**Authentication:** Sealos auth and workspace selection are handled by `skills/sealos-deploy/scripts/sealos-auth.mjs` or `sealos-cli` workflows in `skills/sealos-database/SKILL.md` and `skills/sealos-s3/SKILL.md`.
**Security:** Keep secrets out of chat and committed files; use approved Kubeblocks and object-storage secret references in generated templates; require confirmation for public access, credential rotation, deletes, and system installs.
**External services:** Workflows target Sealos Cloud, Kubernetes through the Sealos kubeconfig, container registries such as GHCR or Docker Hub, and `sealos-cli` resource APIs.

---

*Architecture analysis: 2026-06-15*
