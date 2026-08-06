---
phase: 05-baseline-ownership-and-shared-contract
plan: 03
subsystem: skills
tags: [entry-contract, safety, runtime-preservation, sealos]

requires:
  - phase: 05-baseline-ownership-and-shared-contract
    provides: Shared contract, canary IDs, and deterministic baseline traces from 05-01/05-02
provides:
  - Shared contract skeleton and entry-visible canaries in all eight canonical skills
  - Runtime-preservation checklist tied to baseline traces and existing gates
affects: [06-inventory-router-validator-foundation, 07-host-adapter-public-surface-alignment, 08-dependency-entry-refactors, 09-service-entry-refactors, 10-deploy-orchestration-runtime-truth, 11-behavior-evals-deterministic-grader-maintainer-gate]

tech-stack:
  added: []
  patterns: [additive entry contracts, typed handoff fields, entry-visible canaries, preservation crosswalk]

key-files:
  created:
    - docs/skill-runtime-preservation-checklist.md
  modified:
    - skills/cloud-native-readiness/SKILL.md
    - skills/dockerfile-skill/SKILL.md
    - skills/docker-to-sealos/SKILL.md
    - skills/sealos-app-builder/SKILL.md
    - skills/sealos-database/SKILL.md
    - skills/sealos-s3/SKILL.md
    - skills/sealos-canvas/SKILL.md
    - skills/sealos-deploy/SKILL.md

key-decisions:
  - "Apply the shared contract additively before each existing Overview/Safety/Compatibility section so domain procedures and helper links remain intact."
  - "Keep provider smoke, host projection repair, and release/branch policy work deferred to their assigned phases while preserving the current local/helper gates."
  - "Use the existing Miniforge Python runtime for PyYAML-backed tests because the default python3 lacks PyYAML; do not install or commit a new dependency."

patterns-established:
  - "Every entry exposes the same eight headings and declares its domain canary IDs before detail links."
  - "Composite handoffs name target, inputArtifact, allowedAction, failureReturn, and responseOwner."

requirements-completed: [SDS-01, SDS-03, SDS-05]

coverage:
  - id: D1
    description: "All eight canonical SKILL.md entries expose the ordered shared contract and preserve domain extensions."
    requirement: SDS-01
    verification:
      - kind: other
        ref: "all-eight-core-order Python assertion"
        status: pass
    human_judgment: false
  - id: D2
    description: "Entry-visible canaries retain confirmation, redaction, read-only, eligibility, quality-gate, runtime, SDK, Desktop, and server-lifetime safeguards."
    requirement: SDS-05
    verification:
      - kind: other
        ref: "entry-canaries Python assertion"
        status: pass
      - kind: other
        ref: "docs/skill-runtime-preservation-checklist.md crosswalk"
        status: pass
    human_judgment: false
  - id: D3
    description: "Runtime preservation crosswalk and existing helper gates remain green for the eight-skill baseline."
    requirement: SDS-03
    verification:
      - kind: unit
        ref: "node scripts/skill-design-baseline.mjs --fixture tests/fixtures/skill-design-baseline.json --check"
        status: pass
      - kind: unit
        ref: "node --test scripts/test-skill-design-baseline.mjs"
        status: pass
      - kind: integration
        ref: "Docker-to-Sealos 213 + 5 + 48 Python tests; deploy footprint/live-smoke tests"
        status: pass
    human_judgment: false

duration: 29min
completed: 2026-08-06
status: complete
---

# Phase 5 Plan 3: Entry Contract and Runtime Preservation Summary

**All eight canonical skills now expose the shared request contract and safety canaries, with a passing runtime-preservation crosswalk anchored to existing gates.**

## Performance

- **Duration:** 29 min
- **Started:** 2026-08-06T10:05:00Z
- **Completed:** 2026-08-06T10:34:00Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Added the exact ordered eight-section core to all eight `SKILL.md` entries without replacing their existing domain workflows, frontmatter, module links, or helper names.
- Added entry-visible canaries for eligibility, runtime acceptance, MUST-map/quality-gate, kubeconfig scope, confirmation, redaction, private service defaults, Canvas read-only/server lifetime, and Desktop SDK verification.
- Added a checklist with eight approved crosswalk rows mapping canaries, baseline positive/violating cases, artifacts, typed handoffs, terminal evidence, and deterministic gate commands.
- Preserved provider smoke, host projection, and branch/release boundaries for later phases.

