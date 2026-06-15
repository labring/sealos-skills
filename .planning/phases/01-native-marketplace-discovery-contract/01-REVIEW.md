---
phase: 01
phase_name: native-marketplace-discovery-contract
review_type: code-review
status: fixed
files_reviewed:
  - .agents/plugins/marketplace.json
  - plugins/sealos
  - .codex-plugin/plugin.json
  - plugin.json
  - scripts/validate-codex-plugin.py
findings:
  critical: []
  warnings: []
  suggestions: []
resolved_findings:
  - CR-01
  - WR-01
fix_report: .planning/phases/01-native-marketplace-discovery-contract/01-REVIEW-FIX.md
fix_commit: 4eead54
---

# Phase 01 Code Review

## Findings

### CR-01: BLOCKER - Native install succeeds with an incomplete plugin payload

**File:** `.agents/plugins/marketplace.json:11`

**Issue:** The marketplace entry points Codex at `./.codex-plugin`. In an isolated native smoke, `codex plugin add sealos@sealos --json` returned success, but the installed cache only contained `plugin.json` and `.codex-plugin/plugin.json`. It did not contain `skills/`, `skills/sealos-deploy/SKILL.md`, or `assets/logo.svg`. Both installed manifests still reference those missing paths (`./skills/`, `../skills/`, `./assets/logo.svg`, `../assets/logo.svg`), so the plugin is discoverable and installable but has no canonical skill source or UI assets in the installed payload.

This violates the phase contract and the repository constraint that root `skills/**` is the single canonical skill source for Codex installs.

**Fix:** Change the Codex marketplace/install packaging contract so the installed cache includes the repository root payload required by the manifest. The acceptance check must assert that the installed cache contains at least:

```text
plugin.json
skills/sealos-deploy/SKILL.md
skills/sealos-database/SKILL.md
skills/sealos-s3/SKILL.md
assets/logo.svg
```

Then align manifest paths with the actual installed root. A valid fix can use a repo-root install shape with `skills: "./skills/"` and `logo: "./assets/logo.svg"`, or another Codex-supported packaging shape that copies root `skills/**` and `assets/**` into the installed plugin directory.

### WR-01: WARNING - Validator accepts successful install without checking installed payload

**File:** `scripts/validate-codex-plugin.py:91`

**Issue:** The validator checks local source files and manifest parity, then passes even when the native installed cache is missing `skills/` and `assets/`. The current Phase 01 evidence also records `plugin add` success, but it stops before verifying the installed directory content. This creates a regression gap where marketplace discovery passes while runtime skill loading fails after installation.

**Fix:** Extend validation or the smoke assertions to inspect the `installedPath` returned by `codex plugin add sealos@sealos --json` and fail unless the installed payload contains the manifest-referenced skill and asset paths. At minimum, parse the installed manifest and resolve `skills`, `interface.logo`, and `interface.composerIcon` relative to the installed manifest location.

## Verification Notes

- Reviewed `.agents/plugins/marketplace.json`, `.codex-plugin/.codex-plugin/plugin.json`, `plugin.json`, and `scripts/validate-codex-plugin.py` at standard depth.
- Re-ran `python3 scripts/validate-codex-plugin.py`; it passed all current static checks.
- Re-ran JSON syntax checks for the reviewed JSON files; all parsed successfully.
- Consulted Phase 01 evidence:
  - `01-initial-discovery.json` shows the pre-change marketplace could be added but `plugin list --available` returned an empty list and `plugin add sealos@sealos` failed.
  - `03-plugin-list-available.json` and `04-plugin-add.json` show the current implementation makes `sealos@sealos` discoverable and reports install success.
  - `05-native-smoke-assertions.json` checks discovery and add success only.
  - `06-validate-codex-plugin.txt` and `07-json-syntax-checks.txt` show static validation passed.
- Performed an additional isolated native install with temporary `HOME` and `CODEX_HOME`. `codex plugin list` reported `sealos@sealos` installed and enabled, while the installed cache missed `skills/`, `skills/sealos-deploy/SKILL.md`, and `assets/logo.svg`.

## Residual Risk

- Codex CLI marketplace packaging behavior is sensitive to the marketplace `source.path` layout. The fixed contract points `source.path` at `./plugins/sealos`, where `plugins/sealos` is a symlink to the repository root, so Codex discovers a plugin-shaped source and installs the repository-root payload.
- Future marketplace changes should preserve the installed payload smoke assertions in `05-native-smoke-assertions.json`.

## Fix Status

Resolved in `4eead54 fix(01): CR-01 install complete Codex plugin payload`.

- `.agents/plugins/marketplace.json` now points to `./plugins/sealos`.
- `plugins/sealos` is a symlink to `..`, preserving root `skills/**` as the only skill source.
- The obsolete `.codex-plugin/.codex-plugin/plugin.json` install-root shim was removed.
- `scripts/validate-codex-plugin.py` now checks the symlink source and required payload paths.
- `05-native-smoke-assertions.json` now checks the installed cache contains `plugin.json`, `.codex-plugin/plugin.json`, `skills/sealos-deploy/SKILL.md`, `skills/sealos-database/SKILL.md`, `skills/sealos-s3/SKILL.md`, and `assets/logo.svg`.
