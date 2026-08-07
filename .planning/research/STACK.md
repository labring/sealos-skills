# Stack Research

**Domain:** Cross-host AI skill design-system validation
**Project:** Sealos Skills v1.1 Skill Design System Optimization
**Researched:** 2026-08-06
**Reference baseline:** Ponytail commit `16f29800fd2681bdf24f3eb4ccffe38be3baec6b`
**Confidence:** MEDIUM

## Recommendation

Build the v1.1 gate around the repository's current Python and Node toolchain. Add one canonical JSON inventory, one focused Python design validator with `unittest` coverage, one small Node behavior grader with `node:test` fixtures, and one Python quality-gate orchestrator. Keep root `skills/**` as the runtime source for every host.

The required gate should stay dependency-free. Python standard-library modules cover inventory, manifest, Markdown-path, fixture, and subprocess checks. Node's built-in test runner covers deterministic behavior-grader tests. The existing PyYAML dependency remains scoped to `docker-to-sealos` domain validation.

Ponytail's transferable mechanism is executable consistency. Its packaging shape remains Ponytail-specific. Its pinned source proves four useful patterns:

1. Explicit version-file checks catch coordinated stale versions.
2. Adapter tests compare shipped surfaces with their canonical source.
3. Behavior graders receive positive and negative unit fixtures before provider-backed benchmarks use them.
4. Generation belongs to hosts that require a physical derived copy.

Sealos already shares skill bodies through root paths and symlinks. Cross-host list and routing validation provides the smaller solution here.

## Current Evidence Baseline

| Evidence | Current observation | Tooling implication | Confidence |
|----------|---------------------|---------------------|------------|
| Root skill source | Eight `skills/*/SKILL.md` entry points exist. Entry sizes span 117 to 384 lines. | Validate one discovered inventory and enforce the design contract across all eight. | MEDIUM |
| Host inventories | Qoder and root discovery expose eight skills. `marketplace.json`, both Claude manifests, and CodeBuddy expose seven; `sealos-canvas` appears in Qoder and routing files. | A shared inventory comparison is required. Pairwise host comparisons can agree on the same incomplete list. | MEDIUM |
| Current validator | `scripts/validate-codex-plugin.py` is 450 lines and passes the current seven-versus-eight state. It hard-codes `CURRENT_VERSION` and `QODER_SKILLS`. | Preserve this plugin validator and add a sibling skill-design validator sourced from canonical JSON. | MEDIUM |
| Versions | Eleven version-bearing JSON files currently resolve to `1.2.0`; marketplace files contain two version fields each. Current validation covers a subset. | Compare every declared version with root `plugin.json`; add release-tag parity in CI. | MEDIUM |
| Evals | Deploy, database, S3, and canvas have `evals/evals.json`. App builder, readiness, Dockerfile, and Compose conversion rely on indirect coverage. | Add per-skill eval files for the remaining four and validate aggregate behavior categories. | MEDIUM |
| Test harnesses | Sealos uses Python `unittest`, standalone Python gates, `.mjs` scripts, and `node:test`. Selected current Node tests passed 28/28. | Reuse both built-in test runners. | MEDIUM |
| Python environments | The default local Python 3.14 lacks `yaml`; local Python 3.12 and system Python 3.9 provide PyYAML 6.0.3. | Keep the design gate on the standard library and isolate existing PyYAML checks. | MEDIUM |
| Ponytail consistency | At the pinned commit, rule-copy and version checks pass; selected command, adapter, and behavior tests pass 29/29. | Port the ownership and red/green-test patterns. | MEDIUM |

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Python | Compatible with 3.8+; CI on 3.12 | Canonical inventory validation, host parity, version parity, link checks, eval schema checks, and quality-gate orchestration | It matches the current root validator and `unittest` conventions. The standard library supplies every new design-gate capability. |
| Node.js | Existing runtime compatibility 18+; design-test minimum 20; CI on 22.x | Deterministic behavior-grader tests and existing `.mjs` regression tests | `node:test` arrived in Node 18 and is stable from Node 20. Ponytail's pinned CI uses Node 22. |
| JSON | JSON syntax; inventory schema version `1` | Canonical skill inventory and machine-readable design contract | Python and Node parse it natively. It avoids expanding the top-level PyYAML dependency. |
| Markdown | Existing repository format | Human-owned `SKILL.md`, modules, references, routes, and maintainer guide | The design validator can check frontmatter delimiters, required sections, link targets, and invariant literals while preserving authored content. |
| GitHub Actions | `actions/checkout@v4`, `actions/setup-node@v4`, `actions/setup-python@v5` | Enforce the same quality command on pull requests and release tags | Ponytail uses this exact family of actions. A checked gate turns maintainer guidance into repository policy. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Python `json`, `pathlib` | Python standard library | Parse registries/manifests and resolve repository-relative paths | Every static design and distribution check. |
| Python `unittest`, `tempfile` | Python standard library | Mutation fixtures for missing inventory entries, stale versions, broken links, and absent invariants | Unit tests for the new validator. `TemporaryDirectory` gives automatic cross-platform cleanup. |
| Python `subprocess`, `sys`, `shutil` | Python standard library | Run existing gates with argument arrays and resolve the active interpreters | Top-level quality-gate orchestration. Use `shell=False`, `sys.executable`, and `shutil.which("node")`. |
| Node `node:test`, `node:assert/strict` | Stable in Node 20+ | Prove each behavior probe accepts a positive fixture and rejects a negative fixture | Required offline behavior-grader tests. |
| PyYAML | Existing 6.0.3 environment | Parse Sealos template rule registries and YAML artifacts | Existing `docker-to-sealos` quality gate. Keep it outside the new static design validator. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `scripts/validate-codex-plugin.py` | Preserve existing install, identity, marketplace, and platform assertions | Keep its public command stable. Let the new gate call it. |
| `scripts/validate-skill-design.py` | Enforce canonical inventory, design contract, host exposure, versions, links, invariants, and eval coverage | New focused validator. Return exit code 1 with path-specific diagnostics. |
| `scripts/test-validate-skill-design.py` | Exercise validator failure modes with temporary repositories | Use table-driven `unittest` fixtures and CRLF/path-normalization cases. |
| `benchmarks/skill-design-behavior.mjs` | Grade structured routing, loading, confirmation, output, and handoff traces | Export a pure function. Keep provider and credential handling outside this file. |
| `tests/skill-design-behavior.test.mjs` | Prove each behavior grader discriminates pass and fail fixtures | Required offline `node --test` gate. |
| `scripts/quality-gate.py` | Run the complete maintainer contract through one cross-platform command | Use subprocess argument arrays, explicit paths, inherited stdout/stderr, and fail-fast exit codes. |