## Task Commits

1. **Task 1: Apply the contract to dependency and adjacent local-workflow entries** - `60eca2d` (feat)
2. **Task 2: Apply the contract to service, Canvas, and deploy entries** - `60eca2d` (feat)
3. **Task 3: Approve the runtime-preservation crosswalk and run existing gates** - `60eca2d` (feat)

**Plan metadata:** SUMMARY close-out commit follows this production commit.

## Files Created/Modified

- `skills/cloud-native-readiness/SKILL.md` - Eligibility-first contract and Dockerfile handoff.
- `skills/dockerfile-skill/SKILL.md` - Owned-file, runtime-acceptance, and redaction contract.
- `skills/docker-to-sealos/SKILL.md` - MUST-map, registry, and final quality-gate contract.
- `skills/sealos-app-builder/SKILL.md` - SDK-source, Desktop iframe, and publish contract.
- `skills/sealos-database/SKILL.md` - Analyzer-first, env-preserving, confirmation contract.
- `skills/sealos-s3/SKILL.md` - Private-first bucket, rotation confirmation, and object-proof contract.
- `skills/sealos-canvas/SKILL.md` - Read-only state/kubeconfig gate and bounded loopback lifecycle.
- `skills/sealos-deploy/SKILL.md` - Scoped orchestration, Runtime Truth, confirmation, and redaction contract.
- `docs/skill-runtime-preservation-checklist.md` - Eight-row preservation crosswalk and gate record.

## Decisions Made

- Used additive entry sections to keep the existing domain detail and runtime semantics as the source for procedure behavior.
- Recorded helper-level and offline gates as preservation evidence; live provider verification remains a later phase concern.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The default `/opt/homebrew/opt/python@3.14/bin/python3.14` lacks PyYAML, so the three Docker-to-Sealos Python suites initially failed at import. The existing `/opt/homebrew/Caskroom/miniforge/base/bin/python` includes PyYAML 6.0.3; rerunning with that interpreter passed all 213 consistency tests, 5 MUST-coverage tests, and 48 Compose/template tests. No system installation or repository dependency change was made.

The test run created Python bytecode caches under the Docker-to-Sealos scripts directory; those generated files were removed before commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 5 is ready for verifier review. Phase 6 can use the checklist and baseline checker to repair host/router inventory parity while keeping the eight physical entries as behavior owners.

## Verification Evidence

- All-eight core-order assertion -> `PASS`; eight files contain all eight headings in order.
- Entry-canaries assertion -> `PASS`; Canvas has `127.0.0.1`, `local_url`, `read-only`, and `Stop the server`; deploy has `KUBECONFIG`, `Runtime Truth`, `confirmation`, and `redact`.
- `node scripts/skill-design-baseline.mjs --fixture tests/fixtures/skill-design-baseline.json --check` -> `ok: true`, 8 skills, 16 cases.
- `node --test scripts/test-skill-design-baseline.mjs` -> 5 passed, 0 failed.
- `python3 scripts/validate-codex-plugin.py` -> passed.
- `/opt/homebrew/Caskroom/miniforge/base/bin/python skills/docker-to-sealos/scripts/test_check_consistency.py` -> 213 tests passed.
- `/opt/homebrew/Caskroom/miniforge/base/bin/python skills/docker-to-sealos/scripts/test_check_must_coverage.py` -> 5 tests passed.
- `/opt/homebrew/Caskroom/miniforge/base/bin/python skills/docker-to-sealos/scripts/test_compose_to_template.py` -> 48 tests passed.
- `node skills/sealos-deploy/scripts/test-sealos-footprint.mjs` -> 3 passed, 0 failed.
- `node skills/sealos-deploy/scripts/test-sealos-live-smoke.mjs` -> 5 passed, 0 failed.
- `git diff --check` -> passed.

## Self-Check: PASSED

- All eight entry files and the checklist exist at planned paths.
- Baseline, plugin, Docker-to-Sealos, deploy, and diff gates pass.
- No credentials, provider data, host projection changes, or generated caches are committed.

---
*Phase: 05-baseline-ownership-and-shared-contract*
*Plan: 05-03*
*Completed: 2026-08-06*
