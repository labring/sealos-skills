---
phase: 01-native-marketplace-discovery-contract
plan: 01-02-isolated-codex-smoke
subsystem: distribution
tags: [codex, marketplace, plugin-install, smoke-evidence]

requires:
  - phase: 01-native-marketplace-discovery-contract
    provides: Root Codex plugin manifest and initial discovery baseline
provides:
  - Isolated Codex marketplace add/list evidence
  - Available plugin evidence for sealos@sealos
  - Successful native install evidence for sealos@sealos
  - Machine-readable smoke assertions
affects: [codex-plugin-install, marketplace-discovery, validator-hardening, readme-alignment]

tech-stack:
  added: []
  patterns:
    - Codex 0.139.0 marketplace source.path points at a plugin root containing .codex-plugin/plugin.json.
    - The install-root Codex manifest keeps root skills canonical through ../skills/.
    - Native marketplace smoke commands use isolated HOME and CODEX_HOME for every Codex command.

key-files:
  created:
    - .codex-plugin/.codex-plugin/plugin.json
    - .planning/phases/01-native-marketplace-discovery-contract/evidence/00-codex-version.txt
    - .planning/phases/01-native-marketplace-discovery-contract/evidence/01-marketplace-add.json
    - .planning/phases/01-native-marketplace-discovery-contract/evidence/02-marketplace-list.json
    - .planning/phases/01-native-marketplace-discovery-contract/evidence/03-plugin-list-available.json
    - .planning/phases/01-native-marketplace-discovery-contract/evidence/04-plugin-add.json
    - .planning/phases/01-native-marketplace-discovery-contract/evidence/05-native-smoke-assertions.json
  modified:
    - .agents/plugins/marketplace.json
    - scripts/validate-codex-plugin.py

key-decisions:
  - "Point .agents/plugins/marketplace.json source.path at ./.codex-plugin because Codex 0.139.0 discovers marketplace plugins only when the source path is a plugin root."
  - "Add .codex-plugin/.codex-plugin/plugin.json with ../skills/ and ../assets/ paths so native install succeeds while root skills remain canonical."
  - "Extend scripts/validate-codex-plugin.py to enforce install-root manifest parity with the main Codex manifest."

patterns-established:
  - "Phase smoke evidence records one JSON file per Codex marketplace command output."
  - "Evidence assertions recursively validate marketplace-qualified plugin identity and successful install fields."

requirements-completed: [DISC-01, DISC-02, DISC-03]

duration: 7 min
completed: 2026-06-15
---

# Phase 01 Plan 01-02: Isolated Codex Smoke Summary

**Native Codex marketplace discovery and install evidence for sealos@sealos using isolated HOME and CODEX_HOME**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-15T08:19:06Z
- **Completed:** 2026-06-15T08:26:14Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Ran the required isolated Codex 0.139.0 marketplace smoke sequence with explicit temporary `HOME` and `CODEX_HOME`.
- Captured marketplace add, marketplace list, available plugin list, and native install outputs under the Phase 1 evidence directory.
- Proved `03-plugin-list-available.json` contains `pluginId: "sealos@sealos"` before install.
- Proved `04-plugin-add.json` reports successful install of plugin `sealos` from marketplace `sealos`.
- Added machine-readable assertion evidence with `passed: true`.

## Task Commits

1. **Task 02.01: Run isolated marketplace add, list, available-list, and install smoke** - `d65fdd4` (fix)
2. **Task 02.02: Assert JSON evidence for available and installed identities** - `67da3e8` (test)

## Files Created/Modified

- `.agents/plugins/marketplace.json` - Points Codex marketplace discovery at the installable plugin root shim.
- `.codex-plugin/.codex-plugin/plugin.json` - Install-root manifest using `../skills/` and `../assets/logo.svg`.
- `scripts/validate-codex-plugin.py` - Validates install-root manifest parity and path targets.
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/00-codex-version.txt` - Captures `codex-cli 0.139.0`.
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/01-marketplace-add.json` - Captures isolated marketplace add result.
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/02-marketplace-list.json` - Captures isolated marketplace list result.
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/03-plugin-list-available.json` - Captures available plugin result containing `sealos@sealos`.
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/04-plugin-add.json` - Captures successful native install result.
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/05-native-smoke-assertions.json` - Captures machine-readable assertion results.

