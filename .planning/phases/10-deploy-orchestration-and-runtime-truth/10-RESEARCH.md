# Phase 10: Deploy Orchestration and Runtime Truth - Research

**Researched:** 2026-08-07
**Domain:** Composite deployment orchestration, typed evidence handoffs, Kubernetes runtime verification, and Sealos deploy/preview branch boundaries
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-10-01:** Treat every upstream handoff as a typed envelope with source, owner, preconditions, input artifact, allowed action, verification evidence, redaction status, and the five stable handoff fields. Deploy validates the envelope at each boundary and returns the failed owner/condition without repeating discovery.
- **D-10-02:** Keep phase order explicit: preflight/auth/workspace -> eligibility -> optional GitHub template fast path -> mode detection -> assess/detect -> Dockerfile/build or image reuse -> template/configure -> deploy/update -> Runtime Truth -> state and handoff. A generic shortcut cannot bypass a phase or its canary.
- **D-10-03:** Optimize for stable evidence reuse: read each source/artifact once per phase, cache bounded reports in the current execution context, use repository-relative artifact paths, and keep Runtime Truth probes bounded to the selected app/namespace.

- **D-10-04:** Preserve the `.sealos` inventory and ownership: user-owned `config.json`, optional `template-match.json`, regenerated `analysis.json`, lazy `build/build-result.json`, generated `template/index.yaml`, validated `state.json` after deploy/update, and one append-only log under `~/.sealos/logs/`.
- **D-10-05:** Validate JSON artifacts before trusting resume or UPDATE state. `.sealos/state.json` is a resume hint; live App/Deployment identity, image, namespace, URL, and readiness remain the runtime authority. A state/live mismatch returns `stopped` with the exact reconciliation action.
- **D-10-06:** Keep Canvas ownership downstream: deploy writes verified `last_deploy` plus sanitized Runtime Truth fields to state and hands a read-only observation tuple to Canvas. Deploy never renders topology; Canvas never mutates deploy resources.

- **D-10-07:** Enter UPDATE only when a validated state record and a live selected deployment agree on app, namespace, and current image. Missing or unusable kubectl turns an ambiguous existing record into a stopped confirmation path; it never silently mutates a guessed target. DEPLOY creates a distinct instance only after mode is resolved.
- **D-10-08:** Keep preflight/auth/workspace and eligibility before project artifacts or provider mutation. System-tool installation, public exposure, credential changes, deletion, cleanup, and rollback require explicit confirmation with operation, impact, and post-action evidence.
- **D-10-09:** Implement Phase 10 for the full-deploy main workflow in this worktree. Preserve the documented `brain-deploy-preview` prepare-only policy as an explicit excluded boundary; any future merge into that branch requires manual adaptation and must retain Kaniko/prepare artifacts and omit full runtime deployment.

- **D-10-10:** Final `success` requires the strongest applicable Runtime Truth: actual App URL/live identity, Launchpad public-network and Service-port/host match for public web apps, fresh root response, selected signup/bootstrap/login and one authenticated route when required, recent logs and Event convergence, workload readiness, and complete footprint with `collectionOk` and `runtimeReady`.
- **D-10-11:** Apply conditional probes by workload: web apps require URL/network/HTTP/auth checks; workers and scheduled jobs require lifecycle, logs, events, and completion/readiness evidence; database-backed or S3-backed apps require the declared database/object proof. A deploy-only request can return deployment artifacts and a `stopped` runtime-pending result; it does not claim final acceptance without Runtime Truth.
- **D-10-12:** Runtime Truth uses a first baseline and a final comparison after at least one complete reconciliation window (60 seconds minimum). Active failures, restart deltas, unresolved Secrets, advancing Warning Events, readiness flaps, log errors, or incomplete footprint keep the result `stopped` or `error` with a safe remediation action.

- **D-10-13:** Cleanup is a separate confirmed mutation. Inventory `Instance`, App, Deployments/StatefulSets/DaemonSets, CronJobs, Jobs, Services, Ingresses, PVCs, KubeBlocks, and ObjectStorageBucket resources first; any listing error keeps cleanup unresolved. Report zero matching resources only after every requested listing succeeds.
- **D-10-14:** UPDATE failures preserve the previous image/state and use the existing rollout/rollback boundary. Rollback evidence records the target, previous image, rollout result, and residual footprint; historical credential residue becomes a rotation requirement and never appears as a raw value.

### the agent's Discretion
- Exact envelope serialization, helper extraction, diagnostic codes, and fixture names may follow existing Node/Python patterns when they preserve the decisions above.
- The plan may choose one shared deploy contract validator or skill-local checks, provided all phase boundaries and schemas remain machine-checkable.
- Live provider checks may use the existing helper scripts and a user-authorized disposable app; deterministic offline tests remain the default maintainer gate.

### Deferred Ideas (OUT OF SCOPE)
- Complete eight-skill behavior grader and one documented maintainer quality command — Phase 11.
- Main/preview aligned-adapted-excluded audit, localized docs, and external host/release evidence — Phase 12.
- New deploy runtime capabilities, provider benchmark suites, or a second artifact/inventory source — outside v1.1.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SDS-D01 | Terminal outputs include the strongest available evidence for the domain, such as an actual App URL and live identity, sanitized resource footprint, connection proof, object round trip, report path, or local Canvas URL. | Runtime Truth acceptance and helper outputs; footprint/live-smoke/log/network evidence. [VERIFIED: codebase grep] |
| SDS-D03 | Existing readiness, build, template, deployment-state, and Canvas handoffs use minimal typed payloads that carry evidence and prevent repeated discovery. | Five-field handoffs from Phases 8/9, deploy artifact/schema validation, and typed envelope recommendation. [VERIFIED: codebase grep] |
</phase_requirements>

## Summary

Phase 10 should refactor the existing `sealos-deploy` entry into a typed composite coordinator around behavior that already exists in `SKILL.md`, `preflight.md`, `pipeline.md`, and `runtime-truth.md`. The current implementation already has deterministic artifact schemas, eligibility and mode logic, Template API and kubectl fallback, Runtime Truth helpers, and sanitized structured reports. [VERIFIED: codebase grep] The planning risk is contract composition: the current prose contains permissive fallbacks for ambiguous state and rollback, while D-10-05, D-10-07, and D-10-14 require explicit stopped paths, live identity agreement, and post-rollback evidence. [VERIFIED: codebase grep]

