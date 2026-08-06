# Phase 6: Inventory, Router, and Validator Foundation - Context

**Gathered:** 2026-08-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 6 derives the canonical eight-skill inventory from `skills/*/SKILL.md`, makes `commands/sealos.md` machine-readable enough for route validation, and adds fixture-tested structural and semantic-safety diagnostics. The phase establishes reusable readers and red/green mutation probes while preserving current host behavior; host projection repair belongs to Phase 7 and skill workflow refactors belong to Phases 8-10.

</domain>

<decisions>
## Implementation Decisions

### Canonical Inventory and Ownership
- **D-01:** Discover the inventory from immediate `skills/*/SKILL.md` entry files. The discovered set and each frontmatter `name` are authoritative; no second hand-maintained inventory file is introduced.
- **D-02:** Derive stable display order from the canonical broad router when available, while all parity checks compare sets so ordering differences do not hide or create drift.
- **D-03:** Keep host manifests and adapters as projections. Phase 6 reports missing, unexpected, duplicate, or malformed projections and preserves the existing seven-versus-eight Canvas drift for Phase 7 to repair.

### Router and Readers
- **D-04:** Treat `commands/sealos.md` as the single broad route source. Require one parseable route record per physical skill with canonical skill name, intent, plugin surface, and direct-entry semantics.
- **D-05:** Keep readers constrained to repository-owned Markdown and JSON paths, reject path traversal or missing targets, and expose importable diagnostics so tests can exercise synthetic fixtures without mutating the live tree.
- **D-06:** Parse frontmatter with a small deterministic reader that validates `name` and a non-empty `description`; preserve existing Markdown content and avoid a new YAML dependency.

### Semantic Safety and Fixture Mutations
- **D-07:** Use the Phase 5 canary registry and entry-visible markers as the safety oracle. A targeted mutation that removes confirmation, redaction, read-only, eligibility-stop, or fail-closed language must fail with the canary ID and owning entry.
- **D-08:** Pair each semantic canary with one passing live fixture and one failing mutated fixture. Keep the mutation harness offline, deterministic, and text-based; the marker alone is insufficient when the registry requires evidence phrases.
- **D-09:** Keep safety checks focused on policy presence and targeted behavior probes. Provider calls, network benchmarks, and live runtime smoke remain outside this foundation phase.

### Metadata, Links, and Eval Schema
- **D-10:** Derive the canonical package version from `.codex-plugin/plugin.json` and validate version-bearing projections against it without adding another version source.
- **D-11:** Validate all resolver-visible relative Markdown links one level deep, all referenced skill-owned resources, and all eval fixture records against the existing Phase 5 trace shape; report the exact file, field, and target on failure.
- **D-12:** Preserve the existing `scripts/validate-codex-plugin.py` CLI and add the new design-system checks as importable functions or a companion validator with a focused unit suite. Existing Codex checks remain callable throughout.

