# Project Research Summary

**Project:** Sealos Skills v1.1 Skill Design System Optimization
**Domain:** Multi-host AI agent skill design system and plugin distribution
**Researched:** 2026-08-06
**Confidence:** MEDIUM

## Executive Summary

Sealos Skills is a plugin-first pack of eight task-scoped workflows for Sealos Cloud and Sealos Desktop: deployment, databases, S3 storage, read-only topology, Desktop app building, readiness assessment, Docker packaging, and Compose-to-template conversion. Experts build this class of system around focused entry contracts, thin host adapters, owned progressive detail, deterministic helpers, and behavior tests that tie user-visible promises to observable traces. Ponytail supplies transferable ownership and drift-detection mechanisms; Sealos keeps its own cloud, Kubernetes, artifact, credential, and runtime-truth semantics.

The recommended v1.1 sequence is baseline capture, contract and validator work, host projection alignment, dependency-ordered entry refactors, deploy orchestration last, then full behavior coverage and a maintainer gate. Use the existing Python and Node toolchains: Python standard-library validation and `unittest`, Node `node:test` for deterministic graders, JSON only for derived reports, and the existing PyYAML-backed Compose/template gate in its current boundary. Keep pull-request checks offline and deterministic; select a pinned provider benchmark only after a runner, budget, retry, and secret policy are defined.

The central design risk is silent behavior drift while entries become shorter or adapters are synchronized. Preserve load-bearing safety in entry files and pre-routing context, derive expected inventory from the physical skill tree, parse `commands/sealos.md` as the routing authority, require typed handoffs, and pair every critical rule with positive and violating probes. Treat `brain-deploy-preview` as a separate prepare-only product during every integration audit.

## Key Findings

### Recommended Stack

Use Python compatible with 3.8+ for the validator and CI on 3.12, and keep new checks dependency-free. `pathlib`, `json`, `unittest`, `tempfile`, and shell-free `subprocess` cover inventory discovery, Markdown/link checks, version and manifest parity, fixture mutations, and quality-gate orchestration. Existing `docker-to-sealos` YAML validation continues to use PyYAML 6.0.3 in its owning gate.

Use the repository's current Node compatibility (18+) for skill helpers and Node 20+ for the new `node:test` suite, with CI on Node 22.x. Markdown remains the authored contract format; GitHub Actions should run the same root gate on pull requests and release tags. Avoid adding pytest, Jest/Vitest, JSON-schema packages, a YAML inventory, or an unpinned provider benchmark to the required gate.

**Source-of-truth resolution:**

- The eight entry files under `skills/` form the physical inventory and canonical behavior source for each skill.
- `commands/sealos.md` is the canonical broad intent-to-skill routing table and the source for the public `$sealos`/`/sealos` route contract.
- Skill modules, references, knowledge, scripts, schemas, and assets remain owned by their skill directories.
- Plugin manifests, marketplaces, `qoder.md`, `AGENTS.md`/`CLAUDE.md`, OpenAI metadata, `distribution/platforms.json`, and README claims are projections. Validate them against the two sources above.
- A machine-readable inventory or report may be generated in memory or as a clearly derived artifact for a host/check. It gains source status only when a host protocol requires a physical transformed copy, in which case a reproducible generator and parity test own that copy. Do not introduce a second hand-maintained canonical manifest for v1.1.

### Expected Features

**Must have (table stakes):**

- A shared entry contract covering discovery, scope, risk, workflow, progressive loading, output, handoff, host exposure, and verification across all eight skills.
- Request-scoped lifecycle semantics with explicit success, stopped, and error outcomes; canvas declares its temporary server lifecycle.
- Entry-visible confirmation, secret-redaction, read-only, eligibility, quality-gate, and runtime-acceptance invariants.
- One-level progressive disclosure with resolvable links and clear load conditions.
- Typed handoffs for readiness to Dockerfile, deploy to Dockerfile/template, and deploy state to canvas.
- Exact host parity for Codex, Claude-compatible hosts, Qoder, CodeBuddy, Gemini/Qwen context extensions, OpenClaw, and direct skills.sh claims.
- Positive and violating behavior coverage for routing, boundaries, confirmation, outputs, and handoffs, plus one documented maintainer quality gate.
- Preservation of current deployment artifacts, phase order, auth, cleanup confirmation, runtime verification, and branch-specific behavior.

**Should have (competitive):**

