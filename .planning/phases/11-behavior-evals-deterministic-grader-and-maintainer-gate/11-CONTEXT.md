# Phase 11: Behavior Evals, Deterministic Grader, and Maintainer Gate - Context

**Gathered:** 2026-08-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 11 provides executable behavior coverage for all eight canonical skills and the unified router, adds a deterministic offline grader for structured traces, and publishes one maintainer command and guide for the complete design-system quality gate. The phase covers positive and violating cases for routing, scope and boundary, terminal outcomes, progressive loading, and each skill's highest-risk action. Provider-backed trajectory benchmarks, network runs, and release branch reconciliation belong to later phases or the v2 backlog.

</domain>

<decisions>
## Implementation Decisions

### Behavior fixture coverage
- **D-01:** Keep `tests/fixtures/skill-design-baseline.json` as the canonical cross-skill trace shape and extend it only when the phase needs a new observable field.
- **D-02:** Every canonical skill keeps at least one positive and one violating trace. The four missing skill-local `evals/evals.json` files receive the same schema and assertion vocabulary used by the existing deploy, database, S3, and Canvas suites.
- **D-03:** Add unified-router cases for a clear owner, an ordered compound request, and an ambiguous mutation that terminates before side effects. Router cases live in a repository fixture owned by the router tests.
- **D-04:** Trace files record observable `text`, `toolCalls`, and `files` alongside owner, interaction class, terminal state, loaded resources, handoff, and redaction checks. Sensitive values remain placeholders or redacted markers.

### Deterministic grader
- **D-05:** The grader is standard-library or Node.js-only and provider-free. It evaluates committed traces and fixture mutations deterministically so local results remain repeatable and inexpensive.
- **D-06:** Grading distinguishes structural validity from behavior outcome: positive traces require `success`; violating traces require `stopped` or `error` plus a named guard. Failures identify the skill, case, field, and source path in machine-readable output.
- **D-07:** Mutation tests run the real validator or grader against temporary repository copies. They prove that removing confirmation, redaction, read-only, eligibility, runtime, output, or handoff evidence produces a targeted failure.

### Maintainer gate and evidence policy
- **D-08:** One documented command runs contract shape, inventory, routes, versions, links, safety canaries, eval schemas, behavior traces, and existing skill-specific validators. The command returns a nonzero exit code for any failed component and emits an aggregated JSON summary.
- **D-09:** The gate remains offline by default and does not install tools, call providers, mutate a cluster, or require credentials. Environment-dependent checks report a clear conditional status when a local prerequisite is unavailable.
- **D-10:** The maintainer guide documents the command, required optional tools, fixture ownership, redaction rules, failure triage, and evidence retention. It uses English operational prose consistent with repository documentation.
- **D-11:** Missing skill-local eval suites are required diagnostics in the aggregate design validator. The eight-suite inventory is part of the maintainer gate.
- **D-12:** Baseline traces carry explicit `evidence`, `safeNextAction`, and `coverage` fields in addition to the `{text, toolCalls, files}` tuple so terminal output and five behavior dimensions are machine-checkable.

### the agent's Discretion
- Exact module names, helper boundaries, assertion implementation, and test runner composition may follow existing repository patterns.
- The agent may choose JSON or line-oriented machine output for individual helpers when the aggregate maintainer gate preserves a stable JSON summary and actionable diagnostics.
- Test case wording may use synthetic repository paths and placeholder values while preserving the user-observable contract.

</decisions>

<canonical_refs>
## Canonical References

### Roadmap and requirements
- `.planning/ROADMAP.md` §Phase 11 — phase goal, requirements, success criteria, and plan boundaries.
- `.planning/REQUIREMENTS.md` §Shared Contract and Safety, §Validation and Behavior — SDS-07, SDS-10, and SDS-11 definitions.
- `.planning/PROJECT.md` — canonical `skills/**` source, safety, evidence, and host-distribution decisions.

### Existing behavior and validators
- `scripts/skill-design-baseline.mjs` — canonical structured trace validator and terminal-state vocabulary.
- `scripts/test-skill-design-baseline.mjs` — existing positive/violating fixture coverage.
- `scripts/skill_design_inventory.py` — derived inventory and router readers.
- `scripts/skill_design_safety.py` — safety canary registry and semantic checks.
- `scripts/validate_skill_design.py` — aggregate Phase 6 design-system validator.
- `scripts/test_dependency_skill_gates.py` — existing dependency and quality-gate runner.
- `commands/sealos.md` — unified route and compound handoff source.
- `skills/*/evals/evals.json` — established eval schema for deploy, database, S3, and Canvas.

### Safety and runtime contracts
- `docs/skill-safety-canaries.md` — canonical safety markers and mutation targets.
- `skills/sealos-deploy/references/deploy-contract.md` — typed deploy trace and terminal output contract.
- `skills/sealos-deploy/modules/runtime-truth.md` — runtime evidence and redaction requirements.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/skill-design-baseline.mjs` already validates eight-skill ownership, paths, handoffs, terminal states, and secret-shaped values.
- Python inventory, safety, and design validators already emit structured diagnostics and support temporary-copy mutation tests.
- Existing skill-local eval JSON files provide the public prompt/assertion format and can be copied as the missing-suite baseline.

### Established Patterns
- Node helpers use ESM, two-space indentation, `node:test`, and structured JSON on stdout.
- Python validators use `unittest`, four-space indentation, explicit diagnostics, and `--check` exit semantics.
- Fixtures are synthetic, repository-relative, and provider-free; secrets use redacted placeholders.
- GSD planning artifacts are committed per phase and state/roadmap updates use `gsd-tools` handlers.

### Integration Points
- The new grader should consume the existing baseline fixture and feed its result into the aggregate maintainer gate.
- The maintainer gate should invoke existing validators rather than duplicate their parsing rules.
- `validate_skill_design.py` should remain the design contract owner while the new gate composes it with behavior and skill-specific checks.

</code_context>

<specifics>
## Specific Ideas

The required evidence tuple is `{text, toolCalls, files}`. The user-visible result should make it possible to identify the selected owner, terminal outcome, evidence location, redaction state, and safe next action from one trace without replaying a provider session.

</specifics>

<deferred>
## Deferred Ideas

- Provider-backed trajectory runners, retry/cost policy, network benchmarks, and remote evidence storage remain outside this offline phase.
- Branch preservation and public release claim audit belong to Phase 12.

</deferred>

---

*Phase: 11-Behavior Evals, Deterministic Grader, and Maintainer Gate*
*Context gathered: 2026-08-06*
