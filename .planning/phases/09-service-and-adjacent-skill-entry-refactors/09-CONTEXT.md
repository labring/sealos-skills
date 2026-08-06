---
phase: 09-service-and-adjacent-skill-entry-refactors
status: decided
source: roadmap, Phase 8 handoff contracts, current skill entries and owned references
created: 2026-08-07
---

# Phase 9 Context

## Phase Goal

Database, S3, Canvas, and Desktop app workflows expose their risk boundaries, terminal evidence, and owned progressive detail while retaining domain-specific behavior.

## Shared Decisions

### D-09-01: One outcome vocabulary

Every entry returns request-scoped `success`, `stopped`, or `error`. Each result names the owner, source or target identity, evidence, artifact path or URL when applicable, redaction status, and one safe next action.

### D-09-02: Five-field handoffs remain stable

Cross-skill handoffs use `target`, `inputArtifact`, `allowedAction`, `failureReturn`, and `responseOwner`. A direct workflow uses `target: none`. A receiving skill re-checks its own scope and canaries.

### D-09-03: Progressive detail is owned and conditional

Each entry keeps identity, scope, risk, lifecycle, output states, handoff, and verification visible. It loads one branch-specific module or reference only after the matching precondition passes. Existing analyzers and CLI references remain the behavior source.

### D-09-04: Credentials and environment values stay out of evidence

Database connection strings, S3 credential blocks, kubeconfig content, Desktop session values, and copied environment values remain redacted. Reports carry names, key names, types, status, digests, counts, and verification categories.

## Database Decisions

### D-09-05: Resolve account and workspace before mutation

Database workflows resolve project path, CLI availability, auth, region, and workspace before listing or mutating resources. Ambiguous workspace or database intent returns `stopped` with a clarification and no create/update.

### D-09-06: List before create or reuse

The database flow analyzes the project, lists matching resources, and chooses create or reuse from explicit type/name/purpose evidence. It preserves the existing local Compose fallback and writes only the existing application env key.

### D-09-07: Public and destructive operations are confirmed

Public access, delete, backup-delete, collision-prone restore, and disabling active access require explicit confirmation. Private access is the default. The result records the confirmation boundary and the final connectivity or migration proof.

## S3 Decisions

### D-09-08: Private bucket and smallest env mapping by default

S3 analyzes the project, lists buckets, creates or reuses a `private` bucket, initializes credentials only when needed, and updates only keys read by the app. Local MinIO/Compose remains available for rollback.

### D-09-09: Public policy, rotation, and deletion are gated

Changing a bucket to `publicRead` or `publicReadwrite`, rotating active credentials, deleting buckets or objects, and replacing storage configuration require explicit confirmation. Presigned URLs are the preferred temporary sharing path.

### D-09-10: Object-flow proof is required

S3 success requires an authenticated upload/list/download or application storage-path proof, cleanup state, policy evidence, and redacted credential handling. Async secret readiness is polled before env mutation.

## Canvas Decisions

### D-09-11: Verified deployment and read-only access are hard preconditions

Canvas requires `.sealos/state.json.last_deploy`, the scoped Sealos kubeconfig, and live read access. Missing state, kubeconfig, or kubectl returns `stopped` before HTML generation. Canvas never deploys, updates, restarts, patches, deletes, applies, or changes workload images.

### D-09-12: Sanitized topology and explicit server lifetime

Canvas exposes names, kinds, statuses, counts, relationships, and event summaries while omitting Secret data, full ConfigMap contents, credentials, and kubeconfig values. It returns `local_url`, `html_path`, app URL, node/edge counts, and server-lifetime evidence; the loopback server stops at request end or `SIGINT`/`SIGTERM`.

## App Builder Decisions

### D-09-13: Classify the starting path before reading branch detail

The app entry first distinguishes create, adapt, identity integration, and tutorial/documentation work. Code work and tutorial output keep separate success claims. Missing branch clarity returns `stopped` before file mutation.

### D-09-14: Local SDK/source precedence and client-only integration

Existing local SDK sources and provider apps take precedence. The official `@labring/sealos-desktop-sdk` package is the fallback. SDK initialization runs once in a client-only root provider, session identity maps to the app's business key, and outside-Desktop fallback remains explicit.

### D-09-15: Desktop iframe evidence gates publish handoff

A browser-only render does not prove Desktop readiness. Publish handoff requires verified session/language behavior in a real Desktop iframe, business data behavior, environment/migration checks, and a stable target URL. The handoff goes to `sealos-deploy` only after the app owner records those artifacts.

## Validation Decisions

- Extend the Phase 8 dependency fixture vocabulary to database, S3, Canvas, and App Builder positive/violating traces.
- Prefer deterministic helper and document checks over live cloud mutation during this phase.
- Use the existing Canvas fixture path and `--no-serve` generator mode for offline tests.
- Keep provider login, database/bucket creation, Desktop iframe, and live deploy evidence for the deployment/runtime phases where authority exists.

## Deferred

- Live database and bucket provisioning remains user-authorized runtime work.
- A real Sealos Desktop iframe remains an environment check; the entry contract can require and report it without fabricating evidence.
- Deploy orchestration consumes these service handoffs in Phase 10.

## Plan Implications

1. Database establishes shared cloud-local mutation and env-preservation result fields.
2. S3 reuses those fields and adds private policy, credential readiness, object-flow, and cleanup evidence.
3. Canvas proves read-only and sanitized-output boundaries independently of mutation skills.
4. App Builder consumes the shared outcome vocabulary and adds branch classification, SDK source precedence, iframe, and publish evidence.
