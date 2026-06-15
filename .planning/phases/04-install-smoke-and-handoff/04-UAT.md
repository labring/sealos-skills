---
status: complete
phase: 04-install-smoke-and-handoff
source:
  - .planning/phases/04-install-smoke-and-handoff/04-01-SUMMARY.md
  - .planning/phases/04-install-smoke-and-handoff/04-02-SUMMARY.md
  - .planning/phases/04-install-smoke-and-handoff/04-REVIEW.md
  - .planning/phases/04-install-smoke-and-handoff/04-REVIEW-FIX.md
  - .planning/phases/04-install-smoke-and-handoff/04-VERIFICATION.md
  - .planning/phases/04-install-smoke-and-handoff/evidence/08-final-handoff.md
  - .planning/phases/04-install-smoke-and-handoff/evidence/11-install-smoke-assertions.json
started: 2026-06-15T13:12:32Z
updated: 2026-06-15T13:12:32Z
verdict: PASS
---

# Phase 04 Final UAT: Install Smoke and Handoff

## Current Test

[testing complete]

## Final Verdict

PASS.

The Phase 4 maintainer closeout workflow is accepted. Native Codex install evidence, compatibility discovery evidence, review fixes, aggregate assertions, final handoff, cleanup proof, and validation gates are present and consistent enough to close the milestone.

## Tests

### 1. Native Codex Install Smoke
expected: Final evidence records isolated Codex native marketplace add, available-list, and install smoke output for `sealos@sealos`.
result: pass
evidence:
  - `.planning/phases/04-install-smoke-and-handoff/evidence/01-native-marketplace-add.json`
  - `.planning/phases/04-install-smoke-and-handoff/evidence/02-native-marketplace-list.json`
  - `.planning/phases/04-install-smoke-and-handoff/evidence/03-native-plugin-list-available.json`
  - `.planning/phases/04-install-smoke-and-handoff/evidence/04-native-plugin-add.json`
  - `.planning/phases/04-install-smoke-and-handoff/evidence/06-native-smoke-assertions.json`
observed: `11-install-smoke-assertions.json` reports `passed: true`; `HAND-01` reports `passed: true`.

### 2. Compatibility Install Path Evidence
expected: Final evidence records compatibility install or discovery evidence for `npx plugins add https://github.com/labring/sealos-skills --target codex`.
result: pass
evidence:
  - `.planning/phases/04-install-smoke-and-handoff/evidence/05-npx-package-audit.json`
  - `.planning/phases/04-install-smoke-and-handoff/evidence/05-npx-compat-discovery.json`
  - `.planning/phases/04-install-smoke-and-handoff/evidence/10-compat-smoke-env.txt`
  - `.planning/phases/04-install-smoke-and-handoff/evidence/11-install-smoke-assertions.json`
observed: Compatibility status is `discovery_evidence`; `HAND-02` reports `passed: true`; autonomous package gate approval is present and scoped to isolated compatibility evidence.

### 3. Final Handoff Completeness
expected: Final handoff cites `HAND-01`, `HAND-02`, `HAND-03`, `04-VERIFICATION.md`, `04-UAT.md`, remaining non-Codex follow-up, and autonomous package gate approval.
result: pass
evidence:
  - `.planning/phases/04-install-smoke-and-handoff/evidence/08-final-handoff.md`
observed: Handoff grep found all required terms and the remaining non-Codex follow-up section.

### 4. Review Fix Closure
expected: Code review findings are fixed before milestone closeout.
result: pass
evidence:
  - `.planning/phases/04-install-smoke-and-handoff/04-REVIEW.md`
  - `.planning/phases/04-install-smoke-and-handoff/04-REVIEW-FIX.md`
  - `.planning/phases/04-install-smoke-and-handoff/04-VERIFICATION.md`
observed: `04-REVIEW-FIX.md` reports both review findings fixed; `04-VERIFICATION.md` reports `status: passed` and `score: 6/6 must-haves verified`.

### 5. Validation and Metadata Syntax Gates
expected: Distribution validation and JSON syntax checks pass.
result: pass
commands:
  - `python3 scripts/validate-codex-plugin.py`
  - `python3 -m json.tool .codex-plugin/plugin.json`
  - `python3 -m json.tool plugin.json`
  - `python3 -m json.tool .agents/plugins/marketplace.json`
  - `python3 -m json.tool marketplace.json`
  - `python3 -m json.tool distribution/platforms.json`
  - `python3 -m json.tool .planning/phases/04-install-smoke-and-handoff/evidence/11-install-smoke-assertions.json`
observed: All commands completed successfully during final UAT.

### 6. Skills Stability and Working Tree State
expected: Phase 4 does not change `skills/**`, and the final worktree state is visible before UAT commit.
result: pass
commands:
  - `git diff -- skills --exit-code`
  - `git status --short --branch`
observed: `git diff -- skills --exit-code` completed successfully. Before writing this UAT file, `git status --short --branch` showed only `## worktree-agent-phase-01`.

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Evidence

- `python3 scripts/validate-codex-plugin.py` ended with `Sealos Codex plugin integration validation passed`.
- JSON syntax checks passed for Codex plugin metadata, marketplace metadata, platform registry metadata, native smoke evidence, compatibility evidence, package audit evidence, native assertions, and aggregate assertions.
- `11-install-smoke-assertions.json` has top-level `passed: true`.
- `11-install-smoke-assertions.json` has `HAND-01`, `HAND-02`, and `HAND-03` all passed.
- `08-final-handoff.md` cites the HAND requirements, `04-VERIFICATION.md`, `04-UAT.md`, remaining non-Codex follow-up, and autonomous package gate approval.
- `git diff -- skills --exit-code` passed.
- `git status --short --branch` was clean before this UAT artifact was created.

## Residual Risks

- Compatibility evidence is classified as `discovery_evidence` because the `npx plugins` command reached the interactive install prompt and produced no installed Codex state under isolated `CODEX_HOME`.
- Post-publication remote smoke for `codex plugin marketplace add labring/sealos-skills` remains a follow-up after candidate commits are published upstream.
- Non-Codex distribution-wide validator, CI or documented full distribution validation command, and non-Codex screenshot or GIF refresh remain v2 follow-up items.

## Closeout Recommendation

Close Phase 4 and the milestone. The maintainer-facing Codex install upgrade is ready for final repository handoff, with the compatibility path accurately labeled and follow-up scope documented.

## Gaps

none
