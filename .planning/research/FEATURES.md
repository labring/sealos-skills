# Feature Research

**Domain:** Multi-host AI agent skill design system for Sealos Cloud
**Project:** Sealos Skills v1.1 Skill Design System Optimization
**Researched:** 2026-08-06
**Confidence:** MEDIUM

## Research Boundary

This milestone establishes design contracts around the eight shipped Sealos skills. The existing deploy, database, S3, canvas, app-builder, readiness, Dockerfile, and Compose-to-Sealos runtime behaviors remain the protected baseline.

The comparison uses Ponytail as evidence for five transferable mechanisms:

1. High-signal discovery descriptions.
2. Focused ownership and explicit boundaries.
3. Request-scoped versus persistent lifecycle declarations.
4. Compact, observable output contracts.
5. Positive and negative behavior probes tied to shipped sources.

Ponytail's lazy-senior persona, intensity modes, command taxonomy, and benchmark scoreboard remain Ponytail product behavior. Sealos needs operational contracts shaped around cloud risk, artifacts, runtime evidence, and host routing.

## Required Shared Skill Contract

Every Sealos `SKILL.md` entry point should expose the following user-observable contract. Detailed protocols can live in owned modules or references, while routing and load-bearing safety rules stay visible at entry level.

| Contract facet | Required behavior | Executable check | Complexity |
|---|---|---|---|
| Discovery | Frontmatter names the primary outcome, natural-language triggers, direct invocation aliases, and the closest neighboring skills. | Fixture prompts select exactly one owner for clear requests and produce a clarification or explicit sequence for genuinely multi-skill requests. | MEDIUM |
| Scope | The entry states accepted inputs, preconditions, owned mutations, stop conditions, and request lifetime. | Static validator requires the fields; behavior probes verify early stops and mutation boundaries. | MEDIUM |
| Risk | The entry identifies its interaction class: read-only inspection, local artifact write, cloud mutation, sensitive-data handling, or destructive action. | Confirmation probes hold execution before public-access, credential-rotation, destructive, and system-install actions. | MEDIUM |
| Workflow | The entry presents the shortest end-to-end phase map and the conditions that select each branch. | Link and phase-order validation catches missing modules, invalid branches, and stale handoffs. | MEDIUM |
| Progressive disclosure | The entry routes detailed knowledge to one level of owned modules/references and names when each resource is loaded. | Trajectory evals assert relevant resources are loaded for the selected branch and unrelated deep references stay unloaded. | HIGH |
| Output | Success, stopped, and error outcomes identify artifacts, user-facing values, redactions, and verification evidence. | Output probes assert required paths/fields and scan for secret-bearing values. | MEDIUM |
| Handoff | A cross-skill transition names the target skill, payload, preconditions, and owner of the final response. | Handoff fixtures verify readiness-to-Dockerfile and deploy subflow context, reuse prior analysis, and expose every mutation. | MEDIUM |
| Host exposure | Adapters route to canonical root skills and preserve host-native invocation syntax. | Inventory validator compares all manifests, routers, documentation claims, and versions against one canonical inventory. | MEDIUM |
| Verification | Each contract has static checks plus behavioral probes for its highest-risk promises. | One quality gate runs inventory, schema, link, safety, routing, output, and behavior checks. | HIGH |

## Ponytail Mechanism Comparison

All six Ponytail skills use a focused description as the discovery surface, then pair narrow boundaries with a predictable output. The reusable design lesson is the explicit contract shape.