The acceptance gate must remain evidence-driven. `sealos-footprint.mjs`, `sealos-launchpad-network.mjs`, `sealos-live-smoke.mjs`, and `sealos-log-scan.mjs` already cover the main web, workload, event, and cleanup signals; the deploy coordinator should compose their bounded JSON results, apply workload-specific probes, and write state only after a successful Runtime Truth result. [VERIFIED: codebase grep] Runtime Truth requires a first baseline and a final comparison after at least 60 seconds, so a single HTTP 200 or pod-ready observation cannot be the terminal success signal. [VERIFIED: codebase grep]

The implementation boundary is the full-deploy main workflow in this worktree. The remote `brain-deploy-preview` branch remains a prepare-only Kaniko flow with its own build-request and delivery-manifest artifacts; it excludes OAuth/Template API deployment, UPDATE, rollout/rollback, Canvas, and runtime smoke. [VERIFIED: git diff] Plans must keep that boundary explicit and avoid introducing main-only runtime artifacts into preview merge work.

**Primary recommendation:** Build one deploy-owned typed envelope/validation layer and one bounded Runtime Truth result, route every phase through the existing helper surface, refuse ambiguous mode or incomplete evidence, and persist only validated state plus sanitized Runtime Truth after acceptance. [VERIFIED: codebase grep]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Preflight, eligibility, phase ordering, and typed handoffs | API / Backend (CLI orchestration) | — | The local deploy entry owns sequencing, failure routing, and handoff validation. [VERIFIED: codebase grep] |
| `.sealos` artifacts and resume/update state | Database / Storage | API / Backend | JSON artifacts persist evidence and hints; the coordinator validates and consumes them. [VERIFIED: codebase grep] |
| Template API, kubectl fallback, rollout, and cleanup mutations | API / Backend | Database / Storage | Provider calls and scoped cluster mutations are owned by deploy; live resources supply authoritative state. [VERIFIED: codebase grep] |
| Runtime Truth probes and acceptance decision | API / Backend | Database / Storage | Helpers query Launchpad, HTTP/auth, logs/events, and Kubernetes resource inventory, then return structured evidence. [VERIFIED: codebase grep] |
| Sanitized observation handoff to Canvas | Browser / Client | API / Backend | Canvas consumes a read-only state tuple and renders the observation; deploy owns the verified state it emits. [VERIFIED: codebase grep] |
| Deploy audit log and redacted diagnostics | Database / Storage | API / Backend | One append-only log under `~/.sealos/logs/` stores execution evidence while helpers keep sensitive values out of reports. [VERIFIED: codebase grep] |

## Project Constraints (from AGENTS.md)

- Treat root `skills/**` as the canonical implementation and keep host manifests/adapters pointed at that source; do not add a second packaged skill copy. [VERIFIED: AGENTS.md]
- Keep Node helpers as ESM with two-space indentation, camelCase names, structured JSON on stdout, and diagnostics on stderr; keep Python four-space/snake_case conventions and the existing `unittest` validator style. [VERIFIED: AGENTS.md]
- Preserve deploy evals when user-visible deploy behavior changes. Run `node --check` and the matching helper tests for changed deploy JavaScript; run footprint and live-smoke tests when runtime contracts change. [VERIFIED: AGENTS.md]
- Keep `brain-deploy-preview` prepare-only: preserve its Kaniko flow and artifacts, evaluate `sealos-deploy` changes manually, and exclude Canvas, Sealos OAuth/Template API deployment, UPDATE, rollout/rollback, and runtime smoke from that branch. Keep the absence of `k8s-buildkit-job`. [VERIFIED: AGENTS.md]
- Do not merge main-only plugin/marketplace surfaces, main planning history, or unrelated assets into the preview branch; keep branch-owned `AGENTS.md`, `README.md`, `CLAUDE.md`, and the preview containerization diagram. [VERIFIED: AGENTS.md]
- Obtain explicit confirmation before Kubernetes/database/bucket deletion, public-access changes, credential rotation, rollback, cleanup, or system-tool installation. [VERIFIED: AGENTS.md]
- Keep passwords, tokens, kubeconfig contents, S3 secrets, `.env` values, and complete connection strings out of committed files and user-facing output. Scope Kubernetes operations to the selected namespace/app and use the Sealos kubeconfig with `--insecure-skip-tls-verify` unless an equivalent active workflow is supplied. [VERIFIED: AGENTS.md]
- Accept a deployment only after the actual App URL, required setup/login, relevant logs, workload readiness, and complete footprint are verified. Authorized test cleanup must include Instance, App, workloads, Jobs, Services, Ingresses, PVCs, and KubeBlocks. [VERIFIED: AGENTS.md]
- Inspect `git status --short` and relevant diffs before edits, preserve pre-existing changes/untracked files, keep edits scoped, and remove only artifacts made obsolete by the current change. [VERIFIED: AGENTS.md]

## Standard Stack

### Core

| Library / tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| Node.js ESM runtime | `>=18` required by the skill; `v24.13.0` available locally | Run deploy orchestration and helper scripts | The skill specifies Node 18+ and existing helpers use ESM, structured JSON stdout, and two-space JavaScript style. [VERIFIED: codebase grep] [VERIFIED: shell probe] |
| Custom artifact validator | Repository implementation | Validate `analysis.json`, `build-result.json`, `config.json`, `state.json`, and `template-match.json` before resume/update trust | Existing schemas and semantic checks avoid adding a dependency and already enforce timestamps, image, URL, and history invariants. [VERIFIED: codebase grep] |
| `kubectl` with Sealos kubeconfig | `v1.35.0` available locally | Query and mutate the selected namespace, inspect rollout, and collect footprint | The deploy contract scopes every command through the Sealos kubeconfig and live resources are the runtime authority. [VERIFIED: codebase grep] [VERIFIED: shell probe] |
| Sealos Template API client helper | Repository `deploy-template.mjs` | Submit the final template or use the documented kubectl fallback | The helper encodes auth, accepts a mode-0600 args file, allowlists diagnostics, and returns sanitized JSON. [VERIFIED: codebase grep] |

