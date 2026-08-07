# Phase 12: Branch Policy, Documentation, and Release Audit - Context

**Gathered:** 2026-08-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Produce source-aware release evidence for the v1.1 design-system work, audit the `main` to `brain-deploy-preview` integration boundary file by file, synchronize public inventory and host claims across the root README, localized READMEs, manifests, platform evidence, and version fields, and run the complete preservation and quality gates. The phase records and verifies policy outcomes; it does not perform a branch merge, publish a release, add runtime capabilities, or mutate a Sealos provider environment.

</domain>

<decisions>
## Implementation Decisions

### Audit anchors and source authority
- **D-12-01:** Record immutable audit anchors at the start of the release audit: source `main` is `a2efc15e95b86582469f423f6e9cae1bcfce4585`, target `upstream/brain-deploy-preview` is `dbc55f0d4e572d283d3244581246823a1ca6b932`, and the current release candidate is `ef8f2aceb2e7f0b915713419cd129fbc0454d717`.
- **D-12-02:** Treat `AGENTS.md` as the policy authority for branch ownership, preview exclusions, Railpack/Kaniko rules, and required validation. Use `main` and `brain-deploy-preview` branch trees as audit inputs; keep the current worktree as the release-candidate evidence tree.

### File classification and preview boundary
- **D-12-03:** Classify every changed path in the source-to-target comparison as `aligned`, `adapted`, or `excluded`, with one evidence row naming source content, target content, policy rule, and final disposition. `aligned` means shared behavior matches the selected source; `adapted` means target behavior differs under a documented prepare-only or Railpack/Kaniko rule; `excluded` means a main-only runtime, plugin, distribution, Canvas, full-deploy, or planning surface stays out of preview.
- **D-12-04:** Keep the preview branch prepare-only: preserve eligibility, assess, optional Railpack probe, image detection, Dockerfile preparation, build request, sandbox Kaniko or image reuse, template generation, and delivery manifest. Keep OAuth, Template API deployment, UPDATE, rollout/rollback, Runtime Truth smoke, Canvas, and BuildKit out of the preview classification.
- **D-12-05:** Synchronize the five explicitly aligned skill directories (`cloud-native-readiness`, `sealos-app-builder`, `sealos-database`, `sealos-s3`, `docker-to-sealos`) against the recorded source tree. Compare `dockerfile-skill` against source while permitting only the documented normalized Railpack evidence, precedence, raw-Railpack rejection, and Dockerfile-plus-Kaniko differences. Evaluate every `sealos-deploy` difference manually.
- **D-12-06:** Preserve preview-owned `AGENTS.md`, `README.md`, `CLAUDE.md`, `.gitignore`, prepare-flow diagram, `k8s-kaniko-job`, and preview-generated artifact rules. Keep main plugin, marketplace, distribution, branding assets, `.planning` history, main-only validators, and full-deploy scripts classified as excluded when they occur in the source delta.