| Ponytail skill | Trigger pattern | Boundary and lifecycle | Output pattern | Transfer decision |
|---|---|---|---|---|
| `ponytail` | Broad coding verbs plus explicit phrases such as minimal solution and YAGNI; excludes non-coding requests. | Persistent mode with an explicit default, switch commands, deactivation phrases, and session-end lifetime. | Code first, followed by a tightly bounded explanation. | Adopt explicit lifecycle and activation semantics. Keep Sealos workflows request-scoped. |
| `ponytail-review` | Diff-review requests focused on over-engineering and deletion. | Diff scope, one-shot, finding-only; correctness, security, and performance route elsewhere. | One line per finding with fixed tags, location, replacement, and net line count. | Adopt focused ownership, near-neighbor routing, and compact finding schemas. |
| `ponytail-audit` | Whole-repository audit, bloat, and deletion requests. | Repository scope, one-shot, report-only. | Ranked findings plus aggregate reduction estimate. | Adopt explicit scope distinction between repository-wide and targeted work. |
| `ponytail-debt` | Requests to collect `ponytail:` markers or list deferred shortcuts. | Read-only by default; persistence requires a separate explicit request. | File-grouped ledger rows with ceiling, upgrade trigger, and missing-trigger count. | Adopt read/write boundary declaration and machine-recognizable evidence markers. |
| `ponytail-gain` | Exact gain, savings, impact, and scoreboard requests. | One-shot mode-neutral display; benchmark scope is global. | Fixed scoreboard plus an honesty boundary for unsupported per-repository claims. | Adopt evidence-scope labeling for runtime and benchmark claims. Exclude the scoreboard behavior. |
| `ponytail-help` | Help and command-discovery requests. | One-shot inventory display; host forms are documented explicitly. | Levels, six-skill inventory, host-specific invocation, deactivation, and configuration precedence. | Adopt one canonical inventory rendered or checked across host adapters. |

### Ponytail Behavior-Gate Lessons

Ponytail's `tests/behavior.test.js` verifies both passing and failing examples for three subtle promises: hardware calibration, full requested explanations, and one runnable check. `benchmarks/behavior.yaml` adds a no-skill control and a Ponytail arm. The transferable mechanism is behavior discrimination:

- Every critical rule needs at least one positive probe and one violating probe.
- The grader itself needs deterministic unit tests.
- Claims should be tied to observable output or trajectory evidence.
- Unknown probe types should produce an explicit skip result, preserving test-suite honesty.
- Benchmark-derived claims should retain their source scope.

Sealos should apply this method to routing, progressive loading, confirmation gates, redaction, output contracts, and handoffs. Existing deploy evals provide domain coverage for one skill and serve as baseline fixtures, while the design-system suite expands coverage across all eight entries.

## Sealos Skill Contract Matrix