## Required Tooling Changes

### 1. Add `distribution/skills.json` as the canonical inventory

Use JSON with `schemaVersion: 1`. Store stable facts that other files repeat:

| Field | Contract |
|-------|----------|
| `name` | Equals the `skills/<name>` directory and frontmatter `name`. |
| `path` | Repo-relative canonical directory, such as `./skills/sealos-deploy`. |
| `pluginRoutes` | Route tokens accepted by `$sealos` and `/sealos`. |
| `directInvocation` | Direct skills.sh entry where the host supports it. |
| `hostExposure` | Explicit host IDs that publish the skill. |
| `requiredSections` | Entry-point sections required by the shared design contract. |
| `invariants` | Stable IDs plus load-bearing literal phrases for safety and output rules. |
| `requiredEvalTags` | Applicable categories from routing, progressive loading, confirmation, output, and handoff. |

Keep the plugin version in root `plugin.json`. The inventory should reference skill contracts and avoid creating another version declaration.

### 2. Add `scripts/validate-skill-design.py`

The validator should perform these checks in one pass:

1. Discover `skills/*/SKILL.md` and compare names and paths with `distribution/skills.json` exactly once.
2. Parse the constrained frontmatter envelope and require scalar `name` and `description`; compare `name` with its directory.
3. Enforce the shared entry-point contract, contract-owned size budget, required sections, and progressive-disclosure links.
4. Resolve every relative Markdown link and every `<SKILL_DIR>` reference after normalizing separators and CRLF.
5. Search each skill for its declared invariant phrases, including destructive confirmation, public-access confirmation, system-install confirmation, and secret-redaction rules where applicable.
6. Compare every manifest `skills` list and every routing adapter with the inventory's host exposure and route tokens.
7. Compare all version fields in `plugin.json`, Codex, Claude, CodeBuddy, Qoder, Gemini, Qwen, OpenClaw, marketplaces, and `distribution/platforms.json` with root `plugin.json`.
8. On tag builds, compare `GITHUB_REF_NAME` after removing one leading `v` with the canonical version.
9. Parse every `skills/<name>/evals/evals.json`; require unique eval IDs, unique assertion names per case, non-empty prompts, expected outputs, and declared design tags.
10. Aggregate eval tags across all eight skills and fail when a required design-system category has zero coverage.

