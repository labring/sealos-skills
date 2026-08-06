# Architecture Research

**Domain:** Multi-host agent skill design system for Sealos Skills v1.1
**Researched:** 2026-08-06
**Confidence:** HIGH
**Local baselines:** Sealos Skills current worktree; Ponytail commit `16f29800fd2681bdf24f3eb4ccffe38be3baec6b`

## Recommendation

Keep the physical `skills/*/SKILL.md` set as the canonical inventory, make `commands/sealos.md` the canonical intent-to-skill routing contract, and keep every runtime rule in its owning skill, module, reference, or deterministic helper. Treat manifests, marketplaces, `qoder.md`, `CLAUDE.md`, and `skills/*/agents/openai.yaml` as projections of those sources. Extend the existing `scripts/validate-codex-plugin.py` gate so every projection is checked against the physical inventory and the shared router.

This is the smallest architecture that covers all eight skills and every current host. It uses one packaged skill source, a stateless task-scoped execution model, and the existing dependency set. Ponytail's transferable mechanism is its ownership discipline and executable drift detection. Ponytail retains ownership of its persistent mode, hook injection, state files, generated OpenClaw package, and host-specific runtime code; Sealos Skills retains task-scoped cloud workflows.

The design must preserve Sealos safety placement. Cross-cutting warnings remain visible before routing in `AGENTS.md`, `commands/sealos.md`, and `qoder.md`. Skill-specific gates remain visible in the relevant `SKILL.md`. Detailed execution stays in existing modules and references. Deterministic helpers remain the final enforcement layer where a fixed oracle exists.

## Evidence Reviewed

| Evidence | Observed behavior | Confidence |
|---|---|---|
| `skills/*/SKILL.md` | Eight canonical skills exist. Entry files range from 116 to 383 lines. | HIGH |
| `.codex-plugin/plugin.json` | Codex points at the complete root `./skills/` directory. | HIGH |
| `.qoder-plugin/plugin.json` | Qoder explicitly lists all eight skill paths and reuses `commands/sealos.md`. | HIGH |
| `.claude-plugin/plugin.json`, `marketplace.json`, `.claude-plugin/marketplace.json`, `.codebuddy-plugin/marketplace.json` | Each explicit inventory currently contains seven skills and omits `sealos-canvas`. | HIGH |
| `scripts/validate-codex-plugin.py` | The current gate compares the Claude and marketplace lists with each other, while only Qoder is compared with physical `skills/*/SKILL.md`. The gate passed while the seven-versus-eight drift remained. | HIGH |
| `skills/*/agents/openai.yaml` | All eight skills already have Codex presentation metadata and `$skill-name` default prompts. | HIGH |
| `skills/*/evals/evals.json` | Deploy, database, S3, and canvas have eval fixtures. Readiness, Dockerfile, Docker-to-Sealos, and app-builder require new skill-local eval files. | HIGH |
| Ponytail `skills/*/SKILL.md` | Six focused skills range from 41 to 120 lines and keep one task boundary per skill. | HIGH |
| Ponytail `scripts/check-rule-copies.js` | Compact host rule files are byte-checked against `AGENTS.md`; nine load-bearing phrases are checked in both `AGENTS.md` and the primary skill. | HIGH |
| Ponytail `scripts/check-versions.js` | Eight version-bearing files are checked against one pinned version and the release tag. | HIGH |
| Ponytail adapter tests | The selected rule, version, command, Gemini, Qoder, OpenClaw, and behavior checks passed at commit `16f2980` (40 selected adapter/behavior tests passed). | HIGH |

The local checkout is more current than the June codebase map in one area: four Sealos skills now have eval fixtures, while `.planning/PROJECT.md` still describes deploy as the only skill with dedicated evals. Roadmap planning should use the live file inventory above.

## Standard Architecture

### System Overview