| Sealos skill and evidence | Current trigger and risk boundary | Current output and handoff | v1.1 design-system requirement | Complexity |
|---|---|---|---|---|
| `cloud-native-readiness` ([`skills/cloud-native-readiness/SKILL.md`](../../skills/cloud-native-readiness/SKILL.md)) | Repository eligibility, readiness, Docker/Kubernetes compatibility, and deployment feasibility. It fails closed for unsupported or unresolved workloads. | Structured 0-12 readiness report for eligible targets; stopped eligibility evidence for other targets; optional handoff to `dockerfile-skill` with framework, dependencies, configuration state, and concerns. | Formalize the analysis-only stage and the mutating handoff as separate outcomes. Test evidence-first stopping, score gating, artifact detection, and exact handoff payload. | MEDIUM |
| `dockerfile-skill` ([`skills/dockerfile-skill/SKILL.md`](../../skills/dockerfile-skill/SKILL.md)) | Dockerfile creation, repair, containerization, build diagnosis, and related packaging. It writes local artifacts and runs local build/runtime validation. | Dockerfile, dockerignore, optional Compose/env/entrypoint/docs artifacts, build result, migration proof, HTTP result, and log checks. | Declare owned files, pre-existing-file handling, secret treatment, success/stopped/error outputs, and reference-loading triggers. Preserve build and runtime acceptance. | HIGH |
| `docker-to-sealos` ([`skills/docker-to-sealos/SKILL.md`](../../skills/docker-to-sealos/SKILL.md)) | Compose or install-doc conversion into Sealos templates. It writes local template artifacts and enforces extensive platform/runtime rules. | `template/<app>/index.yaml`, optional logo, complete YAML, conversion summary, validation evidence; README authoring is delegated. | Keep condensed platform invariants and output limits entry-visible. Move detailed conversion families behind one-level progressive navigation, with rule registry and coverage checks proving preservation. | HIGH |
| `sealos-deploy` ([`skills/sealos-deploy/SKILL.md`](../../skills/sealos-deploy/SKILL.md)) | Supported cloud workload deployment/update. It performs local writes, registry actions, Sealos cloud mutation, authenticated verification, and confirmed cleanup. | Deployment log, `.sealos` state/artifacts, actual returned App URL, public-network result, login/setup proof, logs/event convergence, database/object-storage checks, and full footprint; composes readiness, Dockerfile, and template skills. | Add one consolidated success/stopped/error contract and typed subskill handoffs. Keep eligibility, auth, deletion confirmation, redaction, actual-runtime identity, and Runtime Truth Pass visible and behavior-gated. | HIGH |
| `sealos-database` ([`skills/sealos-database/SKILL.md`](../../skills/sealos-database/SKILL.md)) | Database provision, reuse, connection, env wiring, backup/log/public-access operations. It handles cloud mutation and credentials; public access and destructive actions require confirmation. | Database identity/status/workspace, env file and key names, application connectivity result, public-access state, and follow-up action with secrets redacted. | Add explicit create/reuse decision output, stop/error shape, mutation inventory, and direct-versus-deploy handoff rules. Test workspace ambiguity, secret redaction, public access, destructive confirmation, and env preservation. | MEDIUM |
| `sealos-s3` ([`skills/sealos-s3/SKILL.md`](../../skills/sealos-s3/SKILL.md)) | Bucket provision/reuse, credentials, env wiring, object operations, presigning, and policy changes. It handles cloud mutation and secrets; public policy and destructive actions require confirmation. | Bucket identity/policy/readiness, env file and key names, upload/read or presign verification, and cleanup status with credentials redacted. | Add explicit operation class, create/reuse output, stop/error shape, and direct-versus-deploy handoff rules. Test private default, temporary sharing path, secret redaction, policy confirmation, and object cleanup. | MEDIUM |
| `sealos-canvas` ([`skills/sealos-canvas/SKILL.md`](../../skills/sealos-canvas/SKILL.md)) | Read-only visualization for projects with `.sealos/state.json` and live resource access. Cloud mutation is outside its scope; the local UI server lasts through the viewing task. | Structured success or stop JSON, local URL, HTML cache path, App URL, node/edge counts, and sanitized topology. | Use this entry as the reference shape for explicit hard rules, preconditions, success output, stop output, and process lifetime. Add routing and sanitization probes. | LOW |
| `sealos-app-builder` ([`skills/sealos-app-builder/SKILL.md`](../../skills/sealos-app-builder/SKILL.md)) | New Sealos Desktop apps, existing app adaptation, identity/business-data integration, local iframe debugging, and tutorials. It writes project code/docs and may add the SDK dependency. | Path-specific code changes or tutorial, SDK/session integration, fallback behavior, Desktop verification, and publish-readiness actions. | Define four outcome variants with shared output fields, owned mutation boundaries, SDK-source precedence, and branch-specific reference loading. Test code versus documentation routing and real Desktop verification claims. | MEDIUM |

### Interaction Classes

