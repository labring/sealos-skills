# Phase 7: Host Adapter and Public Surface Alignment - Context

**Gathered:** 2026-08-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 7 aligns every supported host projection and public invocation claim with the eight physical skill entries, extends the broad route with risk-aware interaction metadata and ordered handoff information, and makes the Canvas exposure policy explicit. Host files remain behavior-free projections of root `skills/**`; skill workflow refactors belong to Phases 8-10, executable behavior coverage belongs to Phase 11, and release/localized-document synchronization belongs to Phase 12.

</domain>

<decisions>
## Implementation Decisions

### Risk-aware routing and compound handoffs
- **D-01:** Extend `commands/sealos.md` as the single broad route source. Keep one record per physical skill and add an explicit interaction class plus a typed capability tuple with `base` and ordered `escalations` for observation, local write, cloud write, public exposure, and destructive work. This preserves compound escalation instead of collapsing each skill to one scalar risk.
- **D-02:** Encode the existing composite path as a typed ordered handoff note: deploy may consume readiness, Dockerfile, and Docker-to-Sealos evidence before runtime truth and Canvas handoff; readiness may conditionally hand off to Dockerfile. The adapter records routing metadata and sequence while owning skills retain execution behavior.
- **D-03:** An ambiguous mutation request returns a stopped clarification boundary before provider, filesystem, or Kubernetes side effects. Detailed confirmation and mutation semantics stay with the owning skill.

### Host projection parity and canonical version
- **D-04:** Immediate `skills/*/SKILL.md` entries remain the only inventory source. `.codex-plugin/plugin.json` remains the sole package-version source. Every explicit host skill array equals the derived eight-skill set, and every version-bearing projection equals the canonical version.
- **D-05:** Validate directory-pointer hosts separately from explicit arrays. Keep Codex and OpenClaw pointer semantics intact, retain Qoder's eight-skill list, and inspect a temporary Qoder ZIP built from canonical inputs without committing generated packages.
- **D-06:** Host adapters contain metadata, routing, and context only. They do not copy skill behavior, reimplement safety gates, or introduce a second packaged skill tree.

### Canvas exposure and direct-entry semantics
- **D-07:** Expose `sealos-canvas` in every plugin and marketplace projection that lists skills, including Claude-compatible and CodeBuddy surfaces. Codex directory discovery and the OpenClaw bundle inherit the canonical tree; Qoder remains explicitly complete.
- **D-08:** Keep the documented direct `skills.sh` commands limited to `/sealos-deploy`, `/sealos-database`, and `/sealos-s3`. Canvas remains a plugin-pack capability because it requires verified deployment state and a host-managed read-only entry; public docs describe that precondition.

### Public claims and adapter boundaries
- **D-09:** Gemini and Qwen remain context-only extensions with no slash-command claim. Shared `CLAUDE.md`/`AGENTS.md` context and the root README enumerate all eight capabilities, while each host section retains its native `$sealos`, `/sealos`, context-only, or direct-entry semantics.
- **D-10:** Update the root public invocation contract in Phase 7. Synchronize localized README siblings in the Phase 12 release audit after final inventory and version evidence settle.
- **D-11:** Keep Phase 7 validation offline and deterministic: synthetic manifest copies, route mutations, version mutations, link checks, and temporary package inspection provide evidence; provider marketplace installation and live host smoke remain deferred.

### the agent's Discretion
- Exact Markdown column names, risk-label serialization, diagnostic code names, and temporary archive inspection implementation may follow existing Python standard-library patterns when they preserve the decisions above.
- The validator may normalize host-specific command syntax into structured claims while preserving each host's literal public invocation examples.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/PROJECT.md` — v1.1 source-of-truth, host-adapter boundaries, and branch constraints.
- `.planning/REQUIREMENTS.md` — SDS-02, SDS-D02, and SDS-D05 acceptance requirements.
- `.planning/ROADMAP.md` — Phase 7 goal, success criteria, plan dependency order, and later-phase boundaries.

### Prior contract and validator foundation
- `.planning/phases/06-inventory-router-and-validator-foundation/06-CONTEXT.md` — derived inventory, host projection, canonical version, and safety decisions.
- `.planning/phases/06-inventory-router-and-validator-foundation/06-VERIFICATION.md` — current four-projection Canvas drift and validator evidence.
- `docs/skill-design-system.md` — ownership model, interaction classes, host adapter contract, and risk-aware routing requirements.
- `docs/skill-safety-canaries.md` — entry-visible safety markers that adapters must preserve and route toward.
- `tests/fixtures/skill-design-baseline.json` — eight-owner trace and handoff shape.

