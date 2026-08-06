# Phase 6: Inventory, Router, and Validator Foundation - Discussion Log

> **Audit trail only.** Downstream planning and execution use `06-CONTEXT.md`.
> This log records the autonomous decisions and alternatives considered.

**Date:** 2026-08-06
**Phase:** 6-Inventory, Router, and Validator Foundation
**Mode:** `--auto` — recommended option selected for each gray area
**Areas discussed:** Canonical inventory, router/readers, semantic safety mutations, metadata/link/eval diagnostics

## Canonical Inventory

| Option | Description | Selected |
|---|---|---|
| Derive from physical `skills/*/SKILL.md` | One authoritative filesystem source; projections are compared as sets | ✓ |
| Maintain a committed inventory manifest | Easy reporting with a second drift source | |
| Infer inventory from host manifests | Misses omitted or host-specific entries | |

**Autonomous choice:** Derive from physical entry files (recommended default).
**Notes:** Canvas projection drift remains a Phase 7 repair target.

## Router and Readers

| Option | Description | Selected |
|---|---|---|
| Parse one structured record per route in `commands/sealos.md` | Human-readable source with deterministic route diagnostics | ✓ |
| Keep prose-only routing and scan names heuristically | Lower edit cost with weak duplicate/missing-route detection | |
| Add a second router manifest | Strong machine shape with duplicated ownership | |

**Autonomous choice:** Parse a structured broad router while retaining existing behavior text (recommended default).
**Notes:** Readers stay repository-scoped and use standard-library parsing.

## Semantic Safety Mutations

| Option | Description | Selected |
|---|---|---|
| Registry-backed red/green mutations | Stable canary IDs produce targeted failures when policy phrases are removed | ✓ |
| Snapshot or line-count comparison | Detects textual churn without proving operational guards | |
| Live provider scenarios | Strong runtime signal with credentials, cleanup, and network variance | |

**Autonomous choice:** Offline canary mutations paired with positive fixtures (recommended default).
**Notes:** Confirmation, redaction, read-only, eligibility, and fail-closed behavior each receive a targeted probe.

## Metadata, Links, and Eval Diagnostics

| Option | Description | Selected |
|---|---|---|
| Derive canonical version and validate paths/links/eval schema | One source with actionable field-level diagnostics | ✓ |
| Hard-code versions and route inventories in the checker | Simple initial implementation with drift risk | |
| Defer metadata and eval checks to the final behavior gate | Delays cheap structural feedback | |

**Autonomous choice:** Derive and validate during the foundation phase (recommended default).
**Notes:** Phase 11 will compose these checks into one maintainer command.

## the agent's Discretion

- Parser format, helper module boundaries, fixture names, and diagnostic code vocabulary inside the locked ownership model.

## Deferred Ideas

- Host projection repair and Canvas exposure decision — Phase 7.
- Unified quality gate and complete eval runner — Phase 11.
- Release version/tag and branch audit — Phase 12.
