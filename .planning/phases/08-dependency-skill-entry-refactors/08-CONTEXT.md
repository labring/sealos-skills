# Phase 8: Dependency Skill Entry Refactors - Context

**Gathered:** 2026-08-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 8 refactors the three dependency entries that feed deployment: `cloud-native-readiness`, `dockerfile-skill`, and `docker-to-sealos`. The entries become focused one-level contracts with minimal typed evidence, explicit success/stopped/error outcomes, and reusable downstream handoffs. Existing helper behavior, artifact paths, safety gates, Docker-to-Sealos rule precedence, database topology, and the `brain-deploy-preview` Railpack/Kaniko boundary remain authoritative. Service entries, composite deploy orchestration, the complete behavior gate, and release audit belong to later phases.

</domain>

<decisions>
## Implementation Decisions

### Readiness Ownership and Eligibility
- **D-01:** Keep `cloud-native-readiness` read-only and eligibility-first. Unsupported or unresolved targets stop before scoring, artifact detection, Dockerfile generation, or deployment.
- **D-02:** A successful readiness report carries only the evidence needed downstream: selected source, workload type, eligibility result, score dimensions, dependency/configuration concerns, detected artifact inventory, recommendation, and redaction status.
- **D-03:** The readiness-to-Dockerfile handoff uses the typed fields from Phase 7. The input artifact is the report, the allowed action is packaging generation, and the readiness owner receives any failed route condition.

### Dockerfile Ownership and Runtime Acceptance
- **D-04:** `dockerfile-skill` owns only named packaging artifacts in the selected project. A pre-existing Dockerfile or `.dockerignore` is preserved unless the request explicitly authorizes a replacement; proposed changes and overwritten files are reported before mutation.
- **D-05:** Required system-tool installation and package-manager changes retain the existing confirmation boundary. Generated secrets, environment values, database URLs, and connection strings stay redacted in reports and traces.
- **D-06:** A Docker build is an intermediate artifact. `success` requires concrete image/build evidence plus migration or database proof, HTTP/health proof, and clean runtime-log evidence. Build-only outcomes remain `error` or `stopped` according to the failed precondition.
- **D-07:** Dockerfile output includes named files, build/runtime evidence, terminal state, safe next action, redaction result, and the typed deploy handoff. Deploy receives a validated Dockerfile and build/runtime result and re-checks its own gates.

### Compose Conversion and Quality Gates
- **D-08:** `docker-to-sealos` keeps the existing governance order: entry MUST rules, Sealos specs and database templates, then mappings and examples. `references/must-rules-map.yaml` and `references/rules-registry.yaml` remain coupled load-bearing sources.
- **D-09:** Compose conversion preserves source topology, replica counts, runtime-required components, official runtime semantics, storage/database boundaries, and secret safeguards. Database services remain KubeBlocks resources; generated templates remain free of validator-only metadata.
- **D-10:** The conversion handoff is emitted only after consistency, MUST-map coverage, registry, topology, storage, database, and quality-gate checks pass. Missing rule or registry evidence returns `error` to `docker-to-sealos` and blocks deployment.
- **D-11:** The branch-specific `brain-deploy-preview` path keeps normalized `analysis.json.build_environment` evidence, explicit config/README/Dockerfile/lockfile precedence, and the Dockerfile plus Kaniko boundary. The phase does not introduce `railpack build`, BuildKit, full deploy/runtime, or plugin-distribution behavior into that branch.

### Progressive Disclosure and Handoff Preservation
- **D-12:** Each dependency entry keeps the shared core contract entry-visible and loads at most one owned module/reference level for routine work. A module may name a conditional domain data file, while the entry keeps the trigger and safety boundary visible.
- **D-13:** Every downstream handoff carries `target`, `inputArtifact`, `allowedAction`, `failureReturn`, and `responseOwner`, plus source/provenance and verification evidence where the domain needs it. Receiving skills re-check their own canaries.
- **D-14:** Refactors preserve existing helper commands, artifact locations, request-scoped terminal vocabulary, and baseline positive/violating traces. New fixtures prove the new typed payloads and fail-closed branch boundaries without provider calls.