- Evidence-bearing terminal outputs: actual App URL and live identity, sanitized footprint, connection proof, object round trip, report paths, or local canvas URL.
- A risk-aware router that labels observation, local writes, cloud writes, public exposure, and destructive operations before delegation.
- Semantic safety canaries paired with behavioral checks so concise prose retains its operational meaning.
- A shared terminal-state vocabulary with domain-specific output fields and typed orchestration payloads.

**Defer (v1.x/v2+):**

- Provider-backed prompt benchmarks, prompt-load measurement, and cross-host trajectory comparison until a stable runner and telemetry policy exist.
- Automatic adapter rendering until repeated drift justifies generation; validation and thin projections are sufficient at the current eight-skill scale.
- Expanded machine-readable contract DSLs, new cloud runtime capabilities, persistent modes, hooks, persona/intensity systems, or host-specific behavior forks.

### Eight-Skill Coverage

| Skill | v1.1 contract focus | Primary risk/evidence to preserve |
|---|---|---|
| `cloud-native-readiness` | Analysis-only eligibility, score gating, stop routes, and typed Dockerfile handoff | Unsupported targets stop before scoring, build, or deploy; report carries evidence |
| `dockerfile-skill` | Owned files, pre-existing-file policy, build/runtime acceptance, and artifact output | Local mutation and secret handling remain explicit; build and HTTP/log proof stay intact |
| `docker-to-sealos` | Condensed rule precedence, one-level references, template output, and quality-gate handoff | MUST-map/registry coupling, topology, storage, database, and secret rules remain load-bearing |
| `sealos-database` | Create/reuse decision, env mutation boundary, public/destructive gates, and redacted output | Workspace/account ambiguity, key preservation, connectivity proof, and confirmation remain intact |
| `sealos-s3` | Bucket create/reuse, private default, policy confirmation, env wiring, and object verification | Credentials stay redacted; sharing and deletion require explicit confirmation |
| `sealos-canvas` | Read-only precondition, sanitized topology, exact JSON/output, and server lifecycle | Requires deployed state; cannot mutate resources or expose Secret/ConfigMap content |
| `sealos-app-builder` | Starting-path branches, SDK-source precedence, iframe verification, and publish handoff | Code/tutorial boundaries and real Desktop verification remain explicit |
| `sealos-deploy` | Composite phase map, typed subskill payloads, preflight gates, and Runtime Truth Pass | Kubeconfig scope, auth, deletion confirmation, actual App URL, logs, readiness, and full footprint remain authoritative |

### Architecture Approach

The system is a stateless task-scoped pipeline: host entry surfaces select one canonical route, the selected `SKILL.md` owns the user-visible contract and safety boundary, owned detail loads conditionally, deterministic helpers perform fixed operations, and skill-local plus router evals verify the result. Deployment composes readiness, Dockerfile, and template skills; deployed state feeds the read-only canvas; database and S3 remain direct service workflows with explicit integration handoffs.

**Major components:**

1. **Physical inventory** — discover the eight skill entry files under `skills/`; this set defines exactly which capabilities ship.
2. **Unified router** — parse the structured route table in `commands/sealos.md`; each physical skill appears once with plugin and direct-entry semantics.
3. **Entry contracts and detail layer** — keep triggers, scope, safety, workflow, outputs, handoffs, and load conditions in `SKILL.md`; keep phase detail in owned modules/references/knowledge.
4. **Thin host projections** — expose the same root tree through Codex, Claude-compatible, Qoder, CodeBuddy, Gemini, Qwen, OpenClaw, skills.sh, and generic import surfaces using native syntax.
5. **Design and behavior gates** — extend `scripts/validate-codex-plugin.py` (with fixture-testable helpers) for inventory, routes, versions, paths, metadata, safety canaries, and eval schema; use deterministic `unittest` and `node:test` probes for fixed behavior.
6. **Runtime and branch boundaries** — retain current helper tests and cloud safety gates; classify main-to-preview changes as aligned, adapted, or excluded under the prepare-only policy.

**Host adapter contract:** Codex keeps a root `./skills/` pointer and `$sealos`; Claude-compatible hosts and Qoder use `/sealos`; Qoder keeps its complete eight-skill package; explicit Claude and CodeBuddy arrays must add the currently omitted `sealos-canvas`; Gemini and Qwen remain context-only through `CLAUDE.md -> AGENTS.md`; OpenClaw keeps its bundle pointer unless a future host requires a transformed copy; direct skills.sh examples retain their documented deploy/database/S3 subset. Every projection gets set, version, route, and invocation checks against the physical tree and router.

### Critical Pitfalls

