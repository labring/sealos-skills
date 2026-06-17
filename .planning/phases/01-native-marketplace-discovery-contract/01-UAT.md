---
phase: 01
phase_name: native-marketplace-discovery-contract
verify_work_type: uat
status: passed
checked_at: 2026-06-15T09:24:41Z
---

# Phase 01 UAT: Native Marketplace Discovery Contract

## Acceptance Checks

| Check | Result | Evidence |
|---|---|---|
| Maintainer can add the repository as a Codex marketplace in an isolated environment. | Passed | `evidence/01-marketplace-add.json` records `marketplaceName: "sealos"` and the repository worktree as `installedRoot`; `evidence/09-native-payload-smoke-env.txt` records isolated `SMOKE_HOME` and `SMOKE_CODEX_HOME`. |
| Maintainer can see `sealos@sealos` through native Codex available plugin discovery. | Passed | `evidence/03-plugin-list-available.json` contains an available entry with `pluginId: "sealos@sealos"`, `name: "sealos"`, `marketplaceName: "sealos"`, and source path ending in `plugins/sealos`. |
| Maintainer can install `sealos@sealos` through native Codex plugin add. | Passed | `evidence/04-plugin-add.json` records `pluginId: "sealos@sealos"`, `marketplaceName: "sealos"`, `version: "1.0.0"`, and an isolated installed cache path. |
| Installed payload includes the runtime files a Codex user needs after install. | Passed | `evidence/05-native-smoke-assertions.json` has `passed: true`, `installed_payload_complete: true`, and true checks for `plugin.json`, `.codex-plugin/plugin.json`, `skills/sealos-deploy/SKILL.md`, `skills/sealos-database/SKILL.md`, `skills/sealos-s3/SKILL.md`, and `assets/logo.svg`. |
| Root `skills/**` remains the single canonical skill source. | Passed | `plugins/sealos` is a symlink to `..`, `plugin.json` uses `skills: "./skills/"`, and `git diff -- skills --exit-code` passed with exit code 0. |
| Existing verifier report and review-fix evidence support UAT readiness. | Passed | `01-VERIFICATION.md` is passed with 6/6 must-haves verified; `01-REVIEW.md` is fixed; `01-REVIEW-FIX.md` records the complete installed payload fix in commit `4eead54`. |

## Command Verification

| Command | Result |
|---|---|
| `python3 scripts/validate-codex-plugin.py` | Passed. Output ended with `Sealos Codex plugin integration validation passed` and included payload checks for required skills and assets. |
| `python3 -m json.tool .planning/phases/01-native-marketplace-discovery-contract/evidence/05-native-smoke-assertions.json >/dev/null` | Passed. |
| `git diff -- skills --exit-code` | Passed. Runtime skill files under `skills/**` remain unchanged. |

## Installed Payload Completeness

The native smoke assertion file confirms the installed cache contains the complete plugin payload:

- `plugin.json`
- `.codex-plugin/plugin.json`
- `skills/sealos-deploy/SKILL.md`
- `skills/sealos-database/SKILL.md`
- `skills/sealos-s3/SKILL.md`
- `assets/logo.svg`

This closes the previous review risk where native install could report success while omitting the referenced skills and assets.

## Single Source Confirmation

The Codex marketplace entry points at `./plugins/sealos`, and `plugins/sealos` resolves to the repository root. That gives Codex a plugin-shaped marketplace source while preserving root `skills/**` as the canonical skill source for all hosts. The UAT check also confirmed `git diff -- skills --exit-code` exits 0.

## User Interaction

User interaction: none needed because the parent invocation authorized autonomous, non-interactive UAT verification. The phase is a CLI metadata and distribution contract, and every acceptance check is covered by existing evidence plus reproducible local commands.

## Verdict

Phase 01 UAT passed. The repository exposes `sealos@sealos` through native Codex marketplace discovery, native install reports success, the installed payload includes required skills and assets, and root `skills/**` remains the single source.
