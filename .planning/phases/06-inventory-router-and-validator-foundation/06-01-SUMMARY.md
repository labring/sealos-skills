---
phase: 06-inventory-router-and-validator-foundation
plan: 01
subsystem: validation
tags: [inventory, router, frontmatter, paths, python]

# Dependency graph
requires:
  - phase: 05-baseline-ownership-and-shared-contract
    provides: eight-skill ownership baseline and canonical source decisions
provides:
  - derived physical eight-skill inventory reader
  - parseable four-column broad route table
  - constrained repository-relative path and frontmatter readers
  - offline structural regression fixtures
affects: [06-02, 06-03, 07-host-adapter-alignment, 11-behavior-gate]

# Tech tracking
tech-stack:
  added: [Python standard library, dataclasses, unittest]
  patterns: [derived inventory, structured diagnostics, repository-scoped path resolution]

key-files:
  created:
    - scripts/skill_design_inventory.py
    - scripts/test_skill_design_inventory.py
  modified:
    - commands/sealos.md

key-decisions:
  - "Physical immediate skills/*/SKILL.md entries remain the only inventory source; router order is display metadata and parity uses sets."
  - "commands/sealos.md uses one human-readable four-column route table for all eight skills."
  - "Repository paths reject absolute, traversal, outside-root, and missing targets before reads."

requirements-completed: [SDS-09]

coverage:
  - id: D1
    description: "The live physical tree and broad route resolve to the same eight canonical names."
    requirement: "SDS-09"
    verification:
      - kind: unit
        ref: "python3 scripts/test_skill_design_inventory.py"
        status: pass
  - id: D2
    description: "Frontmatter, route, CRLF, and constrained-path mutations produce targeted diagnostics."
    requirement: "SDS-09"
    verification:
      - kind: unit
        ref: "six unittest cases including name mismatch, route duplicate/missing, malformed columns, and traversal"
        status: pass

# Metrics
duration: 8min
completed: 2026-08-06
status: complete
---

# Phase 6 Plan 1: Inventory and Router Summary

The canonical inventory and broad router are now machine-checkable without adding a second inventory source.

## Accomplishments

- Replaced route bullets with an eight-row table covering intent, canonical skill, plugin entry, and direct skills.sh semantics.
- Added `skill_design_inventory.py` with strict frontmatter parsing, derived inventory discovery, route parsing, repository-scoped path validation, structured diagnostics, and a JSON CLI.
- Added six standard-library regression tests covering the live tree, CRLF normalization, frontmatter identity, route drift, path traversal, missing targets, and malformed route columns.

## Verification Evidence

- `python3 scripts/skill_design_inventory.py --root . --router commands/sealos.md --check` -> `ok: true`, 8 skills, 8 routes.
- `python3 scripts/test_skill_design_inventory.py` -> 6 tests passed, 0 failed.
- `python3 -m py_compile scripts/skill_design_inventory.py` -> passed.
- `git diff --check` -> passed.

## Deviations

None. Host projection repair remains deferred to Phase 7 as planned.

## Next Phase Readiness

Plan 06-02 can consume the constrained reader and add registry-backed safety mutations.

---
*Phase: 06-inventory-router-and-validator-foundation*
*Completed: 2026-08-06*
