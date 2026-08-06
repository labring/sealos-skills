---
phase: 10-deploy-orchestration-and-runtime-truth
plan: 04
subsystem: runtime-truth
tags: [runtime, convergence, workload-matrix, canvas, evals]
key-files:
  created:
    - scripts/test_runtime_truth_contract.mjs
    - tests/fixtures/deploy-runtime-truth.json
  modified:
    - skills/sealos-deploy/modules/runtime-truth.md
    - skills/sealos-deploy/references/live-smoke-playbooks.md
    - skills/sealos-deploy/evals/evals.json
metrics:
  tasks: 3
  traces: 9
  new_eval_cases: 3
---

# Phase 10 Plan 04 Summary

## Outcome

Runtime Truth now exposes an explicit conditional evidence matrix for public/private web,
worker, scheduled job, database-backed, and S3-backed workloads. It requires actual live
identity, applicable URL/network/business evidence, initial/final logs and Events, readiness,
complete footprint, redaction, and a minimum 60-second stability window. Deploy-only output
remains `stopped` with `runtime_pending`, and only a verified sanitized report unlocks the
read-only Canvas tuple.

Three deploy eval cases now cover runtime-pending output, conditional non-public workload
probes, and partial database/S3 evidence with advancing warnings. The deterministic fixture
and test exercise accepted public/private web, worker, scheduled job, database/S3, pending,
convergence failure, footprint listing failure, and sanitized Canvas handoff traces.

## Commits

| Commit | Description |
| --- | --- |
| `7f05dba` | docs(10-04): define conditional Runtime Truth |
| `ea14afc` | test(10-04): strengthen runtime truth evals |
| `abcba6f` | test(10-04): add Runtime Truth evidence matrix |

## Verification

- `node --check scripts/test_runtime_truth_contract.mjs`
- `node scripts/test_runtime_truth_contract.mjs` (9 traces)
- `python3 -m json.tool skills/sealos-deploy/evals/evals.json`
- `python3 -m json.tool tests/fixtures/deploy-runtime-truth.json`
- `node skills/sealos-deploy/scripts/test-sealos-live-smoke.mjs` (5/5)
- `node skills/sealos-deploy/scripts/test-sealos-log-scan.mjs` (12/12)
- `node skills/sealos-deploy/scripts/test-sealos-footprint.mjs` (3/3)
- `node scripts/test_canvas_contract.mjs` (4/4)
- `git diff --check`

## Deviations

None. Live provider verification was unnecessary for this static contract phase and no
credentials or cluster mutations were used.

## Self-Check

PASSED. Every workload class has applicable and skipped probes, partial evidence has a
stopped/error trace, and all Canvas paths remain sanitized and read-only.