1. **Concision removes load-bearing safety.** Define an entry-visible safety set per skill and canary it; move explanatory detail behind one link level while retaining confirmation, redaction, eligibility, quality-gate, and runtime evidence rules.
2. **Pairwise parity hides omissions, and a second inventory becomes a drift source.** Discover the physical tree first, parse the router second, and compare every adapter to those sources. Keep any JSON inventory/report derived and disposable unless a host protocol requires it.
3. **Refactoring precedes a behavior baseline.** Record positive and violating routing, stop, confirmation, output, and handoff cases for all eight skills before editing long entries; retain current helper/runtime tests as the preservation oracle.
4. **Implicit handoffs and deep disclosure create unsafe duplicate work.** Name the artifact, source, owner, preconditions, allowed mutation, failure return, and evidence for each handoff; keep normal entry-to-detail depth at one level.
5. **Ponytail runtime leakage expands scope.** Transfer ownership, thin adapters, version checks, and red/green behavior tests; keep Sealos request-scoped and action-driven.
6. **Main-to-preview scope leaks during distribution edits.** Keep full plugin/marketplace/command/distribution and runtime deploy changes on `main`; preserve preview's Kaniko prepare flow, Railpack delta, branch identity, and exclusion list.

## Implications for Roadmap

Suggested phases continue from Phase 5 in `.planning/PROJECT.md`.

### Phase 5: Baseline, Ownership, and Shared Contract

**Rationale:** Behavior and ownership decisions must precede prose refactors, adapter repair, and validator expectations.

**Delivers:** A captured eight-skill inventory/adapter matrix; positive and violating baseline probes; the explicit physical-source/router-source decision; a shared entry template; per-skill safety canaries; and a runtime-preservation checklist.

**Addresses:** SDS-01, SDS-03, SDS-05, SDS-12; all eight skills' contract facets.

**Avoids:** Safety loss, second-source drift, premature refactoring, and Ponytail mode/runtime leakage.

**Research flag:** Standard repository patterns support planning without a broad research pass. Confirm exact section names and per-skill invariant phrases during phase discussion.

### Phase 6: Inventory, Router, and Validator Foundation

**Rationale:** Adapter alignment needs a trusted expected set and route schema; current checks pass despite a seven-versus-eight projection gap.

**Delivers:** Filesystem discovery of all eight skill entry files; structured parsing of `commands/sealos.md`; derived in-memory inventory/report; version-source loading from root plugin metadata; Markdown/link/frontmatter checks; safety canary checks; eval schema checks; and fixture-driven validator regressions.

**Addresses:** SDS-09, SDS-11, SDS-D04 and the host/version/path contracts.

**Avoids:** Mutual-drift parity, hand-maintained duplicate inventory, broken progressive links, and stale version fields.

**Research flag:** Use `$gsd-plan-phase --research-phase 6` for exact manifest/version-field coverage and the boundary between validator output and optional host-required reports.

### Phase 7: Host Adapter and Public Surface Alignment

**Rationale:** Make every host projection agree before changing skill prose, so subsequent failures identify behavior changes rather than inventory noise.

**Delivers:** Eight-skill parity in Claude, CodeBuddy, Qoder, and marketplace surfaces; Codex metadata parity; Qoder command/package checks; Gemini/Qwen context-only canaries; OpenClaw bundle checks; direct skills.sh claim checks; and corrected `$sealos`/`/sealos` examples. Resolve `sealos-canvas` exposure explicitly and document the decision.

**Addresses:** SDS-09, SDS-D02, SDS-D05 and host-accurate invocation.

**Avoids:** Omitted canvas capability, mixed host syntax, host-specific behavior forks, and accidental command claims for context-only extensions.

**Research flag:** Use `$gsd-plan-phase --research-phase 7` for host packaging semantics and the product decision on canvas exposure; keep adapters behavior-free.

### Phase 8: Dependency Skill Entry Refactors

**Rationale:** Readiness, Dockerfile generation, and Compose conversion form the upstream dependency chain consumed by deploy.

**Delivers:** Focused contracts for `cloud-native-readiness`, `dockerfile-skill`, and `docker-to-sealos`; one-level navigation; typed readiness/build/template payloads; explicit output and stop/error states; and updated skill-local eval schemas while preserving current helper gates.

**Addresses:** SDS-01, SDS-05, SDS-06, SDS-07, SDS-08, SDS-12.

**Avoids:** Unsupported workload mutation, hidden build rules, lost Docker-to-Sealos MUST-map coverage, and premature deployment from a generated artifact.

