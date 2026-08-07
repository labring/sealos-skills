---
phase: 03-validator-hardening
verified: 2026-06-15T11:20:43Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
---

# Phase 3: Validator Hardening Verification Report

**Phase Goal:** Maintainers can run validation that catches README, manifest, marketplace, platform registry, fallback install, and JSON syntax drift.
**Verified:** 2026-06-15T11:20:43Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | VAL-01: validator fails when README Quick Start native Codex commands are absent, mismatched, or ordered incorrectly. | VERIFIED | `scripts/validate-codex-plugin.py` extracts `### Recommended: install in Codex`, parses fenced bash blocks, and requires the exact native block at lines 126-164. Negative probe changed `codex plugin add sealos@sealos` to `codex plugin add sealos@sealos-bad`; validator exited 1 with `FAIL: README Quick Start includes exact native Codex install block`. |
| 2 | VAL-02: validator fails when README fallback `npx plugins add https://github.com/labring/sealos-skills --target codex` is absent or mismatched. | VERIFIED | README fallback block exists at `README.md:22-26`; validator requires exact one-line fenced block at `scripts/validate-codex-plugin.py:161-164`. Negative probe changed `--target codex` to `--target codex-bad`; validator exited 1 with `FAIL: README Quick Start includes exact fallback Codex npx install block`. |
| 3 | VAL-03: validator checks README, manifest, marketplace, and platform registry identity/source parity, including platform top-level identity. | VERIFIED | Constants and checks cover repo slug, repo URL, plugin id, selector, display label, skills source, Codex marketplace source, root marketplace source, and platform registry fields at `scripts/validate-codex-plugin.py:18-36`, `169-225`, and `228-250`. Negative probe changed `distribution/platforms.json` top-level `name` to `sealos-bad`; validator exited 1 with `FAIL: platform registry uses canonical plugin id`. |
| 4 | VAL-04: validator parses all five JSON metadata files and shape errors produce structured `FAIL:` output. | VERIFIED | `main()` loads `plugin.json`, `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `marketplace.json`, and `distribution/platforms.json` through `load_json_object()` at `scripts/validate-codex-plugin.py:253-259`; object/list guards emit `FAIL:` at lines 73-101. Negative probe replaced `marketplace.json` with valid JSON `[]`; validator exited 1 with `FAIL: marketplace.json contains a JSON object`. |
| 5 | CR-01, CR-02, CR-03, and WR-01 are fixed. | VERIFIED | Review fix report records all four fixes. Independent probes confirmed exact Quick Start native block failure, exact fallback block failure, platform top-level identity failure, and valid-wrong-type JSON structured failure without traceback. |
| 6 | README validation instructions document validator plus five JSON syntax checks, and `skills/**` remains unchanged. | VERIFIED | README validation block lists `python3 scripts/validate-codex-plugin.py` plus five `json.tool` commands at `README.md:126-135`. `git diff -- skills --exit-code` passed. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `scripts/validate-codex-plugin.py` | Maintainer-facing Codex distribution drift gate | VERIFIED | Exists, substantive, wired as the documented command, parses README and all five JSON metadata files, and produces `PASS:` / `FAIL:` output. |
| `README.md` | Maintainer validation command documentation | VERIFIED | Validation block includes the validator plus syntax checks for `.codex-plugin/plugin.json`, `plugin.json`, `.agents/plugins/marketplace.json`, `marketplace.json`, and `distribution/platforms.json`. |
| `.codex-plugin/plugin.json`, `plugin.json`, `.agents/plugins/marketplace.json`, `marketplace.json`, `distribution/platforms.json` | Metadata inputs validated by the gate | VERIFIED | All five parse through both validator and `python3 -m json.tool`; identity/source fields match canonical contract. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `scripts/validate-codex-plugin.py` | `README.md` | Exact fenced bash block assertions | WIRED | `require_readme_contract()` checks Quick Start native and fallback blocks. |
| `scripts/validate-codex-plugin.py` | `distribution/platforms.json` | Platform top-level and Codex entry assertions | WIRED | `require_platform_codex_contract()` checks top-level name/version/repository plus install, alternateInstall, invoke, evidence, commands, and date. |
| `scripts/validate-codex-plugin.py` | `.codex-plugin/plugin.json` and `plugin.json` | Manifest parity and canonical identity assertions | WIRED | `require_manifest_contract()` checks parity, repository URL, skills source, and display label. |
| `scripts/validate-codex-plugin.py` | `.agents/plugins/marketplace.json` and `marketplace.json` | Marketplace identity/source assertions | WIRED | Codex and root marketplace helpers check one plugin entry and canonical source fields. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `scripts/validate-codex-plugin.py` | `readme`, `root_plugin`, `plugin`, `marketplace`, `root_marketplace`, `platforms` | `read_text()` and `load_json_object()` from repository files | Yes | FLOWING - the validator reads actual workspace files and fails on mutated inputs. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Positive validator gate | `python3 scripts/validate-codex-plugin.py` | Exit 0; final line `Sealos Codex plugin integration validation passed` | PASS |
| Python syntax | `python3 -m py_compile scripts/validate-codex-plugin.py` | Exit 0 | PASS |
| Five JSON syntax checks | `python3 -m json.tool ...` for all five metadata files | Exit 0 | PASS |
| README validation block assertion | Python block assertion over `README.md` | Exit 0 | PASS |
| Skills unchanged | `git diff -- skills --exit-code` | Exit 0 | PASS |
| VAL-01 negative probe | Mutated native Quick Start command | Exit 1; `FAIL: README Quick Start includes exact native Codex install block` | PASS |
| VAL-02 negative probe | Mutated fallback target to `codex-bad` | Exit 1; `FAIL: README Quick Start includes exact fallback Codex npx install block` | PASS |
| VAL-03 negative probe | Mutated platform top-level `name` | Exit 1; `FAIL: platform registry uses canonical plugin id` | PASS |
| VAL-04 negative probe | Replaced `marketplace.json` with valid JSON `[]` | Exit 1; `FAIL: marketplace.json contains a JSON object` | PASS |

### Probe Execution

No `scripts/**/tests/probe-*.sh` files are declared for this phase. Targeted negative probes above serve the phase-specific drift-failure proof.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| VAL-01 | 03-01-PLAN.md | Validator checks README native Codex install commands. | SATISFIED | Exact Quick Start native block check plus negative mutation failure. |
| VAL-02 | 03-01-PLAN.md | Validator checks README fallback `npx plugins` command. | SATISFIED | Exact fallback block check plus negative mutation failure. |
| VAL-03 | 03-01-PLAN.md | Validator checks README/manifest/registry plugin identity parity. | SATISFIED | Manifest, marketplace, root marketplace, and platform registry assertions plus top-level platform identity probe. |
| VAL-04 | 03-01-PLAN.md | JSON syntax checks pass for touched plugin, marketplace, and platform registry files. | SATISFIED | Validator parses five JSON files; `json.tool` checks pass; valid wrong-type JSON produces structured `FAIL:` output. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| - | - | None found | - | `rg` scan found no TODO/FIXME/XXX/HACK/PLACEHOLDER/stub markers in phase files. |

### Human Verification Required

None.

### Gaps Summary

No blocking gaps found. The phase goal is achieved: the maintainer validator catches README native install drift, fallback command drift, identity/source drift across required metadata surfaces, platform top-level identity drift, and JSON shape drift with structured `FAIL:` output. Runtime `skills/**` remains unchanged.

---

_Verified: 2026-06-15T11:20:43Z_
_Verifier: the agent (gsd-verifier)_