### the agent's Discretion
- Exact Markdown subsection wording and payload serialization, provided the shared contract remains first-screen and artifacts remain named.
- Whether dependency payload fixtures live in one Phase 8 fixture or skill-local eval additions, provided each owner and violating branch has machine-readable coverage.
- The smallest helper extraction or validator change needed to prove one-level links, file scope, rule precedence, and quality-gate evidence.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/PROJECT.md` — v1.1 source-of-truth, safety, runtime, and branch constraints.
- `.planning/REQUIREMENTS.md` — SDS-06 and SDS-08 acceptance requirements.
- `.planning/ROADMAP.md` — Phase 8 goal, four-plan dependency order, and Phase 9 boundary.

### Prior contract and routing
- `.planning/phases/05-baseline-ownership-and-shared-contract/05-CONTEXT.md` — shared entry shape and terminal vocabulary.
- `.planning/phases/06-inventory-router-and-validator-foundation/06-VERIFICATION.md` — inventory, safety, and aggregate validator contracts.
- `.planning/phases/07-host-adapter-and-public-surface-alignment/07-CONTEXT.md` — host route, typed handoff, and adapter ownership decisions.
- `docs/skill-design-system.md` — core sections, progressive disclosure, handoff fields, and evidence requirements.
- `commands/sealos.md` — dependency route ownership and composite order.

### Canonical dependency entries
- `skills/cloud-native-readiness/SKILL.md` and `modules/*.md` — eligibility-first assessment and report fields.
- `skills/dockerfile-skill/SKILL.md` and `modules/*.md` — owned file scope and build/runtime acceptance.
- `skills/docker-to-sealos/SKILL.md` and `references/must-rules-map.yaml` — conversion precedence, topology, registry, and quality gates.
- `tests/fixtures/skill-design-baseline.json` — positive/violating trace shape and existing owner evidence.

### Branch and implementation constraints
- `AGENTS.md` — `main` to `brain-deploy-preview` policy and targeted validation commands.
- `skills/docker-to-sealos/scripts/check_consistency.py` — registry-driven consistency gate.
- `skills/docker-to-sealos/scripts/check_must_coverage.py` — MUST-map coverage gate.
- `skills/docker-to-sealos/scripts/quality_gate.py` — complete template quality gate.
- `skills/dockerfile-skill/scripts/validate-dockerfile.mjs` — Dockerfile syntax and contract helper.
- `skills/sealos-deploy/evals/evals.json` — downstream deploy handoff expectations.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- The three entries already expose the shared contract skeleton, typed handoff prose, and domain canaries from Phase 5.
- Readiness has owned eligibility, scoring, detection, and route modules; Dockerfile has analyze/generate/build-fix modules and runtime checks; Docker-to-Sealos has registry-driven Python validators and conversion helpers.
- The baseline fixture already records readiness, Dockerfile, and conversion positive/violating traces with redaction checks.

### Established Patterns
- Python checks use standard-library `unittest` and temporary copies; Node helpers use ESM and structured JSON output.
- Artifact-producing skills report repository-relative paths and keep generated values out of diagnostics.
- Existing Docker-to-Sealos checks are the preservation oracle for MUST-map, registry, consistency, topology, and quality-gate behavior.

### Integration Points
- Phase 9 consumes the shared terminal vocabulary and artifact/evidence conventions for database, S3, Canvas, and App Builder entries.
- Phase 10 consumes the dependency payloads and must be able to skip repeated discovery while preserving deploy-owned authentication, confirmation, cleanup, and Runtime Truth gates.
- Phase 11 will extend the new fixtures into the complete eight-skill behavior and maintainer gate.

</code_context>

<specifics>
## Specific Ideas

- Make every dependency handoff copyable as a small report or artifact reference rather than prose assumptions.
- Keep readiness as the only eligibility owner and keep Dockerfile generation as the only packaging-file writer in the dependency chain.
- Treat `docker-to-sealos` rule precedence and quality-gate evidence as a single contract; a converted YAML without all gate evidence is not a deployable handoff.
- Preserve the preview branch's prepare-only behavior whenever shared code is touched.

</specifics>

<deferred>
## Deferred Ideas

- Database, S3, Canvas, and Desktop app entry refactors — Phase 9.
- Composite deploy payload consumption and live Runtime Truth acceptance — Phase 10.
- Provider-backed benchmarks and the single complete maintainer gate — Phase 11.
- Main/preview aligned-adapted-excluded audit and public release evidence — Phase 12.

</deferred>

---

*Phase: 8-Dependency Skill Entry Refactors*
*Context gathered: 2026-08-06*
