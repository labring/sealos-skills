---
phase: 06-inventory-router-and-validator-foundation
plan: 03
subsystem: validation
tags: [inventory, projections, versions, links, evals, canaries, python]

# Dependency graph
requires:
  - phase: 06-inventory-router-and-validator-foundation
    plan: 01
    provides: derived physical inventory, route parser, and constrained path diagnostics
  - phase: 06-inventory-router-and-validator-foundation
    plan: 02
    provides: registry-backed safety canary checker and mutation fixture schema
provides:
  - aggregate design-system validator for inventory, routes, projections, versions, links, canaries, and evals
  - deterministic mutation coverage for every Phase 6 diagnostic family
  - preserved callable Codex plugin validator regression
affects: [07-host-adapter-alignment, 11-behavior-gate]

# Tech tracking
tech-stack:
  added: [Python standard library, unittest]
  patterns: [canonical-source comparison, stable structured diagnostics, fixture-driven mutation tests]

key-files:
  created:
    - scripts/validate_skill_design.py
    - scripts/test_validate_skill_design.py
  modified:
    - scripts/skill_design_inventory.py

key-decisions:
  - "The physical inventory and .codex-plugin/plugin.json remain the sole sources for skill names and package version; host projections are checked as derived views."
  - "The live Canvas projection omission is reported deliberately until Phase 7 repairs the four affected host manifests."
  - "Diagnostics use repository-relative paths and stable codes so later maintainer gates can consume them directly."

requirements-completed: [SDS-09, SDS-D04]

coverage:
  - id: D1
    description: "Aggregate validator derives the eight-skill inventory and reports the known Canvas host-projection drift."
    requirement: SDS-09
    verification:
      - kind: unit
        ref: "python3 scripts/test_validate_skill_design.py::test_live_reports_only_known_canvas_projection_drift"
        status: pass
    human_judgment: false
  - id: D2
    description: "Version, link, route, frontmatter, canary fixture, and eval mutations produce stable targeted diagnostics."
    requirement: SDS-09
    verification:
      - kind: unit
        ref: "python3 scripts/test_validate_skill_design.py"
        status: pass
    human_judgment: false
  - id: D3
    description: "The existing Codex plugin validator remains callable alongside the new aggregate gate."
    requirement: SDS-D04
    verification:
      - kind: unit
        ref: "python3 scripts/validate-codex-plugin.py"
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-08-06
status: complete
---

# Phase 6 Plan 3: Aggregate Validator Summary

The repository now has one importable validator that exposes structural and semantic design drift with stable source-scoped diagnostics.

## Accomplishments

- Added `validate_skill_design.py` to aggregate derived inventory, route parity, host projections, canonical version metadata, Markdown links, safety canaries, and present eval schemas.
- Added 11 offline mutation tests covering projection repair, route loss, frontmatter identity, outside-root and broken links, stale versions, malformed canary fixtures, malformed evals, duplicate eval IDs/assertions, and the existing plugin validator.
- Kept the live Canvas projection omission as an intentional Phase 6 red result so Phase 7 can repair the owning host projections against a concrete detector.
- Normalized route diagnostics to repository-relative paths for actionable reports.

## Verification Evidence

- `python3 scripts/test_validate_skill_design.py` -> 11 tests passed, 0 failed.
- `python3 scripts/test_skill_design_inventory.py` -> 6 tests passed, 0 failed.
- `python3 scripts/test_skill_design_safety.py` -> 9 tests passed, 0 failed.
- `python3 scripts/validate-codex-plugin.py` -> plugin integration validation passed.
- `python3 scripts/skill_design_inventory.py --root . --router commands/sealos.md --check` -> `ok: true`, 8 skills, 8 routes.
- `python3 scripts/skill_design_safety.py --root . --fixture tests/fixtures/skill-design-safety.json --check` -> `ok: true`.
- `git diff --check` -> passed.

## Deviations from Plan

The planned mutation coverage was expanded with explicit outside-root link, missing route, duplicate eval, and malformed canary fixture tests. The additions make every listed diagnostic family directly observable without changing the production scope.

## Next Phase Readiness

Phase 7 can repair the four explicit host projections missing `./skills/sealos-canvas`, then rerun this validator to establish an all-green projection baseline.

---
*Phase: 06-inventory-router-and-validator-foundation*
*Completed: 2026-08-06*
