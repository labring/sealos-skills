# Skill Design Quality Gate

**Purpose:** Give maintainers one repeatable, provider-free check for the canonical skills, the unified router, structured behavior traces, host projections, safety canaries, and existing skill contracts.

## Run the Gate

Run this command from the repository root:

```bash
python3 scripts/maintainer-quality-gate.py --root . --fixture tests/fixtures/maintainer-quality-gate.json --check
```

The command prints an aggregated JSON report to stdout. `summary.requiredFailures` identifies every failed required component. With `--check`, any required failure returns exit code `1`; a report containing only passed and conditional components returns exit code `0`. Component records include the stable `id`, command, `status`, exit code, duration, and bounded redacted diagnostics.

The registry currently contains 21 components: 20 required offline checks and one optional local Docker prerequisite. A healthy checkout reports 20 passed and either one conditional check when Docker is unavailable or 21 passed when Docker is available.

## Ordered Coverage

`tests/fixtures/maintainer-quality-gate.json` is the execution registry. The gate runs components in this order and uses the listed command from the repository root.

| Order | Component | Command | Coverage |
| ---: | --- | --- | --- |
| 1 | `design-validator` | `python3 scripts/validate_skill_design.py --root . --check` | Contract shape, eight-entry inventory, routes, host projections and pointers, OpenAI metadata, public claims, versions, Markdown links, all eight eval schemas, and safety canaries. |
| 2 | `inventory-tests` | `python3 scripts/test_skill_design_inventory.py` | Physical inventory and router reader behavior, frontmatter, path safety, and route table shape. |
| 3 | `router-tests` | `python3 scripts/test_skill_design_router.py` | Clear owner selection, compound handoff order, interaction classes, typed handoff fields, and side-effect-free ambiguity. |
| 4 | `safety-tests` | `python3 scripts/test_skill_design_safety.py` | Canary registry, positive/violating fixture records, confirmation, redaction, read-only, eligibility, and fail-closed quality-gate mutations. |
| 5 | `validator-tests` | `python3 scripts/test_validate_skill_design.py` | Targeted diagnostics for inventory, projections, claims, versions, links, eval coverage, and safety validation. |
| 6 | `baseline-check` | `node scripts/skill-design-baseline.mjs --fixture tests/fixtures/skill-design-baseline.json --check` | Canonical trace schema, eight owners, one positive and one violating case per skill, evidence, handoff, resource ownership, terminal states, and redaction. |
| 7 | `baseline-tests` | `node --test scripts/test-skill-design-baseline.mjs` | Regression coverage for baseline ownership, source paths, terminal vocabulary, observable evidence, and redaction checks. |
| 8 | `behavior-check` | `node scripts/skill-design-behavior.mjs --fixture tests/fixtures/skill-design-baseline.json --scenarios tests/fixtures/skill-design-behavior.json --check` | Deterministic positive/violating grading, five coverage dimensions, side-effect scenarios, and mutation declarations. |
| 9 | `behavior-tests` | `node --test scripts/test_skill_design_behavior.mjs` | Real-validator mutation tests, structured diagnostics, sensitive-value detection, and writable temporary-copy behavior. |
| 10 | `dependency-contract` | `python3 scripts/test_dependency_skill_contract.py` | Dependency skill contracts and typed cross-skill handoffs. |
| 11 | `service-contract` | `python3 scripts/test_service_skill_contract.py` | Database and S3 service skill contracts and their safety/evidence boundaries. |
| 12 | `deploy-entry-contract` | `node scripts/test_deploy_entry_contract.mjs` | Deploy envelope fields, evidence, terminal state, redaction status, and local artifact links. |
| 13 | `deploy-pipeline-contract` | `node scripts/test_deploy_pipeline_contract.mjs --artifacts` | Deploy phase order, typed handoffs, artifact paths, state/live reconciliation, and redaction. |
| 14 | `deploy-safety-contract` | `node scripts/test_deploy_safety_contract.mjs` | Deploy confirmation, credential scope, kubeconfig scope, redaction, cleanup, and rollback canaries. |
| 15 | `runtime-truth-contract` | `node scripts/test_runtime_truth_contract.mjs` | Runtime readiness, logs, events, footprint collection, stability evidence, and sanitized Canvas handoff. |
| 16 | `canvas-contract` | `node scripts/test_canvas_contract.mjs` | Deployed-state precondition, read-only resource collection, sanitized output, local URL/HTML evidence, and server lifetime. |
| 17 | `dockerfile-syntax` | `node --check skills/dockerfile-skill/scripts/validate-dockerfile.mjs` | Syntax validation for the Dockerfile helper. |
| 18 | `codex-plugin-validator` | `python3 scripts/validate-codex-plugin.py --root .` | Codex plugin metadata and root skill inventory. |
| 19 | `dependency-skill-gates` | `python3 scripts/test_dependency_skill_gates.py` | Docker-to-Sealos consistency, MUST-map/registry coverage, Compose conversion, and topology quality gates. |
| 20 | `git-diff-check` | `git diff --check` | Whitespace errors across the working tree. |
| 21 | `optional-docker-runtime` | `docker --version` | Optional local prerequisite for container-runtime checks; unavailable Docker is reported as `conditional`. |