### Research and architecture
- `.planning/research/ARCHITECTURE.md` — canonical inventory, route ownership, host contract, Canvas exposure gap, and version source.
- `.planning/research/FEATURES.md` — host-accurate distribution, risk-aware router, and public acceptance probes.
- `.planning/research/PITFALLS.md` — projection drift, invocation ambiguity, safety placement, and adapter overclaim risks.
- `.planning/research/STACK.md` — Python/Node/JSON validation constraints and host packaging surfaces.

### Route and validation sources
- `commands/sealos.md` — broad route source and host-native examples.
- `scripts/skill_design_inventory.py` — derived inventory and route parser consumed by Phase 7 checks.
- `scripts/validate_skill_design.py` — aggregate projection, version, path, link, canary, and eval validator.
- `scripts/validate-codex-plugin.py` — existing distribution validator whose CLI and public behavior remain callable.
- `scripts/package-qoder-plugin.py` — canonical Qoder ZIP packager to inspect in a temporary output.

### Host projections and public claims
- `.codex-plugin/plugin.json` — Codex directory pointer and canonical package version.
- `.agents/plugins/marketplace.json` — local Codex marketplace pointer and policy.
- `.claude-plugin/plugin.json` — Claude-compatible explicit skill projection.
- `.claude-plugin/marketplace.json` — Claude marketplace explicit skill projection.
- `.codebuddy-plugin/marketplace.json` — CodeBuddy explicit skill projection.
- `.qoder-plugin/plugin.json` — Qoder explicit skill and command projection.
- `marketplace.json` — root Claude-compatible marketplace projection.
- `gemini-extension.json` — Gemini context-only projection.
- `qwen-extension.json` — Qwen context-only projection.
- `openclaw.plugin.json` — OpenClaw bundle pointer and command claim.
- `distribution/platforms.json` — platform install, invocation, and evidence claims.
- `README.md` — root public installation, invocation, direct-entry, and eight-skill capability claims.
- `CLAUDE.md` — shared context and host routing rules.
- `qoder.md` — Qoder behavior-free routing and safety adapter.
- `AGENTS.md` — repository source-of-truth, validation, and host/runtime constraints.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/skill_design_inventory.py`: derives the eight names from immediate entry files and parses the broad route; Phase 7 should extend its route schema without adding an inventory source.
- `scripts/validate_skill_design.py`: already compares explicit projections, canonical versions, links, canaries, and eval records; Phase 7 can add route-risk and public-claim diagnostics here.
- `scripts/validate-codex-plugin.py`: provides the existing host metadata regression command and should consume the canonical version rather than create a competing source.
- `scripts/package-qoder-plugin.py`: packages `.qoder-plugin`, root skills, commands, assets, `qoder.md`, and `README.md`; temporary archive inspection can prove complete input coverage.

### Established Patterns
- Python validators use `pathlib`, structured dataclasses, JSON stdout, and `unittest` temporary repository copies.
- Root `skills/**` owns behavior; manifests and context files are thin adapters with host-native invocation syntax.
- Existing distribution claims distinguish plugin, context-only, direct skills.sh, and host-dependent surfaces.
- Phase 6 deliberately reports drift with stable codes and repository-relative source paths; Phase 7 should turn the four known Canvas projection failures green after repair.

### Integration Points
- `commands/sealos.md` feeds Claude-compatible routing and Qoder command packaging.
- Explicit skill arrays in Claude, marketplace, and CodeBuddy files feed host installers and the Phase 6 aggregate validator.
- `CLAUDE.md`, `qoder.md`, `distribution/platforms.json`, and `README.md` feed context hosts and public install/invocation claims.
- OpenClaw points at `.claude-plugin/plugin.json`; its bundle semantics must remain pointer-based.

</code_context>

<specifics>
## Specific Ideas

- Preserve the current public distinction: Codex uses `$sealos`, Claude-compatible hosts and Qoder use `/sealos`, Gemini/Qwen provide context only, and direct skills.sh examples remain deploy/database/S3.
- Treat the Phase 6 four-item Canvas drift as the concrete red-to-green target for Phase 7.
- Keep risk labels machine-readable enough for Phase 11 router fixtures while keeping the Markdown route readable to maintainers.

</specifics>

<deferred>
## Deferred Ideas

- Provider-backed marketplace installation and live host smoke tests — requires external host state and belongs outside the offline Phase 7 gate.
- Localized README sibling synchronization — Phase 12 release audit after all public inventory and version claims settle.
- New direct Canvas skills.sh command — deferred because the current plugin-pack precondition and public direct-command contract are stable.
- New runtime workflow behavior — Phases 8-10 own skill entry refactors; Phase 7 only aligns adapters and route metadata.

</deferred>

---

*Phase: 07-Host Adapter and Public Surface Alignment*
*Context gathered: 2026-08-07*
