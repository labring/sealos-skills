---
phase: 04-install-smoke-and-handoff
plan: 01
subsystem: distribution
tags: [codex-plugin, native-marketplace, smoke-evidence, handoff]

requires:
  - phase: 03-validator-hardening
    provides: README, manifest, marketplace, registry, fallback install, and JSON syntax drift validation
provides:
  - Fresh isolated native Codex marketplace add/list/install evidence for sealos@sealos
  - Machine-readable native install identity, isolation, payload completeness, and cleanup assertions
  - HAND-01 evidence set for Phase 4 handoff
affects: [04-install-smoke-and-handoff, HAND-01, Codex native install verification]

tech-stack:
  added: []
  patterns:
    - Isolated HOME and CODEX_HOME for Codex marketplace smoke tests
    - Evidence-first native plugin install verification under the phase evidence directory

key-files:
  created:
    - .planning/phases/04-install-smoke-and-handoff/evidence/00-codex-version.txt
    - .planning/phases/04-install-smoke-and-handoff/evidence/01-native-marketplace-add.json
    - .planning/phases/04-install-smoke-and-handoff/evidence/02-native-marketplace-list.json
    - .planning/phases/04-install-smoke-and-handoff/evidence/03-native-plugin-list-available.json
    - .planning/phases/04-install-smoke-and-handoff/evidence/04-native-plugin-add.json
    - .planning/phases/04-install-smoke-and-handoff/evidence/06-native-smoke-assertions.json
    - .planning/phases/04-install-smoke-and-handoff/evidence/09-native-smoke-env.txt
  modified: []

key-decisions:
  - "Use the current worktree path as the native Codex marketplace source for pre-merge final verification."
  - "Commit raw native Codex command outputs plus assertion JSON as the durable HAND-01 proof."

patterns-established:
  - "Native Codex smoke evidence uses isolated HOME/CODEX_HOME and records cleanup after payload assertions."

requirements-completed: [HAND-01]

duration: 2min
completed: 2026-06-15
---

# Phase 04 Plan 01: Native Codex Install Smoke Summary

**Fresh isolated Codex native marketplace evidence proves `sealos@sealos` is available, installable, payload-complete, and cleaned up from temp state.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-06-15T12:02:24Z
- **Completed:** 2026-06-15T12:04:42Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Captured fresh native Codex CLI version, marketplace add, marketplace list, available plugin list, and plugin add JSON outputs against the current worktree.
- Proved `sealos@sealos` availability and install identity with `name: sealos` and `marketplaceName: sealos`.
- Verified the installed cache path was inside the isolated `CODEX_HOME` and included `plugin.json`, `.codex-plugin/plugin.json`, three required skill entrypoints, and `assets/logo.svg`.
- Removed the temporary smoke home and recorded `cleanup_status=removed` with `retained_for_debugging=false`.

## Task Commits

1. **Task 1: Capture isolated native Codex smoke evidence** - `d188ec3` (test)
2. **Task 2: Assert native install identity, payload, and cleanup** - `8b13390` (test)

## Files Created/Modified

- `.planning/phases/04-install-smoke-and-handoff/evidence/00-codex-version.txt` - Codex CLI version evidence.
- `.planning/phases/04-install-smoke-and-handoff/evidence/01-native-marketplace-add.json` - Native marketplace add JSON evidence.
- `.planning/phases/04-install-smoke-and-handoff/evidence/02-native-marketplace-list.json` - Native marketplace list JSON evidence.
- `.planning/phases/04-install-smoke-and-handoff/evidence/03-native-plugin-list-available.json` - Available plugin list JSON evidence.
- `.planning/phases/04-install-smoke-and-handoff/evidence/04-native-plugin-add.json` - Native plugin install JSON evidence.
- `.planning/phases/04-install-smoke-and-handoff/evidence/06-native-smoke-assertions.json` - Native identity, isolation, payload, and cleanup assertions.
- `.planning/phases/04-install-smoke-and-handoff/evidence/09-native-smoke-env.txt` - Isolated HOME/CODEX_HOME, command list, and cleanup record.
- `.planning/phases/04-install-smoke-and-handoff/04-01-SUMMARY.md` - Plan completion summary.

## Assertion Summary

- `passed`: true
- `available_contains_sealos_at_sealos`: true
- `install_reports_sealos_from_sealos`: true
- `installed_path_under_isolated_codex_home`: true
- `installed_payload_complete`: true
- `cleanup.status`: removed

## Verification Commands

- `test -s .planning/phases/04-install-smoke-and-handoff/evidence/00-codex-version.txt`
- `python3 -m json.tool .planning/phases/04-install-smoke-and-handoff/evidence/01-native-marketplace-add.json >/dev/null`
- `python3 -m json.tool .planning/phases/04-install-smoke-and-handoff/evidence/02-native-marketplace-list.json >/dev/null`
- `python3 -m json.tool .planning/phases/04-install-smoke-and-handoff/evidence/03-native-plugin-list-available.json >/dev/null`
- `python3 -m json.tool .planning/phases/04-install-smoke-and-handoff/evidence/04-native-plugin-add.json >/dev/null`
- `python3 -m json.tool .planning/phases/04-install-smoke-and-handoff/evidence/06-native-smoke-assertions.json >/dev/null`
- `python3 -c 'import json, pathlib; d=json.loads(pathlib.Path(".planning/phases/04-install-smoke-and-handoff/evidence/06-native-smoke-assertions.json").read_text()); assert d["passed"] is True and d["installed_payload_complete"] is True'`
- `rg -n 'cleanup_status|retained_for_debugging|SMOKE_CODEX_HOME' .planning/phases/04-install-smoke-and-handoff/evidence/09-native-smoke-env.txt`

## Decisions Made

- Used the current worktree path as the marketplace source because Phase 4 needs pre-merge proof of the candidate repository state.
- Preserved raw Codex JSON output separately from assertion JSON so reviewers can inspect both source evidence and derived proof.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used local GSD SDK shim when `gsd-tools` was absent from PATH**
- **Found during:** Execution setup
- **Issue:** `gsd-tools query init.execute-phase 4` failed because `gsd-tools` was not on PATH.
- **Fix:** Used `node "$HOME/.codex/gsd-core/bin/gsd-tools.cjs"` for GSD SDK calls.
- **Files modified:** None.
- **Verification:** `init.execute-phase` and `state.load` returned project state successfully.
- **Committed in:** N/A, environment adaptation only.

---

**Total deviations:** 1 auto-fixed (1 blocking environment adaptation)
**Impact on plan:** Evidence scope and source files stayed unchanged.

## Issues Encountered

- `gsd-tools` was unavailable on PATH; the local `gsd-tools.cjs` shim worked for GSD metadata operations.

## Known Stubs

None.

## Threat Flags

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

HAND-01 native Codex smoke evidence is complete. Plan 04-02 can capture compatibility evidence, aggregate verification, final changed-file handoff, and remaining non-Codex follow-up.

## Self-Check: PASSED

- Found all seven evidence files and this SUMMARY file.
- Found task commits `d188ec3` and `8b13390` in git history.
- Re-ran plan-level JSON and assertion verification successfully.

---
*Phase: 04-install-smoke-and-handoff*
*Completed: 2026-06-15*