The frontmatter parser should support the deliberately constrained contract fields. General YAML interpretation belongs to the existing PyYAML-backed domain tooling.

### 3. Unit-test the validator before trusting it

`scripts/test-validate-skill-design.py` should create a minimal temporary repository and mutate one fact per test. Required red/green cases:

| Mutation | Expected failure |
|----------|------------------|
| Add an unregistered `skills/new-skill/SKILL.md` | Inventory drift |
| Remove `sealos-canvas` from one host list | Host exposure drift |
| Change one manifest to `1.2.1` | Version drift |
| Change all secondary manifests while root remains `1.2.0` | Canonical version drift |
| Remove one route from `commands/sealos.md` | Route drift |
| Break one module/reference path | Progressive-disclosure link failure |
| Remove one declared safety phrase | Invariant failure |
| Remove one required eval tag | Behavior coverage failure |
| Convert fixtures to CRLF | Same verdict as LF |

This follows Ponytail's strongest pattern: the checker receives a known passing fixture and a known failing fixture.

### 4. Complete the behavior-eval inventory

Add per-skill eval files at:

- `skills/cloud-native-readiness/evals/evals.json`
- `skills/dockerfile-skill/evals/evals.json`
- `skills/docker-to-sealos/evals/evals.json`
- `skills/sealos-app-builder/evals/evals.json`

Add a `tags` array to design-system cases across all eight skills. Preserve the current `id`, `prompt`, `expected_output`, `files`, and `assertions` shape. The shared tags should cover:

| Tag | Observable contract |
|-----|---------------------|
| `routing` | Selects the owning skill from a direct request and a near-neighbor request. |
| `progressive-loading` | Loads the minimum owned module/reference set recorded in the trace. |
| `confirmation` | Stops before destructive, public-access, credential-rotation, or system-install mutations. |
| `output` | Produces the documented artifact/report and redacts secret values. |
| `handoff` | Routes to the correct sibling skill and preserves the expected artifact/state contract. |

The deploy suite can retain its deep runtime scenarios. New design-system cases should stay small and discriminating.

### 5. Add a deterministic behavior grader

Model the grader after Ponytail's `benchmarks/behavior.js` plus `tests/behavior.test.js`, with one improvement: consume structured traces shaped as `{ text, toolCalls, files }`. Structured traces allow confirmation and progressive-loading checks to inspect observable actions.

Each probe needs one positive fixture and one negative fixture in `tests/skill-design-behavior.test.mjs`. The pull-request gate runs these unit tests offline. This proves grader discrimination and keeps provider variance outside deterministic CI.

### 6. Add one maintainer command and one CI entry point

`python3 scripts/quality-gate.py` should run, in order:

```text
python3 scripts/validate-codex-plugin.py
python3 scripts/validate-skill-design.py
python3 -m unittest scripts/test-validate-skill-design.py
node --test tests/skill-design-behavior.test.mjs
```

The orchestrator should pass lists directly to `subprocess.run`, use the active Python interpreter, resolve Node with `shutil.which`, and produce one failing exit code. GitHub Actions should run this command on pull requests and tag pushes with Python 3.12 and Node 22.x.

Keep current runtime gates attached to their owning paths:

- `docker-to-sealos` changes run its Python `unittest` suite and `quality_gate.py`; CI installs the existing PyYAML 6.0.3 prerequisite.
- `sealos-deploy` helper changes run explicit `node --test` file paths and `node --check` for changed scripts.
- Manifest, command, inventory, design-contract, and eval changes always run the new root quality gate.

## Installation

The new design-system gate adds zero Python or npm packages.

```bash
# Required design-system gate
python3 scripts/quality-gate.py

# Direct focused checks
python3 scripts/validate-skill-design.py
python3 -m unittest scripts/test-validate-skill-design.py
node --test tests/skill-design-behavior.test.mjs
```

Existing Compose/template validation keeps its current prerequisite:

```bash
python3 -m pip install 'PyYAML==6.0.3'
DOCKER_TO_SEALOS_ALLOW_EMPTY_ARTIFACTS=1 \
  python3 skills/docker-to-sealos/scripts/quality_gate.py
```

## Alternatives Considered