### Supporting

| Tool / helper | Version | Purpose | When to Use |
|---------------|---------|---------|-------------|
| `sealos-footprint.mjs` | Repository helper | Inventory Instance/App/workloads/jobs/services/Ingress/PVC/KubeBlocks/ObjectStorageBucket and compute `collectionOk`/`runtimeReady` | Every deploy acceptance and cleanup verification. [VERIFIED: codebase grep] |
| `sealos-launchpad-network.mjs` | Repository helper | Confirm public network, API code, expected Service port, and App URL host match | Public web workload Runtime Truth. [VERIFIED: codebase grep] |
| `sealos-live-smoke.mjs` | Repository helper | Probe fresh root, account flow, authenticated route, and negative route with redacted reports | Web applications requiring HTTP/auth evidence. [VERIFIED: codebase grep] |
| `sealos-log-scan.mjs` | Repository helper | Compare logs, pod status, restarts, readiness, and Warning Events across a 60-second window | Every Runtime Truth decision with workload-specific interpretation. [VERIFIED: codebase grep] |
| Python quality gate | Python `3.8+` and PyYAML required by the deploy skill; Python `3.14.4` available locally | Validate generated Template YAML | Phase 5 template generation and final template gate when conversion runs. [VERIFIED: codebase grep] [VERIFIED: shell probe] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Existing helper JSON reports | A new provider SDK or custom probe layer | Adds dependency and duplicates tested redaction, host matching, footprint, and convergence logic. [VERIFIED: codebase grep] |
| Custom schema package | Existing `artifact-validator.mjs` and JSON schemas | The repository already has deterministic semantic validation and no package installation is required. [VERIFIED: codebase grep] |
| A generic deploy shortcut | The explicit phase coordinator | Shortcuts can bypass eligibility, canaries, mode reconciliation, or Runtime Truth, which violates D-10-02. [VERIFIED: codebase grep] |

**Installation:** No new external package installation is required for Phase 10; use the existing repository helpers and validators. [VERIFIED: codebase grep]

## Package Legitimacy Audit

Not applicable. Phase 10 wires existing repository tools and does not recommend installing an external package. [VERIFIED: codebase grep]

## Architecture Patterns

### System Architecture Diagram

```text
CLI request
  -> preflight / auth / workspace
  -> workload eligibility
  -> optional GitHub template fast path
  -> mode resolver (validated state hint + live identity)
       | UPDATE only when app + namespace + current image agree
       | DEPLOY only after ambiguity is resolved
  -> assess / detect
  -> Dockerfile + build/push OR existing image reuse
  -> template / account configuration
  -> Template API OR scoped kubectl fallback
  -> Runtime Truth gate
       -> live App URL + identity + Launchpad/Service match (web)
       -> fresh HTTP/auth or lifecycle/DB/S3 proof
       -> footprint + logs/events baseline and final comparison
       | accepted -> validated state.json + sanitized Canvas tuple
       | stopped/error -> safe remediation, optional confirmed cleanup
```

This flow mirrors the locked phase order and keeps provider mutation before acceptance while state and Canvas handoff remain downstream of Runtime Truth. [VERIFIED: context] [VERIFIED: codebase grep]

### Recommended Project Structure

```text
skills/sealos-deploy/
├── SKILL.md                         # Entry contract, safety, lifecycle, outputs
├── modules/
│   ├── preflight.md                 # Capability/auth/workspace gates
│   ├── pipeline.md                  # Eligibility, mode, artifacts, DEPLOY/UPDATE
│   └── runtime-truth.md             # Acceptance probes and conditional workflows
├── schemas/
│   ├── analysis.schema.json
│   ├── build-result.schema.json
│   ├── config.schema.json
│   ├── state.schema.json
│   └── template-match.schema.json
└── scripts/
    ├── validate-artifacts.mjs       # JSON/schema/semantic gate
    ├── artifact-validator.mjs
    ├── deploy-template.mjs
    ├── sealos-footprint.mjs
    ├── sealos-launchpad-network.mjs
    ├── sealos-live-smoke.mjs
    └── sealos-log-scan.mjs
```

The paths above are the existing ownership boundaries; the plan should place orchestration contracts beside the deploy owner and keep helper responsibilities narrow. [VERIFIED: codebase grep]

### Pattern 1: Typed Handoff Envelope

**What:** Wrap each dependency report in an envelope that carries the owner, preconditions, artifact path, allowed action, verification evidence, redaction status, and the five stable handoff fields. [VERIFIED: context] [VERIFIED: codebase grep]

**When to use:** At readiness -> Dockerfile, Dockerfile -> deploy, template -> deploy, database/S3 -> deploy, and deploy -> Canvas boundaries. [VERIFIED: codebase grep]

**Example:**

```json
{
  "source": "cloud-native-readiness",
  "owner": "sealos-deploy",
  "preconditions": ["eligibility=eligible", "artifact=repo-relative"],
  "inputArtifact": ".sealos/analysis.json",
  "allowedAction": "build-or-reuse-image",
  "verificationEvidence": {"score": 10, "reportPath": ".sealos/analysis.json"},
  "redactionStatus": "sanitized",
  "handoff": {
    "target": "dockerfile-skill",
    "inputArtifact": ".sealos/analysis.json",
    "allowedAction": "generate-and-validate-dockerfile",
    "failureReturn": "stopped:readiness",
    "responseOwner": "cloud-native-readiness"
  }
}
```

The exact field names remain discretionary, but every boundary must be machine-checkable and must return the failed owner/condition without rediscovering project facts. [VERIFIED: context]

### Pattern 2: Bounded Evidence Cache

**What:** Read each source or artifact once during its owning phase, retain a bounded report object in the execution context, and pass repository-relative paths plus summarized evidence to later phases. [VERIFIED: context]

