---
phase: 12-branch-policy-documentation-and-release-audit
plan: 01
subsystem: release-audit
tags: [preservation, branch-anchors, redaction, read-only]

requires:
  - phase: 10-deploy-orchestration-and-runtime-truth
    provides: Sanitized Runtime Truth and deploy safety evidence
  - phase: 11-behavior-evals-deterministic-grader-and-maintainer-gate
    provides: Offline maintainer quality gate evidence
provides:
  - Immutable source, preview, and release-candidate anchor checks
  - Read-only artifact, phase-order, safety, runtime, and preview-boundary audit
  - Redacted diagnostics and regression coverage for preservation failures
affects: [12-02, 12-04]

tech-stack:
  added: [Python standard library]
  patterns: [git-tree-read, stable-json-report, fail-closed-check]

key-files:
  created:
    - scripts/release-preservation-audit.py
    - scripts/test_release_preservation_audit.py
    - tests/fixtures/release-preservation-policy.json
  modified: []

key-decisions:
  - "Audit refs are resolved and compared to recorded SHAs before branch content is interpreted."
  - "Required markers and forbidden preview paths are evaluated through git show/cat-file without checkout or mutation."
  - "Credential-shaped diagnostics are replaced with a redacted placeholder before JSON emission."

patterns-established:
  - "Preservation reports expose id, status, category, branch, ref, path, and a sanitized message."

requirements-completed: [SDS-12, REL-01]

duration: 8m
completed: 2026-08-07
---

# Phase 12 Plan 01: Preservation Baseline Summary

The release preservation policy now records the immutable `main`, `upstream/brain-deploy-preview`, and candidate SHAs together with source-owned workflow markers, candidate Phase 8-11 evidence, and preview-only forbidden surfaces. The audit helper reads branch trees through Git plumbing, checks required markers, detects forbidden paths, and emits stable JSON with redacted diagnostics.

## Verification

- `python3 -m json.tool tests/fixtures/release-preservation-policy.json` passed.
- `python3 scripts/release-preservation-audit.py --root . --fixture tests/fixtures/release-preservation-policy.json --check` passed with `21 passed, 0 failed, 0 conditional`.
- `python3 -m unittest scripts.test_release_preservation_audit` passed `5/5`.
- `python3 -m py_compile scripts/release-preservation-audit.py scripts/test_release_preservation_audit.py` passed.
- `git diff --check` passed.

## Outcome

The release audit has a source-backed preservation baseline and can fail closed on anchor drift, missing workflow evidence, forbidden preview surfaces, and unsafe diagnostics before branch classifications are evaluated.
