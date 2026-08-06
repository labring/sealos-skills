---
phase: 08-dependency-skill-entry-refactors
plan: 01
subsystem: readiness
tags: [eligibility, readiness-report, handoff, progressive-disclosure]

# Dependency graph
requires:
  - phase: 07-host-adapter-and-public-surface-alignment
    provides: typed route and handoff contract
provides:
  - eligibility-first readiness entry
  - minimal request-scoped readiness payload
  - typed readiness-to-Dockerfile handoff
affects: [08-02, 08-04, 10-deploy-orchestration]

# Tech tracking
tech-stack:
  added: [Markdown contract schema]
  patterns: [fail-closed eligibility, in-memory report, one-level module loading]

key-files:
  modified:
    - skills/cloud-native-readiness/SKILL.md
    - skills/cloud-native-readiness/modules/assess.md
    - skills/cloud-native-readiness/modules/detect.md
    - skills/cloud-native-readiness/modules/route.md

key-decisions:
  - "Unsupported or unresolved workloads stop before score, artifact detection, packaging, or deployment."
  - "A standalone readiness request keeps its report request-scoped; composed deploy may persist a sanitized snapshot under deploy ownership."
  - "Readiness passes source, workload, score, dimensions, concerns, artifacts, verification, and redaction evidence through the five-field Dockerfile handoff."

requirements-completed: [SDS-06, SDS-08]

coverage:
  - id: D1
    description: "Eligibility remains the first gate and preserves the stopped branch."
    requirement: SDS-06
    verification:
      - kind: unit
        ref: "entry/module contract checks"
        status: pass
  - id: D2
    description: "Eligible reports carry minimal typed evidence and no sensitive values."
    requirement: SDS-08
    verification:
      - kind: baseline
        ref: "readiness-positive-eligible and readiness-violating-ineligible"
        status: pass
  - id: D3
    description: "Only the eligible packaging route emits a complete Dockerfile handoff."
    requirement: SDS-08
    verification:
      - kind: unit
        ref: "scripts/test_dependency_skill_contract.py"
        status: pass

# Metrics
duration: 14min
completed: 2026-08-07
status: complete
---

# Phase 8 Plan 1: Readiness Summary

Readiness now owns eligibility and produces a small, reusable report for downstream packaging.

## Accomplishments

- Made eligibility the first observable decision and kept unsupported/needs-review targets fail-closed before scoring or artifact detection.
- Added a request-scoped report contract for source, workload, score, dimensions, concerns, artifacts, verification, terminal state, and redaction.
- Made the readiness-to-Dockerfile handoff explicit with all five typed fields and preserved Dockerfile ownership in the receiving skill.

## Verification Evidence

- Contract assertions for eligibility ordering and typed fields passed.
- `node scripts/skill-design-baseline.mjs --fixture tests/fixtures/skill-design-baseline.json --check` -> `ok: true`.
- `python3 scripts/test_skill_design_safety.py` -> 9 tests passed.
- `python3 scripts/validate_skill_design.py --root . --check` -> no diagnostics.

## Deviations

None. Existing score, detector, and eligibility helpers remain the behavior source.

## Next Phase Readiness

Dockerfile work can consume the readiness report and apply its own file-scope and runtime gates.

---
*Phase: 08-dependency-skill-entry-refactors*
*Completed: 2026-08-07*
