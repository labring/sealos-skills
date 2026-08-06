# Roadmap: Sealos Skills v1.1 Skill Design System Optimization

## Overview

This roadmap carries the shipped v1.0 Codex installation work into v1.1. The milestone establishes one design contract for eight canonical skills, aligns every supported host projection, refactors entry points in dependency order, and closes with deterministic behavior, runtime-preservation, and release evidence. Root `skills/**` remains the only behavior source. Sealos authentication, secret handling, confirmation, cleanup, artifact, Kubernetes, and runtime-truth contracts remain authoritative. The `main` to `brain-deploy-preview` policy remains file-specific, with the preview branch retaining its prepare-only flow and Railpack/Kaniko boundary.

## Milestones

- [x] **v1.0 Sealos Codex Plugin Installation Upgrade** - Phases 1-4 shipped 2026-06-16.
- [ ] **v1.1 Skill Design System Optimization** - Phases 5-12 establish the shared contract and verification gate.

## Completed History

<details>
<summary>v1.0 Sealos Codex Plugin Installation Upgrade (shipped 2026-06-16)</summary>

The completed v1.0 work established native Codex marketplace discovery, aligned README and host metadata, hardened install validation, and captured native plus compatibility smoke evidence.

| Phase | Completed outcome |
|-------|-------------------|
| 1. Native Marketplace Discovery Contract | `sealos@sealos` was discoverable and installable through an isolated Codex marketplace. |
| 2. README and Metadata Alignment | Native installation, compatibility installation, identity, and host invocation claims were aligned. |
| 3. Validator Hardening | README, fallback, identity, registry, and JSON drift checks were enforced. |
| 4. Install Smoke and Handoff | Native and compatibility evidence, cleanup proof, and the final file handoff were captured. |

</details>

## Current Milestone: v1.1 Skill Design System Optimization

**Milestone Goal:** AI agents can reliably select and execute the right Sealos workflow with preserved safety, runtime truth, and host-consistent behavior.

## Phases

**Phase Numbering:**

- Integer phases continue the v1.0 sequence.
- Decimal phases are reserved for urgent insertions between integer phases.

- [x] **Phase 5: Baseline, Ownership, and Shared Contract** - Capture current behavior and establish the entry contract, lifecycle vocabulary, and entry-visible safety set. (completed 2026-08-06)
- [x] **Phase 6: Inventory, Router, and Validator Foundation** - Derive canonical inventory and build fixture-tested structural and semantic checks. (completed 2026-08-06)
- [x] **Phase 7: Host Adapter and Public Surface Alignment** - Align every host projection and risk-aware route around the eight canonical skills. (completed 2026-08-06)
- [x] **Phase 8: Dependency Skill Entry Refactors** - Focus readiness, Dockerfile, and Compose conversion entries while preserving their handoff and quality-gate contracts. (completed 2026-08-06)
- [x] **Phase 9: Service and Adjacent Skill Entry Refactors** - Focus database, S3, Canvas, and Desktop app entries around their risk classes and evidence outputs. (completed 2026-08-06)
- [x] **Phase 10: Deploy Orchestration and Runtime Truth** - Refactor the composite deploy entry around typed inputs and verified live outcomes. (completed 2026-08-06)
- [ ] **Phase 11: Behavior Evals, Deterministic Grader, and Maintainer Gate** - Give all eight skills executable behavior coverage and one documented local gate.
- [ ] **Phase 12: Branch Policy, Documentation, and Release Audit** - Prove preservation and publish aligned, adapted, and excluded change evidence.

## Phase Details

### Phase 5: Baseline, Ownership, and Shared Contract

**Goal**: Maintainers have a behavior-backed shared contract that makes each skill's ownership, lifecycle, and load-bearing safety visible before detailed instructions load.
**Depends on**: Phase 4 (completed v1.0 milestone)
**Requirements**: SDS-01, SDS-03, SDS-05
**Success Criteria** (what must be TRUE):

  1. A single contract matrix names discovery, scope, risk, workflow, output, handoff, lifecycle, and verification facets for all eight entry files.
  2. Every entry declares request lifetime and terminal states, and Canvas states the lifetime and shutdown condition of its temporary local server.
  3. Entry content exposes confirmation, secret redaction, kubeconfig scope, read-only boundaries, eligibility stops, quality-gate requirements, and runtime-acceptance rules before branch detail loads.
  4. Positive and violating baseline probes record current routing, mutation, stop, output, handoff, and runtime behavior for each skill.

**Plans**: 3 plans

Plans:
**Wave 1**

- [x] 05-01: Capture the eight-skill inventory, adapter matrix, runtime artifacts, and positive/violating baseline probes.

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 05-02: Define the shared entry template, lifecycle vocabulary, risk classes, and per-skill safety canaries (depends on 05-01).

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 05-03: Apply the contract skeleton to all eight entries and approve the runtime-preservation checklist (depends on 05-01 and 05-02).

