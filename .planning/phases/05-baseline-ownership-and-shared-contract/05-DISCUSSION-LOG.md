# Phase 5: Baseline, Ownership, and Shared Contract - Discussion Log

> **Audit trail only.** Downstream planning and execution use `05-CONTEXT.md`.
> This log records the autonomous decisions and alternatives considered.

**Date:** 2026-08-06
**Phase:** 5-Baseline, Ownership, and Shared Contract
**Mode:** `--auto` — recommended option selected for each gray area
**Areas discussed:** Shared entry contract shape, lifecycle and terminal vocabulary, entry-visible safety, baseline evidence

---

## Shared Entry Contract Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Shared ordered core with domain extensions | One required contract order for all eight entries, with skill-owned evidence and detail sections | ✓ |
| Fully independent per-skill schemas | Maximum local freedom, with higher drift and validator complexity | |
| Universal schema including every output field | One strict shape, with poor fit for deployment, reports, URLs, and tutorials | |

**Autonomous choice:** Shared ordered core with domain extensions (recommended default).
**Notes:** Physical `skills/` entries remain the behavior source. Host files are projections and later phases handle their parity.

---

## Lifecycle and Terminal Vocabulary

| Option | Description | Selected |
|--------|-------------|----------|
| Shared `success` / `stopped` / `error` states | Common terminal vocabulary with domain evidence and safe next action | ✓ |
| Skill-specific terminal names | Local wording, with weaker cross-skill tests and handoffs | |
| One boolean success flag | Minimal output, with insufficient stop and recovery context | |

**Autonomous choice:** Shared `success` / `stopped` / `error` states (recommended default).
**Notes:** Canvas explicitly records its temporary loopback server lifetime and shutdown condition.

---

## Entry-Visible Safety

| Option | Description | Selected |
|--------|-------------|----------|
| Per-skill safety canary set in the entry | Keep load-bearing gates visible before branch detail loads; test targeted mutations | ✓ |
| Move all safety into references | Smaller entry files, with an unsafe load-order failure mode | |
| Duplicate every safety rule in every host adapter | Local visibility, with rapid cross-host drift | |

**Autonomous choice:** Per-skill safety canary set in the entry (recommended default).
**Notes:** Confirmation, redaction, read-only, eligibility, quality-gate, runtime-acceptance, and kubeconfig rules stay visible where applicable.

---

## Baseline Evidence

| Option | Description | Selected |
|--------|-------------|----------|
| Eight-skill offline positive and violating probes | Record routing, boundaries, confirmation/refusal, outputs, handoffs, and observable traces before refactor | ✓ |
| Textual snapshot and line-count comparison | Cheap review signal, without behavior evidence | |
| Live provider smoke as the first baseline | Strong runtime signal, with credentials, cleanup, and network variance | |

**Autonomous choice:** Eight-skill offline positive and violating probes (recommended default).
**Notes:** Existing helper/unit/eval gates remain authoritative preservation evidence; live smoke is sequenced into later phases.

---

## the agent's Discretion

- Exact headings, fixture filenames, harness decomposition, and invariant phrase wording within the locked contract.
- Whether a small shared parser lives under `scripts/` or a phase-local test module, provided ownership and compatibility remain clear.

## Deferred Ideas

- Host projection repair, provider benchmarks, adapter generation, a contract DSL, universal output JSON, and Ponytail runtime modes are recorded in `05-CONTEXT.md` for their later phases or future milestones.