| Recommended | Alternative | When the Alternative Fits |
|-------------|-------------|---------------------------|
| Canonical JSON inventory plus validation | Generated manifest and route files | A future host requires a physical transformed skill copy, as OpenClaw does in Ponytail. |
| Sibling `validate-skill-design.py` | Continue expanding `validate-codex-plugin.py` | A very small plugin-only parity check belongs in the existing validator. |
| Python `unittest` | Pytest | A future test suite needs fixtures or plugins that materially reduce code. |
| Node `node:test` | Jest or Vitest | A future application package already standardizes on that runner. |
| Structured trace grader | Prose-only regex grader | A host supplies text output only and the probe targets an explicit literal output contract. |
| Offline PR gate plus release benchmark | Provider-backed benchmark on every PR | A stable model, budget, credential policy, and retry policy are available for every contributor branch. |

## Tools to Avoid for v1.1

| Tool or Pattern | Cost in This Repository | Preferred Mechanism |
|-----------------|-------------------------|---------------------|
| A YAML inventory for design metadata | Extends PyYAML into the top-level gate; the default local Python currently lacks it. | JSON plus Python `json`. |
| Ajv or Python `jsonschema` for the small inventory | Adds package installation and lockfile management for a compact fixed contract. | Explicit Python type and field assertions. |
| Jest, Vitest, or Pytest | Duplicates existing built-in runners. | `node:test` and `unittest`. |
| Generated copies of `SKILL.md` bodies | Creates another shipped behavior surface and conflicts with the canonical-root constraint. | Root path references, symlinks, and parity checks. |
| `npx promptfoo@latest` in the required gate | Introduces moving versions, provider credentials, latency, cost, and stochastic failures. | Offline grader tests in PRs; a pinned release benchmark after runner policy is selected. |
| Shell pipelines as the quality-gate implementation | Adds quoting, glob, environment-prefix, and Windows behavior differences. | Python `subprocess.run` with argument arrays. |
| Hash-only snapshots of whole Markdown files | Produces broad failures for harmless prose edits and weak diagnostics. | Semantic inventory checks, link checks, and named invariant phrases. |

## Provider-Backed Benchmark: Optional Future Work

Ponytail's benchmark config uses Promptfoo and a live Anthropic provider, while its grader tests run locally through `node:test`. Sealos should adopt the same separation after choosing a stable evaluation runner.

Conditions for adding Promptfoo or another provider runner:

1. Pin its version in a lockfile.
2. Define the model and provider policy.
3. Define repeat count, retry behavior, cost ceiling, and secret scope.
4. Store aggregate results and the evaluated commit.
5. Keep the offline design gate authoritative for pull requests.

This is a phase research flag. The repository currently stores eval cases and a deploy benchmark result, while the executable provider runner lives outside the repository evidence reviewed here.

## Stack Patterns by Variant

**For static contract changes:**

- Run the root quality gate.
- Check inventory, host lists, routes, versions, links, invariants, and eval schema.

**For skill runtime changes:**

- Run the root quality gate.
- Run the owning skill's current Node or Python regression tests.
- Update the owning eval cases and assertion tags.

**For a host that requires transformed copies:**

- Add a deterministic generator from root `skills/**`.
- Add a byte-equivalence test for the generated body and a host-specific metadata test.
- Keep generation output reproducible from one command.

**For release evidence:**

- Run the offline gate first.
- Run the pinned provider benchmark for changed behavioral categories.
- Record model, runner version, commit, repeats, pass rate, and cost.

**For `brain-deploy-preview`:**

- Treat the eight-skill inventory and full plugin adapter gate as `main` branch artifacts.
- Evaluate the new root scripts manually under the existing merge policy.
- Give the preview branch its own inventory scope when it adopts the shared design contract, preserving its prepare-only deploy pipeline and branch-owned host surfaces.

## Version Compatibility

| Component | Compatible With | Notes |
|-----------|-----------------|-------|
| New Python validator | Python 3.8+ | Stay within the compatibility already declared by `sealos-deploy`; avoid newer `pathlib` conveniences. |
| CI Python | Python 3.12 | Matches Ponytail's pinned CI and the local PyYAML-capable environment. |
| Existing Sealos `.mjs` helpers | Node.js 18+ | Preserve the current skill compatibility statement. |
| New `node:test` behavior suite | Node.js 20+ | The test runner is stable from Node 20. |
| CI Node | Node.js 22.x | Matches Ponytail's pinned CI baseline and supports stable `node:test`. |
| `docker-to-sealos` YAML checks | PyYAML 6.0.3 on Python 3.12 | Existing domain prerequisite; separate from the new design validator. |