**When to use:** Project analysis, template matching, build result, live App identity, footprint, logs, and Canvas handoff. [VERIFIED: context] [VERIFIED: codebase grep]

```js
const evidence = new Map();

function rememberEvidence(key, report) {
  evidence.set(key, report);
  return report;
}

const stateHint = rememberEvidence("state", validateStateArtifact(statePath));
const runtimeTruth = rememberEvidence("runtime", await collectRuntimeTruth(target));
```

The cache is an execution-context optimization; `.sealos` remains the durable artifact owner and the live cluster remains authority for identity/readiness. [VERIFIED: context] [VERIFIED: codebase grep]

### Pattern 3: Explicit Mode Reconciliation

**What:** Validate JSON state, query the live selected App/Deployment, compare app, namespace, current image, URL, and readiness, then choose UPDATE, distinct DEPLOY, or a stopped confirmation path. [VERIFIED: context] [VERIFIED: codebase grep]

**When to use:** Every resume and every run with `.sealos/state.json` or a discovered existing deployment. [VERIFIED: context]

```text
validated state + live selected deployment
  -> all identity/image fields agree -> UPDATE allowed
  -> no usable kubectl or any ambiguity -> stopped + exact reconciliation action
  -> no validated existing deployment -> distinct DEPLOY
```

The current pipeline prose has permissive “deploy/new instance” fallbacks when discovery fails; Phase 10 must tighten this behavior to the locked stopped path. [VERIFIED: codebase grep] [VERIFIED: context]

### Pattern 4: Runtime Truth Acceptance Gate

**What:** Run the strongest applicable probes, collect first-baseline evidence, wait for a complete 60-second reconciliation window, run final comparison, and accept only when required signals are clean. [VERIFIED: context] [VERIFIED: codebase grep]

**When to use:** Every normal deploy/update completion. A deploy-only request may end `stopped` with runtime-pending artifacts. [VERIFIED: context]

```text
deploy response
  -> live identity + App URL
  -> footprint collection
  -> Launchpad/HTTP/auth or worker/DB/S3 conditional proof
  -> initial logs/events baseline
  -> wait >= 60 seconds
  -> final logs/events comparison
  -> collectionOk && runtimeReady && conditional probes clean
       -> write state + Canvas observation
       -> otherwise stopped/error + remediation
```

### Pattern 5: Confirmed Cleanup and Rollback Evidence

**What:** Keep cleanup and rollback as explicit mutations with confirmation, inventory before/after, and redacted evidence. Cleanup reports zero only after all requested resource listings succeed; UPDATE rollback records target, previous image, rollout result, and residual footprint. [VERIFIED: context] [VERIFIED: codebase grep]

**When to use:** User-authorized teardown, failed rollout, failed Runtime Truth recovery, and tests that validate resource hygiene. [VERIFIED: AGENTS.md] [VERIFIED: codebase grep]

### Anti-Patterns to Avoid

- **State-as-authority:** Treating a valid-looking `.sealos/state.json` as proof of a live target causes stale or wrong-image UPDATEs; compare it with live App/Deployment identity first. [VERIFIED: context] [VERIFIED: codebase grep]
- **Optimistic success:** Treating Template API 201, pod readiness, or HTTP 200 as final acceptance skips network, auth, event, log, and full-footprint evidence. [VERIFIED: codebase grep]
- **Generic shortcut:** Jumping directly from source to build/deploy bypasses eligibility, optional fast path, mode reconciliation, or phase canaries. [VERIFIED: context]
- **Unbounded rediscovery:** Re-reading source files and rerunning provider discovery in every phase produces conflicting reports and violates evidence reuse. [VERIFIED: context]
- **Preview contamination:** Copying full-deploy runtime helpers, OAuth, UPDATE, or Canvas into `brain-deploy-preview` changes its prepare-only contract. [VERIFIED: AGENTS.md] [VERIFIED: git diff]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON artifact and state validation | Ad hoc field checks in each phase | `validate-artifacts.mjs` + `artifact-validator.mjs` + the existing schemas | Central semantic checks already cover required fields, timestamp ordering, image/tag consistency, URL shape, and history invariants. [VERIFIED: codebase grep] |
| Public-network and Service/App host matching | A raw curl to the returned URL | `sealos-launchpad-network.mjs` | It queries Launchpad, checks public network and expected port, compares the live App URL host, and redacts raw response fields. [VERIFIED: codebase grep] |
| Authenticated web smoke | Bespoke login/cookie/token code in the coordinator | `sealos-live-smoke.mjs` | It supports cookie-JSON and JSON-token flows, dynamic CSRF, authenticated/negative probes, and sensitive-value redaction. [VERIFIED: codebase grep] |
| Log/Event convergence | Grep output once after deployment | `sealos-log-scan.mjs` with baseline and final comparison | It distinguishes observed, historical-transient, and active failures, tracks restart/readiness deltas, and enforces the minimum comparison window. [VERIFIED: codebase grep] |
| Full resource inventory | A hand-picked Deployment/Pod list | `sealos-footprint.mjs` | It includes Instance, App, all workload types, Jobs/CronJobs, Services, Ingresses, PVCs, KubeBlocks, and ObjectStorageBucket, and exposes listing errors via `collectionOk`. [VERIFIED: codebase grep] |
| Template API auth/diagnostic handling | Direct fetch with raw args or response logging | `deploy-template.mjs` | It uses the existing kubeconfig/auth encoding, mode-0600 args-file contract, response allowlist, and sanitizer. [VERIFIED: codebase grep] |
| Template YAML quality validation | A new YAML parser/checklist in deploy orchestration | The existing `docker-to-sealos` Python quality gate | The quality gate is the owning skill's contract and is already required before deployment. [VERIFIED: codebase grep] |

