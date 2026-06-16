---
status: complete
phase: 03-validator-hardening
source:
  - .planning/ROADMAP.md
  - .planning/STATE.md
  - .planning/REQUIREMENTS.md
  - .planning/phases/03-validator-hardening/03-01-SUMMARY.md
  - .planning/phases/03-validator-hardening/03-REVIEW.md
  - .planning/phases/03-validator-hardening/03-REVIEW-FIX.md
  - .planning/phases/03-validator-hardening/03-VERIFICATION.md
  - scripts/validate-codex-plugin.py
  - README.md
started: 2026-06-15T11:26:13Z
updated: 2026-06-15T11:26:13Z
verdict: PASS
---

# Phase 3 UAT: Validator Hardening

## Current Test

[testing complete]

## Verdict

PASS - Phase 3 is acceptable from the maintainer workflow perspective.

The hardened validator is usable as the maintainer gate for README native install drift, README fallback install drift, plugin identity drift, platform registry drift, JSON syntax drift, and JSON shape drift.

## Tests

### 1. Maintainer Validation Gate

expected: `python3 scripts/validate-codex-plugin.py` passes against the current repository and reports each Codex plugin contract check.
result: pass
evidence:
  - command: `python3 scripts/validate-codex-plugin.py`
  - exit: 0
  - final output: `Sealos Codex plugin integration validation passed`
  - representative checks:
    - `README Quick Start includes exact native Codex install block`
    - `README Quick Start includes exact fallback Codex npx install block`
    - `root plugin.json matches .codex-plugin/plugin.json key fields`
    - `Codex marketplace points at repo-root plugin source`
    - `root marketplace version matches Codex manifest`
    - `platform registry uses canonical plugin id`
    - `Codex platform install command matches native contract`

### 2. Python Syntax Gate

expected: The validator compiles with Python without syntax errors.
result: pass
evidence:
  - command: `python3 -m py_compile scripts/validate-codex-plugin.py`
  - exit: 0
  - cleanup: removed generated `scripts/__pycache__/`

### 3. JSON Syntax Coverage

expected: The five Phase 3 plugin, marketplace, and platform registry JSON files parse with `json.tool`.
result: pass
evidence:
  - `python3 -m json.tool .codex-plugin/plugin.json >/dev/null` - exit 0
  - `python3 -m json.tool plugin.json >/dev/null` - exit 0
  - `python3 -m json.tool .agents/plugins/marketplace.json >/dev/null` - exit 0
  - `python3 -m json.tool marketplace.json >/dev/null` - exit 0
  - `python3 -m json.tool distribution/platforms.json >/dev/null` - exit 0

### 4. Skills Source Stability

expected: Phase 3 leaves runtime skill behavior untouched.
result: pass
evidence:
  - command: `git diff -- skills --exit-code`
  - exit: 0

### 5. Review Finding Closure

expected: CR-01, CR-02, CR-03, and WR-01 are represented as fixed in code and regression probes.
result: pass
evidence:
  - CR-01: mutating the Quick Start native command to `sealos@sealos-bad` produced exit 1 with `FAIL: README Quick Start includes exact native Codex install block`.
  - CR-02: mutating the fallback command target to `codex-bad` produced exit 1 with `FAIL: README Quick Start includes exact fallback Codex npx install block`.
  - CR-03: mutating `distribution/platforms.json` top-level `name` to `sealos-bad` produced exit 1 with `FAIL: platform registry uses canonical plugin id`.
  - WR-01: replacing `marketplace.json` with valid JSON `[]` produced exit 1 with `FAIL: marketplace.json contains a JSON object`.
  - Probe restoration check: `git diff -- README.md distribution/platforms.json marketplace.json --exit-code` exited 0 after probes.

### 6. Repository Status

expected: The final UAT artifact is the only new change before the UAT commit.
result: pass
evidence:
  - command before writing this file: `git status --short --branch`
  - output: `## worktree-agent-phase-01`
  - command after py_compile cleanup: `git status --short --branch`
  - output: `## worktree-agent-phase-01`

## Maintainer Workflow Evidence

The maintainer validation path documented in `README.md` is present and matches the executed commands:

```bash
python3 scripts/validate-codex-plugin.py
python3 -m json.tool .codex-plugin/plugin.json >/dev/null
python3 -m json.tool plugin.json >/dev/null
python3 -m json.tool .agents/plugins/marketplace.json >/dev/null
python3 -m json.tool marketplace.json >/dev/null
python3 -m json.tool distribution/platforms.json >/dev/null
```

The validator implementation contains durable checks for:

- canonical README native commands and fallback command in the `### Recommended: install in Codex` section
- root `plugin.json` and `.codex-plugin/plugin.json` parity
- Codex marketplace entry identity and repo-root symlink source
- root `marketplace.json` identity, command path, and version parity
- platform registry top-level `name`, `version`, and `repository`
- Codex platform install, alternate install, invocation, evidence, command support, and `lastVerified`
- JSON object and list shape guards that produce structured `FAIL:` output

## Residual Warnings

- `.planning/STATE.md` frontmatter reports Phase 3 complete and `Phase: 4`, while the body still contains stale Phase 2/Phase 3 wording and a 50% text progress bar. This is a planning-state freshness warning for Phase 4 handoff clarity, not a Phase 3 validator blocker.
- Phase 4 still owns isolated Codex install smoke, compatibility install evidence, changed-file handoff, and remaining non-Codex distribution follow-up.

## Recommendation

Proceed to Phase 4: Install Smoke and Handoff.

Use `python3 scripts/validate-codex-plugin.py` as the pre-smoke maintainer gate before capturing native Codex marketplace add/list/install evidence and `npx plugins` compatibility evidence.

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[]
