---
phase: 02-readme-and-metadata-alignment
plan: 02
subsystem: docs
tags: [codex, plugin, marketplace, metadata, distribution]

requires:
  - phase: 01-native-marketplace-discovery-contract
    provides: Native Codex marketplace add/list/install evidence and installed payload assertions
  - phase: 02-readme-and-metadata-alignment
    provides: README Codex install and invocation copy from plan 02-01
provides:
  - Codex platform registry aligned to native marketplace install commands
  - Codex alternate install metadata for the npx compatibility path
  - Phase 1 evidence wording in the platform registry while preserving the validator token
  - Verification that Codex manifests keep root skills and marketplace source alignment
affects: [validator-hardening, install-smoke-and-handoff]

tech-stack:
  added: []
  patterns: [Codex native install metadata, platform registry evidence contract]

key-files:
  created:
    - .planning/phases/02-readme-and-metadata-alignment/02-02-SUMMARY.md
  modified:
    - distribution/platforms.json

key-decisions:
  - "Codex platform metadata uses the native Codex marketplace command pair as the primary install path."
  - "The `npx plugins add https://github.com/labring/sealos-skills --target codex` path remains as `alternateInstall` for compatibility and local flows."
  - "Codex evidence now cites Phase 1 native marketplace add/list/install plus installed payload assertions while preserving `codex_manifest+repo_marketplace`."

patterns-established:
  - "Codex registry install guidance mirrors README: `codex plugin marketplace add labring/sealos-skills` followed by `codex plugin add sealos@sealos`."
  - "Codex platform freshness dates use `2026-06-15` for both top-level `lastUpdated` and Codex `lastVerified`."

requirements-completed: [META-01, META-02, META-04]

duration: 4min
completed: 2026-06-15
---

# Phase 02 Plan 02: Codex Platform Metadata Summary

**Codex platform registry metadata now matches the verified native marketplace install path, compatibility path, invocation copy, and Phase 1 evidence contract.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-15T09:56:29Z
- **Completed:** 2026-06-15T10:00:29Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Updated `distribution/platforms.json` top-level `lastUpdated` to `2026-06-15`.
- Set Codex `install` to `codex plugin marketplace add labring/sealos-skills && codex plugin add sealos@sealos`.
- Added Codex `alternateInstall` as `npx plugins add https://github.com/labring/sealos-skills --target codex`.
- Kept invocation Codex-specific with `$sealos` for Codex CLI and selecting `Sealos` from Plugins in Codex App.
- Updated Codex evidence to reference Phase 1 native marketplace add/list/install, installed payload assertions, and the `codex_manifest+repo_marketplace` validator token.
- Set Codex `lastVerified` to `2026-06-15` and verified runtime `skills/**` files were untouched.

## Task Commits

1. **Task 1: Update the Codex platform registry entry** - `c5fbe43` (docs)
2. **Task 2: Run Phase 2 metadata and scope validation** - validation-only task, covered by `c5fbe43`

## Files Created/Modified

- `distribution/platforms.json` - Aligns Codex platform install, alternate install, invocation, evidence, and verification date.
- `.planning/phases/02-readme-and-metadata-alignment/02-02-SUMMARY.md` - Records this plan's execution results.

## Decisions Made

- Used the Phase 1 verified native Codex marketplace command pair as the registry primary install path.
- Preserved the `npx plugins` Codex command as a compatibility/local alternate install path.
- Kept the existing validator evidence token `codex_manifest+repo_marketplace` and added Phase 1 evidence wording.

## Deviations from Plan

None - plan executed exactly as written.

## Auth Gates

None.

## Known Stubs

None.

## Threat Flags

None.

## Verification

- `python3 -m json.tool distribution/platforms.json >/dev/null` - PASS
- `python3 -c 'import json; p=json.load(open("distribution/platforms.json")); c=[x for x in p["platforms"] if x["id"]=="codex"][0]; assert p["lastUpdated"]=="2026-06-15"; assert c["install"]=="codex plugin marketplace add labring/sealos-skills && codex plugin add sealos@sealos"; assert c["alternateInstall"]=="npx plugins add https://github.com/labring/sealos-skills --target codex"; assert "sealos@sealos" in c["install"]; assert "codex_manifest+repo_marketplace" in c["evidence"]; assert "Phase 1" in c["evidence"]; assert c["lastVerified"]=="2026-06-15"'` - PASS
- `rg -n 'codex plugin marketplace add labring/sealos-skills|codex plugin add sealos@sealos|npx plugins add https://github.com/labring/sealos-skills --target codex|codex_manifest\+repo_marketplace' distribution/platforms.json` - PASS
- `python3 scripts/validate-codex-plugin.py` - PASS
- `python3 -m json.tool .codex-plugin/plugin.json >/dev/null` - PASS
- `python3 -m json.tool plugin.json >/dev/null` - PASS
- `python3 -m json.tool .agents/plugins/marketplace.json >/dev/null` - PASS
- `rg -n 'codex plugin marketplace add labring/sealos-skills|codex plugin add sealos@sealos|npx plugins add https://github.com/labring/sealos-skills --target codex' README.md distribution/platforms.json` - PASS
- `rg -n '"path": "\./plugins/sealos"' .agents/plugins/marketplace.json` - PASS
- `rg -n '"skills": "\./skills/"' .codex-plugin/plugin.json plugin.json` - PASS
- `git diff -- skills --exit-code` - PASS

## Issues Encountered

- `gsd-tools` was unavailable on PATH. The local GSD CLI was available through `node /Users/longnv/.codex/gsd-core/bin/gsd-tools.cjs`, so state and metadata commands used that entry point.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 03 can harden the validator against the native Codex install and evidence contract now recorded in both README and `distribution/platforms.json`.

---
*Phase: 02-readme-and-metadata-alignment*
*Completed: 2026-06-15*

## Self-Check: PASSED

- `distribution/platforms.json` exists and contains the required Codex metadata.
- `.planning/phases/02-readme-and-metadata-alignment/02-02-SUMMARY.md` exists.
- Task commit `c5fbe43` exists.
