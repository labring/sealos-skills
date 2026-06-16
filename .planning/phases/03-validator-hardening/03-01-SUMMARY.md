---
phase: 03-validator-hardening
plan: 01
subsystem: validation
tags: [codex, plugin, validator, marketplace, readme, json]

requires:
  - phase: 02-readme-and-metadata-alignment
    provides: README and platform registry native Codex install contract
provides:
  - README native Codex command drift detection
  - README fallback Codex command drift detection
  - Manifest, marketplace, and platform registry identity parity checks
  - JSON syntax parser coverage for Phase 3 Codex metadata files
affects: [install-smoke-and-handoff, distribution-validation]

tech-stack:
  added: []
  patterns: [Python standard-library validation, canonical contract constants, restored negative probes]

key-files:
  created:
    - .planning/phases/03-validator-hardening/03-01-SUMMARY.md
  modified:
    - scripts/validate-codex-plugin.py
    - README.md

key-decisions:
  - "Canonical Codex install, fallback, identity, source, and evidence values now live in scripts/validate-codex-plugin.py."
  - "The validator parses root marketplace.json as part of the maintainer-facing Codex gate."
  - "README maintainer validation instructions include explicit json.tool checks for root plugin.json and root marketplace.json."

patterns-established:
  - "Contract helpers map directly to README, manifest, Codex marketplace, root marketplace, and Codex platform registry surfaces."
  - "Negative drift probes mutate files temporarily, assert non-zero validator output, and restore the original content before final verification."

requirements-completed: [VAL-01, VAL-02, VAL-03, VAL-04]

duration: 4min
completed: 2026-06-15
---

# Phase 03 Plan 01: Validator Hardening Summary

**Codex validator now catches README command drift, fallback drift, identity/source drift, platform registry drift, and malformed Phase 3 JSON metadata.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-15T10:52:42Z
- **Completed:** 2026-06-15T10:56:31Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Extended `scripts/validate-codex-plugin.py` with canonical constants for the Codex repo, plugin id, selector, display label, skills source, marketplace source, native commands, fallback command, platform install, and evidence tokens.
- Added validation helpers for README command/order and identity tokens, manifest contract parity, Codex marketplace contract, root marketplace contract, and Codex platform registry contract.
- Updated README maintainer validation instructions with explicit JSON syntax checks for root `plugin.json` and root `marketplace.json`.
- Proved positive and negative validator behavior for VAL-01 through VAL-04 while restoring all temporary probe mutations.

## Task Commits

1. **Task 1: Harden the Codex validator contract checks** - `60e28c5` (feat)
2. **Task 2: Align README maintainer validation instructions** - `60e28c5` (feat)
3. **Task 3: Prove positive and negative validator behavior** - `60e28c5` (feat, verification evidence)

## Files Created/Modified

- `scripts/validate-codex-plugin.py` - Adds canonical contract constants, README loading, root marketplace parsing, and Codex-focused validation helpers.
- `README.md` - Adds root `plugin.json` and root `marketplace.json` to the documented JSON syntax checks.
- `.planning/phases/03-validator-hardening/03-01-SUMMARY.md` - Records execution evidence and self-check results.

## Decisions Made

- Kept the validator Codex-focused and used exact string checks for commands, IDs, source paths, evidence tokens, and verification date.
- Preserved the current `PASS:` / `FAIL:` output style with one visible invariant per contract assertion.
- Used restored temporary mutations as the TDD/negative proof path because the plan limited persistent source edits to `scripts/validate-codex-plugin.py` and `README.md`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Reconciled TDD persistence with source ownership**
- **Found during:** Task 1 (Harden the Codex validator contract checks)
- **Issue:** The plan marked Task 1 as `tdd=true`, while the user constrained persistent source edits to `scripts/validate-codex-plugin.py` and `README.md` only.
- **Fix:** Used Task 3 restored negative probes as executable RED evidence and kept persistent edits within the requested ownership boundary.
- **Files modified:** `scripts/validate-codex-plugin.py`, `README.md`
- **Verification:** Four negative probes failed on the expected validator messages, then final positive checks passed.
- **Committed in:** `60e28c5`

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Validation behavior was proven without adding persistent test files outside the user's ownership scope.

## Issues Encountered

- `gsd-tools` was unavailable on PATH. The local GSD SDK shim was available at `/Users/longnv/.codex/gsd-core/bin/gsd-tools.cjs`; execution continued with direct plan handling and node-based GSD commands.
- `python3 -m py_compile` generated `scripts/__pycache__/`; the generated directory was removed before commit.

## Negative Probe Evidence

- **VAL-01 README native command order:** Swapped the native README command pair; `python3 scripts/validate-codex-plugin.py` exited `1` with `README lists native Codex commands in canonical order`.
- **VAL-02 README fallback command:** Removed `--target codex` from the README fallback command; validator exited `1` with `README includes fallback Codex npx install command`.
- **VAL-03 identity/source drift:** Changed `.agents/plugins/marketplace.json` source path to `./plugins/sealos-copy`; validator exited `1` with `Codex marketplace points at repo-root plugin source`.
- **VAL-04 malformed JSON:** Replaced `marketplace.json` content with `{`; validator exited `1` with `invalid JSON in marketplace.json`.
- All probe mutations were restored immediately before final verification.

## Verification

- `python3 scripts/validate-codex-plugin.py` - PASS
- `python3 -m py_compile scripts/validate-codex-plugin.py` - PASS
- `python3 -m json.tool .codex-plugin/plugin.json >/dev/null` - PASS
- `python3 -m json.tool plugin.json >/dev/null` - PASS
- `python3 -m json.tool .agents/plugins/marketplace.json >/dev/null` - PASS
- `python3 -m json.tool marketplace.json >/dev/null` - PASS
- `python3 -m json.tool distribution/platforms.json >/dev/null` - PASS
- README validation block assertion for validator plus five `json.tool` commands - PASS
- README command order assertion for native install and fallback install - PASS
- Platform registry assertion for install, alternate install, invoke, commands, evidence, and `lastVerified` - PASS
- `git diff -- skills --exit-code` - PASS
- `git diff -- README.md distribution/platforms.json .codex-plugin/plugin.json plugin.json .agents/plugins/marketplace.json marketplace.json --exit-code` after probes - PASS except the intended persistent README validation block update

## Auth Gates

None.

## Known Stubs

None.

## Threat Flags

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 04 can use `python3 scripts/validate-codex-plugin.py` as the maintainer gate before install smoke and handoff work.

## Self-Check: PASSED

- `scripts/validate-codex-plugin.py` exists.
- `README.md` exists.
- `.planning/phases/03-validator-hardening/03-01-SUMMARY.md` exists.
- Task commit `60e28c5` exists.
- `git diff -- skills --exit-code` passed.

---
*Phase: 03-validator-hardening*
*Completed: 2026-06-15*
