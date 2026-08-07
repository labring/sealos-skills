# Pitfalls Research

**Domain:** Plugin-first AI skill design systems for cloud workflows
**Researched:** 2026-08-06
**Confidence:** HIGH for repository-local behavior and distribution risks; MEDIUM for inferred maintainer ergonomics

## Critical Pitfalls

### Pitfall 1: Concision removes load-bearing safety

**What goes wrong:** A shorter `SKILL.md` hides confirmation gates, secret-handling rules, destructive-action limits, or runtime verification requirements behind a deep reference path. An agent can begin a mutation before it has loaded the rule that must govern the mutation.

**Why it happens:** Ponytail rewards focused entry points, and line-count cleanup is easy to measure. Sealos has safety rules that are intentionally visible at workflow entry, especially in `sealos-deploy`, `sealos-database`, `sealos-s3`, and `docker-to-sealos`.

**How to avoid:** Define an entry-visible safety set per skill before editing. Keep trigger, scope, mutation boundary, confirmation condition, secret rule, and success evidence in the entry file. Route detailed protocol steps to one-level modules or references. Preserve machine-mapped MUST rules in `docker-to-sealos`.

**Warning signs:** A diff removes a safety keyword without adding an equivalent check; a skill's first screen contains only marketing prose; a destructive operation is documented solely in a reference file; a quality gate checks structure while omitting safety assertions.

**Phase to address:** Behavior baseline and shared contract.

### Pitfall 2: Pairwise host parity hides a shared inventory error

**What goes wrong:** Every adapter agrees with the same incomplete list, so pairwise parity tests pass while users lose a skill. The current repository has eight root skills and routing surfaces with seven entries in several Claude and CodeBuddy projections.

**Why it happens:** Validators compare selected files to one another instead of deriving expected membership from the physical skill source and the unified router.

**How to avoid:** Discover `skills/*/SKILL.md` as the canonical inventory, parse `commands/sealos.md` as the broad routing contract, then validate every explicit host projection against that expected set. Make omissions and unexpected entries fail with the skill name and owning surface.

**Warning signs:** A validator reports parity without reporting the expected inventory; a new skill requires hand-editing an undocumented list; `sealos-canvas` appears in root and Qoder but disappears from Claude or CodeBuddy.

**Phase to address:** Inventory and adapter alignment.

### Pitfall 3: A second canonical inventory creates a new drift source

**What goes wrong:** A new `distribution/skills.json` becomes a second authority alongside `skills/*/SKILL.md` and `commands/sealos.md`. Future edits update one file and leave the others stale.

**Why it happens:** A machine-readable manifest feels convenient for validators and packaging, and Ponytail uses explicit generated or checked projections in places where the host requires them.

**How to avoid:** Keep physical skill directories and the unified router as the source of truth. Build an in-memory inventory during validation or generate a derived report that is clearly disposable. Add a second committed manifest only when a host protocol requires it and define its generator and ownership first.

**Warning signs:** A plan introduces a new JSON list without a regeneration command; the same description and version appear in three independent files; reviewers cannot identify which file wins after a conflict.

**Phase to address:** Inventory and validator design.

### Pitfall 4: Refactoring before recording behavior loses the baseline

**What goes wrong:** Entry files look cleaner, yet routing, progressive loading, confirmation, output, or handoff behavior changes without a detectable regression.

**Why it happens:** Markdown changes invite visual review, while the existing eval fixtures cover only deploy, database, S3, and canvas. Four skills have no dedicated behavior fixtures.

**How to avoid:** Capture a baseline matrix for all eight skills before the first refactor. Include positive and negative routing probes, required confirmation probes, stop/error output probes, and handoff payload probes. Treat existing runtime tests as authoritative and add focused evals for the missing skills.

**Warning signs:** The first implementation commit changes eight entries before any new failing test exists; tests assert only headings or line counts; a skill can match a prompt through a broad keyword with no boundary assertion.

**Phase to address:** Behavior baseline.

### Pitfall 5: Cross-skill handoffs become implicit and contradictory

**What goes wrong:** A parent skill tells the agent to “use the deploy skill” without specifying the artifact, state, or stop condition. Two skills each claim ownership of image building, credentials, or rollout verification, producing duplicate work or unsafe mutations.

**Why it happens:** Shared workflows naturally span readiness, Dockerfile generation, conversion, and deployment. Copying prose between entries is faster than defining a typed handoff.

