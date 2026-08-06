---
phase: 09-service-and-adjacent-skill-entry-refactors
session: 2026-08-07
status: complete
---

# Phase 9 Discussion Log

## Inputs Reviewed

- Phase 8 typed handoff, result, redaction, and progressive-disclosure contracts.
- `skills/sealos-database/SKILL.md`, its analyzer, env integration, and CLI references.
- `skills/sealos-s3/SKILL.md`, its analyzer, env integration, and CLI references.
- `skills/sealos-canvas/SKILL.md`, `scripts/generate-canvas.mjs`, and Canvas eval cases.
- `skills/sealos-app-builder/SKILL.md` and the SDK, local-debug, data-integration, and publish references.
- Roadmap requirements SDS-04 and SDS-D06.

## Decisions Recorded

| ID | Decision | Rationale |
| --- | --- | --- |
| D-09-01 | Shared success/stopped/error result vocabulary | Consumers need one terminal contract across cloud mutation, read-only observation, and local artifact work. |
| D-09-02 | Preserve five typed handoff fields | Phase 8 and deploy orchestration already consume this contract. |
| D-09-03 | One-level conditional detail loading | Entry files remain auditable while domain references retain implementation ownership. |
| D-09-04 | Redacted evidence only | Database, S3, Canvas, and Desktop all handle credential-shaped values. |
| D-09-05 | Resolve account/workspace before database mutation | A wrong workspace changes the resource target and is a high-impact failure. |
| D-09-06 | Analyze and list before database create/reuse | Existing resources and application env conventions determine the safe action. |
| D-09-07 | Confirm public/destructive database operations | Public exposure and deletion cross the explicit confirmation boundary. |
| D-09-08 | Private S3 bucket and smallest existing env-key mapping | This preserves least privilege and local rollback. |
| D-09-09 | Confirm public policy, rotation, and deletion | These actions affect active clients or data visibility. |
| D-09-10 | Require authenticated object-flow evidence | Bucket readiness alone does not prove application storage behavior. |
| D-09-11 | Canvas requires deployed state and read-only access | Canvas observes an existing deployment and owns no mutation path. |
| D-09-12 | Sanitize topology and stop temporary server explicitly | Local URLs and graph evidence need a bounded lifecycle and safe data surface. |
| D-09-13 | Classify App Builder branch before branch references | Code, tutorial, and identity workflows have different ownership and claims. |
| D-09-14 | Prefer local SDK sources, client-only root integration | This preserves actual repository behavior and avoids server-side iframe assumptions. |
| D-09-15 | Require real Desktop iframe evidence for publish handoff | A browser render cannot prove Desktop bridge behavior. |

## Open Questions

None. Current local references provide sufficient contracts for planning and offline implementation.

## Constraints Carried Forward

- No provider mutation, credential rotation, public exposure, deletion, or system installation occurs in Phase 9 without explicit user authority.
- App Builder must not claim Desktop iframe verification from a browser-only check.
- Canvas remains a read-only observation skill and never receives mutation authority.
- Phase 10 owns live deployment/runtime acceptance of these handoffs.

## Discussion Outcome

The phase is ready for four dependency-ordered plans: database, S3, Canvas, and App Builder. The first two share cloud-local mutation and env evidence; Canvas remains independent and read-only; App Builder depends on the shared terminal vocabulary and handoff shape.
