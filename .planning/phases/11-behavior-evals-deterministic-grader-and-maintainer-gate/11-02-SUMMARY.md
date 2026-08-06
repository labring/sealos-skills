---
phase: 11-behavior-evals-deterministic-grader-and-maintainer-gate
plan: 02
subsystem: behavior-grader
tags: [structured-trace, deterministic, mutation, redaction]
key-files:
  created:
    - scripts/skill-design-behavior.mjs
    - scripts/test_skill_design_behavior.mjs
    - tests/fixtures/skill-design-behavior.json
  modified:
    - scripts/skill-design-baseline.mjs
    - scripts/test-skill-design-baseline.mjs
metrics:
  tasks: 3
  cases: 16
  mutation_scenarios: 8
  tests: 4
---

# Phase 11 Plan 02 Summary

## Outcome

The canonical baseline validator now requires redacted `text`, named `evidence`, a safe next action, and all five coverage dimensions in every trace. The new deterministic ESM grader separates structural validity from terminal behavior, reports stable skill/case/field/source diagnostics, and confirms eight positive plus eight violating traces. Mutation tests exercise the real validator against altered fixture and temporary-repository copies.

## Commits

| Commit | Description |
| --- | --- |
| `531878e` | `test(11-02): add deterministic behavior grader` |

## Verification

- `node --check scripts/skill-design-behavior.mjs`
- `node --check scripts/test_skill_design_behavior.mjs`
- `node scripts/skill-design-behavior.mjs --fixture tests/fixtures/skill-design-baseline.json --scenarios tests/fixtures/skill-design-behavior.json --check`
- `node --test scripts/test_skill_design_behavior.mjs` (4/4)
- `node --test scripts/test-skill-design-baseline.mjs` (6/6)
- `python3 -m unittest scripts.test_validate_skill_design` (19/19)
- `git diff --check`

## Deviations

None. The grader remains provider-free and uses the existing baseline module as the structural source of truth.

## Self-Check

PASSED. All planned artifacts exist, the complete trace matrix is green, and mutation diagnostics identify the owning field and case.
