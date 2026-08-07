# Phase 5: Baseline, Ownership, and Shared Contract - Context

**Gathered:** 2026-08-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5 establishes a behavior-backed design contract for the eight canonical Sealos skill entry points before detailed entry refactors begin. It records current routing, mutation, stop, output, handoff, and runtime behavior; defines shared lifecycle and safety vocabulary; and applies the contract skeleton without changing the underlying workflow semantics. Inventory/host projection repair belongs to Phase 6-7, dependency entry refactors belong to Phase 8, service entries to Phase 9, deploy orchestration to Phase 10, the full behavior gate to Phase 11, and release/branch audit to Phase 12.

</domain>

<decisions>
## Implementation Decisions

### Shared Entry Contract Shape
- **D-01:** Use one ordered core contract for every `SKILL.md`: identity and discovery, scope/boundaries, risk and confirmation, lifecycle workflow, progressive disclosure, output/stop/error states, handoffs, and verification.
- **D-02:** Allow domain-specific extension sections after the core contract. Domain evidence stays owned by the skill; a universal output JSON schema or universal line-count cap is outside this phase.
- **D-03:** Keep `skills/` entry files as the behavior source and keep host manifests, command routing, and adapter text as projections. Phase 5 records ownership; Phase 6-7 enforce projection parity.

### Lifecycle and Terminal Vocabulary
- **D-04:** Every skill uses request-scoped lifecycle language with explicit `success`, `stopped`, and `error` terminal outcomes.
- **D-05:** A `success` result includes the strongest domain evidence available; `stopped` names the unmet precondition or confirmation boundary and the safe next action; `error` names the failed artifact/step and recovery action without exposing secrets.
- **D-06:** `sealos-canvas` must state its temporary loopback server lifetime and shutdown condition in the entry contract while preserving its read-only behavior.

### Entry-Visible Safety
- **D-07:** Preserve a per-skill safety canary set in the entry file before branch-specific detail loads: confirmation, secret redaction, kubeconfig scope where applicable, read-only boundary where applicable, eligibility stop, quality-gate requirement where applicable, and runtime-acceptance requirement where applicable.
- **D-08:** Detailed procedures may move into owned modules/references only after the entry keeps the rule, its trigger condition, and the required evidence visible. `docker-to-sealos` MUST-map and rule-registry coupling remain load-bearing.
- **D-09:** Destructive operations, public exposure, credential changes, and system-tool installation retain explicit confirmation semantics from the current skills; wording may be normalized, behavior may not be broadened.

### Baseline Evidence
- **D-10:** Capture all eight skills before refactoring with positive and violating probes for routing, scope/boundary, confirmation or refusal, terminal output, and relevant handoffs.
- **D-11:** Baseline probes are deterministic and offline by default. Existing helper/unit/eval gates remain the runtime preservation oracle; live provider smoke is deferred to later phases.
- **D-12:** Record traces as observable evidence (selected owner, loaded resource paths, tool calls or helper invocations, files/artifacts, terminal state, and redaction checks) rather than relying on entry-file line counts.

### the agent's Discretion
- Exact section headings and Markdown table shapes, provided every required contract facet remains discoverable and linkable.
- Fixture filenames, probe harness decomposition, and whether shared parsing helpers live under `scripts/` or a phase-local test module, provided ownership and the existing Python/Node compatibility are preserved.
- The precise invariant phrase for each skill's canary, provided the phrase is specific enough for a targeted mutation test and the owning entry remains the policy source.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/PROJECT.md` — v1.1 goal, constraints, source-of-truth rule, and branch policy.
- `.planning/REQUIREMENTS.md` — SDS-01, SDS-03, SDS-05 acceptance requirements for this phase and the v1.1 out-of-scope list.
- `.planning/ROADMAP.md` — Phase 5 goal, success criteria, plan dependencies, and later phase boundaries.

### Research decisions
- `.planning/research/SUMMARY.md` — synthesized Phase 5-12 sequencing, source ownership, and critical pitfalls.
- `.planning/research/ARCHITECTURE.md` — entry contract, safety canary, handoff, and branch-boundary architecture.
- `.planning/research/FEATURES.md` — contract facets, eight-skill matrix, acceptance probes, and anti-features.
- `.planning/research/PITFALLS.md` — safety compression, baseline loss, deep disclosure, handoff, and parity failure modes.
- `.planning/research/STACK.md` — existing Python/Node validation and deterministic testing constraints.

### Repository rules and routing
- `AGENTS.md` — canonical skill source, runtime/safety invariants, validation expectations, and `main` to `brain-deploy-preview` policy.
- `commands/sealos.md` — broad route ownership and host invocation semantics.
- `marketplaces/README.md` — distribution claim ownership and host-specific command boundaries.