**Key insight:** Phase 10 is an evidence composition problem. Existing helpers encode provider-specific edge cases and secrecy controls; duplicating them in a new coordinator would create divergent acceptance and redaction behavior. [VERIFIED: codebase grep]

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Project-local `.sealos/config.json`, optional `template-match.json`, regenerated `analysis.json`, lazy `build/build-result.json`, generated `template/index.yaml`, and validated `state.json`; state records `last_deploy` and history. [VERIFIED: codebase grep] | Keep ownership stable. Add the sanitized Runtime Truth fields required by D-10-04 through a schema-compatible plan or an explicitly linked bounded report; validate before resume/UPDATE. No database migration is defined by this phase. [VERIFIED: context] |
| Live service config | Selected Sealos Instance/App and namespace resources, Launchpad public-network configuration, Services/Ingresses, KubeBlocks, and ObjectStorageBucket are live provider state queried through helpers; provider UI/database configuration is absent from git. [VERIFIED: codebase grep] | Use read-only inventory and identity probes before mutation. Treat listing errors and state/live mismatches as unresolved. Any live cleanup requires confirmation and post-action evidence. [VERIFIED: context] |
| OS-registered state | `~/.sealos/auth.json`, `~/.sealos/kubeconfig`, and one append-only `~/.sealos/logs/deploy-*.log` are referenced by the workflow. Repository evidence contains no scheduler, pm2, launchd, or systemd registration for this phase. [VERIFIED: codebase grep] | Preserve auth/kubeconfig permissions and redact their contents. Verify host registrations only if the execution environment adds them; no repository migration is currently specified. [VERIFIED: AGENTS.md] |
| Secrets/env vars | Auth metadata, kubeconfig credentials, Template API args, image-registry credentials, app bootstrap credentials, and database/S3 values flow through files or environment variables; helper contracts require mode-0600 args and sanitized reports. [VERIFIED: codebase grep] | Keep raw values out of stdout, logs, state, fixtures, and handoffs. Record only key names or redaction status; historical credential residue becomes a rotation requirement. [VERIFIED: context] |
| Build artifacts / installed packages | Main workflow owns `.sealos/build/build-result.json` and `.sealos/template/index.yaml`; preview owns Kaniko `build-request.json` and `delivery-manifest.json` artifacts on its branch. [VERIFIED: git diff] | Preserve main inventory in this phase. Keep preview artifacts and Kaniko flow intact during any future manual adaptation; do not introduce a second packaged skill source. [VERIFIED: AGENTS.md] |

## Common Pitfalls

### Pitfall 1: Valid state treated as live authority

**What goes wrong:** A stale or tampered state record can select the wrong app, namespace, or image for UPDATE. [VERIFIED: context]  
**Why it happens:** The current pipeline reads `last_deploy` and has permissive discovery fallbacks. [VERIFIED: codebase grep]  
**How to avoid:** Validate JSON, query the live selected deployment, compare identity/image/namespace/URL/readiness, and stop with an exact reconciliation action on mismatch. [VERIFIED: context]  
**Warning signs:** Missing kubectl, ambiguous discovery, changed live image, missing App, or URL host mismatch. [VERIFIED: codebase grep]

### Pitfall 2: State written before Runtime Truth

**What goes wrong:** Later UPDATE or Canvas reads a state record that claims success while the app is unreachable or unstable. [VERIFIED: codebase grep]  
**Why it happens:** Deployment API success and pod readiness are mistaken for application acceptance. [VERIFIED: codebase grep]  
**How to avoid:** Write validated state only after conditional Runtime Truth, final event/log convergence, `collectionOk`, and `runtimeReady` pass. [VERIFIED: context]  
**Warning signs:** `state.json` exists after failed live smoke, missing App URL, or runtime report contains active findings. [VERIFIED: codebase grep]

### Pitfall 3: Public web check omits Launchpad or host/port agreement

**What goes wrong:** A URL can respond through an internal or mismatched route while the public App network is missing or points to another host/port. [VERIFIED: codebase grep]  
**Why it happens:** HTTP is tested before Launchpad and Service metadata are checked. [VERIFIED: codebase grep]  
**How to avoid:** Run Launchpad/network evidence before HTTP; require public network, API success, numeric Service-port match, and App URL host match. [VERIFIED: codebase grep]  
**Warning signs:** Launchpad API error, no public domain, port mismatch, or returned host different from live App `spec.data.url`. [VERIFIED: codebase grep]

### Pitfall 4: Incomplete footprint or optimistic cleanup

**What goes wrong:** Instance, ObjectStorageBucket, Jobs, PVCs, or provider-specific objects remain while the report says cleanup or readiness is complete. [VERIFIED: context]  
**Why it happens:** Hand-written inventory lists only Deployments/Pods, or a failed list is interpreted as empty. [VERIFIED: codebase grep]  
**How to avoid:** Use `sealos-footprint.mjs`, include every required resource type, require `collectionOk:true`, and report zero only after all lists succeed. [VERIFIED: context]  
**Warning signs:** `errors` in footprint output, `cleanupComplete:false`, missing Instance, or missing bucket collection. [VERIFIED: codebase grep]

### Pitfall 5: Event history misclassified as an active failure

**What goes wrong:** A transient startup Warning or completed init Job blocks a healthy app, or an advancing Warning/restart is missed. [VERIFIED: codebase grep]  
**Why it happens:** The coordinator scans once and lacks a baseline or last-seen comparison. [VERIFIED: codebase grep]  
**How to avoid:** Use the log scanner's initial baseline, wait at least 60 seconds, compare count/lastSeen/restarts/readiness, and preserve historical-transient classification only when evidence is stable/resolved. [VERIFIED: context] [VERIFIED: codebase grep]  
**Warning signs:** `baselineIncomplete`, active findings after the final scan, restart deltas, unresolved Secrets, or advancing Warning Events. [VERIFIED: codebase grep]

### Pitfall 6: Sensitive args or provider responses leak into diagnostics

**What goes wrong:** Bootstrap passwords, tokens, kubeconfig material, connection strings, or raw Template API responses become durable log/state/fixture content. [VERIFIED: AGENTS.md]  
**Why it happens:** Arguments are passed inline, parser errors include raw input, or response bodies are logged for debugging. [VERIFIED: codebase grep]  
**How to avoid:** Use mode-0600 args files, allowlisted/sanitized responses, key names only, and redacted structured diagnostics. [VERIFIED: codebase grep]  
**Warning signs:** Raw values in stdout, `.sealos`, `~/.sealos/logs`, test snapshots, or `rawJson` fields. [VERIFIED: codebase grep]