The first validator composes inventory, routes, versions, links, eval schemas, and safety checks. Rows 2-19 preserve the skill-local and runtime contract oracles. The gate remains fail-closed for every required row.

## Fixture Ownership

Each fixture has one owning validator and a narrow update rule:

| Fixture or source | Owner and responsibility |
| --- | --- |
| `tests/fixtures/maintainer-quality-gate.json` | Maintainer gate; owns stable component IDs, order, runner, arguments, required flag, and conditional guidance. |
| `tests/fixtures/skill-design-baseline.json` | `scripts/skill-design-baseline.mjs`; canonical trace for all eight physical `skills/*/SKILL.md` owners, with one positive and one violating case per skill. |
| `tests/fixtures/skill-design-behavior.json` | `scripts/skill-design-behavior.mjs`; owns the five coverage dimensions, side-effect scenarios, and mutation records (`skill`, `caseId`, `field`, `expectedCode`). |
| `tests/fixtures/skill-design-router.json` | `scripts/test_skill_design_router.py`; owns clear-owner, ordered compound-deploy, and ambiguous-mutation router traces. |
| `tests/fixtures/skill-design-safety.json` and `docs/skill-safety-canaries.md` | `scripts/skill_design_safety.py`; the fixture records canary mutations and the Markdown registry records the canonical marker/evidence text. |
| `skills/*/evals/evals.json` | The owning skill; every canonical skill keeps at least two cases and declares both positive and violating coverage. |

Update the fixture owned by the failing component. Keep behavior in the physical `skills/` tree and keep `commands/sealos.md` as the broad router source. Host manifests and documentation project those sources.

## Trace Contract

Every baseline case exposes the observable tuple `{text, toolCalls, files}` and the fields that make the outcome machine-checkable:

| Field | Requirement |
| --- | --- |
| `text` | A non-empty, sanitized user-visible result. It names the selected owner and outcome without credentials. |
| `toolCalls` | A non-empty array of deterministic helper or command descriptions for a skill trace. Provider calls use offline descriptions. The ambiguous-router side-effect scenario intentionally uses an empty array. |
| `files` | A non-empty array of observable artifact paths or `stdout:` evidence. Paths stay repository-relative and synthetic values remain safe. |
| `evidence` | Named proof for the owned result, stop condition, or failed step. |
| `safeNextAction` | A non-empty handoff, recovery, or clarification action that can be taken safely. |
| `coverage` | Exactly `routing`, `boundary`, `terminal`, `progressive-loading`, and `highest-risk`. |
| `expectedOwner`, `interactionClass`, `terminalState` | The selected canonical skill, one of the shared interaction classes, and one of `success`, `stopped`, or `error`. |
| `sourceRefs`, `loadedResources` | Existing repository-relative sources plus one-level resources owned by the selected skill. |
| `handoff` | `target`, `inputArtifact`, `allowedAction`, `failureReturn`, and `responseOwner`. `target` may be `none`. |
| `redactionChecks` | At least one named check with `passed: true` for every accepted trace. |
| `guard` | A named canary or boundary is required for every `violating` case. |

## Terminal-State Rules

The grader applies these rules after structural validation:

- A `positive` trace ends in `success` and includes the strongest available owned evidence.
- A `violating` trace ends in `stopped` or `error` and names the guard that held the boundary.
- `stopped` records an unmet precondition, eligibility/read-only/confirmation boundary, evidence observed, and `safeNextAction`. It makes no downstream completion claim.
- `error` records the attempted step or artifact, a sanitized diagnostic, recovery action, and redaction result.
- A clear owner and compound request preserve their typed handoff sequence. An ambiguous mutation terminates at `stopped` before provider, filesystem, or Kubernetes side effects; its scenario has `toolCalls: []` and a clarification file entry.

