---
phase: 01-native-marketplace-discovery-contract
plan: 01-01-metadata-discovery-contract
subsystem: distribution
tags: [codex, marketplace, plugin-metadata, validation]

requires:
  - phase: 01-native-marketplace-discovery-contract
    provides: Phase context and research for native Codex marketplace discovery
provides:
  - Root Codex plugin manifest at plugin.json
  - Baseline marketplace discovery evidence
  - Validator parity coverage for root and .codex-plugin manifests
affects: [codex-plugin-install, marketplace-discovery, validator-hardening]

tech-stack:
  added: []
  patterns:
    - Root plugin.json mirrors .codex-plugin/plugin.json for Codex native discovery
    - Phase evidence is captured as valid JSON under the phase evidence directory

key-files:
  created:
    - plugin.json
    - .planning/phases/01-native-marketplace-discovery-contract/evidence/01-initial-discovery.json
    - .planning/phases/01-native-marketplace-discovery-contract/evidence/04-sibling-marketplace-surfaces.json
  modified:
    - scripts/validate-codex-plugin.py

key-decisions:
  - "Expose root plugin.json because Codex 0.139.0 reads plugin manifests directly from marketplace source.path."
  - "Keep .agents/plugins/marketplace.json source.path as ./ so root skills remain the only skill source."
  - "Validate key-field parity between root plugin.json and .codex-plugin/plugin.json."

patterns-established:
  - "Codex native discovery manifest parity is enforced by scripts/validate-codex-plugin.py."
  - "Sibling marketplace surfaces preserve commands: ./commands/ and root ./skills/... paths."

requirements-completed: [DISC-01, DISC-02, DISC-03, META-03]

duration: 5 min
completed: 2026-06-15
---

# Phase 01 Plan 01-01: Metadata Discovery Contract Summary

**Root Codex plugin manifest with validator-enforced parity and baseline discovery evidence for sealos@sealos**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-15T08:08:58Z
- **Completed:** 2026-06-15T08:14:11Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments

- Captured isolated Codex 0.139.0 baseline showing marketplace add/list succeeded while available plugins were empty and `sealos@sealos` install failed.
- Added root `plugin.json` mirroring `.codex-plugin/plugin.json` key fields with `skills: "./skills/"`.
- Extended `scripts/validate-codex-plugin.py` to load root `plugin.json` and assert parity for required discovery fields.
- Verified sibling marketplace metadata still points to `./commands/` and root `./skills/...` paths.

## Task Commits

1. **Task 01.01: Inspect current marketplace identity and discoverability baseline** - `97f4f34` (docs)
2. **Task 01.02: Expose a root plugin manifest for Codex native discovery** - `c7e4032` (feat)
3. **Task 01.03: Add manifest parity validation for the root plugin manifest** - `8b53d79` (test)
4. **Task 01.04: Retain sibling marketplace surfaces without introducing skill copies** - `3b58138` (docs)

## Files Created/Modified

- `plugin.json` - Root Codex native plugin manifest for marketplace source path `./`.
- `scripts/validate-codex-plugin.py` - Loads root plugin manifest and checks parity with `.codex-plugin/plugin.json`.
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/01-initial-discovery.json` - Baseline isolated smoke evidence before root manifest fix.
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/04-sibling-marketplace-surfaces.json` - Evidence that sibling marketplace paths stayed rooted at `./commands/` and `./skills/...`.

## Decisions Made

- Expose root `plugin.json` directly at repository root to satisfy Codex native discovery from `source.path: "./"`.
- Preserve `.agents/plugins/marketplace.json` `source.path` as `./` to keep root `skills/**` canonical.
- Keep `marketplace.json` and `.claude-plugin/marketplace.json` unchanged after inspection because they already preserve root command and skill paths.

## Verification

- `python3 -m json.tool plugin.json >/dev/null` - PASS
- `python3 -m json.tool .agents/plugins/marketplace.json >/dev/null` - PASS
- `python3 -m json.tool marketplace.json >/dev/null` - PASS
- `python3 -m json.tool .claude-plugin/marketplace.json >/dev/null` - PASS
- `python3 -m json.tool .codex-plugin/plugin.json >/dev/null` - PASS
- `python3 scripts/validate-codex-plugin.py` - PASS; output includes root manifest existence and parity PASS lines.
- `git diff -- skills --exit-code` - PASS

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** Metadata scope stayed limited to discovery evidence, root manifest exposure, and validator parity.

## Issues Encountered

None.

## Known Stubs

None found in files created or modified by this plan.

## Threat Flags

None. Changes introduce metadata discovery surfaces only; no new network endpoints, auth paths, file access paths, or schema changes were added.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `01-02-isolated-codex-smoke-PLAN.md`, which can verify native marketplace discovery and install behavior against the candidate worktree now that root `plugin.json` exists.

## Self-Check: PASSED

- Found `plugin.json`.
- Found `.planning/phases/01-native-marketplace-discovery-contract/evidence/01-initial-discovery.json`.
- Found `.planning/phases/01-native-marketplace-discovery-contract/evidence/04-sibling-marketplace-surfaces.json`.
- Found commits `97f4f34`, `c7e4032`, `8b53d79`, and `3b58138`.
- Plan verification commands passed.

---
*Phase: 01-native-marketplace-discovery-contract*
*Completed: 2026-06-15*