```text
+-----------------------------------------------------------------------+
| Host entry surfaces                                                   |
| Codex $sealos | Claude /sealos | Qoder /sealos | skills.sh direct     |
| Gemini/Qwen context | CodeBuddy | OpenClaw | generic repo importers   |
+-------------------------------+---------------------------------------+
                                |
                                v
+-----------------------------------------------------------------------+
| Thin host projections                                                 |
| manifests | marketplaces | commands/sealos.md | qoder.md | AGENTS.md  |
| skills/*/agents/openai.yaml | distribution/platforms.json             |
+-------------------------------+---------------------------------------+
                                |
             inventory = discover skills/*/SKILL.md
             routing   = parse commands/sealos.md
                                |
                                v
+-----------------------------------------------------------------------+
| Canonical skill entry contracts                                       |
| eight skills/*/SKILL.md files                                         |
| triggers | scope | safety | workflow | output | handoffs | navigation  |
+-------------------------------+---------------------------------------+
                                |
                                v
+-----------------------------------------------------------------------+
| Owned implementation detail                                           |
| modules/ | references/ | knowledge/ | scripts/ | schemas/ | assets/    |
| templates/ | target-project .sealos/* artifacts                        |
+-------------------------------+---------------------------------------+
                                |
                                v
+-----------------------------------------------------------------------+
| Verification                                                          |
| deterministic: validator + unittest + existing helper tests           |
| behavioral: skill evals + unified router evals                         |
+-----------------------------------------------------------------------+
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|---|---|---|
| Physical skill inventory | Defines exactly which skills ship. | Discover directories matching `skills/*/SKILL.md`; currently eight. |
| Unified routing contract | Maps broad Sealos intents to one specific skill and records the public entry surface. | `commands/sealos.md` with one structured row per physical skill. |
| Skill entry contract | Owns triggers, scope, required safety, workflow outline, output, handoffs, and progressive-loading links. | Each `skills/<name>/SKILL.md`. |
| Detail layer | Owns phase instructions, protocol details, examples, and decision knowledge loaded only when relevant. | Skill-local `modules/`, `references/`, `knowledge/`, `examples/`. |
| Deterministic execution | Parses inputs, validates artifacts, performs scoped operations, and emits structured outputs. | Existing skill-local Node.js and Python helpers. |
| Host adapter | Exposes canonical skills through host-native paths and syntax while preserving behavior. | Plugin manifests, marketplaces, context files, and command metadata. |
| Support-claim registry | Records install, invoke, runtime, evidence, and verification status per host. | `distribution/platforms.json`. |
| Design-system gate | Checks inventory, routing, descriptions, versions, path ownership, safety canaries, eval presence, and host parity. | Expanded `scripts/validate-codex-plugin.py`. |
| Deterministic gate tests | Prove the validator rejects known drift, including a missing skill, route, safety phrase, or version mismatch. | New `scripts/test_validate_codex_plugin.py` using `unittest`. |
| Behavior evals | Exercise probabilistic selection, progressive loading, confirmation, outputs, and handoffs. | `skills/*/evals/evals.json` plus a router-owned eval file. |

## Canonical Ownership Boundaries

### 1. Inventory Ownership

The directory set discovered from `skills/*/SKILL.md` is the inventory source. A second hand-maintained inventory file would duplicate the strongest existing source and introduce another drift edge.

The validator should derive:

```python
canonical_skills = {
    f"./{skill_md.parent.relative_to(root).as_posix()}"
    for skill_md in (root / "skills").glob("*/SKILL.md")
}
```

Every explicit host `skills` array must equal this set exactly. Directory-pointer hosts such as Codex must resolve to the same root directory. Stable display order can come from the order in `commands/sealos.md`; equality checks should remain set-based.

### 2. Routing Ownership

`commands/sealos.md` should become the single broad router. Use a structured table with these fields:

| Intent | Canonical skill | Plugin entry | Direct skills.sh entry |
|---|---|---|---|
| Deploy or update | `sealos-deploy` | `$sealos` / `/sealos` | `/sealos-deploy` |
| Database | `sealos-database` | `$sealos` / `/sealos` | `/sealos-database` |
| Object storage | `sealos-s3` | `$sealos` / `/sealos` | `/sealos-s3` |
| Read-only topology | `sealos-canvas` | `$sealos` / `/sealos` | host selection through the installed pack |
| Desktop app integration | `sealos-app-builder` | `$sealos` / `/sealos` | host selection through the installed pack |
| Readiness assessment | `cloud-native-readiness` | `$sealos` / `/sealos` | host selection through the installed pack |
| Dockerfile generation | `dockerfile-skill` | `$sealos` / `/sealos` | host selection through the installed pack |
| Compose conversion | `docker-to-sealos` | `$sealos` / `/sealos` | host selection through the installed pack |

This preserves the current documented public surfaces: Codex uses `$sealos`, Claude-compatible hosts and Qoder use `/sealos`, and README examples reserve direct `skills.sh` invocation for deploy, database, and S3. The design system covers all eight skills and retains the existing public command set.

`qoder.md` remains a small Qoder context adapter. `.qoder-plugin/plugin.json` should continue to point its command at `commands/sealos.md`. `AGENTS.md` remains the context source for Gemini/Qwen through the existing `CLAUDE.md -> AGENTS.md` symlink.

### 3. Behavior Ownership

Behavior lives in the narrowest owner:

- `SKILL.md`: selection trigger, user-visible boundary, load-bearing safety, workflow outline, output contract, cross-skill handoff.
- `modules/*.md`: phase sequencing and detailed execution logic.
- `references/*.md` and `knowledge/*.md`: conditional domain knowledge, protocols, examples, and exception handling.
- `scripts/*`: deterministic parsing, validation, structured I/O, and runtime operations.
- `schemas/*`: target-project artifact shape.
- `evals/evals.json`: expected agent decisions and observable outcomes.

Host files name and select the skill, then carry the shared safety boundary required before the selected skill loads. Canonical behavior remains with the owning skill.

### 4. Version Ownership

Use `.codex-plugin/plugin.json.version` as the package version source. Remove the hard-coded `CURRENT_VERSION` duplication from the validator and compare every version-bearing projection against the loaded canonical value:

- `plugin.json`
- `.claude-plugin/plugin.json`
- `.qoder-plugin/plugin.json`
- `marketplace.json` metadata and plugin entry
- `.claude-plugin/marketplace.json` metadata and plugin entry
- `.codebuddy-plugin/marketplace.json` root and plugin entry
- `gemini-extension.json`
- `qwen-extension.json`
- `openclaw.plugin.json`
- `distribution/platforms.json`

`.agents/plugins/marketplace.json` is intentionally versionless and should keep its current local-source role.

## Focused Skill Contract

Every entry file should present the same decision sequence while retaining skill-specific semantics:

1. Frontmatter: canonical `name`, selection-quality `description`, existing compatibility metadata where required.
2. Scope: the outcome this skill owns and its stopping conditions.
3. Safety and boundaries: rules needed before any module or reference loads.
4. Workflow: short ordered steps and the files loaded at each step.
5. Output contract: observable files, structured output, or user-facing result.
6. Handoffs: the exact next skill, required input, and stop/return behavior.
7. Reference navigation: conditional links with explicit load conditions.

Use section presence and link validity as gates. A universal line-count gate would conflict with load-bearing rule surfaces. The 383-line `docker-to-sealos/SKILL.md` carries a machine-checked MUST-rule surface through `references/must-rules-map.yaml` and `references/rules-registry.yaml`; shrinking it by moving enforceable rules would change its validation architecture. Its v1.1 pass should remove duplicated explanation and Edge Policy text while retaining rule bullets until a dedicated rule-source migration is planned.

### Skill-Specific Progressive Disclosure

| Skill | Keep visible in `SKILL.md` | Load on demand from existing owners |
|---|---|---|
| `cloud-native-readiness` | Eligibility-first order, scoring decision, stop routes, Dockerfile handoff, report contract. | `modules/assess.md`, `modules/detect.md`, `modules/route.md`, `knowledge/*`, `examples/sample-report.md`. |
| `dockerfile-skill` | Trigger, phase order, mutation boundary, build/runtime success criteria, output and handoff. | `modules/analyze.md`, `modules/generate.md`, `modules/build-fix.md`, `knowledge/error-patterns.md`, templates and examples. The long duplicated issue catalog and shell transcript belong in these existing files. |
| `docker-to-sealos` | Rule precedence, topology source, critical secret/storage/database gates, required quality gate, output, conditional reference map. | Existing `references/*`, registries, converter, checker, and tests. Preserve MUST-map compatibility. |
| `sealos-app-builder` | Starting-path decision, root SDK integration, real iframe verification, output/handoff. | Existing SDK, framework, data, debugging, and publish references. |
| `sealos-canvas` | Read-only boundary, deployed-state precondition, single script call, stop/success outputs, server lifecycle. | `scripts/generate-canvas.mjs` and `assets/canvas-template.html`. |
| `sealos-database` | Secret/public/destructive gates, create-or-reuse flow, env mutation boundary, app-level verification, output. | Existing CLI and env references plus analyzer. |
| `sealos-deploy` | Kubeconfig/deletion/tool-install gates, module order, target artifacts, runtime-truth acceptance, dependency handoffs. | `modules/preflight.md`, `modules/pipeline.md`, `modules/runtime-truth.md`, live-smoke reference, helper scripts, schemas. Move verbose logging examples into `modules/pipeline.md` while keeping the one-log invariant visible. |
| `sealos-s3` | Secret/public/destructive gates, create-or-reuse flow, credential boundary, real object-flow verification, output. | Existing CLI and env references plus analyzer. |

## Safety Placement

Safety is layered so progressive loading cannot hide a required gate.

| Invariant | Pre-routing copy | Canonical skill owner | Deterministic or eval seam |
|---|---|---|---|
| Destructive operations require explicit confirmation. | `AGENTS.md`, `commands/sealos.md`, `qoder.md`. | `sealos-deploy/SKILL.md`, `sealos-database/SKILL.md`, `sealos-s3/SKILL.md`. | Safety canary validation plus confirmation-gate evals. |
| Credentials, kubeconfig, env values, and complete connection strings stay out of output and commits. | Same three adapter/context files. | Deploy, database, and S3 entry files; redacting helper behavior remains in current scripts. | Static phrase checks, structured-output tests, and secret-handling evals. |
| Public database/bucket access and credential rotation require confirmation. | Compact shared warning before routing. | Database and S3 entry files. | Direct evals for ambiguous/public requests. |
| Canvas stays read-only and hides Secret/ConfigMap content. | Router labels it read-only. | `sealos-canvas/SKILL.md`. | Canvas eval plus helper tests for command allowlists and sanitized model output. |
| Unsupported workloads stop before scoring/build/deploy. | Router sends assessment and deploy to their owners. | `cloud-native-readiness/SKILL.md`, `sealos-deploy/SKILL.md`, eligibility knowledge/module. | Existing workload helper tests and deploy evals. |
| Template output passes the complete quality gate before delivery/deploy. | Deploy handoff identifies Docker-to-Sealos as the owner. | `docker-to-sealos/SKILL.md` and its rule registries. | Existing Python test suite and quality gate. |
| Deployment success requires actual App URL, login/setup when relevant, logs, readiness, and full footprint. | Shared high-level runtime warning. | Deploy entry and `modules/runtime-truth.md`. | Existing live-smoke/footprint/log tests and deploy evals. |
| Env updates preserve unrelated keys and existing values. | Shared secret-handling warning. | Database and S3 entries plus `references/env-integration.md`. | Analyzer tests and behavior evals. |

The validator should use a small `SAFETY_INVARIANTS` map of owner path, adapter path, and exact phrase or normalized phrase. This map acts as a canary. The Markdown owner remains the policy source. Any intentional rewording updates the canary and its regression test in the same change.

## Host Adapter Contract

| Host/surface | Current files | v1.1 contract |
|---|---|---|
| Codex | `plugin.json`, `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `plugins/sealos` symlink, `skills/*/agents/openai.yaml` | Keep root directory pointer. Discover all eight. Keep root and Codex manifests in field parity. Validate every OpenAI metadata file and `$skill-id` prompt. |
| Claude-compatible | `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `marketplace.json`, `commands/sealos.md` | Explicit arrays equal physical inventory. Shared command routes all eight. Add the currently omitted canvas path. |
| Qoder | `.qoder-plugin/plugin.json`, `qoder.md`, `commands/sealos.md`, `scripts/package-qoder-plugin.py` | Retain current eight-skill inventory and shared command source. Validate ZIP inputs against inventory; keep context adapter thin. |
| CodeBuddy | `.codebuddy-plugin/marketplace.json` | Explicit array equals physical inventory. Add the currently omitted canvas path. |
| Gemini CLI | `gemini-extension.json`, `CLAUDE.md -> AGENTS.md` | Context-only. Validate context target, version, and route/safety canaries. Keep command support unclaimed. |
| Qwen Code | `qwen-extension.json`, `CLAUDE.md -> AGENTS.md` | Context-only. Same contract as Gemini; retain empty MCP map. |
| OpenClaw/ClawHub | `openclaw.plugin.json` | Keep the existing bundle pointer to `.claude-plugin/plugin.json`; validate source, command directory, command count, and version. No generated skill copy is needed. |
| skills.sh | Root `skills/**`, README direct examples | Consume canonical skill files directly. Preserve the currently documented direct-entry subset and validate that every advertised path exists. |
| Generic importers | Root `skills/**`, `AGENTS.md`, `distribution/platforms.json` | Treat repository import as host-dependent; limit claims to repository import support. |