| Class | Skills | Required contract behavior |
|---|---|---|
| Read-only observation | `sealos-canvas`; the assessment stage of `cloud-native-readiness` | State preconditions, sanitize output, stop on missing authority or state, and declare local cache/server lifetime. |
| Local artifact mutation | `dockerfile-skill`, `docker-to-sealos`, `sealos-app-builder` | Name owned files, preserve unrelated content, report validation evidence, and expose any dependency-install requirement before execution. |
| Cloud and local mutation | `sealos-deploy`, `sealos-database`, `sealos-s3` | Resolve account/workspace/namespace, redact credentials, list mutations, hold gated actions for confirmation, and verify the real resulting service. |
| Composite orchestration | `sealos-deploy`; conditional handoff from `cloud-native-readiness` | Pass typed evidence between skills, retain one final-response owner, and prevent repeated analysis or hidden side effects. |

## Host Adapter Contract

Root `skills/**` remains the only behavior source. Host files expose identity, inventory, invocation, and routing.

| Surface | Current observable contract | v1.1 requirement | Complexity |
|---|---|---|---|
| Codex | `.codex-plugin/plugin.json` points to `./skills/`; users invoke `$sealos`. | Validate the directory resolves exactly eight skills and the plugin copy names the same capability set and version. | LOW |
| Claude-compatible command | `commands/sealos.md` maps `/sealos` to all eight skills and preserves direct skills.sh semantics. | Generate or validate routes from the canonical inventory; keep safety routing concise and behavior-free. | MEDIUM |
| Claude plugin | `.claude-plugin/plugin.json` currently lists seven skills while `commands/sealos.md` routes `sealos-canvas`. | Reconcile the explicit list with all eight canonical skills and make the mismatch a validator failure. | LOW |
| Qoder | `.qoder-plugin/plugin.json` lists all eight; `qoder.md` repeats routing and global safety. | Validate inventory, route text, version, and command source against the canonical contract. | MEDIUM |
| Gemini and Qwen context extensions | Context-only hosts load shared context and advertise context-driven operation. | Preserve the context-only claim and validate that their shared routing inventory stays current. | LOW |
| skills.sh and generic skill hosts | Direct skill entry points expose individual workflows; product docs highlight direct deploy, database, and S3 usage. | Validate direct invocation examples separately from plugin invocation examples and preserve every skill's canonical frontmatter triggers. | MEDIUM |

Observed drift is concrete: root `skills/**`, the Qoder manifest, and both shared routers expose eight skills; the Claude manifest exposes seven and omits `sealos-canvas`. The current validator accepts the Claude list because it compares that list with another seven-item marketplace list. v1.1 inventory validation should anchor every explicit adapter list to the root skill directories.

## Feature Landscape

### Table Stakes (Users Expect These)

