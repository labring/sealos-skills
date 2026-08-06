# Phase 10: Deploy Orchestration and Runtime Truth - Discussion Log

> **Audit trail only.** Decisions are captured in `10-CONTEXT.md`; this log preserves the alternatives considered.

**Date:** 2026-08-07
**Phase:** 10-deploy-orchestration-and-runtime-truth
**Areas discussed:** typed evidence reuse, state and mode authority, Runtime Truth acceptance, cleanup and rollback, branch policy

---

## Typed evidence reuse

| Option | Description | Selected |
|--------|-------------|----------|
| Loose prose handoffs | Let deploy rediscover inputs from project files at every phase. | |
| Typed envelope with cached evidence | Validate source, owner, preconditions, artifact, evidence, redaction, and five handoff fields once per boundary. | ✓ Autonomous selection |
| New universal JSON schema | Replace domain-specific payloads with one broad output schema. | |

**User's choice:** Autonomous selection under the standing instruction to prioritize stability and performance.
**Notes:** Preserve domain-specific fields while reusing the shared envelope and avoiding repeated discovery.

## State and mode authority

| Option | Description | Selected |
|--------|-------------|----------|
| State file only | Trust `.sealos/state.json` for DEPLOY/UPDATE decisions. | |
| Live cluster only | Reconstruct every decision from kubectl and ignore local state. | |
| Validated state plus live identity | Use state for resume hints, verify App/Deployment/image/namespace live, and stop on mismatch. | ✓ Autonomous selection |

**User's choice:** Validated state plus live identity.
**Notes:** This keeps UPDATE safe and avoids mutating a guessed or stale target.

## Runtime Truth acceptance

| Option | Description | Selected |
|--------|-------------|----------|
| HTTP-only acceptance | Accept a reachable App URL after deploy. | |
| Configurable evidence matrix | Apply URL/network/auth/log/event/footprint and domain-specific DB/S3 checks by workload. | ✓ Autonomous selection |
| Always run every probe | Run web, login, object, and database probes for every workload. | |

**User's choice:** Configurable evidence matrix with final success gated by the strongest applicable Runtime Truth.
**Notes:** Use first/final log baselines and a minimum 60-second reconciliation window; deploy-only returns a runtime-pending non-acceptance state.

## Cleanup and rollback

| Option | Description | Selected |
|--------|-------------|----------|
| Best-effort cleanup | Delete visible resources and report the remaining list. | |
| Full-footprint confirmed cleanup | List Instance/App/workloads/Jobs/Services/Ingresses/PVCs/KubeBlocks/ObjectStorageBucket, confirm mutation, then prove empty. | ✓ Autonomous selection |
| Automatic deletion after every test | Remove resources without a separate confirmation gate. | |

**User's choice:** Full-footprint confirmed cleanup with preserved rollback evidence.
**Notes:** Listing errors keep cleanup unresolved; UPDATE rollback preserves the previous image/state.

## Branch policy

| Option | Description | Selected |
|--------|-------------|----------|
| Treat all branches as full deploy | Apply the main workflow everywhere. | |
| Treat all branches as prepare-only | Remove runtime deployment behavior from main. | |
| Full deploy on main-like worktree, explicit preview exclusion | Implement the current full flow and preserve manual adaptation rules for `brain-deploy-preview`. | ✓ Autonomous selection |

**User's choice:** Full deploy on the current main-like worktree with explicit preview exclusion.
**Notes:** The current branch is `worktree-agent-phase5-01`; branch-specific preview policy remains authoritative for future merges.

## the agent's Discretion

- Exact contract envelope serialization, helper extraction, diagnostic codes, and deterministic fixture layout.
- Whether one shared validator or skill-local checks provide the machine gate, provided boundary evidence remains equivalent.

## Deferred Ideas

- Complete behavior grader and maintainer gate — Phase 11.
- Branch/release audit and localized documentation synchronization — Phase 12.
- New runtime capabilities and provider benchmark suites — outside v1.1.