## Decisions Made

- Codex marketplace discovery now points at `./.codex-plugin`, matching Codex 0.139.0's plugin-root discovery rule.
- The install-root manifest is generated as a metadata shim and keeps all skills under the existing root `skills/**` source through `../skills/`.
- Validator parity covers root, main Codex, and install-root manifests so future metadata drift is caught locally.

## Verification

- `python3 -m json.tool .planning/phases/01-native-marketplace-discovery-contract/evidence/01-marketplace-add.json >/dev/null` - PASS
- `python3 -m json.tool .planning/phases/01-native-marketplace-discovery-contract/evidence/02-marketplace-list.json >/dev/null` - PASS
- `python3 -m json.tool .planning/phases/01-native-marketplace-discovery-contract/evidence/03-plugin-list-available.json >/dev/null` - PASS
- `python3 -m json.tool .planning/phases/01-native-marketplace-discovery-contract/evidence/04-plugin-add.json >/dev/null` - PASS
- `python3 -m json.tool .planning/phases/01-native-marketplace-discovery-contract/evidence/05-native-smoke-assertions.json >/dev/null` - PASS
- `python3 scripts/validate-codex-plugin.py` - PASS
- Identity assertion: `03-plugin-list-available.json` contains `pluginId: "sealos@sealos"` - PASS
- Install assertion: `04-plugin-add.json` contains `pluginId: "sealos@sealos"`, `name: "sealos"`, `marketplaceName: "sealos"`, and `installedPath` - PASS
- Live Codex cache check: `$HOME/.codex/plugins/cache/sealos/sealos/1.0.0` absent - PASS

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made native Codex install discoverable**
- **Found during:** Task 02.01 (Run isolated marketplace add, list, available-list, and install smoke)
- **Issue:** `codex plugin list --available --json` returned an empty available list and `codex plugin add sealos@sealos --json` failed because Codex 0.139.0 did not discover a plugin when `.agents/plugins/marketplace.json` used `source.path: "./"`.
- **Fix:** Updated the Codex marketplace entry to `source.path: "./.codex-plugin"`, added `.codex-plugin/.codex-plugin/plugin.json` with install-root relative paths, and extended validator coverage for the install-root manifest.
- **Files modified:** `.agents/plugins/marketplace.json`, `.codex-plugin/.codex-plugin/plugin.json`, `scripts/validate-codex-plugin.py`
- **Verification:** Re-ran the full isolated smoke sequence and `python3 scripts/validate-codex-plugin.py`.
- **Committed in:** `d65fdd4`

---

**Total deviations:** 1 auto-fixed (1 blocking issue).
**Impact on plan:** The fix was required for the planned smoke to complete and preserved the root `skills/**` source.

## Issues Encountered

- Initial install attempt failed with `Error: plugin \`sealos\` was not found in marketplace \`sealos\``. The install-root metadata shim resolved the failure and the final smoke passed.

## Known Stubs

None found in files created or modified by this plan.

## Threat Flags

None. Changes introduce metadata discovery surfaces and evidence files only; no new network endpoints, auth paths, runtime file access paths, or schema trust boundaries were added.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `01-03-validation-and-handoff-PLAN.md`. The native Codex install path has machine-checkable evidence for marketplace add, available-list discovery, and install.

## Self-Check: PASSED

- Found `.agents/plugins/marketplace.json`.
- Found `.codex-plugin/.codex-plugin/plugin.json`.
- Found `scripts/validate-codex-plugin.py`.
- Found all six required evidence files.
- Found commits `d65fdd4` and `67da3e8`.
- Plan verification commands passed.

---
*Phase: 01-native-marketplace-discovery-contract*
*Completed: 2026-06-15*