## Data Flow

### Request Flow

```text
User request
  |
  +-- Codex: $sealos -----------------------------+
  +-- Claude/Qoder: /sealos ----------------------+--> commands/sealos.md
  +-- direct skills.sh entry ---------------------+         |
  +-- natural-language host selection ---------------------+
                                                            v
                                                 one canonical SKILL.md
                                                            |
                                      +---------------------+------------------+
                                      |                                        |
                                      v                                        v
                               conditional detail                     deterministic helper
                         modules/references/knowledge              scripts/schema validation
                                      |                                        |
                                      +---------------------+------------------+
                                                            v
                                               observable output or handoff
```

### Deploy Dependency Flow

```text
sealos-deploy
  -> cloud-native-readiness
       -> dockerfile-skill when eligible and packaging is missing
  -> docker-to-sealos for template generation and validation
  -> deploy/runtime helpers
  -> sealos-canvas only after state.json contains a verified last_deploy

sealos-database and sealos-s3
  -> operate as independent development-service workflows
  -> hand back redacted env-file location and verified application behavior

sealos-app-builder
  -> may recommend database, S3, or deploy based on explicit app needs
  -> keeps SDK and iframe behavior inside its own owner
```

### Validation Flow

1. Discover canonical skills and parse each frontmatter name/description.
2. Parse the canonical route table in `commands/sealos.md` and require one row per discovered skill.
3. Compare every explicit host inventory with the discovered set.
4. Resolve every manifest, command, context, asset, and skill path inside repository root.
5. Load canonical package version and compare every version-bearing projection.
6. Check OpenAI presentation metadata for every skill.
7. Check cross-host entry syntax: `$sealos`, `/sealos`, and the documented direct skills.sh subset.
8. Check safety canaries in adapter and owning skill locations.
9. Require one valid `evals/evals.json` per skill and the router eval file.
10. Run deterministic helper tests for every changed runtime owner.
11. Run behavior evals for changed skills and the unified router.

