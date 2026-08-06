# Phase 7: Host Adapter and Public Surface Alignment - Discussion Log

> **Audit trail only.** Decisions are captured in `07-CONTEXT.md`; this log preserves the alternatives considered.

**Date:** 2026-08-07
**Phase:** 7-Host Adapter and Public Surface Alignment
**Areas discussed:** Risk-aware routing and compound handoffs, Host projection parity and canonical version, Canvas exposure and direct-entry semantics, Public claims and adapter behavior boundaries

---

## Risk-aware routing and compound handoffs

| Option | Description | Selected |
|--------|-------------|----------|
| Enrich the single route table | One readable route source carries interaction class, risk labels, and typed handoff metadata. | ✓ |
| Add a second handoff registry | A second source could model sequence but would duplicate route ownership. | |
| Leave risk classification to skill prose | Owners would retain detail while the broad route stays unaware of request risk. | |

**Decision:** Enrich `commands/sealos.md` with a typed `base` plus ordered `escalations` tuple and stop ambiguous mutations before side effects.

## Host projection parity and canonical version

| Option | Description | Selected |
|--------|-------------|----------|
| Derived physical inventory plus Codex version | Root entries and `.codex-plugin/plugin.json` remain the two canonical sources. | ✓ |
| A new hand-maintained manifest | A central manifest would duplicate the physical source. | |
| Per-host independent lists | Each host could diverge in inventory and versions. | |

**Decision:** Validate pointers and arrays by host type and inspect temporary Qoder packages from canonical inputs.

## Canvas exposure and direct-entry semantics

| Option | Description | Selected |
|--------|-------------|----------|
| All plugin and marketplace projections | Every explicit plugin skill list includes `sealos-canvas`; pointer hosts inherit it. | ✓ |
| Qoder only | Existing Qoder parity remains while other plugin surfaces omit Canvas. | |
| Keep the current seven-skill omissions | Phase 6 drift remains visible without a repair. | |

**Decision:** Publish Canvas through the plugin pack and preserve the three documented direct skills.sh command paths.

## Public claims and adapter behavior boundaries

| Option | Description | Selected |
|--------|-------------|----------|
| Complete capability map with host-native semantics | Enumerate all eight capabilities while keeping each host's actual command contract. | ✓ |
| Claim slash commands everywhere | Context-only hosts would receive unsupported command claims. | |
| Publish only deploy/database/S3 capabilities | Public inventory would omit shipped capabilities. | |

**Decision:** Root README and shared context gain the complete map; localized README synchronization is recorded for Phase 12.

## the agent's Discretion

- Exact route column names and risk-label serialization.
- Diagnostic code names and temporary Qoder archive inspection details.

## Deferred Ideas

- Provider-backed installation and live marketplace smoke.
- Localized README synchronization after final release evidence.
- Direct `/sealos-canvas` skills.sh exposure.
- Runtime workflow refactors and new cloud behavior.
