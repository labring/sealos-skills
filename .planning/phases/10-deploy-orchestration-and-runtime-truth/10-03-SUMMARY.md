---
phase: 10-deploy-orchestration-and-runtime-truth
plan: 03
subsystem: deploy-safety
tags: [preflight, confirmation, cleanup, rollback, preview-boundary]
key-files:
  created:
    - scripts/test_deploy_safety_contract.mjs
  modified:
    - skills/sealos-deploy/modules/preflight.md
    - skills/sealos-deploy/modules/pipeline.md
    - skills/sealos-deploy/references/live-smoke-playbooks.md
metrics:
  tasks: 3
  safety_markers: 14
  mutation_checks: 14
---

# Phase 10 Plan 03 Summary

## Outcome

Preflight now exposes a typed capability report and separates immediate auth/workspace/
`curl` gates from conditional Docker, `gh`, kubectl, Python/PyYAML, Compose, and registry
warnings. The ordering from auth/workspace through eligibility and path selection remains
explicit, with confirmation immediately before installs, public exposure, credential
changes, deletion, cleanup, or rollback.

Pipeline and Runtime Truth playbooks now require explicit full-footprint collection,
`collectionOk` and `cleanupComplete` evidence, Instance/App/workload/Job/Service/Ingress/
PVC/KubeBlocks/ObjectStorageBucket coverage, previous-image preservation on rollback, and
the main versus `brain-deploy-preview` prepare-only boundary. Listing errors keep cleanup
unresolved and redaction/rotation findings remain visible.

## Commits

| Commit | Description |
| --- | --- |
| `5266a6b` | docs(10-03): preserve preflight safety ordering |
| `4d887a3` | docs(10-03): align cleanup and rollback playbooks |
| `39ed925` | test(10-03): enforce deploy safety contracts |

## Verification

- `node --check scripts/test_deploy_safety_contract.mjs`
- `node scripts/test_deploy_safety_contract.mjs` (14 markers and 14 mutation guards)
- `node skills/sealos-deploy/scripts/test-sealos-footprint.mjs` (3/3)
- `node skills/sealos-deploy/scripts/test-deploy-template.mjs` (10/10)
- `node --check skills/sealos-deploy/scripts/sealos-footprint.mjs`
- `git diff --check`

## Deviations

None. The changes are operational guidance and provider-free regression checks.

## Self-Check

PASSED. Safety markers are present in live modules, every marker mutation fails the
contract, and no provider command or destructive action ran during verification.