## Deterministic And Behavioral Test Seams

### Deterministic Gate

Refactor `scripts/validate-codex-plugin.py` into importable functions that accept a repository root, while preserving the current CLI command. Keep the implementation in one file and add `scripts/test_validate_codex_plugin.py`.

The unit tests should create minimal temporary fixtures and prove failure for:

- one physical skill missing from an explicit host manifest;
- a manifest path escaping or missing from the root;
- one route missing from `commands/sealos.md`;
- a duplicate or mismatched frontmatter `name`;
- a missing `skills/<name>/agents/openai.yaml` or wrong `$name` default prompt;
- a version mismatch in any version-bearing file;
- a removed safety canary;
- an absent or malformed eval file;
- a context-only host claiming commands;
- a direct skills.sh example appearing in a plugin-only section.

Pair fixed-oracle behavior with existing helper tests. JSON eval descriptions serve as evidence definitions; executable CI enforcement comes from validator and helper tests.

### Behavioral Evals

Keep the existing fixture shape (`skill_name`, `evals`, prompt, expected output, assertions) and extend it consistently.

Add skill-local evals for the four missing owners:

- `skills/cloud-native-readiness/evals/evals.json`
- `skills/dockerfile-skill/evals/evals.json`
- `skills/docker-to-sealos/evals/evals.json`
- `skills/sealos-app-builder/evals/evals.json`