**Research flag**: Standard local patterns are sufficient. Confirm exact section names and invariant phrases during phase discussion.

### Phase 6: Inventory, Router, and Validator Foundation

**Goal**: The repository has one derived view of the physical skill inventory and a fixture-tested foundation that exposes inventory, route, path, version, link, and semantic-safety drift.
**Depends on**: Phase 5
**Requirements**: SDS-09, SDS-D04
**Success Criteria** (what must be TRUE):

  1. The validator discovers exactly eight `skills/*/SKILL.md` entries and reports every missing or unexpected host projection against that set.
  2. A removed confirmation, redaction, read-only, eligibility, or fail-closed guard produces a targeted semantic-safety failure even when unrelated prose remains valid.
  3. Fixture tests reject missing routes, broken paths, frontmatter/name mismatches, stale versions, malformed eval records, and invalid progressive links.
  4. The existing Codex plugin validator remains callable, while the physical skill tree and router remain the authoritative sources.

**Plans**: 3 plans

Plans:

- [x] 06-01: Implement physical inventory discovery and constrained route/frontmatter readers (depends on the Phase 5 matrix).
- [x] 06-02: Add semantic safety canaries and red/green fixture mutations for confirmation, redaction, read-only, eligibility, and fail-closed behavior (depends on 06-01).
- [x] 06-03: Add version, path, link, metadata, and eval-schema diagnostics without introducing a second hand-maintained inventory (depends on 06-01 and 06-02).

**Research flag**: Deep research recommended for exact manifest/version fields and the boundary between derived reports and host-required files.

### Phase 7: Host Adapter and Public Surface Alignment

**Goal**: A request reaches one risk-labeled owner through every supported host surface, with host-native invocation syntax and a complete eight-skill capability map.
**Depends on**: Phase 6
**Requirements**: SDS-02, SDS-D02, SDS-D05
**Success Criteria** (what must be TRUE):

  1. A clear request selects one owner, a compound request yields an explicit ordered handoff, and an ambiguous mutation request pauses before side effects.
  2. The unified route records whether a request is observation, a local write, a cloud write, public exposure, or destructive work before delegation.
  3. Codex, Claude-compatible hosts, Qoder, CodeBuddy, Gemini/Qwen context extensions, OpenClaw, and skills.sh expose the canonical tree with their documented `$sealos`, `/sealos`, context-only, or direct-entry semantics.
  4. The Canvas exposure decision is explicit, manifests and marketplaces agree with it, and every advertised direct path resolves to an existing skill.

**Plans**: 3 plans

Plans:

- [x] 07-01: Make `commands/sealos.md` structurally parseable with one route and interaction class per skill (depends on the Phase 6 readers).
- [x] 07-02: Align plugin manifests, marketplaces, Qoder packaging, OpenAI metadata, and Canvas exposure (depends on 07-01).
- [x] 07-03: Align context adapters, platform evidence, README invocation claims, and direct skills.sh paths while retaining behavior-free adapters (depends on 07-02).

**Research flag**: Deep research recommended for host packaging semantics and the product decision on Canvas exposure.

### Phase 8: Dependency Skill Entry Refactors

**Goal**: Readiness, Dockerfile generation, and Compose conversion provide focused, one-level entry contracts and typed evidence for downstream orchestration.
**Depends on**: Phase 7
**Requirements**: SDS-06, SDS-08
**Success Criteria** (what must be TRUE):

  1. Each dependency entry names the exact module or reference loaded for a branch, and normal work reaches actionable detail through one resolvable level.
  2. Unsupported or unresolved targets stop with evidence before scoring, build, template generation, or deployment; eligible readiness output carries framework, dependency, configuration, and concern data.
  3. Dockerfile work reports owned file mutations, secret-safe handling, build evidence, HTTP/runtime proof, and a clear success, stopped, or error result.
  4. Compose conversion keeps rule precedence, MUST-map and registry coverage, topology, storage, database, and secret safeguards visible, and template delivery follows the complete quality gate.
  5. Every handoff names its input artifact, evidence, owner, allowed action, failure return, and response owner so downstream work reuses discovery.

**Plans**: 4 plans

Plans:

- [x] 08-01: Refocus `cloud-native-readiness` around eligibility-first routing, report output, and the Dockerfile handoff.
- [x] 08-02: Refocus `dockerfile-skill` around owned files, pre-existing-file policy, build/runtime acceptance, and artifact output (depends on 08-01 payload decisions).
- [x] 08-03: Refocus `docker-to-sealos` around rule precedence, one-level references, template output, and quality-gate handoff (depends on 08-02 artifact vocabulary).
- [x] 08-04: Add typed dependency payload fixtures and run each owning helper gate before handing the contract to deploy (depends on 08-01 through 08-03).