### Pitfall 7: UPDATE rollback loses previous evidence

**What goes wrong:** A failed image rollout leaves state pointing at the target image or reports rollback without residual resource evidence. [VERIFIED: context]  
**Why it happens:** The existing rollback prose restores the image but does not require a complete post-rollback evidence envelope. [VERIFIED: codebase grep]  
**How to avoid:** Capture target and previous image before mutation, retain previous state on failure, run rollout/rollback, collect residual footprint and Runtime Truth, and record the remediation. [VERIFIED: context]  
**Warning signs:** `last_deploy.image` equals the failed target, no rollback result, or no residual footprint report. [VERIFIED: codebase grep]

### Pitfall 8: Preview branch accidentally receives full-deploy behavior

**What goes wrong:** A merge adds OAuth, Template API deployment, UPDATE, runtime smoke, Canvas, or main-only artifacts to the prepare-only preview workflow. [VERIFIED: AGENTS.md] [VERIFIED: git diff]  
**Why it happens:** Main and preview share the `sealos-deploy` name while their artifact contracts and execution surfaces differ. [VERIFIED: git diff]  
**How to avoid:** Keep Phase 10 implementation scoped to main; require manual adaptation for preview, preserving Kaniko and prepare artifacts and excluding full runtime deployment. [VERIFIED: context] [VERIFIED: AGENTS.md]  
**Warning signs:** `skills/sealos-deploy/scripts/sealos-live-smoke.mjs` or Canvas appears on preview, `build-request.json` disappears, or `delivery-manifest.json` is replaced by main state artifacts. [VERIFIED: git diff]

### Pitfall 9: Local environment assumptions block deterministic gates

**What goes wrong:** The plan reaches Docker build or template quality validation without Docker/buildx/PyYAML available. [VERIFIED: shell probe]  
**Why it happens:** Conditional preflight checks are treated as universal tool requirements or bypassed. [VERIFIED: codebase grep]  
**How to avoid:** Probe tools before the phase, choose existing-image/materialized-template paths only where their gates still hold, and make missing PyYAML/Docker explicit blockers or authorized setup tasks. [VERIFIED: codebase grep] [VERIFIED: shell probe]  
**Warning signs:** Docker daemon unavailable, `ModuleNotFoundError: yaml`, or a helper emits a conditional dependency warning. [VERIFIED: shell probe]

## Code Examples

Verified patterns from the repository:

### Validate before resume or UPDATE

```bash
node skills/sealos-deploy/scripts/validate-artifacts.mjs --dir .sealos
```

The validator scans existing project artifacts and exits nonzero when schema or semantic checks fail; callers should stop before trusting resume or UPDATE. [VERIFIED: codebase grep]

### Collect the bounded footprint

```bash
node skills/sealos-deploy/scripts/sealos-footprint.mjs \
  --namespace "$SEALOS_NAMESPACE" \
  --app "$SEALOS_APP" \
  --kubeconfig "$HOME/.sealos/kubeconfig"
```

The report keeps the selected namespace/app scope, includes required resource types, and distinguishes collection errors from runtime readiness. [VERIFIED: codebase grep]

### Run public-network and live smoke evidence

```bash
node skills/sealos-deploy/scripts/sealos-launchpad-network.mjs \
  --app "$SEALOS_APP" \
  --app-url "$LIVE_APP_URL" \
  --expected-port 3000 \
  --namespace "$SEALOS_NAMESPACE"

node skills/sealos-deploy/scripts/sealos-live-smoke.mjs \
  --app-url "$LIVE_APP_URL" \
  --root-path / \
  --auth-config-file "$AUTH_CONFIG_FILE"
```

Launchpad evidence must precede public HTTP acceptance; live smoke reports root, configured/authenticated, and negative probes with credential redaction. [VERIFIED: codebase grep]

### Enforce the convergence window

```bash
node skills/sealos-deploy/scripts/sealos-log-scan.mjs \
  --namespace "$SEALOS_NAMESPACE" \
  --app "$SEALOS_APP" \
  --since 10m \
  --tail 300

node skills/sealos-deploy/scripts/sealos-log-scan.mjs \
  --namespace "$SEALOS_NAMESPACE" \
  --app "$SEALOS_APP" \
  --baseline "$BASELINE_REPORT" \
  --min-window-seconds 60
```

The scanner requires a matching baseline and a minimum 60-second elapsed window for comparison, then reports active failures, restart/readiness deltas, and Event convergence. [VERIFIED: codebase grep]

### Gate state persistence on acceptance

```text
runtimeTruth = collectRuntimeTruth(target)
if runtimeTruth.ok != true:
    return { terminalState: "stopped", reason: runtimeTruth, safeNextAction: remediation }

state = writeValidatedState(lastDeploy, sanitize(runtimeTruth))
return { terminalState: "success", statePath: ".sealos/state.json", canvasTuple: readOnlyTuple(state) }
```

This sequencing preserves the locked state authority and Canvas boundary: deploy writes verified `last_deploy` plus sanitized Runtime Truth, while Canvas receives observation only. [VERIFIED: context]

## State of the Art

| Old approach | Current approach | When changed | Impact |
|--------------|------------------|--------------|--------|
| Treat Template API 201 or pod readiness as deployment success | Require live identity, network/HTTP/auth or workload-specific proof, logs/events convergence, and complete footprint | Runtime Truth contract in current main skill | Success claims become evidence-backed and state is written only after acceptance. [VERIFIED: codebase grep] |
| Use `.sealos/state.json` as the selected target | Treat state as a validated resume hint and reconcile with live App/Deployment identity/image/namespace | D-10-05 and current mode logic | Ambiguous UPDATEs stop instead of mutating a guessed target. [VERIFIED: context] |
| One post-deploy log scan | First baseline plus final comparison after a 60-second window | Current `sealos-log-scan.mjs` contract | Historical transient events are separated from advancing active failures. [VERIFIED: codebase grep] |
| Preview and main share a deploy artifact flow | Main owns full deploy/runtime; `brain-deploy-preview` owns prepare-only Kaniko artifacts | Branch policy and current branch diff | Merge work requires manual adaptation and preserves preview-only contracts. [VERIFIED: AGENTS.md] [VERIFIED: git diff] |