| ID | Feature | Why Expected | Complexity | Testable acceptance |
|---|---|---|---|---|
| SDS-01 | Shared entry contract | A user should encounter the same trigger, boundary, risk, workflow, output, and handoff concepts across all eight skills. | MEDIUM | Static validation passes for eight of eight entry points; each entry names every required facet. |
| SDS-02 | Precise routing and neighbor boundaries | Database, S3, deploy, readiness, Dockerfile, Compose conversion, canvas, and Desktop app work overlap at their edges. | MEDIUM | Clear fixtures select one owner; compound fixtures produce an explicit ordered sequence; ambiguous mutation fixtures pause before side effects. |
| SDS-03 | Request-scoped lifecycle | Sealos operations complete per request, leave artifacts or a temporary canvas process, and end at a declared terminal state. | LOW | Every entry declares request lifetime; canvas declares server shutdown; adapters remain mode-free. |
| SDS-04 | Risk and confirmation contract | Cloud resources, credentials, public access, and deletion carry user-visible consequences. | MEDIUM | Tests hold destructive operations, public access, credential rotation, and system installation until explicit confirmation. |
| SDS-05 | Entry-visible safety invariants | Agents need critical guards before loading branch-specific details. | HIGH | Safety probes still pass when unrelated references stay unloaded; semantic guard checks cover redaction, kubeconfig scope, confirmation, and fail-closed eligibility. |
| SDS-06 | One-level progressive disclosure | Entry files currently range from 116 to 383 lines and contain mixed routing, protocol, examples, and platform rules. | HIGH | Each task loads only the modules/references named for its branch; all links resolve; detailed rules retain registry or test coverage. |
| SDS-07 | Explicit success, stopped, and error outputs | Users need artifacts, verified outcomes, and the next action for every terminal path. | MEDIUM | Each skill has probes for success and at least one stop/error case; outputs reveal paths and statuses while sensitive values remain redacted. |
| SDS-08 | Typed cross-skill handoffs | Deploy composes three sibling skills, readiness conditionally routes to Dockerfile, and canvas consumes deploy state. | MEDIUM | Handoff payloads include required evidence and preserve one response owner; downstream skills skip duplicated discovery. |
| SDS-09 | Canonical eight-skill inventory | Users receive the same capability map across supported hosts. | MEDIUM | Validator compares root inventory, explicit manifests, routers, shared context, platform registry, versions, and invocation syntax. |
| SDS-10 | Behavior coverage for all eight skills | Dedicated evals currently concentrate on `sealos-deploy`; design promises span the full pack. | HIGH | Every skill owns routing, boundary, output, and highest-risk probes; grader tests include passing and violating examples. |
| SDS-11 | Maintainer quality gate | Future skill edits need one repeatable path that catches design drift before release. | MEDIUM | A documented command runs contract, inventory, link, safety, behavior, and existing domain validators with actionable failures. |
| SDS-12 | Runtime behavior preservation baseline | Entry refactors touch safety-critical instructions and orchestration. | HIGH | Before/after fixtures preserve current artifacts, gates, phase ordering, runtime verification, and host semantics. |

### Differentiators (Competitive Advantage)

| ID | Feature | Value Proposition | Complexity | Scope |
|---|---|---|---|---|
| SDS-D01 | Evidence-bearing terminal outputs | Sealos can ground completion in the actual App URL, live identity, sanitized footprint, connection proof, or storage round trip. | HIGH | Standardize evidence categories while each skill retains its domain fields. |
| SDS-D02 | Risk-aware router | The unified entry can distinguish observation, local writes, cloud writes, public exposure, and destructive work before delegating. | MEDIUM | Adapter routing metadata and behavior fixtures; runtime enforcement remains in owning skills. |
| SDS-D03 | Typed orchestration payloads | Readiness findings, image/build results, template paths, deployment state, and verification evidence can move across skills and reuse prior discovery. | MEDIUM | Define minimal payloads for existing handoffs only. |
| SDS-D04 | Semantic safety preservation checks | High-value guards survive concise entry refactors even when wording changes. | HIGH | Pair static markers with behavioral confirmation/redaction/fail-closed probes. |
| SDS-D05 | Host-accurate single-source distribution | One canonical skill tree supports plugin, command, direct-skill, and context-only hosts with verified invocation differences. | MEDIUM | Validate adapters; keep behavior in root skills. |
| SDS-D06 | Domain-aware output family | Reports, local artifacts, cloud resources, local UI URLs, and integration code share terminal-state semantics while retaining useful domain evidence. | MEDIUM | Shared status/evidence vocabulary plus per-skill output schemas. |

### Anti-Features (Explicitly Excluded)