**Research flag**: Deep research recommended for Docker-to-Sealos MUST-map and registry coupling, plus the `brain-deploy-preview` Railpack/Kaniko adaptation boundary.

### Phase 9: Service and Adjacent Skill Entry Refactors

**Goal**: Database, S3, Canvas, and Desktop app workflows expose their risk boundaries, terminal evidence, and owned progressive detail while retaining domain-specific behavior.
**Depends on**: Phase 8
**Requirements**: SDS-04, SDS-D06
**Success Criteria** (what must be TRUE):

  1. Database and S3 create/reuse decisions, environment-key preservation, connectivity or object-flow proof, redaction, and public/destructive confirmation are visible in their terminal outcomes.
  2. Canvas requires verified deployment state, remains read-only, sanitizes topology data, returns its local URL/cache evidence, and states the temporary server shutdown condition.
  3. App Builder distinguishes code work from tutorials, applies SDK/source precedence, verifies a real Desktop iframe, and returns a publish handoff with the correct owner.
  4. These entries use shared success, stopped, and error vocabulary while retaining evidence fields for resources, objects, local URLs, and application integration.

**Plans**: 4 plans

Plans:

- [x] 09-01: Refocus `sealos-database` around account/workspace resolution, create-or-reuse, env mutation, confirmation, redaction, and app verification.
- [x] 09-02: Refocus `sealos-s3` around private-by-default buckets, create-or-reuse, env wiring, policy confirmation, redaction, and object verification (depends on 09-01 output vocabulary).
- [x] 09-03: Refocus `sealos-canvas` around read-only preconditions, sanitized JSON, exact outputs, and local server lifecycle.
- [x] 09-04: Refocus `sealos-app-builder` around starting-path branches, SDK precedence, iframe verification, and publish handoff (depends on the shared outcome vocabulary).

**Research flag**: Standard local helpers cover database, S3, and Canvas. Use a focused research pass only if current Desktop SDK/source precedence or external service behavior has changed.
**UI hint**: yes

### Phase 10: Deploy Orchestration and Runtime Truth

**Goal**: `sealos-deploy` orchestrates the stabilized dependency skills through typed evidence and accepts completion only from verified live runtime truth.
**Depends on**: Phase 9
**Requirements**: SDS-D01, SDS-D03
**Success Criteria** (what must be TRUE):

  1. Deploy consumes readiness, Dockerfile, and template payloads with source, owner, preconditions, and evidence, and downstream phases skip repeated discovery.
  2. Preflight, authentication, kubeconfig scope, system-tool installation, public exposure, deletion, cleanup, and secret-redaction gates remain explicit before mutations.
  3. A successful deployment reports the actual App URL and live identity, relevant setup or login proof, logs/events, workload readiness, and the complete resource footprint; stopped and error results name artifacts and the next safe action.
  4. Verified `.sealos/state.json` and deployment artifacts provide the read-only Canvas handoff without changing Canvas or deploy ownership.

**Plans**: 4 plans

Plans:

- [x] 10-01: Refocus the deploy entry around the composite phase map, preflight gates, and owned `.sealos` artifacts.
- [x] 10-02: Wire typed readiness, Dockerfile, and template handoffs into the deploy pipeline (depends on Phase 8 and 09-04 handoff contracts).
- [x] 10-03: Preserve auth, kubeconfig, tool-install, confirmation, cleanup, rollback, and branch-specific behavior while moving verbose detail into owned modules (depends on 10-01 and 10-02).
- [x] 10-04: Run Runtime Truth, footprint, log, live-smoke, and Canvas handoff checks against the preserved workflow (depends on 10-03).

**Research flag**: Deep research recommended for live runtime evidence, disposable-account and cleanup authority, and the exact boundary between `main` full deploy behavior and preview prepare-only behavior.

### Phase 11: Behavior Evals, Deterministic Grader, and Maintainer Gate

**Goal**: All eight skills and the unified router have executable behavior coverage, and maintainers have one offline quality gate that exercises the complete design contract.
**Depends on**: Phase 10
**Requirements**: SDS-07, SDS-10, SDS-11
**Success Criteria** (what must be TRUE):

  1. Every skill owns positive and violating cases for routing, scope/boundary, terminal outcomes, progressive loading, and its highest-risk action; the unified router has host and compound-request cases.
  2. Structured traces shaped as `{text, toolCalls, files}` let deterministic tests distinguish confirmation, redaction, read-only, eligibility, output, and handoff violations.
  3. One documented local command runs contract shape, inventory, routes, versions, links, safety canaries, eval schemas, behavior probes, and existing skill-specific validators with actionable failures.
  4. Success, stopped, and error outputs across all eight skills include domain evidence, artifact paths or URLs where applicable, redacted sensitive values, and a safe next action.