**Deprecated/outdated:**

- A silent “deploy a new instance” fallback after ambiguous existing state is incompatible with D-10-07 and must become a stopped reconciliation path. [VERIFIED: context] [VERIFIED: codebase grep]
- A cleanup report based on a partial resource list or a failed list command is incomplete under D-10-13. [VERIFIED: context] [VERIFIED: codebase grep]
- Raw provider response/argument logging is incompatible with the current redaction contracts. [VERIFIED: AGENTS.md] [VERIFIED: codebase grep]

## Assumptions Log

All substantive implementation claims in this document were verified against repository files, git branch diffs, or local shell probes. [VERIFIED: codebase grep] [VERIFIED: git diff] [VERIFIED: shell probe]

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Phase 10 implementation target remains the full-deploy main workflow in the current worktree. | Summary / State of the Art | A different branch target would change artifact ownership and allowed mutations; the context decision must be re-opened. |

## Open Questions

1. **Where should sanitized Runtime Truth fields live in `state.json`?**
   - What we know: D-10-04 requires verified `last_deploy` plus sanitized Runtime Truth fields in state, while the current `state.schema.json` requires a closed set of deploy/update fields and has no Runtime Truth object. [VERIFIED: context] [VERIFIED: codebase grep]
   - What's unclear: Whether to extend `state.schema.json` with a bounded `runtime_truth` object, store a relative Runtime Truth report path, or use both while retaining Canvas compatibility.
   - Recommendation: Choose one schema-backed, bounded representation in the plan and add validator/fixture coverage before changing state writers. [VERIFIED: context] [VERIFIED: codebase grep]

2. **How should a runtime-pending deploy-only result be represented?**
   - What we know: D-10-11 allows deployment artifacts plus `stopped` runtime-pending, and the current state schema models successful deploy/update history. [VERIFIED: context] [VERIFIED: codebase grep]
   - What's unclear: Whether runtime-pending writes a separate report only, a stopped terminal envelope, or a state record explicitly marked unaccepted.
   - Recommendation: Keep final success/state acceptance coupled to Runtime Truth and define a machine-checkable stopped envelope without making an unverified deployment look resumable as success. [VERIFIED: context]

3. **How should the existing baseline fixture reference to `delivery-manifest.json` be reconciled?**
   - What we know: `tests/fixtures/skill-design-baseline.json` lists `.sealos/delivery-manifest.json` for a positive deploy case, while the current main `.sealos` inventory and schemas use `state.json` and `build-result.json`; `delivery-manifest.schema.json` belongs to the preview branch. [VERIFIED: codebase grep] [VERIFIED: git diff]
   - What's unclear: Whether Phase 10 should update the fixture now or leave the complete behavior fixture migration to Phase 11.
   - Recommendation: Keep the main implementation aligned to D-10-04 and flag the fixture drift as a planned compatibility update, with Phase 11 owning the complete eight-skill grader. [VERIFIED: context] [VERIFIED: git diff]

4. **What deterministic fixture names cover each conditional Runtime Truth branch?**
   - What we know: Existing helper tests cover footprint, Launchpad, live smoke, log convergence, and deploy-template secrecy; deploy evals cover web, DB, S3, cleanup, bootstrap, and rollback scenarios. [VERIFIED: codebase grep]
   - What's unclear: The exact new composite envelope fixtures and whether worker/scheduled/DB/S3 proof should be separate reports or a unified result.
   - Recommendation: Add provider-free synthetic positive/violating envelopes per workload class and keep one composite acceptance validator. [VERIFIED: context] [VERIFIED: codebase grep]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | All deploy helpers and orchestration | ✓ | `v24.13.0` | —; skill minimum is Node 18+. [VERIFIED: shell probe] [VERIFIED: codebase grep] |
| npm | Node helper maintenance | ✓ | `11.6.2` | No package install planned. [VERIFIED: shell probe] |
| Python | Template quality gate | ✓ | `3.14.4` | —. [VERIFIED: shell probe] |
| PyYAML | Template quality gate | ✗ | — (`ModuleNotFoundError`) | Blocking for local template-generation/quality-gate path; use a user-authorized install or a prevalidated materialized template/image path without bypassing the final gate. [VERIFIED: shell probe] [VERIFIED: codebase grep] |
| Docker daemon / Docker CLI | Local Dockerfile build/push | ✗ | — | Reuse an existing compatible image or obtain explicit authorization for tool setup; do not claim a local build. [VERIFIED: shell probe] [VERIFIED: codebase grep] |
| Docker Buildx | Local build path | ✗ | — | Same image-reuse or authorized setup path. [VERIFIED: shell probe] |
| `kubectl` | UPDATE, rollout, footprint, logs, cleanup | ✓ | `v1.35.0` | —; keep Sealos kubeconfig scope. [VERIFIED: shell probe] [VERIFIED: AGENTS.md] |
| Sealos auth metadata and kubeconfig | Authenticated provider/runtime checks | ✓ | Authenticated check passed; values withheld | —; preserve permissions and redact contents. [VERIFIED: shell probe] [VERIFIED: AGENTS.md] |
| `gh` | GitHub URL clone/template fast path | ✓ | `2.86.0` | Local repository path or authenticated git flow where the selected path supports it. [VERIFIED: shell probe] |
| `git` | Repository metadata and GitHub source path | ✓ | `2.50.1` | —. [VERIFIED: shell probe] |
| `curl` | HTTP/Launchpad probes and preflight | ✓ | `8.7.1` | —. [VERIFIED: shell probe] |
| `jq` | Structured shell diagnostics where used | ✓ | `1.7.1` | Node JSON parsing remains the primary helper path. [VERIFIED: shell probe] |
| `crane` | Conditional registry/image inspection | ✓ | `0.21.7` | Existing image reuse path can be constrained if registry inspection is unavailable. [VERIFIED: shell probe] |
| `kompose` | Conditional Compose conversion | ✗ | — | Compose path requires explicit install or a supported non-Compose input; do not silently skip conversion. [VERIFIED: shell probe] [VERIFIED: codebase grep] |

