---
phase: 03-validator-hardening
fixed_at: 2026-06-15T11:11:49Z
review_path: .planning/phases/03-validator-hardening/03-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-06-15T11:11:49Z
**Source review:** `.planning/phases/03-validator-hardening/03-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: README native install block can be removed while validation still passes

**Files modified:** `scripts/validate-codex-plugin.py`
**Commit:** 95841a4
**Applied fix:** The README validator now extracts the `### Recommended: install in Codex` Quick Start section, parses fenced `bash` blocks, and requires the exact two-line native Codex install block inside that section.

**Probe evidence:** Removing the Quick Start native install block failed with `FAIL: README Quick Start includes exact native Codex install block`.

### CR-02: README fallback command check accepts mismatched commands by substring

**Files modified:** `scripts/validate-codex-plugin.py`
**Commit:** 95841a4
**Applied fix:** The fallback Codex install check now requires a fenced `bash` block containing exactly `npx plugins add https://github.com/labring/sealos-skills --target codex` as a full command line in the Quick Start Codex section.

**Probe evidence:** Changing the fallback command to `--target codex-bad` failed with `FAIL: README Quick Start includes exact fallback Codex npx install block`.

### CR-03: Platform registry top-level identity drift is not validated

**Files modified:** `scripts/validate-codex-plugin.py`
**Commit:** 95841a4
**Applied fix:** The platform registry contract now verifies top-level `name`, `version`, and `repository` before checking the Codex platform entry fields.

**Probe evidence:** Changing top-level `name`, `version`, and `repository` failed with `FAIL: platform registry uses canonical plugin id`.

### WR-01: Valid JSON with wrong container types crashes with traceback

**Files modified:** `scripts/validate-codex-plugin.py`
**Commit:** 95841a4
**Applied fix:** JSON loading and nested access now use small object/list guards so expected shape errors exit through structured `FAIL:` output.

**Probe evidence:** Changing root `marketplace.json` from object to list failed with `FAIL: marketplace.json contains a JSON object`; changing `.agents/plugins/marketplace.json` `plugins` from list to object failed with `FAIL: Codex marketplace plugins is a JSON array`. Neither probe produced a traceback.

## Verification

- `python3 scripts/validate-codex-plugin.py` - PASS
- `python3 -m py_compile scripts/validate-codex-plugin.py` - PASS
- `python3 -m json.tool .codex-plugin/plugin.json >/dev/null` - PASS
- `python3 -m json.tool plugin.json >/dev/null` - PASS
- `python3 -m json.tool .agents/plugins/marketplace.json >/dev/null` - PASS
- `python3 -m json.tool marketplace.json >/dev/null` - PASS
- `python3 -m json.tool distribution/platforms.json >/dev/null` - PASS
- `git diff -- skills --exit-code` - PASS
- `scripts/__pycache__/` cleanup - PASS

## Skipped Issues

None.

---

_Fixed: 2026-06-15T11:11:49Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