**Plans**: 4 plans

Plans:

- [ ] 11-01: Add missing readiness, Dockerfile, Docker-to-Sealos, and App Builder eval suites; extend the existing four suites and add router cases.
- [ ] 11-02: Implement the structured-trace behavior grader and `node:test` positive/violating tests (depends on 11-01 schemas).
- [ ] 11-03: Add fixture-driven validator tests and a single standard-library quality-gate command (depends on Phase 6 validator foundation and 11-02).
- [ ] 11-04: Publish the maintainer design-system guide with the local verification sequence and evidence policy (depends on 11-03).

**Research flag**: Deep research recommended for a pinned provider or trajectory runner, repeat/retry/cost policy, secret scope, and evidence storage. Offline deterministic checks remain the required gate.

### Phase 12: Branch Policy, Documentation, and Release Audit

**Goal**: The shipped design system has source-aware release evidence, synchronized public claims, and a verified `main` to `brain-deploy-preview` integration boundary.
**Depends on**: Phase 11
**Requirements**: SDS-12, REL-01
**Success Criteria** (what must be TRUE):

  1. A file-by-file report classifies every release change as aligned, adapted, or excluded, records both source and target commits, and preserves the preview prepare-only pipeline, Railpack delta, and Kaniko executor.
  2. Runtime and safety verification confirms preserved artifacts, phase order, authentication, confirmation gates, cleanup expectations, host semantics, and live acceptance evidence across the current workflows.
  3. README and localized public claims, manifests, platform evidence, and release version/tag fields describe the same eight-skill inventory and host invocation semantics.
  4. The final release report names the executed gates, changed files, retained branch-specific behavior, and any follow-up outside v1.1 scope.

**Plans**: 4 plans

Plans:

- [ ] 12-01: Compare the refactored entries and helpers with the preservation baseline, including artifacts, phase order, auth, cleanup, and runtime evidence.
- [ ] 12-02: Audit `main` and `brain-deploy-preview` file by file as aligned, adapted, or excluded, preserving the preview identity and prepare-only architecture (depends on 12-01).
- [ ] 12-03: Synchronize README/localized claims, inventory evidence, version fields, and release-tag checks (depends on the final adapter and validator outputs).
- [ ] 12-04: Run the complete root and owning-skill gates and publish the release audit with source-commit evidence (depends on 12-02 and 12-03).

**Research flag**: Standard repository policy is sufficient. Require an explicit current-source comparison and file-level merge audit.

## Requirement Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| SDS-01 | Phase 5 | Pending |
| SDS-02 | Phase 7 | Pending |
| SDS-03 | Phase 5 | Pending |
| SDS-04 | Phase 9 | Pending |
| SDS-05 | Phase 5 | Pending |
| SDS-06 | Phase 8 | Pending |
| SDS-07 | Phase 11 | Pending |
| SDS-08 | Phase 8 | Pending |
| SDS-09 | Phase 6 | Pending |
| SDS-D05 | Phase 7 | Pending |
| REL-01 | Phase 12 | Pending |
| SDS-10 | Phase 11 | Pending |
| SDS-11 | Phase 11 | Pending |
| SDS-D04 | Phase 6 | Pending |
| SDS-D02 | Phase 7 | Pending |
| SDS-12 | Phase 12 | Pending |
| SDS-D01 | Phase 10 | Pending |
| SDS-D03 | Phase 10 | Pending |
| SDS-D06 | Phase 9 | Pending |

**Coverage:** 19/19 v1.1 requirements mapped exactly once.

## Research Flags

Deep research during phase planning is recommended for Phases 6, 7, 8, 10, and 11. Phases 5, 9, and 12 can use the repository's established patterns unless scope changes.

## Progress

**Execution Order:**
Phases execute in numeric order: 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11 -> 12

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 5. Baseline, Ownership, and Shared Contract | v1.1 | 3/3 | Complete    | 2026-08-06 |
| 6. Inventory, Router, and Validator Foundation | v1.1 | 3/3 | Complete    | 2026-08-06 |
| 7. Host Adapter and Public Surface Alignment | v1.1 | 3/3 | Complete    | 2026-08-06 |
| 8. Dependency Skill Entry Refactors | v1.1 | 4/4 | Complete    | 2026-08-06 |
| 9. Service and Adjacent Skill Entry Refactors | v1.1 | 4/4 | Complete    | 2026-08-06 |
| 10. Deploy Orchestration and Runtime Truth | v1.1 | 4/4 | Complete    | 2026-08-06 |
| 11. Behavior Evals, Deterministic Grader, and Maintainer Gate | v1.1 | 0/4 | Not started | - |
| 12. Branch Policy, Documentation, and Release Audit | v1.1 | 0/4 | Not started | - |