**Missing dependencies with no fallback:** PyYAML for a local template-generation quality gate, Docker/buildx for a local build, and kompose for a Compose-specific conversion path require an explicit setup or a scoped alternative path. [VERIFIED: shell probe] [VERIFIED: codebase grep]

**Missing dependencies with fallback:** Docker/buildx can use an existing compatible image where the pipeline's image and acceptance gates permit it; PyYAML can use a materialized, prevalidated template only when the owning quality gate remains satisfied. [VERIFIED: codebase grep]

## Security Domain

Security enforcement is enabled in `.planning/config.json` with ASVS level 1. [VERIFIED: codebase grep]

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | Use `sealos-auth.mjs` device/auth metadata checks and require authenticated kubeconfig/provider access before project discovery. [VERIFIED: codebase grep] |
| V3 Session Management | yes | Preserve auth metadata and kubeconfig permissions; scope each command to the selected region/namespace/workspace and avoid exposing session material. [VERIFIED: AGENTS.md] [VERIFIED: codebase grep] |
| V4 Access Control | yes | Compare live App/Deployment identity, enforce namespace/app scope, and require explicit confirmation for public exposure, credential changes, deletion, cleanup, and rollback. [VERIFIED: context] [VERIFIED: AGENTS.md] |
| V5 Input Validation | yes | Validate JSON artifacts and semantic invariants, require absolute App URLs/valid ports, validate args files and template inputs, and fail closed on ambiguous mode. [VERIFIED: codebase grep] [VERIFIED: context] |
| V6 Cryptography | yes | Use existing auth/token encoding and platform credential mechanisms; never implement custom encryption or credential derivation in the coordinator. [VERIFIED: codebase grep] |

### Known Threat Patterns for Sealos deploy orchestration

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Kubeconfig, token, bootstrap, DB, or S3 material enters stdout/log/state | Information disclosure | Mode-0600 args files, sanitizer/allowlist helpers, redacted key names, and no raw connection strings. [VERIFIED: AGENTS.md] [VERIFIED: codebase grep] |
| Stale state selects the wrong namespace/app/image | Tampering | Schema validation plus live identity/image/namespace comparison; stopped reconciliation on mismatch. [VERIFIED: context] |
| Public URL or Launchpad route points to an unexpected host/port | Spoofing / tampering | Launchpad-before-HTTP check, public network requirement, Service-port comparison, and live App URL host match. [VERIFIED: codebase grep] |
| Cleanup or rollback mutates provider resources without complete evidence | Tampering / repudiation | Explicit confirmation with operation/impact/post evidence, inventory before mutation, residual footprint, and redacted audit log. [VERIFIED: context] [VERIFIED: AGENTS.md] |
| Raw provider error or event data is treated as final state | Denial of service / information disclosure | Allowlisted diagnostics, bounded reports, baseline/final convergence, and `collectionOk`/`runtimeReady` gates. [VERIFIED: codebase grep] |

## Validation Notes

Nyquist validation is explicitly disabled in `.planning/config.json`, so this research omits the `Validation Architecture` section. [VERIFIED: codebase grep] Existing deterministic helper tests still pass in this worktree: footprint 3/3, Launchpad network 9/9, live smoke 5/5, log scan 12/12, and deploy-template 10/10; all seven targeted helper files also pass `node --check`. [VERIFIED: shell probe]

## Sources

### Primary (HIGH confidence)

- `10-CONTEXT.md`, `PROJECT.md`, `REQUIREMENTS.md`, and `ROADMAP.md` — locked scope, requirements, artifact ownership, Runtime Truth acceptance, and branch boundary. [VERIFIED: codebase grep]
- `AGENTS.md` — deploy safety rules, helper conventions, and `brain-deploy-preview` merge policy. [VERIFIED: codebase grep]
- `skills/sealos-deploy/SKILL.md`, `modules/preflight.md`, `modules/pipeline.md`, and `modules/runtime-truth.md` — current main entry contract, phase flow, auth, artifacts, deployment, update, cleanup, and acceptance behavior. [VERIFIED: codebase grep]
- `skills/sealos-deploy/scripts/artifact-validator.mjs`, `validate-artifacts.mjs`, and `schemas/*.schema.json` — machine-checkable artifact and state constraints. [VERIFIED: codebase grep]
- `skills/sealos-deploy/scripts/sealos-footprint.mjs`, `sealos-launchpad-network.mjs`, `sealos-live-smoke.mjs`, `sealos-log-scan.mjs`, and `deploy-template.mjs` — reusable Runtime Truth, cleanup, networking, redaction, and API evidence. [VERIFIED: codebase grep]
- `skills/sealos-deploy/scripts/test-*.mjs` and `skills/sealos-deploy/evals/evals.json` — deterministic helper coverage and positive/violating deploy behavior expectations. [VERIFIED: codebase grep]
- `git diff upstream/brain-deploy-preview..main` and branch file inspection — full-deploy main versus prepare-only preview artifact and helper boundary. [VERIFIED: git diff]

### Secondary (MEDIUM confidence)

- None. This phase is internal orchestration research and all material claims were checked against repository sources or local probes. [VERIFIED: codebase grep]

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — existing repository helpers, schemas, and local runtime versions were inspected and probed. [VERIFIED: codebase grep] [VERIFIED: shell probe]
- Architecture: HIGH — locked context decisions align with current module boundaries and upstream/downstream handoff contracts. [VERIFIED: context] [VERIFIED: codebase grep]
- Pitfalls: HIGH — identified from current fallback behavior, helper tests, safety rules, and branch diff. [VERIFIED: codebase grep] [VERIFIED: git diff]

**Research date:** 2026-08-07
**Valid until:** 2026-09-06, or until deploy helper contracts, state schemas, or main/preview branch policy changes. [VERIFIED: codebase grep]