**How to avoid:** Give every handoff a named owner, input artifact, allowed mutation, output artifact, failure return, and verification evidence. Keep orchestration in the narrowest owning skill and link to sibling entry points instead of duplicating their rules.

**Warning signs:** Handoff text contains a bare skill name; two modules define the same artifact filename; a downstream skill assumes authentication or state that the upstream skill never records; evals verify each skill in isolation only.

**Phase to address:** Shared contract and behavior evals.

### Pitfall 6: Progressive disclosure becomes deep disclosure

**What goes wrong:** The entry file points through several nested references before the agent reaches an actionable rule. Context loading becomes unpredictable and safety behavior depends on model willingness to follow links.

**Why it happens:** Splitting a long skill into many small files reduces local line count, and a generic “read references as needed” instruction looks reusable.

**How to avoid:** Use one focused entry plus one level of owned modules for routine detail. Keep trigger, boundary, safety, output, and handoff contracts in the entry. Add a validator for broken references and a depth limit that reports exceptions explicitly.

**Warning signs:** A normal task requires reading more than two files before the first decision; references link to other references; a module has no clear owner; entry content loses the exact success condition.

**Phase to address:** Shared contract and all eight entry refactors.

### Pitfall 7: Copying Ponytail runtime mechanisms into Sealos

**What goes wrong:** Sealos gains persona language, intensity modes, session hooks, statusline state, or a broad command taxonomy that does not fit cloud deployment safety or host distribution.

**Why it happens:** Ponytail's consistency is visible in its runtime and hook bundle, while the transferable value actually comes from ownership, focused skills, adapters, and executable checks.

**How to avoid:** Adopt mechanism-level patterns only: explicit triggers, boundaries, lifecycle, outputs, thin adapters, and positive/negative tests. Keep Sealos's existing auth, Kubernetes, artifact, secret, and rollout contracts intact. Record rejected runtime additions as anti-features.

**Warning signs:** A design document mentions new hooks or persistent state without a Sealos user workflow; host adapters start carrying behavior; a skill's vocabulary shifts toward Ponytail concepts rather than Sealos tasks.

**Phase to address:** Shared contract review and implementation review.

### Pitfall 8: Main-to-preview scope leaks during distribution edits

**What goes wrong:** A change planned for `main` is copied into `brain-deploy-preview`, adding full deployment, OAuth, Template API, UPDATE mode, BuildKit, or plugin distribution surfaces to a prepare-only branch.

**Why it happens:** The branches share skill names and many files, and a broad parity script can make an excluded file look like an obvious merge target.

**How to avoid:** Tag every planned file as aligned, adapted, or excluded under the branch policy. Keep `sealos-deploy` and `k8s-kaniko-job` on the preview flow, preserve the preview README and AGENTS identity, and exclude main-only plugin and marketplace surfaces from preview merges.

**Warning signs:** A roadmap says “sync all manifests” without naming the target branch; a preview diff adds `.codex-plugin/`, `commands/`, or full-deploy state; `sealos-canvas` or BuildKit appears without a preview requirement.

**Phase to address:** Adapter alignment and final branch-policy audit.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Enforce a universal line cap | Fast style signal | Hides domain-specific safety and encourages prose deletion | Only as an advisory report |
| Add a committed inventory JSON beside skill directories | Simple parser input | Creates competing ownership and stale packaging metadata | Only with a required host schema and generator |
| Copy a canonical paragraph into every adapter | Local readability | Host behavior diverges on the next edit | Never for workflow semantics |
| Test headings and keywords only | Cheap CI | Misses routing, stop, confirmation, and handoff behavior | Early exploratory baseline only |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Codex plugin manifest | Treat plugin name as a command router | Validate plugin identity and point it at the root `skills/` tree |
| Claude/Qoder/CodeBuddy adapters | Maintain independent skill lists | Compare each projection with the discovered eight-skill inventory |
| `commands/sealos.md` | Use broad keyword routing without exclusions | State positive triggers, boundaries, and escalation to direct skills |
| `skills/sealos-deploy` handoffs | Assume sibling skills share hidden state | Name artifacts and verify `.sealos` state at each boundary |
| `brain-deploy-preview` | Merge main's full runtime contract | Classify files against the prepare-only branch policy before adoption |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Load every module at session start | Large prompt and slower first decision | Keep entry files focused and load one owned module on demand | As the skill knowledge tree grows |
| Run network/provider benchmarks in every PR | Flaky, slow validation and rate-limit failures | Keep deterministic local graders in the required gate; run provider benchmarks separately | Any offline CI or contributor setup |
| Reparse multiple full host manifests for each test | Repeated I/O and opaque failures | Parse once, report per-surface mismatches | As host surfaces and eval cases multiply |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Move credential or secret rules into a deep reference | Agent exposes or mishandles credentials before loading the rule | Keep secret handling entry-visible and assert it in the validator |
| Treat a handoff artifact as trusted without provenance | Wrong image, namespace, or template reaches a mutation step | Require source, owner, and verification fields in the handoff contract |
| Use eval fixtures containing real tokens, kubeconfigs, or URLs | Secrets leak through committed tests or logs | Use synthetic placeholders and scrub captured output |
| Let design refactors alter confirmation wording without a negative test | Destructive action proceeds under ambiguous consent | Test explicit confirmation, refusal, and cancellation paths |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Every skill begins with the same generic preamble | Users and agents cannot tell which workflow owns the request | Use a shared contract shape with domain-specific trigger and outcome text |
| Host examples mix `$sealos`, `/sealos`, and direct `skills.sh` commands | Users select a surface that their host cannot execute | Keep host invocation examples in host-owned sections and validate them |
| Output contract names internal files without a user-facing outcome | Users cannot tell whether work stopped, failed, or completed | State result, evidence, next action, and safe stop condition |
| Confirmation is buried after an action checklist | Users see the mutation before the consent boundary | Place the confirmation gate before the first external mutation |