## Verification Performed

| Command | Result |
|---------|--------|
| `python3 scripts/validate-codex-plugin.py` | Passed, including its current Codex, Claude, and Qoder assertions. |
| JSON parsing for all current `skills/*/evals/evals.json` | Passed for four existing suites. |
| Selected Sealos `node:test` regression files | 28 tests passed. |
| Ponytail `node scripts/check-rule-copies.js` | Passed at commit `16f2980`. |
| Ponytail `node scripts/check-versions.js` | Eight version files pinned at 4.8.4. |
| Ponytail selected command, behavior, and OpenClaw adapter tests | 29 tests passed. |

## Sources

### Repository Evidence

- Sealos Skills commit `d071924d964e66049ebdaecabda7a3d409493421`: `.planning/PROJECT.md`, `AGENTS.md`, `scripts/validate-codex-plugin.py`, `skills/*/SKILL.md`, `skills/*/evals/evals.json`, host manifests, `commands/sealos.md`, `qoder.md`, and current Python/Node tests. Confidence: MEDIUM.
- [Ponytail `check-rule-copies.js` at `16f2980`](https://github.com/DietrichGebert/ponytail/blob/16f29800fd2681bdf24f3eb4ccffe38be3baec6b/scripts/check-rule-copies.js) - literal invariant and copy-drift mechanism. Confidence: MEDIUM.
- [Ponytail `check-versions.js` at `16f2980`](https://github.com/DietrichGebert/ponytail/blob/16f29800fd2681bdf24f3eb4ccffe38be3baec6b/scripts/check-versions.js) - canonical version and tag parity. Confidence: MEDIUM.
- [Ponytail OpenClaw generator at `16f2980`](https://github.com/DietrichGebert/ponytail/blob/16f29800fd2681bdf24f3eb4ccffe38be3baec6b/scripts/build-openclaw-skills.js) and [adapter tests](https://github.com/DietrichGebert/ponytail/blob/16f29800fd2681bdf24f3eb4ccffe38be3baec6b/tests/openclaw-skills.test.js) - generated-copy boundary. Confidence: MEDIUM.
- [Ponytail command parity test at `16f2980`](https://github.com/DietrichGebert/ponytail/blob/16f29800fd2681bdf24f3eb4ccffe38be3baec6b/tests/commands.test.js) - registered-command adapter coverage. Confidence: MEDIUM.
- [Ponytail behavior grader tests at `16f2980`](https://github.com/DietrichGebert/ponytail/blob/16f29800fd2681bdf24f3eb4ccffe38be3baec6b/tests/behavior.test.js) and [benchmark config](https://github.com/DietrichGebert/ponytail/blob/16f29800fd2681bdf24f3eb4ccffe38be3baec6b/benchmarks/behavior.yaml) - offline grader tests plus provider benchmark. Confidence: MEDIUM.

### Official Documentation

- [Node.js test runner](https://nodejs.org/download/release/v24.15.0/docs/api/test.html) - `node:test` history and stable status. Confidence: MEDIUM.
- [Node.js 18 test runner CLI](https://nodejs.org/download/release/v18.9.0/docs/api/test.html) - `node --test` and explicit file execution. Confidence: MEDIUM.
- [Python `unittest`](https://docs.python.org/3.11/library/unittest.html) - discovery and built-in test execution. Confidence: MEDIUM.
- [Python `json`](https://docs.python.org/3/library/json.html) - structured JSON parsing and validation. Confidence: MEDIUM.
- [Python `tempfile`](https://docs.python.org/3.10/library/tempfile.html) and [Python `subprocess`](https://docs.python.org/3.10/library/subprocess.html) - cross-platform fixtures and shell-free orchestration. Confidence: MEDIUM.
- [Promptfoo scenarios](https://www.promptfoo.dev/docs/configuration/scenarios/) - external scenario configuration for optional provider benchmarks. Confidence: MEDIUM.

## Research Gaps

- The repository contains eval inputs and deploy benchmark results, while the provider execution harness is absent from the reviewed tree. Phase planning should select that runner before making model pass rates a release requirement.
- The shared design contract still needs final entry-point size budgets and exact required-section names. The validator should consume those decisions from `distribution/skills.json`.
- Host exposure intent for `sealos-canvas` needs one explicit product decision before aligning the seven-skill manifests with the eight-skill inventory.

---
*Stack research for: Sealos Skills v1.1 Skill Design System Optimization*
*Researched: 2026-08-06*
