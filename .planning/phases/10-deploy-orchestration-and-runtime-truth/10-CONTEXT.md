# Phase 10: Deploy Orchestration and Runtime Truth - Context

**Gathered:** 2026-08-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Refactor the main `sealos-deploy` entry into a typed composite orchestration that consumes the stabilized readiness, Dockerfile, template, database, S3, Canvas, and App Builder contracts; preserves DEPLOY/UPDATE behavior, artifact ownership, authentication, confirmation, cleanup, rollback, and branch policy; and accepts final deployment success only from verified live Runtime Truth. This phase wires existing behavior and evidence together. New provider capabilities, a second skill source, behavior benchmark expansion, and release audit remain outside this phase.

</domain>

<decisions>
## Implementation Decisions

### Typed orchestration and evidence reuse
- **D-10-01:** Treat every upstream handoff as a typed envelope with source, owner, preconditions, input artifact, allowed action, verification evidence, redaction status, and the five stable handoff fields. Deploy validates the envelope at each boundary and returns the failed owner/condition without repeating discovery.
- **D-10-02:** Keep phase order explicit: preflight/auth/workspace -> eligibility -> optional GitHub template fast path -> mode detection -> assess/detect -> Dockerfile/build or image reuse -> template/configure -> deploy/update -> Runtime Truth -> state and handoff. A generic shortcut cannot bypass a phase or its canary.
- **D-10-03:** Optimize for stable evidence reuse: read each source/artifact once per phase, cache bounded reports in the current execution context, use repository-relative artifact paths, and keep Runtime Truth probes bounded to the selected app/namespace.

### Artifact ownership and state authority
- **D-10-04:** Preserve the `.sealos` inventory and ownership: user-owned `config.json`, optional `template-match.json`, regenerated `analysis.json`, lazy `build/build-result.json`, generated `template/index.yaml`, validated `state.json` after deploy/update, and one append-only log under `~/.sealos/logs/`.
- **D-10-05:** Validate JSON artifacts before trusting resume or UPDATE state. `.sealos/state.json` is a resume hint; live App/Deployment identity, image, namespace, URL, and readiness remain the runtime authority. A state/live mismatch returns `stopped` with the exact reconciliation action.
- **D-10-06:** Keep Canvas ownership downstream: deploy writes verified `last_deploy` plus sanitized Runtime Truth fields to state and hands a read-only observation tuple to Canvas. Deploy never renders topology; Canvas never mutates deploy resources.

### Mode, mutation, and branch safety
- **D-10-07:** Enter UPDATE only when a validated state record and a live selected deployment agree on app, namespace, and current image. Missing or unusable kubectl turns an ambiguous existing record into a stopped confirmation path; it never silently mutates a guessed target. DEPLOY creates a distinct instance only after mode is resolved.
- **D-10-08:** Keep preflight/auth/workspace and eligibility before project artifacts or provider mutation. System-tool installation, public exposure, credential changes, deletion, cleanup, and rollback require explicit confirmation with operation, impact, and post-action evidence.
- **D-10-09:** Implement Phase 10 for the full-deploy main workflow in this worktree. Preserve the documented `brain-deploy-preview` prepare-only policy as an explicit excluded boundary; any future merge into that branch requires manual adaptation and must retain Kaniko/prepare artifacts and omit full runtime deployment.

### Runtime Truth acceptance
- **D-10-10:** Final `success` requires the strongest applicable Runtime Truth: actual App URL/live identity, Launchpad public-network and Service-port/host match for public web apps, fresh root response, selected signup/bootstrap/login and one authenticated route when required, recent logs and Event convergence, workload readiness, and complete footprint with `collectionOk` and `runtimeReady`.
- **D-10-11:** Apply conditional probes by workload: web apps require URL/network/HTTP/auth checks; workers and scheduled jobs require lifecycle, logs, events, and completion/readiness evidence; database-backed or S3-backed apps require the declared database/object proof. A deploy-only request can return deployment artifacts and a `stopped` runtime-pending result; it does not claim final acceptance without Runtime Truth.
- **D-10-12:** Runtime Truth uses a first baseline and a final comparison after at least one complete reconciliation window (60 seconds minimum). Active failures, restart deltas, unresolved Secrets, advancing Warning Events, readiness flaps, log errors, or incomplete footprint keep the result `stopped` or `error` with a safe remediation action.

### Cleanup and rollback
- **D-10-13:** Cleanup is a separate confirmed mutation. Inventory `Instance`, App, Deployments/StatefulSets/DaemonSets, CronJobs, Jobs, Services, Ingresses, PVCs, KubeBlocks, and ObjectStorageBucket resources first; any listing error keeps cleanup unresolved. Report zero matching resources only after every requested listing succeeds.
- **D-10-14:** UPDATE failures preserve the previous image/state and use the existing rollout/rollback boundary. Rollback evidence records the target, previous image, rollout result, and residual footprint; historical credential residue becomes a rotation requirement and never appears as a raw value.

### the agent's Discretion
- Exact envelope serialization, helper extraction, diagnostic codes, and fixture names may follow existing Node/Python patterns when they preserve the decisions above.
- The plan may choose one shared deploy contract validator or skill-local checks, provided all phase boundaries and schemas remain machine-checkable.
- Live provider checks may use the existing helper scripts and a user-authorized disposable app; deterministic offline tests remain the default maintainer gate.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope, requirements, and branch policy
- `.planning/PROJECT.md` — v1.1 source of truth, runtime preservation, and main/preview boundaries.
- `.planning/REQUIREMENTS.md` — SDS-D01 and SDS-D03 acceptance requirements.
- `.planning/ROADMAP.md` — Phase 10 goal, success criteria, and four-plan order.
- `AGENTS.md` — deploy safety rules and the `brain-deploy-preview` merge policy.