Extend the current files:

- `skills/sealos-deploy/evals/evals.json`
- `skills/sealos-database/evals/evals.json`
- `skills/sealos-s3/evals/evals.json`
- `skills/sealos-canvas/evals/evals.json`

Add `commands/evals/evals.json` for unified routing and host-entry behavior. It should cover one positive route for every skill, ambiguous deploy-versus-readiness and database-versus-S3 cases, `$sealos` versus `/sealos`, and the documented direct skills.sh subset.

Each skill suite should include observable assertions in these categories where applicable:

- selection and out-of-scope stop;
- progressive reference loading;
- destructive/public/credential confirmation gate;
- secret-safe output;
- exact output artifact or JSON contract;
- cross-skill handoff payload;
- runtime verification before success.

An eval runner remains a separate execution concern. v1.1 should document the supported runner command once chosen and keep deterministic schema/coverage checks active in the repository gate. Keep Ponytail's promptfoo benchmark stack outside this milestone's dependency set.

## Recommended Project Structure

```text
sealos-skills/
|-- skills/                              # Canonical behavior and inventory
|   |-- <each-of-eight>/
|       |-- SKILL.md                     # Focused entry contract
|       |-- agents/openai.yaml           # Codex presentation projection
|       |-- evals/evals.json             # Behavioral contract
|       |-- modules/ references/ ...     # Owned progressive detail
|-- commands/
|   |-- sealos.md                        # Canonical broad router
|   `-- evals/evals.json                 # Router behavior evals (new)
|-- docs/
|   `-- skill-design-system.md           # Maintainer contract/template (new)
|-- scripts/
|   |-- validate-codex-plugin.py         # Expanded all-host/design gate
|   `-- test_validate_codex_plugin.py    # Gate regression tests (new)
|-- distribution/platforms.json          # Support-claim projection
|-- .codex-plugin/ .claude-plugin/ ...   # Thin host projections
|-- AGENTS.md                            # Repo and context-host rules
`-- CLAUDE.md -> AGENTS.md               # Retain symlink
```

### Structure Rationale

- `skills/` already provides the strongest canonical inventory and behavior boundary.
- `commands/sealos.md` already routes all eight intents and is directly reused by Qoder, so promoting its structure keeps a single registry.
- `docs/skill-design-system.md` gives maintainers a stable template while runtime ownership remains in skills and helpers.
- One expanded validator keeps the existing release command and consolidates overlapping path logic.
- Co-located evals keep each behavior suite with its owner; command routing receives its own co-located suite.

## File Disposition

### Retain As Canonical Or Thin Projections

| Files | Decision |
|---|---|
| All existing `skills/*/modules/**`, `references/**`, `knowledge/**`, `scripts/**`, `schemas/**`, `templates/**`, and `assets/**` | Retain ownership and runtime semantics. Update only links or moved explanatory text tied to the entry-file refactor. |
| `.agents/plugins/marketplace.json` and `plugins/sealos` symlink | Retain local Codex source wiring. |
| `.qoder-plugin/plugin.json` | Retain its complete eight-skill list and shared command source. |
| `gemini-extension.json`, `qwen-extension.json`, `openclaw.plugin.json` | Retain the current host model and add validation around it. |
| `scripts/package-qoder-plugin.py` | Retain packaging behavior; validate its input roots and produced inventory. |
| `CLAUDE.md` symlink | Retain as a symlink to `AGENTS.md`; edit `AGENTS.md` only. |
| Six already consistent `skills/*/agents/openai.yaml` files | Retain copy unless the owning skill description changes. Validate all eight. |

