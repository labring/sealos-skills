---
phase: 02-readme-and-metadata-alignment
plan: 01
subsystem: docs
tags: [readme, codex, plugin, marketplace, skills]

requires:
  - phase: 01-native-marketplace-discovery-contract
    provides: Native Codex marketplace contract for `sealos@sealos`
provides:
  - README Codex Quick Start led by native marketplace install commands
  - README compatibility/local Codex install path
  - README capability contract for the Sealos plugin skill set
  - README host-specific invocation guidance for Codex, Claude, and skills.sh
affects: [validator-hardening, install-smoke-and-handoff]

tech-stack:
  added: []
  patterns: [Codex native install copy, host-specific invocation sections]

key-files:
  created:
    - .planning/phases/02-readme-and-metadata-alignment/02-01-SUMMARY.md
  modified:
    - README.md

key-decisions:
  - "README Codex Quick Start uses native Codex marketplace installation as the primary path."
  - "`npx plugins add https://github.com/labring/sealos-skills --target codex` remains documented as the compatibility/local Codex path."
  - "Codex `$sealos`, Claude `/sealos`, and direct skills.sh `/sealos-*` examples stay in separate sections."

patterns-established:
  - "Codex README install guidance starts with `codex plugin marketplace add labring/sealos-skills` followed by `codex plugin add sealos@sealos`."
  - "Capability copy names the installed root skill set directly from `skills/**`."

requirements-completed: [DOCS-01, DOCS-02, DOCS-03, DOCS-04, DOCS-05, DOCS-06, META-01]

duration: 3min
completed: 2026-06-15
---

# Phase 02 Plan 01: README Codex Install Path Summary

**README Codex Quick Start now leads with native marketplace installation, preserves the compatibility path, and separates Codex, Claude, and skills.sh invocation surfaces.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-15T09:47:58Z
- **Completed:** 2026-06-15T09:51:09Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Updated the README intro and Codex Quick Start so Codex users see `codex plugin marketplace add labring/sealos-skills` followed by `codex plugin add sealos@sealos`.
- Kept `npx plugins add https://github.com/labring/sealos-skills --target codex` as the compatibility/local Codex path.
- Added the one-plugin capability contract for `sealos-deploy`, `sealos-database`, `sealos-s3`, `sealos-canvas`, `sealos-app-builder`, `cloud-native-readiness`, `dockerfile-skill`, and `docker-to-sealos`.
- Kept Codex `$sealos`, Claude `/sealos`, and direct skills.sh `/sealos-*` examples in their owner sections, with the Codex App screenshot near Codex guidance.

## Task Commits

1. **Task 1: Rewrite the Codex Quick Start around the native install path** - `e8c22df` (docs)
2. **Task 2: Separate Codex, Claude, and skills.sh invocation surfaces** - `dbb5e87` (docs)

## Files Created/Modified

- `README.md` - Aligns Codex install priority, compatibility path, capability copy, and host invocation examples.
- `.planning/phases/02-readme-and-metadata-alignment/02-01-SUMMARY.md` - Records this plan's execution results.

## Decisions Made

- Used the Phase 1 verified native Codex command pair as the first Codex install path.
- Preserved the `npx plugins` Codex command as compatibility/local guidance.
- Updated only README content for this plan; `distribution/platforms.json` remains owned by Plan 02-02.

## Deviations from Plan

None - plan executed exactly as written.

## Auth Gates

None.

## Known Stubs

None.

## Threat Flags

None.

## Verification

- `python3 -c 'from pathlib import Path; t=Path("README.md").read_text(); a=t.index("codex plugin marketplace add labring/sealos-skills"); b=t.index("codex plugin add sealos@sealos"); c=t.index("npx plugins add https://github.com/labring/sealos-skills --target codex"); assert a < b < c; [t.index(s) for s in ["sealos-deploy", "sealos-database", "sealos-s3", "sealos-canvas", "sealos-app-builder", "cloud-native-readiness", "dockerfile-skill", "docker-to-sealos"]]'` - PASS
- `python3 -c 'from pathlib import Path; t=Path("README.md").read_text(); codex=t.index("$sealos deploy this repo to Sealos Cloud"); claude=t.index("/sealos deploy this repo to Sealos Cloud"); skills=t.index("/sealos-deploy"); image=t.index("assets/codex-sealos.png"); table=t.index("### Other supported AI tools"); assert codex < claude < skills; assert image < table'` - PASS
- `rg -n 'codex plugin marketplace add labring/sealos-skills' README.md` - PASS
- `rg -n 'codex plugin add sealos@sealos' README.md` - PASS
- `rg -n 'npx plugins add https://github.com/labring/sealos-skills --target codex' README.md` - PASS
- `rg -n '\$sealos deploy this repo to Sealos Cloud' README.md` - PASS
- `rg -n 'assets/codex-sealos.png' README.md` - PASS
- `git diff -- skills --exit-code` - PASS

## Issues Encountered

- `gsd-tools` was unavailable on PATH. The local GSD shim at `/Users/longnv/.codex/gsd-core/bin/gsd-tools.cjs` is available through `node` for state updates and metadata commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 02-02 can update `distribution/platforms.json` to match the README native Codex install path, compatibility path, evidence, and verification date.

## Self-Check: PASSED

- `README.md` exists.
- `.planning/phases/02-readme-and-metadata-alignment/02-01-SUMMARY.md` exists.
- Task commit `e8c22df` exists.
- Task commit `dbb5e87` exists.

---
*Phase: 02-readme-and-metadata-alignment*
*Completed: 2026-06-15*