### Deploy entry and lifecycle
- `skills/sealos-deploy/SKILL.md` — entry contract, phase map, artifact inventory, safety rules, and output claims.
- `skills/sealos-deploy/modules/preflight.md` — capability, auth, workspace, and conditional tool gates.
- `skills/sealos-deploy/modules/pipeline.md` — eligibility, mode detection, resume, artifact paths, DEPLOY/UPDATE flow, and cleanup boundaries.
- `skills/sealos-deploy/modules/runtime-truth.md` — live identity, network, logs, login, object/database proof, event convergence, and acceptance checklist.
- `skills/sealos-deploy/references/live-smoke-playbooks.md` — operational Runtime Truth playbooks and stability window rules.

### Artifact and runtime helpers
- `skills/sealos-deploy/schemas/analysis.schema.json` — readiness/project analysis artifact shape.
- `skills/sealos-deploy/schemas/build-result.schema.json` — image build/push terminal artifact shape.
- `skills/sealos-deploy/schemas/state.schema.json` — deploy/update history and last-deploy state shape.
- `skills/sealos-deploy/schemas/template-match.schema.json` — GitHub template fast-path artifact shape.
- `skills/sealos-deploy/scripts/validate-artifacts.mjs` — schema validation before resume/update trust.
- `skills/sealos-deploy/scripts/sealos-footprint.mjs` — complete resource inventory and cleanup evidence.
- `skills/sealos-deploy/scripts/sealos-live-smoke.mjs` — URL, login, authenticated-route, and negative-probe evidence.
- `skills/sealos-deploy/scripts/sealos-log-scan.mjs` — baseline/final log and Event convergence evidence.
- `skills/sealos-deploy/scripts/sealos-launchpad-network.mjs` — public network, port, and App URL host matching.

### Dependency handoffs and downstream observation
- `.planning/phases/08-dependency-skill-entry-refactors/08-CONTEXT.md` — readiness, Dockerfile, Compose, preview, and quality-gate decisions.
- `.planning/phases/09-service-and-adjacent-skill-entry-refactors/09-CONTEXT.md` — database, S3, Canvas, App Builder, and shared terminal/handoff decisions.
- `skills/cloud-native-readiness/SKILL.md` — eligibility and readiness report owner.
- `skills/dockerfile-skill/SKILL.md` — packaging and runtime acceptance owner.
- `skills/docker-to-sealos/SKILL.md` — template conversion and quality-gate owner.
- `skills/sealos-database/SKILL.md` — database proof and env-key handoff.
- `skills/sealos-s3/SKILL.md` — private object-flow and credential-readiness handoff.
- `skills/sealos-canvas/SKILL.md` — verified state, sanitized read-only topology consumer.
- `skills/sealos-deploy/evals/evals.json` — existing deploy positive/violating behavior expectations.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `skills/sealos-deploy/modules/pipeline.md` already contains the full DEPLOY/UPDATE/resume artifact flow and is the behavior source to refactor around.
- `validate-artifacts.mjs`, `artifact-validator.mjs`, and the four JSON schemas provide deterministic artifact gates.
- `sealos-live-smoke.mjs`, `sealos-log-scan.mjs`, `sealos-footprint.mjs`, and `sealos-launchpad-network.mjs` already expose the Runtime Truth probes required by the phase.
- Existing deploy template, auth, build/push, rollout, and cleanup helpers should remain the execution surface.

### Established Patterns
- Node helpers use ESM, structured JSON on stdout, sanitized diagnostics, and exit codes for terminal outcomes.
- `.sealos` artifacts and `~/.sealos/logs/deploy-*.log` are repository/runtime evidence, while secrets remain outside reports.
- Dependency entries now use one-level progressive disclosure and five-field handoffs; deploy should consume these contracts instead of rediscovering source facts.
- Existing baseline/eval fixtures use positive and violating traces with explicit terminal state and redaction checks.

### Integration Points
- `sealos-deploy` receives readiness -> Dockerfile -> Docker-to-Sealos evidence before deployment and emits `.sealos/state.json` plus Runtime Truth for Canvas.
- UPDATE mode uses live Kubernetes identity and rollout helpers; DEPLOY mode uses Template API or kubectl fallback and writes state only after accepted deployment.
- Phase 11 will extend Phase 10 fixtures into the complete eight-skill behavior gate; Phase 12 will audit main/preview preservation and public release evidence.

</code_context>

<specifics>
## Specific Ideas

- Keep Runtime Truth as an acceptance gate with a first baseline and final 60-second comparison rather than a single optimistic HTTP request.
- Preserve Instance and ObjectStorageBucket in footprint and cleanup checks because both have caused incomplete cleanup reports in prior deploy work.
- Keep state/artifact evidence small and reusable so downstream Canvas and later behavior tests can consume it without re-running discovery.
- Prefer provider-free synthetic fixtures for every failure branch, with a separate user-authorized disposable-app run for live evidence.

</specifics>

<deferred>
## Deferred Ideas

- Complete eight-skill behavior grader and one documented maintainer quality command — Phase 11.
- Main/preview aligned-adapted-excluded audit, localized docs, and external host/release evidence — Phase 12.
- New deploy runtime capabilities, provider benchmark suites, or a second artifact/inventory source — outside v1.1.

</deferred>

---

*Phase: 10-Deploy Orchestration and Runtime Truth*
*Context gathered: 2026-08-07*