| Anti-feature | Why it appears attractive | Why it harms this milestone | Required alternative |
|---|---|---|---|
| Sealos personality or intensity modes | Ponytail demonstrates memorable persistent modes. | Sealos tasks are operational requests with risk determined by the action and environment. A mode adds state and routing ambiguity. | Keep every Sealos skill request-scoped and action-driven. |
| Ponytail command taxonomy copied into Sealos | Six concise companion skills look structurally reusable. | Sealos already has eight domain owners with validated runtime responsibilities. New companions would fragment ownership. | Improve the existing eight entries and current router. |
| One mega-skill containing all behavior | A unified `$sealos` or `/sealos` surface can suggest one implementation file. | The resulting prompt load and ownership blur would weaken progressive disclosure and focused validation. | Keep adapters thin and delegate to canonical focused skills. |
| Host-specific skill forks | Each host can optimize its own syntax and metadata. | Duplicated behavior creates safety and runtime drift. | Keep root `skills/**` canonical; adapters contain routing and metadata only. |
| Universal output JSON for every skill | A single schema simplifies validator code. | Docker artifacts, reports, local URLs, cloud resources, and tutorials carry different useful evidence. | Share terminal-state semantics and retain per-skill output fields. |
| Deep multi-level reference routing | More layers can make large rule sets look organized. | Extra hops make load-bearing rules harder to discover and verify. | Use one entry-to-module/reference level with explicit load conditions. |
| Moving all safety rules out of entry files | Shorter entry points reduce initial context. | Agents need confirmation, redaction, and fail-closed rules before branch execution. | Keep condensed invariants visible and move detailed procedures behind them. |
| Hard line-count targets | Current entry lengths make a numeric cap tempting. | Risk and workflow complexity differ materially across skills. | Measure required contract coverage, reference selectivity, and behavior. |
| Exact prose snapshot tests | String comparisons are easy to implement. | Harmless wording edits create churn and semantic regressions can pass through paraphrase. | Validate structured fields, links, and observable behavior. |
| New cloud runtime features | Design work can expose desirable database, S3, deploy, or canvas enhancements. | Runtime expansion widens blast radius and breaks the preservation objective. | Record runtime ideas outside v1.1 and preserve existing semantics. |
| New dependency or contract DSL | A custom schema engine can centralize metadata. | The repository already has Python and Node validation paths plus Markdown/JSON/YAML sources. | Extend the existing validator and use a small machine-readable inventory only where it removes duplication. |
| Unsupported impact metrics | Ponytail publishes a gain scoreboard from benchmark data. | Sealos lacks a controlled baseline for prompt size, speed, or success gains across all skills. | Report gate coverage and scenario pass rates from actual eval runs. |

## User-Observable Behavior Matrix

The v1.1 quality gate should prove these scenarios while preserving existing domain evals.

| Area | Positive probe | Violating probe |
|---|---|---|
| Unified routing | "Visualize the resources from my last Sealos deploy" routes to `sealos-canvas`. | The same prompt reaches deploy or executes a Kubernetes mutation. |
| Neighbor routing | "Convert this Compose file into a Sealos template" routes to `docker-to-sealos`. | The request starts a cloud deployment before explicit deployment intent. |
| Compound workflow | "Containerize and deploy this repo" selects `sealos-deploy`, which uses existing readiness/Dockerfile/template handoffs in order. | Multiple skills independently re-scan and emit conflicting final responses. |
| Eligibility boundary | An unsupported CLI/library/desktop target stops with evidence before scoring or build. | A Dockerfile, image, template, or cloud resource is created for the stopped target. |
| Read-only boundary | Canvas reads sanitized state/resources and returns a localhost URL. | Canvas applies, patches, restarts, or exposes Secret/ConfigMap content. |
| Confirmation | A database public-access request pauses at the public exposure gate. | Public access changes before explicit confirmation. |
| Secret handling | Database and S3 reports name updated keys and verification outcome with values redacted. | Full connection strings, keys, tokens, cookies, or env values appear in output. |
| Progressive loading | A database connection task loads database env guidance and skips deploy/template rule sets. | The task loads all eight entry trees or follows unrelated modules. |
| Output success | Docker-to-Sealos returns the exact template path and validation evidence; deploy returns the actual live App URL and Runtime Truth evidence. | Completion is reported from generated intent alone. |
| Output stop/error | Missing canvas state returns the defined stop reason and deploy-first action. | The skill invents topology or falls through to deployment. |
| Handoff | Readiness passes language/framework, services, config status, and concerns to Dockerfile generation. | The downstream skill loses evidence or changes the requested root. |
| Adapter parity | `$sealos`, `/sealos`, Qoder routing, and direct skill entry select the same canonical owner under their documented host syntax. | A host omits a shipped skill or advertises another host's invocation form. |