**Research flag:** Use `$gsd-plan-phase --research-phase 8` for Docker-to-Sealos rule-registry/MUST-map coupling and the `brain-deploy-preview` Railpack/Kaniko adaptation boundary.

### Phase 9: Service and Adjacent Skill Entry Refactors

**Rationale:** These skills can stabilize independently after the shared contract and validator exist, while their risk classes require distinct output and confirmation tests.

**Delivers:** Focused contracts and evals for `sealos-database`, `sealos-s3`, `sealos-canvas`, and `sealos-app-builder`; create/reuse and env-preservation outputs; public/destructive confirmation; credential redaction; sanitized read-only canvas output; SDK/framework branch loading; and real Desktop verification claims.

**Addresses:** SDS-02, SDS-04, SDS-06, SDS-07, SDS-D01, SDS-D06.

**Avoids:** Secret leakage, public-by-default storage, canvas mutations, generic preambles, and code/tutorial ownership confusion.

**Research flag:** Database, S3, and canvas structure follows well-documented local helpers and can usually skip deep research. Use `$gsd-plan-phase --research-phase 9` only for current Desktop SDK/source precedence or changed external service behavior.

### Phase 10: Deploy Orchestration and Runtime Truth

**Rationale:** `sealos-deploy` depends on the stabilized upstream contracts and carries the widest cloud and cleanup blast radius, so it belongs last among entry refactors.

**Delivers:** A concise composite deploy contract; typed readiness/Dockerfile/template handoffs; preserved preflight/auth/kubeconfig/tool-install/deletion gates; explicit `.sealos` artifact/state outputs; actual App URL and live identity checks; Runtime Truth Pass; and canvas handoff from verified state.

**Addresses:** SDS-07, SDS-08, SDS-12, SDS-D01, SDS-D03.

**Avoids:** Duplicate discovery, hidden external mutations, intent-only success claims, incomplete footprint cleanup, and unsafe rollback/verification changes.

**Research flag:** Use `$gsd-plan-phase --research-phase 10` for live runtime evidence, disposable-account/cleanup prerequisites, and the exact boundary between main's full deploy workflow and preview's prepare-only flow.

### Phase 11: Behavior Evals, Deterministic Grader, and Maintainer Gate

**Rationale:** The executable contract should follow the refactored entries and provide one release path for future changes.

**Delivers:** Skill-local evals for all eight skills; `commands/evals/evals.json` for unified routing and host syntax; structured `{text, toolCalls, files}` probes; positive/negative `node:test` grader tests; `unittest` validator fixtures; a documented root quality-gate command; and maintainer design guidance.

**Addresses:** SDS-02, SDS-04, SDS-10, SDS-11 plus all highest-risk handoffs and outputs.

**Avoids:** Treating JSON fixtures as executable coverage, network flakiness in pull requests, and unsupported benchmark claims.

**Research flag:** Use `$gsd-plan-phase --research-phase 11` to choose a pinned provider/trajectory runner, repeat/retry/cost policy, and evidence storage. Deterministic local checks can proceed with standard patterns.

### Phase 12: Branch-Policy, Documentation, and Release Audit

**Rationale:** Public claims and branch integration need a final source-aware audit after behavior and host projections settle.

**Delivers:** Aligned/adapted/excluded file report for `main` and `brain-deploy-preview`; synchronized README/localized claims where inventory or invocation text changed; full root gate plus owning runtime gates; and release/tag version parity evidence.

**Addresses:** SDS-09, SDS-11, SDS-12 and the merge-policy constraint.

**Avoids:** Main-only plugin/distribution/runtime surfaces entering preview, stale public inventory, and release metadata drift.

**Research flag:** Standard policy review can skip external research. Require an explicit file-by-file audit and current source-commit comparison.

### Phase Ordering Rationale

- Capture behavior before changing entries; define the contract before applying it eight times.
- Derive inventory and routes before repairing projections; this prevents a shared omission from masquerading as parity.
- Refactor readiness, Dockerfile, and template dependencies before deploy; deploy then becomes an orchestration update with stable payloads.
- Add behavior tests after contract text settles, while retaining baseline fixtures and existing runtime gates throughout.
- Finish with branch-policy and public-documentation review so release claims reflect the shipped projections and branch architecture.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 6:** Exact host manifest/version fields and derived-report boundary.
- **Phase 7:** Canvas exposure intent and host-specific package/context semantics.
- **Phase 8:** Docker-to-Sealos MUST-map preservation and preview Railpack/Kaniko delta.
- **Phase 10:** Live runtime-truth evidence, cleanup authority, and branch-specific deploy behavior.
- **Phase 11:** Provider-backed behavior runner, trajectory capture, and release evidence policy.

