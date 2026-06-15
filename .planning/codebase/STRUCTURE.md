# Codebase Structure

**Analysis Date:** 2026-06-15

## Directory Layout

```text
sealos-skills/
├── .agents/                  # Local Codex marketplace metadata and supporting diagram
├── .claude-plugin/           # Claude Code-compatible plugin and marketplace metadata
├── .codebuddy-plugin/        # CodeBuddy marketplace metadata
├── .codex-plugin/            # Codex plugin manifest
├── .planning/codebase/       # Generated codebase mapping documents
├── assets/                   # Plugin logo and README screenshots
├── commands/                 # Claude-compatible slash command router
├── distribution/             # Platform support registry and evidence
├── marketplaces/             # Marketplace maintainer rules
├── scripts/                  # Repository-level validation scripts
├── skills/                   # Canonical skill source for every host
├── AGENTS.md                 # Repository agent instructions
├── README.md                 # User-facing install, usage, and distribution guide
├── marketplace.json          # Claude-compatible root marketplace entry
├── gemini-extension.json     # Gemini CLI context extension manifest
├── qwen-extension.json       # Qwen Code context extension manifest
└── openclaw.plugin.json      # OpenClaw / ClawHub bundle pointer
```

## Directory Purposes

**`skills/`:**
- Purpose: Canonical source for all Sealos skills. Add and edit skill behavior here.
- Contains: One directory per skill with `SKILL.md`, optional `modules/`, `scripts/`, `references/`, `knowledge/`, `templates/`, `assets/`, `schemas/`, `evals/`, and `agents/`.
- Key files: `skills/sealos-deploy/SKILL.md`, `skills/sealos-database/SKILL.md`, `skills/sealos-s3/SKILL.md`, `skills/docker-to-sealos/SKILL.md`

**`skills/sealos-deploy/`:**
- Purpose: Primary deployment workflow from local/GitHub project to Sealos Cloud.
- Contains: Entry skill, phase modules, deploy helper scripts, JSON schemas, evals, config, lessons, and live-smoke references.
- Key files: `skills/sealos-deploy/SKILL.md`, `skills/sealos-deploy/modules/preflight.md`, `skills/sealos-deploy/modules/pipeline.md`, `skills/sealos-deploy/scripts/deploy-template.mjs`, `skills/sealos-deploy/scripts/sealos-live-smoke.mjs`, `skills/sealos-deploy/schemas/state.schema.json`

**`skills/cloud-native-readiness/`:**
- Purpose: Assess cloud-native readiness and route projects toward Docker artifact generation when needed.
- Contains: Assessment, detection, routing modules, scoring knowledge, Sealos patterns, and sample output.
- Key files: `skills/cloud-native-readiness/SKILL.md`, `skills/cloud-native-readiness/modules/assess.md`, `skills/cloud-native-readiness/knowledge/scoring-model.md`

**`skills/dockerfile-skill/`:**
- Purpose: Generate and fix production Dockerfiles and related containerization artifacts.
- Contains: Analyze/generate/build-fix modules, Dockerfile templates, validation script, examples, and knowledge files.
- Key files: `skills/dockerfile-skill/SKILL.md`, `skills/dockerfile-skill/modules/analyze.md`, `skills/dockerfile-skill/templates/nodejs-nextjs.dockerfile`, `skills/dockerfile-skill/scripts/validate-dockerfile.mjs`

**`skills/docker-to-sealos/`:**
- Purpose: Convert Docker Compose files or install docs into Sealos templates.
- Contains: Conversion rules, Sealos specs, database templates, rule registries, converter scripts, validators, and tests.
- Key files: `skills/docker-to-sealos/SKILL.md`, `skills/docker-to-sealos/references/sealos-specs.md`, `skills/docker-to-sealos/scripts/compose_to_template.py`, `skills/docker-to-sealos/scripts/check_consistency.py`, `skills/docker-to-sealos/scripts/quality_gate.py`

**`skills/sealos-database/`:**
- Purpose: Provision, connect, and operate Sealos Cloud databases for local development and Devbox usage.
- Contains: Entry skill, analyzer script, OpenAI agent config, evals, CLI references, and env integration rules.
- Key files: `skills/sealos-database/SKILL.md`, `skills/sealos-database/scripts/analyze-project-database.mjs`, `skills/sealos-database/references/sealos-cli-database.md`, `skills/sealos-database/references/env-integration.md`