### Canonical skill entries
- `skills/cloud-native-readiness/SKILL.md` — eligibility-first analysis and Dockerfile handoff.
- `skills/dockerfile-skill/SKILL.md` — owned file mutation, build/runtime acceptance, and artifact output.
- `skills/docker-to-sealos/SKILL.md` — rule precedence, MUST-map coupling, and template quality gate.
- `skills/sealos-deploy/SKILL.md` — composite deploy lifecycle, safety, artifacts, and Runtime Truth.
- `skills/sealos-database/SKILL.md` — create/reuse, environment preservation, confirmation, and connectivity evidence.
- `skills/sealos-s3/SKILL.md` — private-by-default storage, redaction, public/destructive confirmation, and object evidence.
- `skills/sealos-canvas/SKILL.md` — read-only topology precondition, sanitized output, and temporary server lifecycle.
- `skills/sealos-app-builder/SKILL.md` — code/tutorial boundaries, SDK precedence, Desktop verification, and publish handoff.

### Existing behavior evidence
- `skills/sealos-deploy/evals/evals.json` — current deploy behavior fixtures.
- `skills/sealos-database/evals/evals.json` — current database behavior fixtures.
- `skills/sealos-s3/evals/evals.json` — current S3 behavior fixtures.
- `skills/sealos-canvas/evals/evals.json` — current Canvas behavior fixtures.
- `skills/docker-to-sealos/references/must-rules-map.yaml` — machine-mapped conversion safety rules that must remain covered.
- `skills/docker-to-sealos/references/rules-registry.yaml` — conversion rule registry coupled to the MUST map.
- `scripts/validate-codex-plugin.py` — existing distribution validator that later phases extend.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- The eight root `SKILL.md` files — canonical entry sources and the exact baseline targets.
- Skill-local `modules/`, `references/`, `knowledge/`, `scripts/`, `schemas/`, and `evals/` directories — existing ownership boundaries for progressive disclosure and deterministic behavior.
- `skills/sealos-deploy/modules/pipeline.md` and helper scripts — phase/artifact vocabulary, runtime evidence, and deploy state conventions.
- `skills/docker-to-sealos/scripts/check_consistency.py`, `check_must_coverage.py`, and `quality_gate.py` — preservation gates for conversion behavior.
- Existing JSON eval fixtures and Python `unittest` suites — baseline evidence format and local test conventions.

### Established Patterns
- Markdown entry points use operational sections and route long detail to owned modules/references.
- Node helpers return structured JSON for machine-consumed traces; human remediation uses stderr or explicit status text.
- Python validators return targeted `PASS`/`FAIL`/`ERROR` diagnostics and exit codes.
- Root `skills/` is the only behavior source; host adapters point to it or expose context without copying behavior.
- Cloud mutations and sensitive operations require explicit confirmation and redacted output.

### Integration Points
- Phase 5 contract wording will be consumed by `commands/sealos.md`, host manifests, and later validator projections, while those surfaces remain implementation scope for Phases 6-7.
- Baseline probes will feed Phase 6 validator fixtures and Phase 11 behavior evals.
- Typed handoff vocabulary connects readiness → Dockerfile → Docker-to-Sealos → deploy and verified deploy state → Canvas.
- State and artifact expectations connect entry prose to target-project `.sealos/` files without treating generated artifacts as source rules.

</code_context>

<specifics>
## Specific Ideas

- Use the shared contract to make the first screen of every entry actionable for an agent, while keeping domain detail one link level away.
- Preserve request-scoped behavior and Sealos-specific safety; Ponytail contributes ownership and executable drift checks, not persona, hook, or persistent-mode runtime.
- Use positive and violating traces as the proof of behavior preservation; textual similarity and line count are insufficient evidence.

</specifics>

<deferred>
## Deferred Ideas

- Host inventory/projection repair and Canvas exposure decisions — Phase 6-7.
- New entry content and typed handoff implementation for dependency skills — Phase 8.
- Service-specific entry refactors — Phase 9.
- Composite deploy orchestration and live Runtime Truth checks — Phase 10.
- Full eight-skill behavior grader, provider benchmark policy, and maintainer gate — Phase 11.
- Main/preview file audit, README/release claims, and version/tag evidence — Phase 12.
- Automatic adapter generation, a machine-readable contract DSL, universal output JSON, and Ponytail runtime modes — future work.

</deferred>

---

*Phase: 5-Baseline, Ownership, and Shared Contract*
*Context gathered: 2026-08-06*
