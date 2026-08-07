---
phase: 12-branch-policy-documentation-and-release-audit
plan: 03
subsystem: public-surface
tags: [readme, localized-readme, manifest, version, tag]

requires:
  - phase: 12-02
    provides: Branch boundary and canonical source policy
provides:
  - Public inventory and host invocation policy
  - Root/localized README, manifest, version, pointer, and tag audit
  - Temporary-copy mutation tests for public claim drift
affects: [12-04]

tech-stack:
  added: [Python standard library]
  patterns: [derived-inventory, manifest-field-projection, conditional-tag-evidence]

key-files:
  created:
    - scripts/public-surface-audit.py
    - scripts/test_public_surface_audit.py
    - tests/fixtures/public-surface-policy.json
  modified: []

key-decisions:
  - "The physical eight-directory inventory is the canonical public claim source."
  - "All root/localized README files must expose the same inventory and host tokens; direct skills.sh entries remain the three documented deploy/database/S3 skills."
  - "Manifest versions are compared field-by-field to `.codex-plugin/plugin.json` and all inventory arrays must contain exactly the eight root skill pointers."
  - "Tag evidence is observed from the immutable candidate; absent tags are conditional while tag creation remains outside the phase."

patterns-established:
  - "Public audit diagnostics identify the exact README, manifest field, version field, or candidate tag reference."

requirements-completed: [REL-01]

duration: 9m
completed: 2026-08-07
---

# Phase 12 Plan 03: Public Surface Summary

The public surface checker derives the eight physical skills, verifies the root and all localized README projections, validates host invocation semantics, compares manifest versions and skill arrays, and records tag evidence without creating history. The live repository required no README edits because all public projections already matched the policy.

## Verification

- `python3 -m json.tool tests/fixtures/public-surface-policy.json` passed.
- `python3 scripts/public-surface-audit.py --root . --fixture tests/fixtures/public-surface-policy.json --candidate ef8f2aceb2e7f0b915713419cd129fbc0454d717 --check` passed with `38 passed, 0 failed, 1 conditional`.
- `python3 -m unittest scripts.test_public_surface_audit` passed `5/5` with temporary-copy drift cases.
- `python3 scripts/validate_skill_design.py --root . --check` passed with `ok: true` and no diagnostics.
- `python3 scripts/validate-codex-plugin.py --root .` passed.
- JSON parsing, Python compilation, and `git diff --check` passed.

## Outcome

The root and localized public claims, host semantics, manifest projections, and package versions are synchronized to the canonical eight-skill source. The only release follow-up is the absent candidate tag, which remains a publication decision outside this phase.