## "Looks Done But Isn't" Checklist

- [ ] **Eight-skill inventory:** Root and Qoder show eight entries while every explicit host projection is checked for the same set.
- [ ] **Safety visibility:** Each entry exposes its mutation boundary, confirmation condition, secret rule, and success evidence.
- [ ] **Behavior coverage:** All eight skills have positive and negative routing probes plus relevant output and handoff assertions.
- [ ] **Reference integrity:** Every linked module exists, has one owner, and stays within the approved disclosure depth.
- [ ] **Version parity:** Skill metadata, plugin version, host projections, and validator expectations derive from one declared source.
- [ ] **Branch policy:** Main-only distribution and runtime files are classified before any preview-branch merge.
- [ ] **Maintainer gate:** A single local command runs structural, semantic, and behavior checks without network access.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Safety rule was hidden | HIGH | Restore the last known entry contract, add a failing safety test, then move only explanatory detail to a module |
| Host projection lost a skill | MEDIUM | Recompute inventory from `skills/*/SKILL.md`, repair the adapter, and add the missing-surface regression fixture |
| Behavior changed during refactor | HIGH | Compare the baseline matrix, revert the narrow offending section, then update the contract with an explicit behavior test |
| Handoff became ambiguous | MEDIUM | Name the artifact and owner, add a stop/error return, and test the parent-to-child path |
| Preview branch received main-only files | HIGH | Remove the scope leak in a focused commit and record the aligned/adapted/excluded decision in the merge audit |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Concision removes safety | Behavior baseline / shared contract | Entry-visible safety assertions and mutation review |
| Pairwise parity hides omissions | Inventory and adapter alignment | Eight-skill projection matrix with missing and unexpected checks |
| Second inventory source | Inventory and validator design | Source-of-truth decision plus no unowned manifest check |
| Missing behavior baseline | Behavior baseline | All eight baseline probes recorded before refactor |
| Ambiguous handoffs | Entry refactors / behavior evals | Typed handoff fixtures and downstream failure tests |
| Deep disclosure | Entry refactors | Reference-depth and broken-link checks |
| Ponytail runtime leakage | Contract review | Anti-feature review and Sealos runtime regression suite |
| Preview scope leak | Branch-policy audit | Aligned/adapted/excluded file report |

## Sources

- `/Users/longnv/bin/repo/ponytail/AGENTS.md`
- `/Users/longnv/bin/repo/ponytail/skills/*/SKILL.md`
- `/Users/longnv/bin/repo/ponytail/scripts/`
- `/Users/longnv/bin/repo/ponytail/tests/`
- `AGENTS.md` in this repository, including the `main` to `brain-deploy-preview` merge policy
- `.planning/research/STACK.md`
- `.planning/research/FEATURES.md`
- `.planning/research/ARCHITECTURE.md`
- `skills/*/SKILL.md`, `commands/sealos.md`, host manifests, and existing eval fixtures

---
*Pitfalls research for: Sealos Skills v1.1 Skill Design System Optimization*
*Researched: 2026-08-06*
