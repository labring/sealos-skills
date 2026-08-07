---
phase: 07-host-adapter-and-public-surface-alignment
plan: 01
subsystem: routing
tags: [router, interaction-class, capability, handoff, ambiguity]

# Dependency graph
requires:
  - phase: 06-inventory-router-and-validator-foundation
    plan: 03
    provides: derived inventory and aggregate validator
provides:
  - risk-aware eight-owner route contract
  - typed compound handoff metadata
  - side-effect-free ambiguity boundary
affects: [07-02, 07-03, 11-behavior-gate]

# Tech tracking
tech-stack:
  added: [Python standard library, dataclasses, unittest]
  patterns: [typed route records, ordered risk escalation, owner-scoped handoff]

key-files:
  created:
    - scripts/test_skill_design_router.py
  modified:
    - commands/sealos.md
    - scripts/skill_design_inventory.py
    - scripts/test_skill_design_inventory.py

key-decisions:
  - "One broad command route remains the adapter boundary for all eight physical skills."
  - "Risk uses a typed base plus ordered escalations across observation, local-write, cloud-write, public-exposure, and destructive categories."
  - "Compound handoffs carry target, inputArtifact, allowedAction, failureReturn, and responseOwner fields; ambiguous mutations stop before side effects."

requirements-completed: [SDS-02, SDS-D02]

coverage:
  - id: D1
    description: "The live route parses eight physical owners with documented interaction classes and validated risk tuples."
    requirement: SDS-D02
    verification:
      - kind: unit
        ref: "python3 scripts/test_skill_design_inventory.py"
        status: pass
      - kind: unit
        ref: "python3 scripts/test_skill_design_router.py"
        status: pass
  - id: D2
    description: "Deploy, readiness, and packaging handoffs preserve ordered typed metadata and failure ownership."
    requirement: SDS-02
    verification:
      - kind: unit
        ref: "test_compound_deploy_handoff_and_conditional_readiness_handoff"
        status: pass
  - id: D3
    description: "Ambiguous mutation requests expose a stopped clarification before provider, filesystem, or Kubernetes actions."
    requirement: SDS-02
    verification:
      - kind: unit
        ref: "test_ambiguity_policy_is_side_effect_free"
        status: pass

# Metrics
duration: 18min
completed: 2026-08-07
status: complete
---

# Phase 7 Plan 1: Risk-Aware Route Summary

The broad host route now provides a deterministic, behavior-free contract for owner selection, risk classification, and existing compound handoffs.

## Accomplishments

- Extended `commands/sealos.md` to eight rows with interaction class, typed capability tuple, and ordered handoff columns.
- Added strict route parsing for owner/class mapping, escalation order, handoff fields, known targets, duplicate owners, and inventory parity.
- Added offline route discrimination tests for clear ownership, compound deploy flow, conditional readiness handoff, malformed metadata, and side-effect-free ambiguity.

## Verification Evidence

- `python3 scripts/test_skill_design_inventory.py` -> 6 tests passed.
- `python3 scripts/test_skill_design_router.py` -> 7 tests passed.
- `python3 scripts/skill_design_inventory.py --root . --router commands/sealos.md --check` -> `ok: true`, 8 skills, 8 routes.

## Deviations

None. Workflow behavior remains in the owning skill entries.

## Next Phase Readiness

Plan 07-02 can consume the route contract while repairing explicit host projections and validator coverage.

---
*Phase: 07-host-adapter-and-public-surface-alignment*
*Completed: 2026-08-07*