## Redaction Policy

Trace text, tool-call descriptions, files, evidence, diagnostics, handoffs, generated artifacts, and final responses use placeholders or `<redacted>` markers. Keep these classes out of committed fixtures and retained reports:

- private-key blocks, cloud access-key identifiers, GitHub tokens, and bearer tokens;
- passwords, API keys, secrets, cookies, kubeconfig contents, and environment values;
- complete PostgreSQL, MySQL, Redis, or MongoDB connection strings;
- Secret data and complete ConfigMap values.

`scripts/skill-design-baseline.mjs` rejects credential-shaped trace values. `scripts/maintainer-quality-gate.py` applies the same class of redaction to captured subprocess output and keeps only the last 2,400 characters of a diagnostic. Redaction checks remain explicit evidence even when a field is marked `not_applicable` by a domain contract.

## Mutation-Test Expectations

Mutation tests operate on temporary repository or fixture copies and run the real validator. They prove that a removed contract marker produces a targeted diagnostic while the canonical checkout stays unchanged.

The behavior fixture declares mutations for missing `text`, `evidence`, `safeNextAction`, `coverage`, `handoff`, `redactionChecks`, `guard`, and `loadedResources`; each record names the expected diagnostic code. The behavior test must report a failure for every mutation and identify its skill, case ID, field, and source fixture. Safety tests remove confirmation, redaction, read-only, eligibility, or quality-gate markers from copied skill entries and require the corresponding canary ID. Router tests mutate owner classes, handoff fields, and route membership in copied files and require targeted route diagnostics.

Run focused mutation coverage with:

```bash
node --test scripts/test_skill_design_behavior.mjs
python3 -m unittest scripts.test_skill_design_safety
python3 -m unittest scripts.test_skill_design_inventory
```

## Failure Triage

1. Capture the machine report while preserving the exit code:

   ```bash
   python3 scripts/maintainer-quality-gate.py --root . --fixture tests/fixtures/maintainer-quality-gate.json --check > /tmp/sealos-quality-gate.json
   ```

2. Read `summary.requiredFailures`, then locate each matching component ID in the ordered table and report. A `failed` required row blocks the gate; a `conditional` optional row records environment guidance.
3. Rerun the exact component command from the repository root. Use its diagnostic path, field, skill, or case ID to identify the owning source or fixture.
4. Apply the smallest fix in the canonical owner: `skills/*/SKILL.md` for behavior, `commands/sealos.md` for broad routing, the named fixture for trace/schema coverage, or the owning helper for an executable contract.
5. Rerun the component, then the full gate. Finish with `git diff --check` and inspect the diff for unrelated generated files.

Common diagnostic classes map directly to owners: `inventory.*`, `route.*`, `version.*`, and `link.*` point to projections or route sources; `eval.*` points to a skill-local `evals/evals.json`; `canary.*` points to the entry marker or safety fixture; `missing-*`, `invalid-*`, and `sensitive-trace-value` point to the baseline trace; contract-test failures point to the skill's existing artifact or runtime oracle.

## Evidence Retention

Commit fixture and documentation changes with the source change that motivated them. Store the sanitized gate JSON as a CI artifact named with the commit SHA when audit evidence is required; the report preserves component IDs, commands, statuses, exit codes, elapsed times, aggregate counts, and bounded diagnostics. Retain the failed report and its redacted diagnostic for review, then remove temporary copies and local reports after the run unless repository policy requires archival. Raw subprocess output, credentials, kubeconfig material, and full connection strings stay out of retained evidence.

Provider-backed smoke evidence follows the owning skill's runtime policy and a separate retention scope. Link that evidence from a release or runtime report after redaction; a provider run never replaces the required offline gate report.

## Offline and Conditional Providers

The required registry is deterministic and provider-free. It uses Python standard-library runners, Node.js helpers, repository fixtures, and local file checks. It performs no tool installation, network request, credential login, Kubernetes mutation, database deletion, bucket deletion, public-access change, or cluster cleanup.

The registry currently marks only `optional-docker-runtime` as conditional. Missing Docker, or an unavailable Docker executable, yields `status: "conditional"` with the fixture's safe guidance while the required offline result remains eligible to pass. Provider-backed trajectory benchmarks, live Sealos smoke, network checks, and credential-dependent runtime verification run as explicitly scoped follow-ups in later phases; their absence leaves the offline gate result unchanged.