### Modify

| Files | Required change |
|---|---|
| All eight `skills/*/SKILL.md` | Apply the focused entry contract and progressive navigation while preserving behavior and safety. |
| `skills/sealos-deploy/modules/pipeline.md` | Receive verbose logging/script detail removed from the deploy entry, while preserving the one-log and phase-order contracts. |
| `commands/sealos.md` | Make its route table structurally parseable, cover all eight exactly once, record host surfaces, and retain pre-routing safety. |
| `qoder.md` | Keep a compact all-eight router/context projection and safety canaries; delegate command semantics to `commands/sealos.md`. |
| `AGENTS.md` | Add the v1.1 design-system ownership/gate rule and an explicit all-eight routing view while preserving the merge policy and runtime safety. |
| `.claude-plugin/plugin.json`, `marketplace.json`, `.claude-plugin/marketplace.json`, `.codebuddy-plugin/marketplace.json` | Add `./skills/sealos-canvas` so explicit inventories equal the physical set. |
| `plugin.json`, `.codex-plugin/plugin.json` | Keep parity and align interface copy with all eight capabilities, including read-only canvas inspection. |
| `distribution/platforms.json` | Align inventory evidence, host claims, version derivation, and documented invocation surfaces. |
| `marketplaces/README.md` | Document physical-inventory parity, router ownership, version source, and the expanded gate. |
| `skills/sealos-canvas/agents/openai.yaml`, `skills/sealos-database/agents/openai.yaml` | Normalize duplicated display labels (`Sealos: Sealos ...`) while retaining `$skill-id` prompts. |
| `scripts/validate-codex-plugin.py` | Expand from partial plugin checks to the all-host/design-system gate and make functions fixture-testable. |
| Existing four skill eval files | Add design-contract, safety, progressive-loading, output, and handoff coverage. |
| `README.md` and `readmes/README.*.md` | Update together only where public inventory, validation, or invocation wording changes. Preserve current host-specific syntax. |

### Add

| File | Purpose |
|---|---|
| `docs/skill-design-system.md` | Maintainer template, ownership rules, progressive-disclosure criteria, safety placement, adapter checklist, and gate commands. |
| `scripts/test_validate_codex_plugin.py` | `unittest` regression suite for inventory, routing, versions, safety canaries, and eval structure. |
| `commands/evals/evals.json` | Unified router and host-entry behavior cases. |
| `skills/cloud-native-readiness/evals/evals.json` | Readiness selection, fail-closed stop, report, and Dockerfile handoff cases. |
| `skills/dockerfile-skill/evals/evals.json` | Containerization selection, progressive loading, mutation/output, and runtime-validation cases. |
| `skills/docker-to-sealos/evals/evals.json` | Direct conversion selection, rule-source loading, quality-gate, output, and deploy handoff cases. |
| `skills/sealos-app-builder/evals/evals.json` | SDK selection, framework-specific loading, iframe verification, identity boundary, and publish handoff cases. |

No host-specific `skills/` copy, generated rule tree, hook bundle, package runtime, or second inventory manifest should be added.

## Dependency-Aware Build Order

1. **Record the baseline and write failing validator tests.**
   - Capture the eight physical skills, current host lists, existing safety phrases, and current eval files.
   - Add fixture tests that expose the current seven-skill Claude/marketplace gap.
   - Verification: tests fail for the intended missing-canvas reason.

2. **Establish the design contract and expand the deterministic gate.**
   - Add `docs/skill-design-system.md`.
   - Refactor `scripts/validate-codex-plugin.py` to discover inventory, parse routes, derive version, and check adapters, metadata, safety canaries, and eval structure.
   - Verification: validator unit tests pass against synthetic fixtures; the live repository reports the known adapter gaps.

3. **Align host projections.**
   - Fix explicit skill arrays, route/context projections, plugin interface copy, platform evidence, and OpenAI display metadata.
   - Preserve `$sealos`, `/sealos`, and direct skills.sh semantics.
   - Verification: the expanded live validator passes before skill behavior text changes.

4. **Refocus dependency skills.**
   - Apply the entry contract to `cloud-native-readiness`, then `dockerfile-skill`, then `docker-to-sealos`.
   - Retain Docker-to-Sealos MUST-map and registry coupling.
   - Verification: each skill's existing helper tests/quality gate plus new local eval schema checks pass.

5. **Refocus independent and adjacent skills.**
   - Update database, S3, app-builder, and canvas.
   - Verification: analyzer/helper tests where available, confirmation/output evals, and the design validator pass per skill.

6. **Refocus deploy last.**
   - Deploy depends on the stabilized readiness, Dockerfile, and template contracts.
   - Keep preflight, kubeconfig, deletion confirmation, artifact, and runtime-truth rules load-bearing.
   - Verification: deploy helper tests, fast-path test, eval schema, runtime-truth assertions, and Docker-to-Sealos quality gate pass.

