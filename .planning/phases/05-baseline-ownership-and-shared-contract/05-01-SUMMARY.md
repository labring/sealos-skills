---
phase: 05-baseline-ownership-and-shared-contract
plan: 01
subsystem: testing
tags: [baseline, ownership, node, json, redaction, runtime-evidence]

# Dependency graph
requires:
  - phase: 04-install-smoke-and-handoff
    provides: host-install and handoff evidence used to describe current projections
provides:
  - eight-skill physical ownership and runtime-artifact matrix
  - schemaVersion 1 fixture with 16 deterministic positive and violating traces
  - offline source-path, evidence, terminal-state, handoff, and redaction checker
  - node:test discrimination coverage for every canonical skill
affects: [06-inventory-router-validator, 08-dependency-entry-refactors, 09-service-entry-refactors, 10-deploy-orchestration, 11-behavior-gate, 12-release-audit]

# Tech tracking
tech-stack:
  added: [Node.js built-in fs/path/url APIs, node:test, JSON fixture schema]
  patterns: [physical-entry ownership, one-level owned-resource references, positive/violating traces, offline redaction checks]

key-files:
  created:
    - docs/skill-design-baseline.md
    - tests/fixtures/skill-design-baseline.json
    - scripts/skill-design-baseline.mjs
    - scripts/test-skill-design-baseline.mjs
  modified: []

key-decisions:
  - "The eight physical skills/*/SKILL.md entries remain behavior owners; commands/sealos.md remains the broad route owner; host files remain projections."
  - "Baseline traces are offline and deterministic, with generated target-project artifacts represented as observable paths and no provider values."
  - "A valid violating case is structurally accepted while its per-case ok result remains false, preserving red/green behavior discrimination."

patterns-established:
  - "Every case records selected owner, loaded resources, tool calls, files, terminal state, handoff, and redaction checks."
  - "Checker resolves repository sourceRefs, enforces one-level owned resources, and rejects credential-shaped trace values."

requirements-completed: [SDS-01, SDS-03]

coverage:
  - id: D1
    description: "Human-readable matrix records exactly eight physical owners, current host projections, lifecycle/risk boundaries, handoffs, artifacts, and preservation gates."
    requirement: "SDS-01"
    verification:
      - kind: other
        ref: "python3 matrix acceptance: names eight skills and D-12 trace fields"
        status: pass
    human_judgment: false
  - id: D2
    description: "Machine fixture captures one positive and one violating deterministic trace for every canonical skill."
    requirement: "SDS-03"
    verification:
      - kind: unit
        ref: "node scripts/skill-design-baseline.mjs --fixture tests/fixtures/skill-design-baseline.json --check"
        status: pass
      - kind: other
        ref: "python3 -m json.tool tests/fixtures/skill-design-baseline.json"
        status: pass
    human_judgment: false
  - id: D3
    description: "Importable checker and node:test suite discriminate positive/violating terminal behavior and redaction-safe evidence."
    requirement: "SDS-03"
    verification:
      - kind: unit
        ref: "node --test scripts/test-skill-design-baseline.mjs"
        status: pass
      - kind: unit
        ref: "node --check scripts/skill-design-baseline.mjs"
        status: pass
    human_judgment: false

# Metrics
duration: 22min
completed: 2026-08-06
status: complete
---

# Phase 5 Plan 1: Baseline, Ownership, and Shared Contract Summary

**Eight-skill ownership matrix plus a 16-case offline trace gate that preserves routing, safety boundaries, handoffs, runtime artifacts, and redaction evidence.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-08-06T09:25:48Z
- **Completed:** 2026-08-06T09:47:55Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Recorded one auditable row for each physical `skills/*/SKILL.md` owner, including inputs, preconditions, mutation class, terminal evidence, handoffs, host projections, runtime artifacts, and the current seven-versus-eight projection drift.
- Added a schemaVersion 1 JSON fixture with exactly eight skill records and 16 cases covering readiness eligibility, Dockerfile runtime acceptance, Docker-to-Sealos MUST-map coupling, deploy Runtime Truth, database/S3 confirmation and redaction, Canvas read-only preconditions, and App Builder Desktop verification.
- Added a dependency-free checker and built-in Node test suite that resolve source paths, enforce one-level owned-resource references, validate observable evidence, reject credential-shaped values, and discriminate positive versus violating outcomes.

## Task Commits

Each task was committed atomically:

1. **Task 1: Record the physical ownership and runtime baseline** - `eec5e97` (docs)
2. **Task 2: Define the deterministic baseline trace fixture and checker** - `91178cb` (feat)
3. **Task 3: Add red/green tests for baseline discrimination** - `cce4c7e` (test)

**Plan metadata:** summary close-out commit recorded after self-check.

## Files Created/Modified

- `docs/skill-design-baseline.md` - Human-readable eight-skill ownership, adapter, lifecycle, handoff, artifact, and preservation matrix.
- `tests/fixtures/skill-design-baseline.json` - Structured 16-case positive/violating baseline evidence with source references and redaction checks.
- `scripts/skill-design-baseline.mjs` - Importable and CLI checker with path, schema, terminal, handoff, ownership-depth, and sensitive-value validation.
- `scripts/test-skill-design-baseline.mjs` - `node:test` assertions for count, discrimination, trace completeness, and secret-safe evidence.

## Decisions Made

- Kept physical skill entries as behavior owners and `commands/sealos.md` as the broad route owner; recorded host files as projections so later phases can repair parity without changing this baseline.
- Used repository-relative source references and generated artifact labels to keep the fixture deterministic and provider-free while preserving the observable trace contract.
- Treated violating cases as valid fixture records with `valid: true` and `ok: false`, allowing tests to prove refusal/stop behavior without making the aggregate fixture gate fail.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The repository ignores the `docs/` directory. The required baseline document was intentionally staged with an explicit path force so it is committed without changing the ignore policy. No production behavior, host projection, or unrelated user file was changed.

## Auth Gates

None. All checks were local and offline; no provider authentication or live mutation was attempted.

## Known Stubs

None. Generated target-project paths in the fixture are evidence labels for later runtime runs, while source references and the checker are fully wired and validated.

## Threat Flags

None. The new surface is offline committed evidence and a local parser; it adds no network endpoint, authentication path, file mutation outside the fixture/document outputs, or schema trust boundary beyond the planned JSON checker.

## Verification Evidence

- `node scripts/skill-design-baseline.mjs --fixture tests/fixtures/skill-design-baseline.json --check` → `ok: true`, `skillCount: 8`, `caseCount: 16`.
- `node --test scripts/test-skill-design-baseline.mjs` → 5 tests passed, 0 failed.
- `node --check scripts/skill-design-baseline.mjs` → passed.
- `python3 -m json.tool tests/fixtures/skill-design-baseline.json` → passed.
- Matrix acceptance script → eight skill names and all D-12 trace-field labels present.
- Mutation probes → checker rejected missing source paths, deep/unlisted resources, sensitive connection values, and missing violating guards.

## Next Phase Readiness

Phase 6 can consume the fixture as the expected eight-skill inventory and extend the checker into host/router parity validation. The preserved seven-versus-eight projection observations identify the known adapter drift without blocking this baseline.

## Self-Check: PASSED

- All four created files exist at their planned paths.
- Task commits `eec5e97`, `91178cb`, and `cce4c7e` exist in the worktree history.
- Acceptance and plan-level verification commands pass with the evidence listed above.

---
*Phase: 05-baseline-ownership-and-shared-contract*
*Completed: 2026-08-06*