Phases with standard patterns (skip research-phase unless scope changes):

- **Phase 5:** Contract extraction and baseline fixtures from current local sources.
- **Phase 9:** Database, S3, and canvas entry shaping around existing helpers and safety gates.
- **Phase 12:** Repository merge policy, version checks, and documentation synchronization.

## Confidence Assessment

| Area | Confidence | Notes |
|---|---|---|
| Stack | MEDIUM | Python/Node built-ins and current tests are directly observed; provider-runner choice and exact CI matrix remain open. |
| Features | MEDIUM | Eight-skill contracts and risk classes are grounded in current entries, while behavior coverage is uneven and some acceptance wording needs normalization. |
| Architecture | HIGH | Physical inventory, router ownership, host projections, handoff graph, and branch boundaries are confirmed in repository files and current manifests. |
| Pitfalls | HIGH | Seven-versus-eight drift, safety placement, handoff ambiguity, deep disclosure, and preview scope risks have concrete local evidence and prevention seams. |

**Overall confidence:** MEDIUM

### Gaps to Address

- **Canvas exposure intent:** Explicit manifests currently omit `sealos-canvas` in several surfaces. Decide whether every supported plugin projection publishes it, then make the decision executable.
- **Contract vocabulary:** Finalize required section names, per-skill invariant phrases, and advisory size budgets. Keep safety coverage as the gate and treat line counts as diagnostics.
- **Behavior runner:** Eval JSON and deploy results exist, while a repository-owned provider/trajectory runner is absent. Keep offline deterministic checks authoritative until the runner is selected and pinned.
- **Version surface inventory:** Enumerate every version-bearing field, including marketplace duplicates and release tags, before removing hard-coded validator constants.
- **Preview scope:** Revalidate the current source `main` commit and target branch before applying shared-skill changes; preserve preview's prepare-only deployment and exclusion list.
- **Environment prerequisites:** Keep the new design gate standard-library-only and isolate PyYAML requirements to the existing Compose/template quality gate so local Python differences remain predictable.

## Sources

### Primary (HIGH confidence)

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — canonical ownership, router, component boundaries, dependency-aware build order, host adapters, and preview policy.
- [`PITFALLS.md`](./PITFALLS.md) — concrete drift, safety, disclosure, handoff, benchmark, and branch-policy failure modes.
- [`AGENTS.md`](../../AGENTS.md) — root skill architecture, runtime safety, validation commands, and `main` to `brain-deploy-preview` policy.
- [`PROJECT.md`](../PROJECT.md) — v1.1 goal, active requirements, exclusions, and source-of-truth constraints.
- [`commands/sealos.md`](../../commands/sealos.md), all eight skill entry files under [`skills/`](../../skills/), host manifests, and existing eval fixtures — live routing, behavior, and distribution evidence.

### Secondary (MEDIUM confidence)

- [`STACK.md`](./STACK.md) — Python/Node/JSON recommendations, built-in test strategy, version compatibility, and optional provider benchmark conditions.
- [`FEATURES.md`](./FEATURES.md) — shared contract, eight-skill matrix, host contract, table stakes, differentiators, anti-features, and acceptance probes.
- Ponytail local rule-copy, version, adapter, and behavior checks under `/Users/longnv/bin/repo/ponytail/scripts/` and `/Users/longnv/bin/repo/ponytail/tests/` — executable ownership and drift-detection mechanisms.

### Tertiary (LOW confidence / requires validation)

- [Node `node:test` documentation](https://nodejs.org/download/release/v24.15.0/docs/api/test.html), [Python `unittest`](https://docs.python.org/3.11/library/unittest.html), and [Promptfoo scenarios](https://www.promptfoo.dev/docs/configuration/scenarios/) — implementation references; CI and provider choices still require project validation.
- [Acceptance-Test-Driven Evaluation Protocols](https://arxiv.org/abs/2606.02755) and [SkillJuror](https://arxiv.org/abs/2606.11543) — external rationale for observable contracts and progressive-loading evaluation.

---
*Research completed: 2026-08-06*
*Ready for roadmap: yes*

## Verification

- All four research reports and this summary are present.
- The research diff check passes.
- The source decision, phase ordering, research flags, and branch boundary are ready for roadmap planning.
