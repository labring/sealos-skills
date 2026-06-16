---
phase: 04-install-smoke-and-handoff
plan: 02
subsystem: distribution
tags: [codex-plugin, npx-plugins, compatibility-smoke, handoff]

requires:
  - phase: 04-install-smoke-and-handoff
    provides: Fresh native Codex marketplace install evidence from Plan 04-01
provides:
  - Autonomous npm package legitimacy audit for the `plugins` compatibility installer
  - Traceable autonomous package gate approval record for isolated compatibility evidence
  - Isolated compatibility `npx plugins` command evidence with truthful discovery classification
  - Aggregate HAND-01/HAND-02/HAND-03 assertions, cleanup proof, secret scan, and final changed-file handoff
affects: [HAND-02, HAND-03, install-smoke-closeout, downstream-verification, downstream-uat]

tech-stack:
  added: []
  patterns:
    - Isolated HOME, CODEX_HOME, npm cache, and XDG dirs for compatibility installer evidence
    - Git-truth final handoff generated from merge-base, diff, and status outputs

key-files:
  created:
    - .planning/phases/04-install-smoke-and-handoff/evidence/05-npx-package-audit.json
    - .planning/phases/04-install-smoke-and-handoff/evidence/05-npx-compat-install.txt
    - .planning/phases/04-install-smoke-and-handoff/evidence/05-npx-compat-install.stderr.txt
    - .planning/phases/04-install-smoke-and-handoff/evidence/05-npx-compat-install.exitcode
    - .planning/phases/04-install-smoke-and-handoff/evidence/05-npx-compat-discovery.json
    - .planning/phases/04-install-smoke-and-handoff/evidence/07-validator-and-json-checks.txt
    - .planning/phases/04-install-smoke-and-handoff/evidence/08-final-handoff.md
    - .planning/phases/04-install-smoke-and-handoff/evidence/11-install-smoke-assertions.json
    - .planning/phases/04-install-smoke-and-handoff/evidence/12-secret-scan.txt
    - .planning/phases/04-install-smoke-and-handoff/evidence/13-cleanup-verification.txt
    - .planning/phases/04-install-smoke-and-handoff/04-02-SUMMARY.md
  modified: []

key-decisions:
  - "Recorded autonomous package gate approval for `plugins@1.3.1`, based on user-delegated interaction-gate decisions and metadata due diligence for isolated compatibility evidence."
  - "Approved `plugins@1.3.1` for isolated compatibility execution after npm metadata matched expected package, repository, CLI bin, Node engine, registry integrity, and no postinstall script."
  - "Classified compatibility output as discovery evidence because the exact command discovered the Sealos plugin and Codex target, then reached an installer confirmation prompt without installed Codex state."
  - "Used `git merge-base HEAD upstream/main` as the milestone base for final changed-file handoff."

patterns-established:
  - "Compatibility smoke records package audit, raw stdout/stderr/exit code, isolated temp paths, command classification, cleanup, and secret scan as separate evidence files."

requirements-completed: [HAND-02, HAND-03]

duration: 8min
completed: 2026-06-15
---

# Phase 04 Plan 02: Compatibility Install and Final Handoff Summary

**Compatibility installer due diligence, isolated discovery evidence, aggregate assertions, cleanup proof, and git-truth handoff complete the install smoke milestone.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-15T12:09:23Z
- **Completed:** 2026-06-15T12:17:16Z
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments

- Captured `plugins@1.3.1` npm provenance evidence and approved the package for isolated compatibility execution.
- Ran `npx plugins add https://github.com/labring/sealos-skills --target codex` with temp `HOME`, `CODEX_HOME`, npm cache, `XDG_CACHE_HOME`, and `XDG_CONFIG_HOME`.
- Recorded compatibility output as `discovery_evidence`: repository clone, one Sealos plugin found, Codex target listed, and installer confirmation prompt reached.
- Generated final validator transcript, milestone file lists, `skills/**` stability proof, cleanup verification, secret scan, and aggregate `11-install-smoke-assertions.json` with `passed: true`.

## Task Commits

1. **Task 1: Verify `plugins` npm package legitimacy before compatibility install** - `ec5a8dd` (test)
2. **Task 2: Capture compatibility install or labeled discovery evidence** - `31cadf3` (test)
3. **Task 3: Generate aggregate assertions, cleanup proof, validation transcript, and final handoff** - `b609c71` (test)

## Files Created/Modified

