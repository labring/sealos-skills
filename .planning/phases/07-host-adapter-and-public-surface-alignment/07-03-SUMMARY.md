---
phase: 07-host-adapter-and-public-surface-alignment
plan: 03
subsystem: public-surface
tags: [context, readme, platforms, qoder, openclaw, skills-sh]

# Dependency graph
requires:
  - phase: 07-host-adapter-and-public-surface-alignment
    plan: 02
    provides: green host projections and canonical pointer/version checks
provides:
  - complete eight-capability shared context map
  - host-accurate public invocation claims
  - deterministic public-surface evidence checks
affects: [11-behavior-gate, 12-release-audit]

# Tech tracking
tech-stack:
  added: [Python standard library, JSON fixtures, Markdown contract checks]
  patterns: [host classification, exact direct-entry subset, behavior-free adapters]

key-files:
  modified:
    - AGENTS.md
    - qoder.md
    - distribution/platforms.json
    - marketplaces/README.md
    - README.md
    - scripts/validate_skill_design.py
    - scripts/test_validate_skill_design.py

key-decisions:
  - "AGENTS.md remains the shared context source and CLAUDE.md remains its symlink."
  - "Gemini and Qwen are context-only; OpenClaw points to the Claude manifest; CodeBuddy remains host-dependent."
  - "The direct `skills.sh` surface is exactly `/sealos-deploy`, `/sealos-database`, and `/sealos-s3`; Canvas requires verified `.sealos/state.json` deployment evidence."

requirements-completed: [SDS-02, SDS-D05]

coverage:
  - id: D1
    description: "Shared context and Qoder docs enumerate all eight owners with native host invocation semantics."
    requirement: SDS-D05
    verification:
      - kind: unit
        ref: "python3 scripts/validate_skill_design.py --root . --check"
        status: pass
  - id: D2
    description: "Public claims enforce the exact direct skills.sh subset, context-only extensions, pointer inheritance, and Canvas precondition."
    requirement: SDS-02
    verification:
      - kind: unit
        ref: "python3 scripts/test_validate_skill_design.py"
        status: pass
  - id: D3
    description: "Platform evidence records route, inventory, pointer, version, link, and temporary-package validation while preserving claim levels."
    requirement: SDS-D05
    verification:
      - kind: unit
        ref: "python3 -m json.tool distribution/platforms.json"
        status: pass

# Metrics
duration: 21min
completed: 2026-08-07
status: complete
---

# Phase 7 Plan 3: Public Surface Summary

Shared context, public documentation, and platform evidence now describe the same eight canonical skills and host-specific invocation boundaries.

## Accomplishments

- Added a complete host capability map to `AGENTS.md` and a behavior-free `/sealos` route contract to `qoder.md`.
- Updated root README, marketplace guidance, and platform evidence for Canvas parity, direct-entry scope, context-only extensions, and pointer hosts.
- Added deterministic public-claim checks for canonical names, host tokens, exact direct paths, context targets, OpenClaw semantics, evidence, and Canvas deployment-state preconditions.

## Verification Evidence

- `python3 scripts/test_validate_skill_design.py -v` -> 18 tests passed.
- `python3 scripts/validate_skill_design.py --root . --check` -> `ok: true`, no diagnostics.
- `python3 -m json.tool distribution/platforms.json` -> passed.
- `git diff --check` -> passed.

## Deviations

None. External host smoke tests remain a later release-audit concern; the offline contracts are complete and deterministic.

## Next Phase Readiness

Phase 7 is ready for goal-backward verification and GSD closeout. The next implementation phase can consume the aligned canonical projections.

---
*Phase: 07-host-adapter-and-public-surface-alignment*
*Completed: 2026-08-07*
