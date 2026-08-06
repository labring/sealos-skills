---
phase: 06-inventory-router-and-validator-foundation
plan: 02
subsystem: safety-validation
tags: [canaries, confirmation, redaction, read-only, fail-closed, python]

# Dependency graph
requires:
  - phase: 06-inventory-router-and-validator-foundation
    plan: 01
    provides: constrained repository path reader and derived inventory
  - phase: 05-baseline-ownership-and-shared-contract
    provides: entry-visible safety canary registry and baseline traces
provides:
  - registry-backed entry safety checker
  - schema-versioned mutation fixture covering all 26 current canaries
  - red/green offline tests for confirmation, redaction, read-only, eligibility, and fail-closed guards
affects: [06-03, 07-host-adapter-alignment, 11-behavior-gate]

# Tech tracking
tech-stack:
  added: [Python standard library, JSON fixture schema, unittest]
  patterns: [normalized phrase matching, canary-specific diagnostics, deterministic source mutation]

key-files:
  created:
    - scripts/skill_design_safety.py
    - scripts/test_skill_design_safety.py
    - tests/fixtures/skill-design-safety.json
  modified:
    - skills/sealos-deploy/SKILL.md

key-decisions:
  - "The maintainer-facing canary registry remains the policy index while each owning SKILL.md stays the final rule source."
  - "Safety phrase checks normalize case, punctuation, and whitespace and pair broad evidence matching with strict category anchors for confirmation, redaction, read-only, and eligibility guards."
  - "Mutation fixtures are offline and deterministic; they never invoke provider APIs or cloud mutations."

requirements-completed: [SDS-D04]

coverage:
  - id: D1
    description: "All current registry canaries resolve to existing entry owners and pass marker/evidence checks."
    requirement: "SDS-D04"
    verification:
      - kind: unit
        ref: "python3 scripts/skill_design_safety.py --root . --fixture tests/fixtures/skill-design-safety.json --check"
        status: pass
  - id: D2
    description: "Safety guard removal mutations fail with canary identity, owner, and category."
    requirement: "SDS-D04"
    verification:
      - kind: unit
        ref: "python3 scripts/test_skill_design_safety.py"
        status: pass

# Metrics
duration: 12min
completed: 2026-08-06
status: complete
---

# Phase 6 Plan 2: Safety Canary Summary

Entry-visible semantic safety now has a deterministic registry-backed check and mutation suite.

## Accomplishments

- Added a dependency-free canary registry parser and checker with stable `canary.missing`, `canary.evidence_missing`, `canary.owner_missing`, and `canary.fixture_malformed` diagnostics.
- Added a schemaVersion 1 fixture with one mutation record for each of the 26 current Phase 5 canaries.
- Added nine offline tests covering live green checks, confirmation, redaction, read-only, eligibility, fail-closed mutations, malformed fixtures, normalization, and CLI output.
- Added explicit deploy evidence for the exact operation, impact, confirmation, post-action evidence, and sanitized diagnostic footprint required by the deploy canary.

## Verification Evidence

- `python3 scripts/skill_design_safety.py --root . --fixture tests/fixtures/skill-design-safety.json --check` -> `ok: true`.
- `python3 scripts/test_skill_design_safety.py` -> 9 tests passed, 0 failed.
- `python3 -m py_compile scripts/skill_design_safety.py` -> passed.
- `git diff --check` -> passed.

## Deviations

The live registry contains 26 canary rows; the fixture and tests derive that count from the registry rather than duplicating an inventory count.

## Next Phase Readiness

Plan 06-03 can aggregate the inventory, route, canary, version, link, and eval-schema diagnostics without changing host projection ownership.

---
*Phase: 06-inventory-router-and-validator-foundation*
*Completed: 2026-08-06*