**`skills/sealos-s3/`:**
- Purpose: Provision, connect, and operate Sealos S3-compatible object storage.
- Contains: Entry skill, analyzer script, OpenAI agent config, evals, CLI references, and env integration rules.
- Key files: `skills/sealos-s3/SKILL.md`, `skills/sealos-s3/scripts/analyze-project-s3.mjs`, `skills/sealos-s3/references/sealos-cli-s3.md`, `skills/sealos-s3/references/env-integration.md`

**`skills/sealos-canvas/`:**
- Purpose: Render deployed Sealos resources as a local read-only topology UI.
- Contains: Entry skill, generator script, HTML template, evals, and OpenAI agent config.
- Key files: `skills/sealos-canvas/SKILL.md`, `skills/sealos-canvas/scripts/generate-canvas.mjs`, `skills/sealos-canvas/assets/canvas-template.html`

**`skills/sealos-app-builder/`:**
- Purpose: Guide Sealos Desktop app SDK integration, local debugging, and publish readiness.
- Contains: Entry skill, React/Vue starter templates, SDK references, Next.js App Router guidance, and publish checklist.
- Key files: `skills/sealos-app-builder/SKILL.md`, `skills/sealos-app-builder/assets/templates/react/sealos-provider.tsx`, `skills/sealos-app-builder/assets/templates/vue/use-sealos.ts`, `skills/sealos-app-builder/references/minimal-app-template.md`

**`.codex-plugin/`:**
- Purpose: Codex plugin manifest and UI metadata.
- Contains: `plugin.json` pointing to `./skills/`.
- Key files: `.codex-plugin/plugin.json`

**`.agents/`:**
- Purpose: Local Codex marketplace entry and supporting diagram.
- Contains: Local marketplace JSON and Mermaid diagram.
- Key files: `.agents/plugins/marketplace.json`, `.agents/sealos-deploy-containerize.mmd`