- `.planning/phases/04-install-smoke-and-handoff/evidence/05-npx-package-audit.json` - Phase 4 compatibility, validation, cleanup, secret scan, handoff, or summary evidence.
- `.planning/phases/04-install-smoke-and-handoff/evidence/05-npx-compat-install.txt` - Phase 4 compatibility, validation, cleanup, secret scan, handoff, or summary evidence.
- `.planning/phases/04-install-smoke-and-handoff/evidence/05-npx-compat-install.stderr.txt` - Phase 4 compatibility, validation, cleanup, secret scan, handoff, or summary evidence.
- `.planning/phases/04-install-smoke-and-handoff/evidence/05-npx-compat-install.exitcode` - Phase 4 compatibility, validation, cleanup, secret scan, handoff, or summary evidence.
- `.planning/phases/04-install-smoke-and-handoff/evidence/05-npx-compat-discovery.json` - Phase 4 compatibility, validation, cleanup, secret scan, handoff, or summary evidence.
- `.planning/phases/04-install-smoke-and-handoff/evidence/07-validator-and-json-checks.txt` - Phase 4 compatibility, validation, cleanup, secret scan, handoff, or summary evidence.
- `.planning/phases/04-install-smoke-and-handoff/evidence/08-milestone-files.txt` - Phase 4 compatibility, validation, cleanup, secret scan, handoff, or summary evidence.
- `.planning/phases/04-install-smoke-and-handoff/evidence/08-working-tree-status.txt` - Phase 4 compatibility, validation, cleanup, secret scan, handoff, or summary evidence.
- `.planning/phases/04-install-smoke-and-handoff/evidence/08-skills-files.txt` - Phase 4 compatibility, validation, cleanup, secret scan, handoff, or summary evidence.
- `.planning/phases/04-install-smoke-and-handoff/evidence/08-phase-4-uncommitted-files.txt` - Phase 4 compatibility, validation, cleanup, secret scan, handoff, or summary evidence.
- `.planning/phases/04-install-smoke-and-handoff/evidence/08-final-handoff.md` - Phase 4 compatibility, validation, cleanup, secret scan, handoff, or summary evidence.
- `.planning/phases/04-install-smoke-and-handoff/evidence/10-compat-smoke-env.txt` - Phase 4 compatibility, validation, cleanup, secret scan, handoff, or summary evidence.
- `.planning/phases/04-install-smoke-and-handoff/evidence/11-install-smoke-assertions.json` - Phase 4 compatibility, validation, cleanup, secret scan, handoff, or summary evidence.
- `.planning/phases/04-install-smoke-and-handoff/evidence/12-secret-scan.txt` - Phase 4 compatibility, validation, cleanup, secret scan, handoff, or summary evidence.
- `.planning/phases/04-install-smoke-and-handoff/evidence/13-cleanup-verification.txt` - Phase 4 compatibility, validation, cleanup, secret scan, handoff, or summary evidence.
- `.planning/phases/04-install-smoke-and-handoff/04-02-SUMMARY.md` - Phase 4 compatibility, validation, cleanup, secret scan, handoff, or summary evidence.

## Assertion Summary

- `passed`: true
- `HAND-01`: true
- `HAND-02`: true
- `HAND-03`: true
- `compatibility.status`: `discovery_evidence`
- `cleanup.cleanup_status`: `clean`
- `secretScan.status`: `clean`
- `milestone_base`: `9ee2d3ac269b4d5b1c81ba43be979c0c7cdac03b`

## Verification Commands

- `python3 scripts/validate-codex-plugin.py`
- `python3 -m json.tool .codex-plugin/plugin.json >/dev/null`
- `python3 -m json.tool plugin.json >/dev/null`
- `python3 -m json.tool .agents/plugins/marketplace.json >/dev/null`
- `python3 -m json.tool marketplace.json >/dev/null`
- `python3 -m json.tool distribution/platforms.json >/dev/null`
- `python3 -m json.tool .planning/phases/04-install-smoke-and-handoff/evidence/11-install-smoke-assertions.json >/dev/null`
- `git diff -- skills --exit-code`
- `rg -n '^status: clean$' .planning/phases/04-install-smoke-and-handoff/evidence/12-secret-scan.txt`
- `rg -n 'HAND-01|HAND-02|HAND-03|04-VERIFICATION.md|04-UAT.md' .planning/phases/04-install-smoke-and-handoff/evidence/08-final-handoff.md`

## Decisions Made

- The package legitimacy gate now has an explicit `autonomous_package_gate_approval` record in `05-npx-package-audit.json` and `11-install-smoke-assertions.json`; scope is limited to isolated compatibility evidence.
- The `plugins` npm package passed autonomous due diligence for isolated execution based on npm metadata: expected name, repository, homepage, CLI bin, Node engine, registry integrity, and no `postinstall` script.
- The compatibility command result is labeled `discovery_evidence` because it discovered the remote repository and Sealos Codex target, then stopped at the interactive install prompt.
- `MILESTONE_BASE` is `9ee2d3ac269b4d5b1c81ba43be979c0c7cdac03b`, produced by `git merge-base HEAD upstream/main`.

## Deviations from Plan

None - plan executed exactly as written with the user-approved autonomous due-diligence handling for the package legitimacy gate.

## Issues Encountered

- `npx plugins add ... --target codex` exited `0` after reaching `Install? [Y/n]`; no installed Codex state appeared under the isolated `CODEX_HOME`. The evidence is therefore truthfully classified as compatibility discovery evidence.
- Initial secret scan had false positives on validator text containing the public phrase `canonical identity token`; the scan allowlist was narrowed to public validator wording and re-run clean.

## Known Stubs

None.

## Threat Flags

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

HAND-01, HAND-02, and HAND-03 evidence is complete. Downstream `04-VERIFICATION.md` and `04-UAT.md` should cite the evidence files listed in `08-final-handoff.md`.

## Self-Check: PASSED

- Found all required compatibility, validation, cleanup, secret scan, handoff, aggregate assertion, and SUMMARY files.
- Found task commits `ec5a8dd`, `31cadf3`, and `b609c71` in git history.
- Re-ran validator, JSON syntax checks, aggregate assertion check, `git diff -- skills --exit-code`, handoff grep, cleanup verification, and secret scan checks successfully.

---
*Phase: 04-install-smoke-and-handoff*
*Completed: 2026-06-15*