### the agent's Discretion
- Exact route table syntax and parser implementation, provided the source remains readable to humans and one record maps to each physical skill.
- Fixture directory layout, diagnostic error codes, and whether the semantic probe runner is Python or Node, provided the command is offline and supports synthetic mutations.
- Which currently versioned host files are included in the Phase 6 report, provided the canonical version and path boundaries are explicit and Phase 7 can consume the diagnostics.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/PROJECT.md` — v1.1 source-of-truth, safety, host, and branch constraints.
- `.planning/REQUIREMENTS.md` — SDS-09 and SDS-D04 acceptance requirements plus v1.1 out-of-scope boundaries.
- `.planning/ROADMAP.md` — Phase 6 goal, success criteria, plan dependency order, and Phase 7 boundary.

### Phase 5 contract
- `.planning/phases/05-baseline-ownership-and-shared-contract/05-CONTEXT.md` — shared entry contract, lifecycle vocabulary, entry-visible canaries, and baseline evidence decisions.
- `.planning/phases/05-baseline-ownership-and-shared-contract/05-DISCUSSION-LOG.md` — autonomous Phase 5 choices and deferred projection work.
- `docs/skill-design-system.md` — ordered contract facets, ownership, progressive loading, terminal vocabulary, and gate expectations.
- `docs/skill-safety-canaries.md` — stable canary IDs, markers, triggers, evidence requirements, and baseline case mapping.
- `tests/fixtures/skill-design-baseline.json` — existing positive/violating trace shape and owned-resource conventions.

### Research and architecture
- `.planning/research/ARCHITECTURE.md` — inventory ownership, route ownership, version source, adapter parity, validator seams, and deterministic gate recommendations.
- `.planning/research/FEATURES.md` — eight-skill matrix and acceptance probes.
- `.planning/research/PITFALLS.md` — drift, safety-placement, progressive-disclosure, and handoff failure modes.
- `.planning/research/STACK.md` — existing Python/Node validation and deterministic testing constraints.

### Repository sources
- `commands/sealos.md` — broad route source to make parseable and validate.
- `scripts/validate-codex-plugin.py` — existing Codex plugin validator and preserved CLI contract.
- `.codex-plugin/plugin.json` — canonical package version source.
- `.claude-plugin/plugin.json` — explicit host projection.
- `marketplace.json` — root marketplace projection.
- `.claude-plugin/marketplace.json` — Claude marketplace projection.
- `.codebuddy-plugin/marketplace.json` — CodeBuddy marketplace projection.
- `.qoder-plugin/plugin.json` — Qoder inventory and command projection.
- `gemini-extension.json` — Gemini context-only projection.
- `qwen-extension.json` — Qwen context-only projection.
- `openclaw.plugin.json` — OpenClaw bundle projection.
- `distribution/platforms.json` — platform claims and evidence projection.
- `AGENTS.md` — repository validation and host/runtime rules.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/validate-codex-plugin.py` already has JSON loading, path resolution, manifest parity, and targeted `PASS`/`FAIL` diagnostics that can be extracted or reused.
- `scripts/skill-design-baseline.mjs` and `tests/fixtures/skill-design-baseline.json` already define the eight owners, safe relative resource resolution, trace fields, and redaction checks.
- `docs/skill-safety-canaries.md` gives stable IDs and required evidence phrases for targeted semantic mutation tests.
- The eight `skills/*/SKILL.md` entries and `skills/*/agents/openai.yaml` files provide the canonical frontmatter and presentation metadata sources.

### Established Patterns
- Python validators use standard-library JSON/path handling and `unittest`; Node helpers use ESM and structured JSON output.
- Existing host validators are CLI-compatible and print actionable `PASS`/`FAIL` lines before exiting non-zero on drift.
- Root `skills/` is the only behavior source; adapters reference or describe it without copying runtime logic.
- Existing Phase 5 tests use temporary copies or fixture mutations to prove both positive and violating paths.

### Integration Points
- Phase 7 will consume inventory and router diagnostics to repair host projections and Canvas exposure.
- Phase 8-10 entry refactors must retain the canary markers and metadata fields validated here.
- Phase 11 will extend the eval-schema and trace readers into the complete deterministic maintainer gate.

</code_context>

<specifics>
## Specific Ideas

- Keep the live repository's current Canvas omission in Claude/marketplace/CodeBuddy projections visible as a deterministic Phase 6 failure so Phase 7 has a concrete red-to-green target.
- Prefer diagnostics such as `inventory.missing_projection`, `route.missing_skill`, `frontmatter.name_mismatch`, `path.outside_root`, `version.mismatch`, `eval.malformed`, and `canary.missing` so a maintainer can repair the exact source.
- Preserve the current Codex validator command while allowing a separate design-system command during the foundation phase; consolidate the gate in Phase 11 after behavior coverage exists.

</specifics>

<deferred>
## Deferred Ideas

- Repairing the seven-versus-eight host projection drift and deciding explicit Canvas exposure — Phase 7.
- Full host adapter alignment, README claims, and direct-entry inventory validation — Phase 7.
- New behavior eval suites, provider-backed runners, and one complete quality-gate command — Phase 11.
- Version/tag synchronization and `main` to `brain-deploy-preview` file audit — Phase 12.

</deferred>

---

*Phase: 6-Inventory, Router, and Validator Foundation*
*Context gathered: 2026-08-06*