**`.claude-plugin/`:**
- Purpose: Claude Code-compatible plugin metadata.
- Contains: Plugin manifest and marketplace entry.
- Key files: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`

**`.codebuddy-plugin/`:**
- Purpose: CodeBuddy marketplace metadata.
- Contains: Marketplace entry.
- Key files: `.codebuddy-plugin/marketplace.json`

**`commands/`:**
- Purpose: Host command router for `/sealos`.
- Contains: Markdown command file with frontmatter, routing table, safety rules, and examples.
- Key files: `commands/sealos.md`

**`distribution/`:**
- Purpose: Platform support claims and verification evidence.
- Contains: Platform registry JSON.
- Key files: `distribution/platforms.json`

**`marketplaces/`:**
- Purpose: Maintainer notes for marketplace files and command-support claims.
- Contains: README guidance.
- Key files: `marketplaces/README.md`

**`assets/`:**
- Purpose: Shared plugin and README visual assets.
- Contains: SVG logo and Codex plugin screenshot.
- Key files: `assets/logo.svg`, `assets/codex-sealos.png`

**`scripts/`:**
- Purpose: Repository-level validation, separate from skill-local runtime helpers.
- Contains: Python validator for Codex plugin integration files.
- Key files: `scripts/validate-codex-plugin.py`

## Key File Locations

**Entry Points:**
- `.codex-plugin/plugin.json`: Codex plugin entry, points to root `skills/`.
- `commands/sealos.md`: `/sealos` route table for Claude-compatible hosts.
- `skills/sealos-deploy/SKILL.md`: Direct deploy skill entry.
- `skills/sealos-database/SKILL.md`: Direct database skill entry.
- `skills/sealos-s3/SKILL.md`: Direct object-storage skill entry.
- `skills/sealos-canvas/SKILL.md`: Direct deployed-resource canvas skill entry.
- `skills/sealos-app-builder/SKILL.md`: Direct Sealos Desktop app skill entry.
- `skills/cloud-native-readiness/SKILL.md`: Direct readiness assessment skill entry.
- `skills/dockerfile-skill/SKILL.md`: Direct Dockerfile generation skill entry.
- `skills/docker-to-sealos/SKILL.md`: Direct Compose-to-template conversion skill entry.

**Configuration:**
- `skills/sealos-deploy/config.json`: Sealos deploy OAuth and regional config.
- `skills/sealos-deploy/schemas/config.schema.json`: Target-project `.sealos/config.json` schema.
- `.agents/plugins/marketplace.json`: Local Codex marketplace entry.
- `.claude-plugin/plugin.json`: Claude-compatible plugin manifest.
- `.claude-plugin/marketplace.json`: Claude-compatible marketplace metadata.
- `.codebuddy-plugin/marketplace.json`: CodeBuddy marketplace metadata.
- `marketplace.json`: Root Claude-compatible marketplace entry.
- `gemini-extension.json`: Gemini CLI extension config.
- `qwen-extension.json`: Qwen Code extension config.
- `openclaw.plugin.json`: OpenClaw / ClawHub plugin config.
- `distribution/platforms.json`: Platform support registry.

**Core Logic:**
- `skills/sealos-deploy/modules/pipeline.md`: Deployment mode detection, resume behavior, artifact layout, and deploy phases.
- `skills/sealos-deploy/modules/preflight.md`: Environment and auth checks for deployment.
- `skills/sealos-deploy/scripts/score-model.mjs`: Deterministic deployability scoring.
- `skills/sealos-deploy/scripts/build-push.mjs`: Container image build and push.
- `skills/sealos-deploy/scripts/deploy-template.mjs`: Template API deployment.
- `skills/sealos-deploy/scripts/sealos-footprint.mjs`: Sealos resource inventory.
- `skills/sealos-deploy/scripts/sealos-live-smoke.mjs`: Real App URL smoke checks.
- `skills/docker-to-sealos/scripts/compose_to_template.py`: Compose-to-template conversion entrypoint.
- `skills/docker-to-sealos/scripts/check_consistency.py`: Template consistency validation.
- `skills/sealos-canvas/scripts/generate-canvas.mjs`: Read-only local topology UI generation.

**Rules and References:**
- `skills/docker-to-sealos/references/sealos-specs.md`: Sealos template specification.
- `skills/docker-to-sealos/references/database-templates.md`: KubeBlocks database resource patterns.
- `skills/docker-to-sealos/references/conversion-mappings.md`: Compose-to-Sealos mapping rules.
- `skills/docker-to-sealos/references/rules-registry.yaml`: Conversion rule registry.
- `skills/dockerfile-skill/knowledge/error-patterns.md`: Known Docker build issues and fixes.
- `skills/dockerfile-skill/knowledge/monorepo-cli-patterns.md`: Workspace CLI patterns.
- `skills/cloud-native-readiness/knowledge/criteria.md`: Readiness scoring criteria.
- `skills/sealos-deploy/references/live-smoke-playbooks.md`: Runtime smoke-check playbooks.
- `skills/sealos-database/references/sealos-cli-database.md`: Database CLI reference.
- `skills/sealos-s3/references/sealos-cli-s3.md`: S3 CLI reference.

**Testing and Evals:**
- `skills/sealos-deploy/evals/evals.json`: Deploy skill eval prompts and assertions.
- `skills/sealos-deploy/evals/benchmark.json`: Deploy benchmark cases.
- `skills/sealos-database/evals/evals.json`: Database skill evals.
- `skills/sealos-s3/evals/evals.json`: S3 skill evals.
- `skills/sealos-canvas/evals/evals.json`: Canvas skill evals.
- `skills/docker-to-sealos/scripts/test_check_consistency.py`: Consistency validator tests.
- `skills/docker-to-sealos/scripts/test_compose_to_template.py`: Compose conversion tests.
- `skills/docker-to-sealos/scripts/test_quality_gate.py`: Quality gate tests.
- `scripts/validate-codex-plugin.py`: Distribution metadata validation.

## Naming Conventions

**Files:**
- `SKILL.md`: Skill entry file for every skill directory, for example `skills/sealos-deploy/SKILL.md`.
- `modules/*.md`: Phase-level instructions with kebab-case names, for example `skills/sealos-deploy/modules/preflight.md`.
- `references/*.md`: Detailed operating references, for example `skills/sealos-s3/references/env-integration.md`.
- `knowledge/*.md`: Reusable decision knowledge, for example `skills/dockerfile-skill/knowledge/best-practices.md`.
- `scripts/*.mjs`: Node.js helper scripts, for example `skills/sealos-deploy/scripts/build-push.mjs`.
- `scripts/*.py`: Python converters, validators, and tests, for example `skills/docker-to-sealos/scripts/check_consistency.py`.
- `schemas/*.schema.json`: JSON schemas for generated deploy artifacts, for example `skills/sealos-deploy/schemas/state.schema.json`.
- `evals/evals.json`: Skill eval definitions where evals exist.

**Directories:**
- Skill directories use kebab-case under `skills/`, for example `skills/sealos-app-builder/`.
- Skill subdirectories use purpose names: `modules/`, `scripts/`, `references/`, `knowledge/`, `templates/`, `assets/`, `schemas/`, `evals/`, `agents/`.
- Plugin metadata directories are host-specific dot directories, for example `.codex-plugin/` and `.claude-plugin/`.

## Where to Add New Code

**New Sealos Skill:**
- Primary code: `skills/<new-skill>/SKILL.md`
- Supporting phases: `skills/<new-skill>/modules/*.md`
- Deterministic helpers: `skills/<new-skill>/scripts/*`
- References: `skills/<new-skill>/references/*.md`
- Evals: `skills/<new-skill>/evals/evals.json`
- Route update: `commands/sealos.md` when the skill is reachable from `/sealos`
- Distribution validation update: `distribution/platforms.json` or `scripts/validate-codex-plugin.py` only when support claims or manifest rules change

**New Deploy Phase or Behavior:**
- Primary instructions: `skills/sealos-deploy/modules/pipeline.md`
- Safety or user-facing trigger rules: `skills/sealos-deploy/SKILL.md`
- Helper implementation: `skills/sealos-deploy/scripts/*.mjs`
- Artifact schema: `skills/sealos-deploy/schemas/*.schema.json`
- Eval updates: `skills/sealos-deploy/evals/evals.json`

**New Dockerfile Pattern:**
- Analysis/generation instructions: `skills/dockerfile-skill/modules/analyze.md` or `skills/dockerfile-skill/modules/generate.md`
- Template: `skills/dockerfile-skill/templates/<runtime>.dockerfile`
- Build-fix knowledge: `skills/dockerfile-skill/knowledge/error-patterns.md`
- Validation helper: `skills/dockerfile-skill/scripts/validate-dockerfile.mjs`

**New Compose-to-Sealos Rule:**
- Top-level MUST rule: `skills/docker-to-sealos/SKILL.md`
- Detailed mapping: `skills/docker-to-sealos/references/conversion-mappings.md`
- Sealos spec rule: `skills/docker-to-sealos/references/sealos-specs.md`
- Database-specific pattern: `skills/docker-to-sealos/references/database-templates.md`
- Rule registry: `skills/docker-to-sealos/references/rules-registry.yaml`
- Validator implementation: `skills/docker-to-sealos/scripts/check_consistency_rules*.py`
- Tests: `skills/docker-to-sealos/scripts/test_check_consistency.py`

**New Database or S3 Integration Detection:**
- Database analyzer: `skills/sealos-database/scripts/analyze-project-database.mjs`
- Database guidance: `skills/sealos-database/references/env-integration.md`
- S3 analyzer: `skills/sealos-s3/scripts/analyze-project-s3.mjs`
- S3 guidance: `skills/sealos-s3/references/env-integration.md`

**New Canvas UI Capability:**
- Generator logic: `skills/sealos-canvas/scripts/generate-canvas.mjs`
- HTML shell: `skills/sealos-canvas/assets/canvas-template.html`
- Skill output contract: `skills/sealos-canvas/SKILL.md`
- Evals: `skills/sealos-canvas/evals/evals.json`

**New Plugin Distribution Metadata:**
- Codex plugin metadata: `.codex-plugin/plugin.json`
- Local Codex marketplace: `.agents/plugins/marketplace.json`
- Claude-compatible plugin metadata: `.claude-plugin/plugin.json`
- Claude-compatible command routing: `commands/sealos.md`
- Platform claim registry: `distribution/platforms.json`
- Validation rules: `scripts/validate-codex-plugin.py`
- Assets: `assets/`

**Utilities:**
- Shared repository validation: `scripts/`
- Skill-local runtime helpers: `skills/<skill>/scripts/`
- Shared skill behavior should be referenced through sibling skill paths under `skills/` instead of copied into another skill directory.

## Special Directories

**`.planning/codebase/`:**
- Purpose: Generated GSD codebase maps consumed by planning and execution commands.
- Generated: Yes
- Committed: Project-dependent

**`skills/`:**
- Purpose: Canonical skill pack source for all hosts.
- Generated: No
- Committed: Yes

**`skills/*/evals/`:**
- Purpose: Skill behavior eval prompts, assertions, and benchmarks.
- Generated: No
- Committed: Yes

**`skills/*/agents/`:**
- Purpose: Host-specific agent configuration for skills that need it.
- Generated: No
- Committed: Yes

**`skills/dockerfile-skill/templates/`:**
- Purpose: Dockerfile and entrypoint templates used by the Dockerfile generation workflow.
- Generated: No
- Committed: Yes

**`skills/sealos-deploy/schemas/`:**
- Purpose: JSON schemas for target-project `.sealos/` deployment artifacts.
- Generated: No
- Committed: Yes

**Target project `.sealos/`:**
- Purpose: Per-project generated deploy state, analysis, build result, template, and canvas output.
- Generated: Yes
- Committed: Depends on the target project and artifact type; `.sealos/config.json` may be committed when it contains only safe overrides.

---

*Structure analysis: 2026-06-15*