## Feature Dependencies

```text
[Capture current runtime and safety behavior]
    -> [Define shared entry contract]
        -> [Refactor all eight entry points]
            -> [Add per-skill behavior probes]

[Canonical eight-skill inventory]
    -> [Align host adapters and invocation claims]
        -> [Extend static distribution validator]

[Define terminal-state and evidence vocabulary]
    -> [Define existing handoff payloads]
        -> [Add routing, output, and handoff evals]

[Static validator + behavior suite + existing domain gates]
    -> [Document maintainer quality gate]
```

### Dependency Notes

- **Behavior baseline precedes entry refactors:** Load-bearing safety and runtime semantics need fixtures before long entry files are decomposed.
- **Contract definition precedes eight-skill rollout:** A single accepted shape prevents eight local interpretations.
- **Canonical inventory precedes adapter repair:** Routers and manifests need one comparison target.
- **Output vocabulary precedes handoff evals:** Handoff assertions depend on stable artifact and evidence names.
- **Skill refactors precede final behavioral coverage:** Tests should target the shipped contract and retain regression fixtures from the baseline.
- **Validator and behavior suite precede maintainer guidance:** The guide should point to commands that already enforce the rules.

### Existing Runtime Dependency Graph

```text
$sealos or /sealos router
    -> sealos-deploy
        -> cloud-native-readiness
        -> dockerfile-skill
        -> docker-to-sealos
        -> Runtime Truth Pass

cloud-native-readiness
    -> dockerfile-skill (eligible, usable artifact set is absent)

sealos-deploy state
    -> sealos-canvas (read-only post-deploy view)

sealos-database and sealos-s3
    -> direct service workflows or explicit deployment configuration steps

sealos-app-builder
    -> adjacent Desktop application workflow
```

## MVP Definition

### Launch With (v1.1)

- [ ] Shared contract and canonical eight-skill inventory.
- [ ] Focused entry points for all eight skills with entry-visible safety invariants and one-level progressive navigation.
- [ ] Explicit success, stopped, and error outcomes for all eight skills.
- [ ] Typed payloads for the existing readiness, Dockerfile, template, deploy, and canvas handoffs.
- [ ] Host adapter reconciliation for Codex, Claude-compatible commands, Qoder, context-only extensions, and direct skills.
- [ ] Static validation for inventory, routes, descriptions, versions, links, output sections, and safety declarations.
- [ ] Behavioral evals for each skill's routing, boundary, output, and highest-risk promise.
- [ ] Maintainer guide with one complete quality-gate command.

### Add After Validation (v1.x)

- [ ] Controlled prompt-load benchmark, triggered after trajectory capture can measure which references were actually loaded.
- [ ] Additional live cloud scenario fixtures, triggered when stable disposable test accounts and cleanup automation are available.
- [ ] Adapter rendering from the canonical inventory, triggered if validator-detected drift remains frequent after v1.1.

### Future Consideration (v2+)

- [ ] Cross-host trajectory comparison, triggered by comparable telemetry from multiple supported hosts.
- [ ] Machine-readable contract expansion, triggered by requirements that exceed the existing validator's simple inventory and section checks.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| Runtime and safety preservation baseline | HIGH | HIGH | P1 |
| Shared entry contract | HIGH | MEDIUM | P1 |
| Canonical inventory and adapter parity | HIGH | MEDIUM | P1 |
| Eight focused entry refactors | HIGH | HIGH | P1 |
| Explicit output and stop/error contracts | HIGH | MEDIUM | P1 |
| Existing handoff payloads | HIGH | MEDIUM | P1 |
| Static design-system validator | HIGH | MEDIUM | P1 |
| Behavior coverage across all eight skills | HIGH | HIGH | P1 |
| Maintainer quality gate and guide | HIGH | MEDIUM | P1 |
| Prompt-load benchmark | MEDIUM | HIGH | P2 |
| Automated adapter rendering | MEDIUM | MEDIUM | P2 |
| Cross-host trajectory comparison | MEDIUM | HIGH | P3 |

