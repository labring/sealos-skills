---
phase: 12-branch-policy-documentation-and-release-audit
plan: 02
subsystem: release-audit
tags: [branch-policy, aligned, adapted, excluded, kaniko, railpack]

requires:
  - phase: 12-01
    provides: Immutable refs and preservation evidence
provides:
  - File-level main-to-preview classification
  - Exact parity checks for five shared skill directories
  - Railpack delta and prepare-only/manual deploy policy enforcement
affects: [12-03, 12-04]

tech-stack:
  added: [Python standard library]
  patterns: [git-diff-classification, policy-fixture, preview-boundary-check]

key-files:
  created:
    - scripts/release-branch-audit.py
    - scripts/test_release_branch_audit.py
    - tests/fixtures/release-branch-policy.json
  modified: []

key-decisions:
  - "Five named skill directories require exact source parity and are checked independently of changed-path classification."
  - "Dockerfile changes pass only when the target file contains the documented normalized Railpack evidence and precedence markers."
  - "Every deploy path remains visible under a manual-review policy while preview-owned Kaniko and prepare documents are adapted classifications."
  - "Main-only plugin, distribution, Canvas, BuildKit, branding, planning, and full-deploy validator paths are excluded explicitly."

patterns-established:
  - "Branch reports retain sourcePath, targetPath, changeType, policyId, classification, and diagnostic for every diff row."

requirements-completed: [SDS-12, REL-01]

duration: 10m
completed: 2026-08-07
---

# Phase 12 Plan 02: Branch Classification Summary

The branch policy is now machine-readable and applied to the immutable `main` and `upstream/brain-deploy-preview` trees. The audit preserves the preview identity and prepare-only build path, records all deploy differences for manual review, and keeps main-only plugin/distribution/Canvas/full-runtime surfaces outside the preview boundary.

## Verification

- `python3 -m json.tool tests/fixtures/release-branch-policy.json` passed.
- `python3 scripts/release-branch-audit.py --root . --fixture tests/fixtures/release-branch-policy.json --source main --target upstream/brain-deploy-preview --candidate ef8f2aceb2e7f0b915713419cd129fbc0454d717 --check` passed with `189 classified paths`, `5 aligned parity checks`, `41 manual-review paths`, and `0 failed`.
- `python3 -m unittest scripts.test_release_branch_audit` passed `4/4`.
- `python3 -m py_compile scripts/release-branch-audit.py scripts/test_release_branch_audit.py` passed.
- `git diff --check` passed.

## Outcome

The main-to-preview boundary has a complete source-aware disposition table. Any future unclassified path, parity drift, forbidden preview surface, or undocumented Dockerfile change fails the audit before release evidence is published.
