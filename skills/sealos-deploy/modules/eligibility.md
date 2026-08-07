# Phase 0.4: Deployment Eligibility Gate

Run this gate before creating `.sealos/`, detecting deployment mode, matching a
template, readiness scoring, Dockerfile generation, image detection, or build.

Read and apply the canonical policy:
`<SKILL_DIR>/../cloud-native-readiness/knowledge/deployment-eligibility.md`.

When Node.js is available, run:

```bash
node "<SKILL_DIR>/scripts/workload-eligibility.mjs" "$WORK_DIR"
```

The script is read-only and prints the decision to stdout. Keep the parsed object as
`ELIGIBILITY_DECISION` in the current execution context; never write it to `.sealos/`
or another project file.

| Exit | Status | Action |
|------|--------|--------|
| `0` | `eligible` | Continue with the requested repository root |
| `2` | `ineligible` | Report workload type/evidence and STOP |
| `3` | `needs_review` | Inspect evidence; keep deployment blocked until explicitly resolved |
| other | execution error | Report the classifier error and STOP |

Parse stdout even for exits `2` and `3`; those are classification results, not script
failures. A mixed repository remains `needs_review` in this workflow: list the
detected units and STOP rather than selecting and deploying a nested directory.

For other `needs_review` results, inspect entry points and runtime evidence. Continue
only when the requested root itself can be explicitly resolved as `eligible`; record
that in-memory decision with `source: "ai-review"` and specific repository-relative
evidence. An ordinary desktop/mobile client cannot be overridden by a Dockerfile,
readiness score, registry image, or user willingness to proceed.

If Node.js is unavailable, perform the same review manually and keep the result in
memory. Missing or ambiguous evidence fails closed. No `.sealos/config.json` field or
resume state may skip or override this gate.