### Public claim and release evidence synchronization
- **D-12-07:** Use the physical eight-entry `skills/**` inventory and `scripts/validate_skill_design.py` as the behavioral source of truth. Synchronize root `README.md`, every `readmes/README.*.md` sibling, `commands/sealos.md`, host manifests, `distribution/platforms.json`, marketplace metadata, and version fields to the same inventory and host-specific invocation semantics.
- **D-12-08:** Keep version evidence internally consistent across `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `marketplace.json`, `distribution/platforms.json`, and related host manifests. A release audit records the observed version/tag values and the exact validator output; it does not invent a tag or push one.
- **D-12-09:** Write the durable file-level release report under `.planning/phases/12-branch-policy-documentation-and-release-audit/12-RELEASE-AUDIT.md`. The report includes source/target SHAs, comparison commands, aligned/adapted/excluded rows, public-claim changes, executed gates, retained branch behavior, and follow-ups outside v1.1.

### Verification and release boundary
- **D-12-10:** Run deterministic offline checks as the required gate: design/inventory/router/safety/eval validation, the Phase 11 maintainer gate, dependency and Docker-to-Sealos quality gates, deploy/service/Canvas contract suites, plugin metadata validation, JSON/link checks, and `git diff --check`. Reuse Phase 10 Runtime Truth and live-smoke evidence with source paths and timestamps.
- **D-12-11:** Keep provider login, Kubernetes mutations, database/bucket deletion, public-access changes, credential rotation, branch merge, push, tag creation, and release publication outside this phase unless an explicit later authorization names the exact operation. Report missing live evidence as a scoped follow-up with the existing offline evidence intact.
- **D-12-12:** Treat a claim as release-ready only when the owning file, validator, branch-policy row, and sanitized evidence agree. Any unresolved branch-policy conflict or public inventory drift blocks REL-01/SDS-12 closure and remains visible in the release report.

### the agent's Discretion

- Exact report table columns, helper script names, and grouping of aligned rows may follow existing Markdown and Python/Node validator patterns.
- The plan may use a single report generator or a set of focused read-only audit scripts when the output remains deterministic and source-backed.
- Existing Phase 8-11 evidence may be referenced by path and commit rather than copied into a second artifact.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope, requirements, and branch policy
- `.planning/ROADMAP.md` §Phase 12 — phase goal, requirements, success criteria, and four-plan order.
- `.planning/REQUIREMENTS.md` §Inventory and Host Distribution, §Runtime Evidence and Output Design — REL-01 and SDS-12 definitions.
- `.planning/PROJECT.md` — canonical skill source, host semantics, runtime preservation, and milestone boundaries.
- `AGENTS.md` §Branch Merge Policy: `main` → `brain-deploy-preview` — source/target commit recording, aligned directories, Railpack delta, preview exclusions, and validation procedure.

### Canonical implementation and public surfaces
- `skills/*/SKILL.md` — physical eight-skill inventory and behavior source.
- `commands/sealos.md` — unified `/sealos` routing and host semantics.
- `README.md` — root install, plugin, direct-entry, and capability claims.
- `readmes/README.*.md` — localized public claims to synchronize with the root inventory.
- `.codex-plugin/plugin.json` — Codex plugin identity, version, and root skill pointer.
- `.claude-plugin/plugin.json`, `marketplace.json`, `.agents/plugins/marketplace.json`, `.codebuddy-plugin/marketplace.json`, `.qoder-plugin/plugin.json` — host manifests and marketplace projections.
- `distribution/platforms.json` — platform support, install syntax, versions, and evidence claims.
- `marketplaces/README.md`, `gemini-extension.json`, `qwen-extension.json`, `openclaw.plugin.json`, `qoder.md` — host-specific capability and routing claims.

### Preservation and verification gates
- `scripts/validate_skill_design.py` — inventory, route, version, link, eval, and safety validator.
- `scripts/maintainer-quality-gate.py` — Phase 11 aggregate offline gate.
- `scripts/validate-codex-plugin.py` — plugin metadata and platform registry validator.
- `scripts/test_dependency_skill_gates.py` — dependency and Docker-to-Sealos quality gate.
- `scripts/test_deploy_entry_contract.mjs`, `scripts/test_deploy_pipeline_contract.mjs`, `scripts/test_deploy_safety_contract.mjs`, `scripts/test_runtime_truth_contract.mjs`, `scripts/test_canvas_contract.mjs` — preserved deploy/runtime contract checks.
- `docs/skill-runtime-preservation-checklist.md` — existing preservation checklist and evidence vocabulary.
- `skills/sealos-deploy/scripts/test-sealos-live-smoke.mjs`, `skills/sealos-deploy/scripts/test-sealos-log-scan.mjs`, `skills/sealos-deploy/scripts/test-sealos-footprint.mjs` — existing runtime evidence helpers.
- `.planning/phases/08-dependency-skill-entry-refactors/08-CONTEXT.md`, `.planning/phases/09-service-and-adjacent-skill-entry-refactors/09-CONTEXT.md`, `.planning/phases/10-deploy-orchestration-and-runtime-truth/10-CONTEXT.md` — locked handoff, runtime, and preview decisions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/validate_skill_design.py` and `scripts/maintainer-quality-gate.py` already emit deterministic JSON suitable for release evidence.
- `scripts/validate-codex-plugin.py` covers plugin metadata, platform entries, asset paths, and version claims.
- `git diff --name-status --find-renames`, `git diff --check`, and commit/tree inspection provide read-only file-level branch evidence.
- Existing Phase 8-11 UAT, verification, summaries, and evidence files provide sanitized runtime and design-contract proof.

### Established Patterns
- Release and planning artifacts are Markdown with frontmatter, explicit source paths, command evidence, and self-check sections.
- Root `skills/**` owns behavior; manifests and host adapters project it.
- Preview branch files preserve their own identity and prepare-only flow; main plugin surfaces and full runtime deploy behavior have separate ownership.
- Python validators use standard-library diagnostics and nonzero `--check` exits; Node helpers emit structured JSON and stable exit codes.

### Integration Points
- The release report consumes branch diffs, public inventory validators, manifest versions, and prior phase evidence.
- README/localized README updates must preserve host-specific `$sealos`, `/sealos`, direct `skills.sh` semantics and the eight-skill inventory.
- The final gate must cover both the current release candidate and the documented preview boundary without mutating either remote branch.

</code_context>

<specifics>
## Specific Ideas

The release report should make a maintainer answer four questions from one file: which source and target commits were compared, which changes were aligned/adapted/excluded, which public claims and version fields were verified, and which gates prove the retained runtime and safety behavior.

</specifics>

<deferred>
## Deferred Ideas

- Actual merge or synchronization of `main` into `brain-deploy-preview` remains a separate maintainer operation after this audit.
- Provider-backed deploy, database, S3, and Desktop iframe runs remain outside the deterministic release gate unless a later task authorizes a named environment and cleanup plan.
- New plugin capabilities, generated host adapters, release tag creation, and public publication remain outside v1.1 release-audit scope.

</deferred>

---

*Phase: 12-Branch Policy, Documentation, and Release Audit*
*Context gathered: 2026-08-07*
