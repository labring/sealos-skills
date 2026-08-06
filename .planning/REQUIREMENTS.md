# Requirements: Sealos Skills v1.1 Skill Design System Optimization

**Defined:** 2026-08-06
**Core Value:** AI agents can reliably select and execute the right Sealos workflow with preserved safety, runtime truth, and host-consistent behavior.

## v1 Requirements

Requirements committed for the v1.1 milestone. Each requirement maps to one roadmap phase during roadmap creation.

### Shared Contract and Safety

- [x] **SDS-01**: Every one of the eight canonical skill entry points exposes the same contract facets for identity, discovery, scope, boundaries, risk, workflow, output, handoff, and verification.
- [x] **SDS-02**: A user request with a clear owner selects one skill, a compound request produces an explicit ordered handoff, and an ambiguous mutation request pauses before side effects.
- [x] **SDS-03**: Each skill declares request-scoped lifecycle behavior and a terminal state; `sealos-canvas` declares the lifecycle and shutdown condition of its temporary local server.
- [x] **SDS-04**: Destructive actions, public exposure, credential changes, and system-tool installation remain behind explicit user confirmation gates.
- [x] **SDS-05**: Entry files expose confirmation, secret redaction, kubeconfig scope, read-only boundaries, eligibility stop conditions, quality-gate requirements, and runtime-acceptance rules before branch-specific detail loads.
- [x] **SDS-06**: Each skill uses one level of progressive disclosure with resolvable links, owned detail, and explicit conditions for loading modules, references, knowledge, or scripts.
- [ ] **SDS-07**: Each skill reports success, stopped, and error outcomes with domain evidence, artifact paths or URLs where applicable, a safe next action, and redacted sensitive values.
- [x] **SDS-08**: Every existing cross-skill handoff names its input, evidence, owner, allowed action, failure return, and response owner, allowing downstream work to reuse prior discovery.

### Inventory and Host Distribution

- [x] **SDS-09**: The eight physical skill entry files under `skills/` define the canonical inventory, and every explicit router, plugin manifest, marketplace, context adapter, platform registry, and direct-entry claim matches that inventory.
- [x] **SDS-D05**: Codex, Claude-compatible hosts, Qoder, CodeBuddy, Gemini/Qwen context extensions, OpenClaw, and skills.sh expose the canonical skill tree with host-accurate invocation syntax and behavior-free adapters.
- [ ] **REL-01**: Release preparation produces an aligned/adapted/excluded file audit for `main` and `brain-deploy-preview`, updates affected public inventory and version evidence, and preserves the preview prepare-only workflow.

### Validation and Behavior

- [ ] **SDS-10**: All eight skills own behavior coverage for routing, boundaries, terminal outputs, and their highest-risk action, with positive and violating cases represented in machine-readable fixtures or deterministic probes.
- [ ] **SDS-11**: Maintainers can run one documented local quality gate covering contract shape, inventory, routes, versions, links, safety invariants, behavior probes, and existing skill-specific validators.
- [x] **SDS-D04**: Semantic safety checks pair static canaries with confirmation, redaction, read-only, eligibility, and fail-closed behavior probes so equivalent wording preserves the operational guard.
- [x] **SDS-D02**: The unified router classifies observation, local writes, cloud writes, public exposure, and destructive actions before delegating to an owning skill.

### Runtime Evidence and Output Design

- [ ] **SDS-12**: Entry refactors preserve existing artifacts, phase order, authentication, confirmation gates, cleanup expectations, runtime verification, host semantics, and branch-specific behavior for the current workflows.
- [ ] **SDS-D01**: Terminal outputs include the strongest available evidence for the domain, such as an actual App URL and live identity, sanitized resource footprint, connection proof, object round trip, report path, or local Canvas URL.
- [ ] **SDS-D03**: Existing readiness, build, template, deployment-state, and Canvas handoffs use minimal typed payloads that carry evidence and prevent repeated discovery.
- [x] **SDS-D06**: Skills share terminal-state and evidence vocabulary while retaining domain-specific output fields for deployment, data services, conversion, Canvas, and Desktop app development.

## v2 Requirements

Deferred capabilities acknowledged during research and excluded from the v1.1 roadmap.

### Evaluation and Automation

- **FUT-01**: Provider-backed prompt benchmarks, trajectory comparison, and prompt-load measurement run through a pinned runner with an explicit cost, retry, secret, and evidence policy.
- **FUT-02**: Host adapters can be generated automatically from canonical inventory when repeated manual drift justifies generation and a reproducible generator is maintained.
- **FUT-03**: A machine-readable contract DSL or committed inventory projection is introduced when a host protocol requires a physical transformed copy and its ownership and regeneration path are defined.

### Runtime Expansion

- **FUT-04**: Sealos runtime capabilities receive a separate product and safety design before entering the skill design system.
- **FUT-05**: Persistent modes, hooks, persona/intensity systems, or session state receive a separate Sealos workflow justification before adoption.

## Out of Scope

| Feature | Reason |
|---------|--------|
| New deploy, database, S3, Canvas, app-builder, readiness, Dockerfile, or Compose runtime capabilities | v1.1 optimizes skill contracts and verification while preserving current runtime behavior. |
| A second hand-maintained copy of `skills/**` | Root skill directories remain the behavior source for every host. |
| A universal line-count cap | Skill complexity and load-bearing safety differ by domain; contract coverage is the quality signal. |
| A universal output JSON schema | Artifacts, reports, cloud resources, local URLs, and tutorials require domain-specific evidence fields. |
| Host-specific forks of skill behavior | Adapters carry host metadata and routing while behavior stays in the canonical tree. |
| A mega-skill that absorbs all eight workflows | Focused ownership keeps progressive disclosure and safety validation tractable. |
| Network or provider benchmarks in the required pull-request gate | Deterministic offline checks provide the stable maintainer path; live evidence can run separately. |
| Ponytail persona, intensity, hook, statusline, and persistent-mode runtime mechanisms | Sealos workflows are request-scoped and action-driven with cloud-specific risk controls. |

## Traceability

Roadmap creation assigns each requirement to exactly one phase and updates this table.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SDS-01 | Phase 5 | Complete |
| SDS-02 | Phase 7 | Complete |
| SDS-03 | Phase 5 | Complete |
| SDS-04 | Phase 9 | Complete |
| SDS-05 | Phase 5 | Complete |
| SDS-06 | Phase 8 | Complete |
| SDS-07 | Phase 11 | Pending |
| SDS-08 | Phase 8 | Complete |
| SDS-09 | Phase 6 | Complete |
| SDS-D05 | Phase 7 | Complete |
| REL-01 | Phase 12 | Pending |
| SDS-10 | Phase 11 | Pending |
| SDS-11 | Phase 11 | Pending |
| SDS-D04 | Phase 6 | Complete |
| SDS-D02 | Phase 7 | Complete |
| SDS-12 | Phase 12 | Pending |
| SDS-D01 | Phase 10 | Pending |
| SDS-D03 | Phase 10 | Pending |
| SDS-D06 | Phase 9 | Complete |

**Coverage:**

- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-08-06*
*Last updated: 2026-08-06 after roadmap approval*