7. **Complete behavior coverage and public documentation.**
   - Add router evals and all missing skill evals; extend existing suites.
   - Update root and localized READMEs together when public claims change.
   - Verification: one documented quality-gate sequence passes from a clean checkout.

8. **Audit `brain-deploy-preview` integration explicitly.**
   - Classify every changed file as aligned, adapted, or excluded under `AGENTS.md`.
   - Verification: shared-skill diffs and documented Dockerfile Railpack delta match the recorded source commit; preview-only and main-only surfaces remain intact.

## `main` To `brain-deploy-preview` Boundary

The v1.1 architecture must follow the existing merge policy:

- Merge the focused-entry and eval changes for `cloud-native-readiness`, `sealos-app-builder`, `sealos-database`, `sealos-s3`, and `docker-to-sealos` as aligned skill-directory changes.
- Use main's `dockerfile-skill` as the baseline while retaining only the documented Railpack evidence and Kaniko-path additions on preview.
- Review every `sealos-deploy` entry, module, and eval change manually against the prepare-only pipeline. Runtime deploy/update, Template API, OAuth, rollout/rollback, and live-smoke semantics remain main-owned.
- Keep `sealos-canvas` out of preview.
- Keep main's plugin manifests, marketplaces, `commands/`, `distribution/`, validator, assets, and `.planning/` history out of preview.
- Preserve preview's `AGENTS.md`, `README.md`, and `CLAUDE.md`; port generic design guidance manually where accurate.
- Treat new shared-skill eval files as part of their owning skill directories. Treat `commands/evals/evals.json`, `docs/skill-design-system.md`, and the expanded root validator as main-only unless preview adopts an explicit branch-specific equivalent.

## Scaling Considerations

| Scale | Architecture adjustment |
|---|---|
| Current: 8 skills, current hosts | Filesystem discovery, one Markdown router, and set comparisons are sufficient. |
| More skills in current hosts | A new skill fails the gate until its route, OpenAI metadata, eval file, and every explicit host projection exist. No generator is required. |
| New host adapter | Add one thin manifest/context projection and one validator function/test. Point to root skills or shared context. |
| Host requires transformed copies | Add a deterministic generator whose output body is compared with canonical skills, following Ponytail's OpenClaw pattern. Use this only when the host format requires a copy. |
| Large behavioral suite | Separate deterministic contract checks from model-run eval jobs; shard eval execution by skill while retaining one router suite. |

The first scaling bottleneck is adapter list drift, already visible in the seven-versus-eight inventory. The expanded validator removes it. The second is behavior-eval execution time; sharding by skill addresses it while source ownership stays stable.

## Anti-Patterns

### Host-Specific Skill Copies

**Failure:** Add `.codex-plugin/skills/`, `.claude-plugin/skills/`, or another packaged behavior tree.

**Consequence:** Runtime and safety fixes diverge by host.

**Preferred pattern:** Point every capable host at root `skills/**`; introduce generated copies only for a proven host-format constraint and test them byte-for-byte.

### Moving Load-Bearing Safety Into Deep References

**Failure:** Shorten entry files by relocating confirmation, credential, read-only, eligibility, quality-gate, or runtime-acceptance rules below the initial load boundary.

**Consequence:** An agent can mutate resources or report success before loading the rule.

**Preferred pattern:** Keep the gate in `SKILL.md`; place detailed execution and examples in modules/references.

### Copying Ponytail Runtime Behavior

**Failure:** Add mode state, lifecycle hooks, per-turn prompt injection, status lines, or subagent propagation.

**Consequence:** Sealos gains a persistent runtime unrelated to task-scoped cloud workflows and expands the safety surface.

**Preferred pattern:** Transfer source ownership, thin adapters, canary checks, version parity, and behavior-test structure only.

### Treating Mutual Drift As Parity

**Failure:** Compare Claude, root marketplace, and CodeBuddy lists only with each other.

**Consequence:** Every copied list can omit the same skill and still pass, as the current canvas gap demonstrates.

**Preferred pattern:** Compare every projection with the physical canonical inventory.

### Treating Eval JSON As An Executable Gate

**Failure:** Count prompt/assertion fixtures as CI coverage.

**Consequence:** Deterministic routing, path, secret, and output regressions remain unenforced.

**Preferred pattern:** Pair each fixed-oracle assertion with validator or helper tests; reserve model evals for probabilistic behavior.

### Applying Main Distribution Changes To Preview

**Failure:** Merge root plugin, command, distribution, canvas, or full-deploy changes into `brain-deploy-preview` as a repository-wide update.

**Consequence:** The prepare-only branch changes product identity and execution architecture.

**Preferred pattern:** Apply the documented aligned/adapted/excluded policy file by file.

## Integration Points

### External Services And Hosts

