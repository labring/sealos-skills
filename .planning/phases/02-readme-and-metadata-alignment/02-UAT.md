---
status: complete
phase: 02-readme-and-metadata-alignment
source:
  - .planning/phases/02-readme-and-metadata-alignment/02-01-SUMMARY.md
  - .planning/phases/02-readme-and-metadata-alignment/02-02-SUMMARY.md
  - .planning/phases/02-readme-and-metadata-alignment/02-REVIEW.md
  - .planning/phases/02-readme-and-metadata-alignment/02-REVIEW-FIX.md
  - .planning/phases/02-readme-and-metadata-alignment/02-VERIFICATION.md
started: 2026-06-15T10:24:49Z
updated: 2026-06-15T10:24:49Z
verdict: PASS
commit_scope: uat-only
---

# Phase 02 UAT: README and Metadata Alignment

## Verdict

PASS.

Phase 2 is complete from the milestone user-workflow perspective. A Codex user now sees the native marketplace install path first, sees the compatibility/local Codex path, understands that one Sealos plugin installs the expected capability set, and sees host-specific invocation guidance for Codex, Claude Code, and direct `skills.sh` usage. Codex platform metadata matches that README contract.

## Tests

### 1. Codex Quick Start Leads With Native Install

expected: README Quick Start shows `codex plugin marketplace add labring/sealos-skills` before `codex plugin add sealos@sealos`.
result: pass
evidence:
  - `README.md:16`: `codex plugin marketplace add labring/sealos-skills`
  - `README.md:17`: `codex plugin add sealos@sealos`
  - Python ordering assertion passed with offsets `800 < 851 < 1260`.

### 2. Compatibility/Local Codex Install Path Remains Present

expected: README keeps `npx plugins add https://github.com/labring/sealos-skills --target codex` as a compatibility/local path.
result: pass
evidence:
  - `README.md:22-26` labels and shows the compatibility/local Codex command.
  - `distribution/platforms.json:13` records the same command as `alternateInstall`.

### 3. One Plugin Capability Contract Is Visible

expected: README explains that one Sealos plugin installs deploy, database, S3, canvas, app-builder, and supporting cloud-native skills from root `skills/**`.
result: pass
evidence:
  - `README.md:20` names `sealos-deploy`, `sealos-database`, `sealos-s3`, `sealos-canvas`, `sealos-app-builder`, `cloud-native-readiness`, `dockerfile-skill`, and `docker-to-sealos`.

### 4. Invocation Surfaces Are Host-Specific

expected: Codex examples use `$sealos`, Claude Code examples use `/sealos`, and direct `skills.sh` examples use `/sealos-deploy`, `/sealos-database`, and `/sealos-s3`.
result: pass
evidence:
  - `README.md:42-50` gives Claude Code `/sealos` examples.
  - `README.md:52-66` gives Codex CLI/App guidance and `$sealos` examples.
  - `README.md:92-104` gives direct `skills.sh` entries for `/sealos-deploy`, `/sealos-database`, and `/sealos-s3`.
  - `distribution/platforms.json:81` records direct `skills.sh` invoke values as `/sealos-deploy, /sealos-database, /sealos-s3`.

### 5. Codex App Selection Guidance Stays Near Screenshot

expected: README keeps Codex App plugin selection guidance near the Sealos screenshot.
result: pass
evidence:
  - `README.md:52-57` contains Codex CLI/App guidance followed by `assets/codex-sealos.png`.

### 6. Codex Platform Metadata Matches README Contract

expected: `distribution/platforms.json` records native install, alternate install, invocation, Phase 1 evidence, and current verification date.
result: pass
evidence:
  - `distribution/platforms.json:12` uses `codex plugin marketplace add labring/sealos-skills && codex plugin add sealos@sealos`.
  - `distribution/platforms.json:13` uses the `npx plugins` alternate install path.
  - `distribution/platforms.json:14` uses `$sealos` and Codex App Sealos selection wording.
  - `distribution/platforms.json:16` cites Phase 1 native marketplace add/list/install, installed payload assertions, and `codex_manifest+repo_marketplace`.
  - `distribution/platforms.json:17` sets `lastVerified` to `2026-06-15`.

### 7. Manifest Identity and Source Contract Remain Aligned

expected: Codex-facing manifests keep plugin identity `sealos`, display label `Sealos`, root `./skills/`, and marketplace source `./plugins/sealos`.
result: pass
evidence:
  - `.codex-plugin/plugin.json:2` and `plugin.json:2` use `"name": "sealos"`.
  - `.codex-plugin/plugin.json:26` and `plugin.json:26` use `"skills": "./skills/"`.
  - `.codex-plugin/plugin.json:28`, `plugin.json:28`, and `.agents/plugins/marketplace.json:4` use display label `Sealos`.
  - `.agents/plugins/marketplace.json:11` uses `"path": "./plugins/sealos"`.

## Command Evidence

| Check | Command | Result |
| --- | --- | --- |
| GSD UAT init | `node /Users/longnv/.codex/gsd-core/bin/gsd-tools.cjs query init.verify-work 2` | PASS: phase found, verification present, UAT path resolved. |
| Plugin validator | `python3 scripts/validate-codex-plugin.py` | PASS: all Codex plugin integration checks passed. |
| JSON syntax | `python3 -m json.tool .codex-plugin/plugin.json >/dev/null && python3 -m json.tool plugin.json >/dev/null && python3 -m json.tool .agents/plugins/marketplace.json >/dev/null && python3 -m json.tool distribution/platforms.json >/dev/null` | PASS: all checked JSON files parsed. |
| README command checks | Python assertions over `README.md` command order, capability names, invocation sections, and Codex screenshot | PASS: offsets and required fields printed successfully. |
| Platform metadata checks | Python assertions over Codex platform entry | PASS: install, alternate install, invoke, evidence, and date matched. |
| Runtime skill scope | `git diff -- skills --exit-code` | PASS: no runtime `skills/**` changes in the working tree. |
| Worktree status before UAT write | `git status --short --branch` | PASS: clean working tree on `worktree-agent-phase-01`. |
| Artifact audit | `node /Users/longnv/.codex/gsd-core/bin/gsd-tools.cjs query audit-open --json` | PASS for Phase 2: no Phase 2 UAT gaps, verification gaps, or open questions. The only returned UAT item was Phase 1 with status `passed`. |

## Residual Warnings

- Phase 3 owns validator hardening for README command drift, fallback install drift, identity parity, and JSON syntax coverage. This is recorded in ROADMAP Phase 3 and REQUIREMENTS `VAL-01` through `VAL-04`.
- Phase 4 owns fresh native and compatibility install smoke evidence. This is recorded in ROADMAP Phase 4 and REQUIREMENTS `HAND-01` and `HAND-02`.

## Recommendation

Proceed to Phase 3: Validator Hardening. The highest-value next check is extending `scripts/validate-codex-plugin.py` so the README native command pair, compatibility command, manifest identity, platform registry identity, and JSON syntax coverage fail loudly when they drift.

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

none
