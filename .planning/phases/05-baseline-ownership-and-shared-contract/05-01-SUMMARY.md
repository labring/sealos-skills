---
phase: 05-baseline-ownership-and-shared-contract
plan: 01
subsystem: testing
tags: [baseline, skills, node, redaction, trace]

requires:
  - phase: 04-install-smoke-and-handoff
    provides: Existing skill entry points, helper gates, and runtime artifact conventions
provides:
  - An auditable eight-skill ownership and runtime baseline
  - A deterministic 16-case positive/violating trace fixture
  - An offline checker and Node test suite for later contract and behavior phases
affects: [06-inventory-router-validator-foundation, 11-behavior-evals-deterministic-grader-maintainer-gate]

tech-stack:
  added: [node:test]
  patterns: [structured offline traces, source-path resolution, redaction-aware validation]

key-files:
  created:
    - docs/skill-design-baseline.md
    - tests/fixtures/skill-design-baseline.json
    - scripts/skill-design-baseline.mjs
    - scripts/test-skill-design-baseline.mjs
  modified: []

key-decisions:
  - "Treat the eight physical skills/*/SKILL.md files as behavior owners, commands/sealos.md as the broad route owner, and host manifests as projections."
  - "Use provider-free positive and violating traces with explicit observable fields and secret-shaped value checks."

patterns-established:
  - "Every baseline case records owner, interaction class, loaded resources, tool calls, artifacts, handoff, terminal state, and redaction checks."
  - "Owned resource references are resolved at validation time and remain one disclosure level deep."

requirements-completed: [SDS-01, SDS-03]

coverage:
  - id: D1
    description: "Eight-skill ownership, projection, runtime artifact, handoff, and preservation matrix"
    requirement: SDS-01
    verification:
      - kind: other
        ref: "node scripts/skill-design-baseline.mjs --fixture tests/fixtures/skill-design-baseline.json --check"
        status: pass
    human_judgment: false
  - id: D2
    description: "Sixteen deterministic positive and violating traces with redaction checks"
    requirement: SDS-03
    verification:
      - kind: unit
        ref: "scripts/test-skill-design-baseline.mjs#all baseline tests"
        status: pass
    human_judgment: false

duration: 18min
completed: 2026-08-06
status: complete
---

# Phase 5 Plan 01: Baseline and Trace Fixture Summary

**Eight canonical skill owners now have an auditable, provider-free baseline and deterministic safety trace suite.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-08-06T09:25:00Z
- **Completed:** 2026-08-06T09:47:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Recorded exactly eight physical `skills/*/SKILL.md` owners, current host projections, handoffs, terminal evidence, runtime artifacts, and preservation gates.
- Added a schema-versioned fixture with exactly two cases per skill: eight positive traces and eight violating traces.
- Added an offline checker that resolves repository references, enforces one-level owned-resource loading, validates trace fields, and rejects credential-shaped values.
- Added five `node:test` assertions covering count, positive/violating discrimination, observable fields, provider-free operation, and redaction safety.

## Task Commits

1. **Task 1: Record the physical ownership and runtime baseline** - `eec5e97` (docs)
2. **Task 2: Define the deterministic baseline trace fixture and checker** - `91178cb` (feat)
3. **Task 3: Add red/green tests for baseline discrimination** - `cce4c7e` (test)

## Files Created/Modified

- `docs/skill-design-baseline.md` - Human-readable ownership, projection, handoff, artifact, and preservation matrix.
- `tests/fixtures/skill-design-baseline.json` - Eight skill records and sixteen observable traces.
- `scripts/skill-design-baseline.mjs` - Importable and CLI checker for the fixture.
- `scripts/test-skill-design-baseline.mjs` - Deterministic Node test suite.

## Decisions Made

- Kept baseline evidence offline and deterministic so later phases can compare entry refactors without provider access.
- Preserved the current seven-versus-eight host projection drift as evidence for Phase 6-7 inventory repair.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The executor initially halted on the detached worktree safety gate. The orchestrator created the required `worktree-agent-phase5-01` branch from the committed plan base before execution resumed. No implementation was written before the gate was cleared.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

05-02 can consume the baseline matrix and fixture. The checker and test suite are provider-free and ready to become the preservation oracle for the shared contract document.

## Verification Evidence

- `node scripts/skill-design-baseline.mjs --fixture tests/fixtures/skill-design-baseline.json --check` -> `ok: true`, `skillCount: 8`, `caseCount: 16`.
- `node --test scripts/test-skill-design-baseline.mjs` -> 5 passed, 0 failed.
- `node --check scripts/skill-design-baseline.mjs` -> passed.
- `git diff --check` -> passed.

---
*Plan: 05-01*
*Completed: 2026-08-06*
