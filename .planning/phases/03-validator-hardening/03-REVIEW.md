---
phase: 03-validator-hardening
reviewed: 2026-06-15T11:05:02Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - scripts/validate-codex-plugin.py
  - README.md
  - .codex-plugin/plugin.json
  - plugin.json
  - .agents/plugins/marketplace.json
  - marketplace.json
  - distribution/platforms.json
findings:
  critical: 3
  warning: 1
  info: 0
  total: 4
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-06-15T11:05:02Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

The validator and README updates were reviewed against the Phase 3 hardening contract. Positive validation passes, JSON syntax checks pass, and `skills/**` remains unchanged. Negative probes found three contract failures: README native command absence can pass, README fallback command mismatch can pass, and platform registry identity drift can pass. One robustness issue also leaves malformed-but-valid JSON shapes as Python tracebacks rather than controlled validation failures.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: README native install block can be removed while validation still passes

**File:** `scripts/validate-codex-plugin.py:100`
**Issue:** `require_readme_contract()` uses `readme.find(command)` across the entire README. The same native commands appear later in the "Other supported AI tools" table, so deleting the Quick Start native Codex install code block still leaves matching substrings. Negative probe: replacing the Quick Start code block with a placeholder produced exit `0` and `Sealos Codex plugin integration validation passed`. This violates the Phase 3 contract that the validator fails when README native Codex install commands are absent.
**Fix:**
```python
README_NATIVE_BLOCK = """```bash
codex plugin marketplace add labring/sealos-skills
codex plugin add sealos@sealos
```"""

def require_readme_contract(readme: str) -> None:
    require(
        README_NATIVE_BLOCK in readme,
        "README Quick Start includes native Codex install block in canonical order",
    )
```

### CR-02: README fallback command check accepts mismatched commands by substring

**File:** `scripts/validate-codex-plugin.py:110`
**Issue:** The fallback assertion checks `README_FALLBACK_COMMAND in readme`, so a wrong command such as `npx plugins add https://github.com/labring/sealos-skills --target codex-bad` still contains the expected substring and passes validation. Negative probe: mutating only the README fallback command target to `codex-bad` produced exit `0`. This violates the Phase 3 contract that mismatched fallback commands fail.
**Fix:**
```python
README_FALLBACK_BLOCK = """```bash
npx plugins add https://github.com/labring/sealos-skills --target codex
```"""

def require_readme_contract(readme: str) -> None:
    require(
        README_FALLBACK_BLOCK in readme,
        "README includes exact fallback Codex npx install block",
    )
```

### CR-03: Platform registry top-level identity drift is not validated

**File:** `scripts/validate-codex-plugin.py:173`
**Issue:** `require_platform_codex_contract()` validates only the Codex platform entry and ignores the top-level registry identity fields. Negative probes changed `distribution/platforms.json` top-level `name`, `version`, and `repository`; each mutation still produced exit `0`. This violates the Phase 3 contract that README, manifest, marketplace, and platform registry identity/source divergence fails.
**Fix:**
```python
def require_platform_codex_contract(platforms: dict, codex_plugin: dict) -> None:
    require(platforms.get("name") == PLUGIN_ID, "platform registry uses canonical plugin id")
    require(platforms.get("version") == codex_plugin.get("version"), "platform registry version matches Codex manifest")
    require(platforms.get("repository") == REPOSITORY_URL, "platform registry uses canonical repository URL")
    codex_entries = [platform for platform in platforms.get("platforms", []) if platform.get("id") == CODEX_PLATFORM_ID]
```

## Warnings

### WR-01: Valid JSON with wrong container types crashes with traceback

**File:** `scripts/validate-codex-plugin.py:63`
**Issue:** `load_json()` returns any JSON value while downstream helpers assume dictionaries and lists. Negative probes with `plugin.json` set to `[]` and `.agents/plugins/marketplace.json` `plugins` set to an object both exited non-zero through uncaught `AttributeError` or `KeyError` tracebacks. The validator does fail, but the output is brittle and obscures the actionable field path.
**Fix:** Validate container types immediately after parsing and before indexing.
```python
def load_json_object(path: Path) -> dict:
    value = load_json(path)
    require(isinstance(value, dict), f"{path.relative_to(ROOT)} contains a JSON object")
    return value

def require_single_plugin_list(value: object, label: str) -> list[dict]:
    require(isinstance(value, list), f"{label} plugins is a list")
    require(len(value) == 1 and isinstance(value[0], dict), f"{label} has one plugin object")
    return value
```

## Verification Evidence

- `python3 scripts/validate-codex-plugin.py` - PASS
- `python3 -m py_compile scripts/validate-codex-plugin.py` - PASS
- `python3 -m json.tool .codex-plugin/plugin.json >/dev/null` - PASS
- `python3 -m json.tool plugin.json >/dev/null` - PASS
- `python3 -m json.tool .agents/plugins/marketplace.json >/dev/null` - PASS
- `python3 -m json.tool marketplace.json >/dev/null` - PASS
- `python3 -m json.tool distribution/platforms.json >/dev/null` - PASS
- `git diff -- skills --exit-code` - PASS
- Negative probe: removed Quick Start native install block; validator incorrectly exited `0`.
- Negative probe: changed README fallback target to `codex-bad`; validator incorrectly exited `0`.
- Negative probe: changed platform registry top-level `name`, `version`, and `repository`; validator incorrectly exited `0`.
- Negative probe: changed JSON containers to valid but wrong types; validator exited non-zero with uncaught tracebacks.

---

_Reviewed: 2026-06-15T11:05:02Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