| Integration | Pattern | Architecture note |
|---|---|---|
| Codex | Root plugin manifest points to `./skills/`; per-skill OpenAI metadata supplies presentation. | Validate physical inventory and metadata; retain the single root skill source. |
| Claude-compatible hosts | Explicit skill arrays and shared `/sealos` command. | Exact set parity with physical inventory. |
| Qoder | Explicit array, shared command source, packaged ZIP. | Validate package contents and version from the canonical manifest. |
| Gemini/Qwen | Context manifest loads `CLAUDE.md`, which resolves to `AGENTS.md`. | Preserve context-only claims and symlink. |
| Sealos Cloud/Kubernetes | Skill-local scripts and modules execute auth, deploy, database, S3, and read-only queries. | Design-system work must preserve current runtime and safety contracts. |
| skills.sh/generic importers | Discover root skill directories. | Physical `SKILL.md` set remains canonical. |

### Internal Boundaries

| Boundary | Communication | Contract |
|---|---|---|
| Router to skill | Skill ID and user task context | Exactly one canonical route; selected skill owns behavior. |
| Deploy to readiness | Assessment request and project evidence | Eligibility stops before score/build; report feeds deploy. |
| Readiness to Dockerfile | Project metadata, services, and concerns | Handoff occurs only for eligible targets lacking artifacts. |
| Deploy to Docker-to-Sealos | Image/project analysis and target artifact path | Template quality gate passes before deployment. |
| Deploy to canvas | `.sealos/state.json.last_deploy` plus live read access | Canvas remains view-only and starts only after deployment state exists. |
| Skill entry to detail | Explicit relative link and load condition | Detail stays inside the owning skill directory or documented sibling dependency. |
| Eval to deterministic test | Assertion classified by fixed versus probabilistic oracle | Fixed behavior becomes code-level coverage; model behavior remains eval coverage. |

## Confidence Assessment

| Area | Confidence | Reason |
|---|---|---|
| Canonical ownership | HIGH | Confirmed in project instructions, manifests, symlink layout, physical skills, and Ponytail fixed-commit mechanisms. |
| Adapter parity gap | HIGH | Direct set comparison shows four explicit Sealos projections omit canvas while Qoder and physical inventory include it; current validator still passes. |
| Safety placement | HIGH | Entry files, AGENTS runtime safety, helper contracts, and current tests provide concrete owners. |
| Progressive-disclosure plan | HIGH | Existing modules/references already provide destinations; Docker-to-Sealos MUST-map coupling is directly observed. |
| Behavior-eval execution | MEDIUM | Fixture locations and deterministic seams are clear; a documented root model-eval runner remains an open requirement. |

## Sources

### Sealos Skills Local Sources

- `.planning/PROJECT.md`
- `.planning/codebase/ARCHITECTURE.md`
- `.planning/codebase/STRUCTURE.md`
- `.planning/codebase/CONCERNS.md`
- `.planning/codebase/TESTING.md`
- `AGENTS.md` and `CLAUDE.md`
- `commands/sealos.md` and `qoder.md`
- `plugin.json`, `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `.qoder-plugin/plugin.json`
- `marketplace.json`, `.claude-plugin/marketplace.json`, `.codebuddy-plugin/marketplace.json`, `.agents/plugins/marketplace.json`
- `gemini-extension.json`, `qwen-extension.json`, `openclaw.plugin.json`, `distribution/platforms.json`
- All eight `skills/*/SKILL.md` files, their OpenAI metadata, representative modules/references, existing evals, helper scripts, and tests
- `scripts/validate-codex-plugin.py` and `scripts/package-qoder-plugin.py`

### Ponytail Fixed-Commit Sources

- `/Users/longnv/bin/repo/ponytail/AGENTS.md`
- `/Users/longnv/bin/repo/ponytail/skills/*/SKILL.md`
- `/Users/longnv/bin/repo/ponytail/scripts/check-rule-copies.js`
- `/Users/longnv/bin/repo/ponytail/scripts/check-versions.js`
- `/Users/longnv/bin/repo/ponytail/scripts/build-openclaw-skills.js`
- `/Users/longnv/bin/repo/ponytail/hooks/*`
- `/Users/longnv/bin/repo/ponytail/.claude-plugin/`, `.codex-plugin/`, `.qoder-plugin/`, `.github/plugin/`, `.opencode/`, `pi-extension/`, and `ponytail-mcp/`
- `/Users/longnv/bin/repo/ponytail/tests/*`, `pi-extension/test/*`, and `ponytail-mcp/test/*`

### External Cross-Check

- [Acceptance-Test-Driven Evaluation Protocols for Business-Centric LLM Systems](https://arxiv.org/abs/2606.02755) - MEDIUM confidence cross-check for separating executable behavioral contracts and release gates from post-hoc benchmarks.

---
*Architecture research for: Sealos Skills v1.1 Skill Design System Optimization*
*Researched: 2026-08-06*