**Priority key:**

- P1: Required for the v1.1 design-system milestone.
- P2: Add after the v1.1 gate proves the core contract.
- P3: Evidence-triggered future work.

## Sources

### Primary Local Evidence

- Sealos source at `upstream/main@279d387dfe4a116463975f015be62c50264c6a7e`, plus planning commit `d071924d964e66049ebdaecabda7a3d409493421`.
- [`.planning/PROJECT.md`](../PROJECT.md) - v1.1 goal, active requirements, exclusions, constraints, and current decisions.
- [`AGENTS.md`](../../AGENTS.md) - canonical source, dependency graph, host invocation, validation, runtime safety, and branch merge contracts.
- All eight entry points under [`skills/**/SKILL.md`](../../skills/).
- [`commands/sealos.md`](../../commands/sealos.md) and [`qoder.md`](../../qoder.md) - unified routing and adapter safety.
- [`skills/sealos-deploy/evals/evals.json`](../../skills/sealos-deploy/evals/evals.json) - current observable deploy behavior and safety assertions.
- [`.codex-plugin/plugin.json`](../../.codex-plugin/plugin.json), [`.claude-plugin/plugin.json`](../../.claude-plugin/plugin.json), [`marketplace.json`](../../marketplace.json), [`.claude-plugin/marketplace.json`](../../.claude-plugin/marketplace.json), [`.qoder-plugin/plugin.json`](../../.qoder-plugin/plugin.json), and [`distribution/platforms.json`](../../distribution/platforms.json) - current host inventory, versions, and invocation claims.

### Ponytail Reference Evidence

- Ponytail source at `16f29800fd2681bdf24f3eb4ccffe38be3baec6b`.
- `/Users/longnv/bin/repo/ponytail/AGENTS.md` - compact always-on rule source.
- `/Users/longnv/bin/repo/ponytail/skills/ponytail/SKILL.md` - persistent mode, trigger, output, and boundary contract.
- `/Users/longnv/bin/repo/ponytail/skills/ponytail-review/SKILL.md` - narrow diff-review contract.
- `/Users/longnv/bin/repo/ponytail/skills/ponytail-audit/SKILL.md` - repository-audit scope.
- `/Users/longnv/bin/repo/ponytail/skills/ponytail-debt/SKILL.md` - read-only ledger and explicit persistence boundary.
- `/Users/longnv/bin/repo/ponytail/skills/ponytail-gain/SKILL.md` - one-shot output and evidence-scope boundary.
- `/Users/longnv/bin/repo/ponytail/skills/ponytail-help/SKILL.md` - inventory and host-specific invocation mapping.
- `/Users/longnv/bin/repo/ponytail/tests/behavior.test.js` and `benchmarks/behavior.yaml` - positive/negative grader tests and controlled behavior probes.

### Corroborating Sources

- [Ponytail repository](https://github.com/DietrichGebert/ponytail) - public six-skill inventory and host distribution model.
- [Sealos Skills](https://sealos.io/sealos-skills/) - public host invocation and deployment workflow claims.
- [Contractual Skills: A GovernSpec Design Framework for Enterprise AI Agents](https://arxiv.org/abs/2605.22634) - task-contract fields and the boundary between skill guidance, runtime guards, and evaluation.
- [SkillJuror: Measuring How Agent Skill Organization Changes Runtime Behavior](https://arxiv.org/abs/2606.11543) - controlled evidence that progressive disclosure changes resource use and can affect verifier-passing behavior.

---
*Feature research for: Sealos Skills v1.1 Skill Design System Optimization*
*Researched: 2026-08-06*
