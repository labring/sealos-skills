---
phase: 07-host-adapter-and-public-surface-alignment
plan: 02
subsystem: distribution
tags: [host-projection, codex, qoder, openai-metadata, pointers, version]

# Dependency graph
requires:
  - phase: 07-host-adapter-and-public-surface-alignment
    plan: 01
    provides: risk-aware route contract
  - phase: 06-inventory-router-and-validator-foundation
    plan: 03
    provides: aggregate validator and known Canvas projection diagnostics
provides:
  - explicit Canvas parity in Claude-compatible and CodeBuddy projections
  - canonical version and pointer validation
  - disposable Qoder package inspection gate
affects: [07-03, 11-behavior-gate, 12-release-audit]

# Tech tracking
tech-stack:
  added: [Python standard library, unittest, zipfile]
  patterns: [derived host projections, canonical version source, temporary archive inspection]

key-files:
  created:
    - scripts/test_validate_codex_plugin.py
    - scripts/test_qoder_plugin_package.py
  modified:
    - .claude-plugin/plugin.json
    - marketplace.json
    - .claude-plugin/marketplace.json
    - .codebuddy-plugin/marketplace.json
    - scripts/validate_skill_design.py
    - scripts/validate-codex-plugin.py
    - scripts/test_validate_skill_design.py

key-decisions:
  - "The physical eight-skill tree remains the source for explicit host arrays; Canvas is added to each derived projection."
  - "`.codex-plugin/plugin.json` remains the only package-version source; secondary projections and validators derive from it."
  - "Qoder packaging is validated in a temporary archive, keeping generated release packages out of the repository."

requirements-completed: [SDS-D05]

coverage:
  - id: D1
    description: "All explicit arrays contain the exact derived eight-skill set and the pointer hosts retain canonical-tree semantics."
    requirement: SDS-D05
    verification:
      - kind: unit
        ref: "python3 scripts/validate_skill_design.py --root . --check"
        status: pass
  - id: D2
    description: "Canonical version, Codex metadata, OpenAI presentation metadata, and OpenClaw/Qoder pointer contracts are mutation-tested."
    requirement: SDS-D05
    verification:
      - kind: unit
        ref: "python3 scripts/test_validate_codex_plugin.py"
        status: pass
  - id: D3
    description: "A temporary Qoder ZIP contains the complete canonical input set without a committed generated package."
    requirement: SDS-D05
    verification:
      - kind: unit
        ref: "python3 scripts/test_qoder_plugin_package.py"
        status: pass

# Metrics
duration: 24min
completed: 2026-08-07
status: complete
---

# Phase 7 Plan 2: Host Projection Summary

All explicit host projections now match the physical skill tree, while pointer, version, metadata, and temporary package contracts are independently validated.

## Accomplishments

- Added `./skills/sealos-canvas` to the four explicit Claude-compatible and CodeBuddy arrays.
- Extended the aggregate and Codex validators to derive inventory and canonical version data, check OpenAI metadata, and enforce pointer semantics.
- Added temporary-root Codex mutation fixtures and a temporary Qoder ZIP inspection suite.

## Verification Evidence

- `python3 scripts/test_validate_codex_plugin.py` -> 7 tests passed.
- `python3 scripts/test_qoder_plugin_package.py` -> 1 test passed.
- `python3 scripts/test_validate_skill_design.py` -> 18 tests passed after Phase 7 public-claim additions.
- `python3 scripts/validate-codex-plugin.py --root .` -> integration validation passed.

## Deviations

None. No generated Qoder archive or host-specific skill copy is committed.

## Next Phase Readiness

Plan 07-03 can align shared context, public claims, platform evidence, and direct `skills.sh` scope against the green host projection baseline.

---
*Phase: 07-host-adapter-and-public-surface-alignment*
*Completed: 2026-08-07*
