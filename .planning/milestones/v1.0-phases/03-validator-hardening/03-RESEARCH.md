# Phase 3: Validator Hardening - Research

**Researched:** 2026-06-15
**Domain:** Python repository validator for Codex plugin distribution metadata
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
## Implementation Decisions

### First-Principles Success Criteria
- **D-01:** Treat `scripts/validate-codex-plugin.py` as the maintainer-facing distribution gate for this phase.
- **D-02:** A passing Phase 3 validator run should mean the README, Codex manifest, root discovery manifest, Codex marketplace entry, root marketplace entry, and platform registry all agree on the Codex install contract.
- **D-03:** The goal is drift detection. The validator should fail loudly when a maintainer changes a command, plugin id, repository id, display label, source path, or JSON file shape in a way that breaks the Phase 2 contract.

### Locked Codex Contract
- **D-04:** Canonical repository shorthand is `labring/sealos-skills`; canonical repository URL is `https://github.com/labring/sealos-skills`.
- **D-05:** Canonical marketplace id is `sealos`, plugin id/name is `sealos`, install selector is `sealos@sealos`, and display label is `Sealos`.
- **D-06:** Canonical native README command order is:

```bash
codex plugin marketplace add labring/sealos-skills
codex plugin add sealos@sealos
```

- **D-07:** Canonical fallback/local Codex command is:

```bash
npx plugins add https://github.com/labring/sealos-skills --target codex
```

- **D-08:** `.codex-plugin/plugin.json` and root `plugin.json` keep key-field parity and `skills: "./skills/"`.
- **D-09:** `.agents/plugins/marketplace.json` keeps one plugin entry named `sealos` with `source.path: "./plugins/sealos"`; `plugins/sealos` remains the repository-root symlink source.
- **D-10:** `distribution/platforms.json` Codex entry keeps native install as primary, `alternateInstall` as the fallback command, `$sealos` / Codex App selection as invocation copy, and Phase 1 evidence wording.

### Validator Gap Resolution
- **D-11:** Extend the existing Python validator rather than adding a separate Phase 3 script.
- **D-12:** README checks should validate exact command presence and native command ordering. This covers VAL-01 and VAL-02 directly.
- **D-13:** Identity parity checks should compare README text, `.codex-plugin/plugin.json`, root `plugin.json`, `.agents/plugins/marketplace.json`, `marketplace.json`, and `distribution/platforms.json` against the locked canonical values. This covers VAL-03.
- **D-14:** JSON syntax coverage should be part of the maintainer validation path for the relevant plugin, marketplace, and platform registry files. The minimum Phase 3 set is `.codex-plugin/plugin.json`, root `plugin.json`, `.agents/plugins/marketplace.json`, `marketplace.json`, and `distribution/platforms.json`.
- **D-15:** Keep the validation surface Codex-focused. Distribution-wide parity for Claude, CodeBuddy, Gemini, Qwen, OpenClaw, and every command route remains v2 scope.

### Verification Expectations
- **D-16:** Phase 3 verification should run `python3 scripts/validate-codex-plugin.py` and explicit JSON syntax checks for every touched plugin, marketplace, and platform registry JSON file.
- **D-17:** Planning should include at least one drift-failure proof for each VAL requirement category where practical: README native command, fallback command, identity parity, and JSON syntax.
- **D-18:** Source changes in Phase 3 should stay limited to validation and any directly related validation documentation. Runtime skill files under `skills/**` remain untouched.

### the agent's Discretion
- The planner may decide whether JSON syntax checks are enforced solely through `load_json()` calls inside `scripts/validate-codex-plugin.py` or through explicit helper checks plus the existing parser behavior, as long as maintainers get one clear failing command.
- The executor may factor canonical values into constants inside `scripts/validate-codex-plugin.py` if that keeps future command and identity checks readable.
- The executor may keep explicit `python3 -m json.tool` commands in verification evidence even when the validator already parses those files.

### Deferred Ideas (OUT OF SCOPE)
## Deferred Ideas

- Phase 4: capture fresh native Codex marketplace add/list/install evidence and compatibility install evidence after validator hardening.
- v2: add a distribution-wide validator for Claude, CodeBuddy, Gemini, Qwen, OpenClaw, marketplace, and command-route parity.
- v2: add CI or a documented top-level validation command that runs every distribution validator.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VAL-01 | `scripts/validate-codex-plugin.py` checks README native Codex install commands. | Use exact command constants and ordering checks over `README.md`. [VERIFIED: `.planning/REQUIREMENTS.md`, `README.md`] |
| VAL-02 | `scripts/validate-codex-plugin.py` checks README fallback `npx plugins` command. | Use an exact fallback command constant and assert presence in `README.md` and `distribution/platforms.json` `alternateInstall`. [VERIFIED: `.planning/REQUIREMENTS.md`, `README.md`, `distribution/platforms.json`] |
| VAL-03 | `scripts/validate-codex-plugin.py` checks README/manifest/registry plugin identity parity. | Compare canonical repo, URL, plugin id, selector, display label, source path, and skill source across README, manifests, marketplace files, and platform registry. [VERIFIED: `.planning/REQUIREMENTS.md`, `scripts/validate-codex-plugin.py`, metadata JSON files] |
| VAL-04 | JSON syntax checks pass for all touched plugin, marketplace, and platform registry files. | Ensure the validator parses `.codex-plugin/plugin.json`, `plugin.json`, `.agents/plugins/marketplace.json`, `marketplace.json`, and `distribution/platforms.json`; keep explicit `json.tool` verification. [VERIFIED: `.planning/REQUIREMENTS.md`, current `python3 -m json.tool` run] |
</phase_requirements>

## Summary

Phase 3 should harden the existing Python validator as the single maintainer-facing drift gate. [VERIFIED: `.planning/phases/03-validator-hardening/03-CONTEXT.md`] The current validator already passes against the repository baseline and covers root/Codex manifest parity, repository-root marketplace symlink shape, required payload files, Codex plugin interface fields, Codex marketplace entry policy, and two Codex platform registry claims. [VERIFIED: `scripts/validate-codex-plugin.py`, current `python3 scripts/validate-codex-plugin.py` run]

The missing Phase 3 coverage is concentrated in README text, root `marketplace.json`, exact platform registry command fields, and complete JSON parser coverage for the Phase 3 JSON set. [VERIFIED: `scripts/validate-codex-plugin.py`, `README.md`, `marketplace.json`, `distribution/platforms.json`] The planner should create tasks that add constants for canonical values, read README text, parse root marketplace metadata, add small assertion helpers, and prove failure modes with temporary drift mutations restored after each check. [VERIFIED: codebase pattern in `scripts/validate-codex-plugin.py`; ASSUMED: temporary mutation is the simplest practical failure proof workflow]

**Primary recommendation:** Extend `scripts/validate-codex-plugin.py` with canonical constants plus `require_readme_contract()`, `require_platform_codex_contract()`, and `require_marketplace_contract()` helpers, then verify with positive baseline and targeted drift-failure probes. [VERIFIED: `.planning/phases/03-validator-hardening/03-CONTEXT.md`, `scripts/validate-codex-plugin.py`]

## Project Constraints (from AGENTS.md)

- Use `python3 scripts/validate-codex-plugin.py` when Codex plugin metadata changes. [CITED: `AGENTS.md`]
- Root `skills/**` is the only skill source for every host; a second packaged skill copy is forbidden. [CITED: `AGENTS.md`]
- Plugin usage examples must use `$sealos` for Codex and `/sealos` for Claude Code-compatible hosts. [CITED: `AGENTS.md`]
- Keep `/sealos-deploy`, `/sealos-database`, and `/sealos-s3` examples only in direct `skills.sh` sections. [CITED: `AGENTS.md`]
- Validate distribution metadata when adding or renaming skills, commands, or manifests. [CITED: `AGENTS.md`]
- The repository has no single top-level app build; validation is script-specific. [CITED: `AGENTS.md`]
- JSON files use readable two-space formatting. [CITED: `AGENTS.md`]
- Source changes for this phase should stay away from runtime skill behavior under `skills/**`. [VERIFIED: `.planning/phases/03-validator-hardening/03-CONTEXT.md`]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| README native install drift detection | Repository validation script | Markdown documentation | The validator owns executable assertions; README is the checked input. [VERIFIED: `scripts/validate-codex-plugin.py`, `README.md`] |
| Fallback install drift detection | Repository validation script | Platform registry | The validator should assert README and registry use the same fallback command. [VERIFIED: `README.md`, `distribution/platforms.json`] |
| Manifest identity parity | Repository validation script | JSON metadata files | Existing validator already compares root `plugin.json` and `.codex-plugin/plugin.json`; Phase 3 broadens the same pattern. [VERIFIED: `scripts/validate-codex-plugin.py`] |
| Marketplace identity parity | Repository validation script | `.agents/plugins/marketplace.json`, `marketplace.json`, `plugins/sealos` symlink | The Codex marketplace entry and root marketplace entry are file-backed metadata consumed by installers. [VERIFIED: `.agents/plugins/marketplace.json`, `marketplace.json`, `plugins/sealos`] |
| Platform registry exact command contract | Repository validation script | `distribution/platforms.json` | The registry stores install, fallback, invocation, evidence, and verification date fields that must match the locked Codex contract. [VERIFIED: `distribution/platforms.json`, `03-CONTEXT.md`] |
| JSON syntax guard | Repository validation script | Explicit verification commands | `load_json()` fails on invalid JSON; explicit `python3 -m json.tool` remains verification evidence. [VERIFIED: `scripts/validate-codex-plugin.py`, current `json.tool` run] |

## Current Validator Coverage

| Area | Current Assertion | Covered File(s) | Phase 3 Status |
|------|-------------------|-----------------|----------------|
| Root and Codex manifest existence | Requires `plugin.json` and `.codex-plugin/plugin.json` files. | `plugin.json`, `.codex-plugin/plugin.json` | Keep. [VERIFIED: `scripts/validate-codex-plugin.py`] |
| Manifest parity | Compares `name`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`, `skills`, and `interface`. | `plugin.json`, `.codex-plugin/plugin.json` | Keep and augment with canonical-value checks. [VERIFIED: `scripts/validate-codex-plugin.py`] |
| Repository-root symlink | Requires `plugins/sealos` symlink resolving to repository root. | `plugins/sealos` | Keep. [VERIFIED: `scripts/validate-codex-plugin.py`] |
| Plugin payload | Requires root plugin payload contains plugin manifests, three core skill entry files, and logo. | `plugins/sealos` resolved root | Keep. [VERIFIED: `scripts/validate-codex-plugin.py`] |
| Codex plugin interface | Requires display name, category, brand color, capability list, prompt limit, icon path, and logo path. | `.codex-plugin/plugin.json` | Keep. [VERIFIED: `scripts/validate-codex-plugin.py`] |
| Local Codex marketplace | Requires one plugin named `sealos`, local source, `./plugins/sealos` path, install/auth policy, and category. | `.agents/plugins/marketplace.json` | Keep and add canonical source/id constants. [VERIFIED: `scripts/validate-codex-plugin.py`] |
| Platform registry minimal Codex claims | Requires one Codex entry, evidence token, and `commands: supported`. | `distribution/platforms.json` | Expand to exact install, fallback, invoke, claim, runtime, and verification fields. [VERIFIED: `scripts/validate-codex-plugin.py`, `distribution/platforms.json`] |
| JSON parser coverage | Parses `plugin.json`, `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, and `distribution/platforms.json`. | Four JSON files | Add root `marketplace.json`. [VERIFIED: `scripts/validate-codex-plugin.py`] |

## Missing Coverage

| Gap | Required Assertion | Requirement |
|-----|--------------------|-------------|
| README native command presence | `README.md` contains `codex plugin marketplace add labring/sealos-skills` and `codex plugin add sealos@sealos`. [VERIFIED: `README.md`] | VAL-01 |
| README native command order | Marketplace-add command appears before plugin-add command. [VERIFIED: `README.md`, `.planning/phases/02-readme-and-metadata-alignment/02-VERIFICATION.md`] | VAL-01 |
| README fallback command | `README.md` contains `npx plugins add https://github.com/labring/sealos-skills --target codex`. [VERIFIED: `README.md`] | VAL-02 |
| Platform exact native install | Codex platform `install` equals `codex plugin marketplace add labring/sealos-skills && codex plugin add sealos@sealos`. [VERIFIED: `distribution/platforms.json`] | VAL-03 |
| Platform exact fallback install | Codex platform `alternateInstall` equals `npx plugins add https://github.com/labring/sealos-skills --target codex`. [VERIFIED: `distribution/platforms.json`] | VAL-02, VAL-03 |
| Platform invocation copy | Codex platform `invoke` contains `$sealos` and `Sealos` plugin selection language. [VERIFIED: `distribution/platforms.json`] | VAL-03 |
| Root marketplace parsing | `marketplace.json` is loaded through `load_json()`. [VERIFIED: `scripts/validate-codex-plugin.py`, `marketplace.json`] | VAL-04 |
| Root marketplace identity | Root marketplace `name`, `metadata.repository`, `plugins[0].name`, `plugins[0].source`, `plugins[0].version`, and `plugins[0].commands` match the canonical contract. [VERIFIED: `marketplace.json`] | VAL-03 |
| README identity text | README contains `labring/sealos-skills`, `sealos@sealos`, `$sealos`, and `Sealos` in the Codex sections. [VERIFIED: `README.md`] | VAL-03 |
| JSON syntax minimum set | Validator parses `.codex-plugin/plugin.json`, `plugin.json`, `.agents/plugins/marketplace.json`, `marketplace.json`, and `distribution/platforms.json`. [VERIFIED: current source and `json.tool` run] | VAL-04 |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python standard library `json` | Python 3.12.12 available locally | Parse JSON and report syntax failures. | Existing validator already uses `json.loads()` and has no external dependency. [VERIFIED: `scripts/validate-codex-plugin.py`, `python3 --version`] |
| Python standard library `pathlib` | Python 3.12.12 available locally | Resolve repository-relative paths. | Existing validator uses `Path(__file__).resolve().parents[1]`. [VERIFIED: `scripts/validate-codex-plugin.py`, `python3 --version`] |
| Python standard library `sys` | Python 3.12.12 available locally | Return process exit status. | Existing validator exits through `sys.exit(main())`. [VERIFIED: `scripts/validate-codex-plugin.py`, `python3 --version`] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `python3 -m json.tool` | Python 3.12.12 available locally | Explicit verification evidence for JSON syntax. | Use in phase verification for touched JSON files even after validator parsing is extended. [VERIFIED: current `json.tool` run, `03-CONTEXT.md`] |
| `git` | 2.50.1 available locally | Atomic research artifact commit and failure-probe restoration during implementation. | Use for status checks and final commit; implementation can use git diff checks to confirm probes are restored. [VERIFIED: `git --version`] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extend Python validator | Add a separate shell or Node validation script | Context locks Python validator extension; a second script would split the maintainer gate. [VERIFIED: `03-CONTEXT.md`] |
| Exact string checks | Regex-based partial matching | Exact strings match the drift-detection goal for commands and ids; regex can mask meaningful command changes. [VERIFIED: `03-CONTEXT.md`; ASSUMED: exact matching is safer for this contract] |
| Validator-only JSON parsing | External `json.tool` only | Validator parsing gives one maintainer command; `json.tool` remains verification evidence. [VERIFIED: `03-CONTEXT.md`] |

**Installation:**
```bash
# No package install required.
```

**Version verification:** `python3 --version` returned `Python 3.12.12`; `git --version` returned `git version 2.50.1 (Apple Git-155)`. [VERIFIED: local command output]

## Package Legitimacy Audit

No external packages are recommended or installed for this phase. [VERIFIED: `scripts/validate-codex-plugin.py` imports only Python standard library modules]

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```text
Maintainer runs validator
  |
  v
scripts/validate-codex-plugin.py
  |
  +--> load JSON inputs
  |      |-- .codex-plugin/plugin.json
  |      |-- plugin.json
  |      |-- .agents/plugins/marketplace.json
  |      |-- marketplace.json
  |      `-- distribution/platforms.json
  |
  +--> read README.md
  |
  +--> assert canonical constants
  |      |-- repo shorthand: labring/sealos-skills
  |      |-- repo URL: https://github.com/labring/sealos-skills
  |      |-- plugin id/name: sealos
  |      |-- selector: sealos@sealos
  |      |-- display label: Sealos
  |      |-- skills source: ./skills/
  |      `-- local marketplace source: ./plugins/sealos
  |
  +--> branch on failure
  |      |-- PASS lines for satisfied checks
  |      `-- FAIL line + exit 1 for first drift
  |
  `--> exit 0 after all checks pass
```

### Recommended Project Structure

```text
scripts/
└── validate-codex-plugin.py        # Add canonical constants and validation helpers.

.planning/phases/03-validator-hardening/
└── 03-RESEARCH.md                  # Research artifact for planner.
```

### Pattern 1: Central Canonical Constants

**What:** Define immutable values near existing path constants: repo shorthand, repo URL, plugin id, selector, display label, skill source, local source path, native commands, and fallback command. [VERIFIED: `scripts/validate-codex-plugin.py`, `03-CONTEXT.md`]

**When to use:** Use constants anywhere the same value appears in README, manifests, marketplace, or platform registry checks. [VERIFIED: `03-CONTEXT.md`]

**Example:**
```python
# Source: scripts/validate-codex-plugin.py existing path-constant pattern.
REPOSITORY_SLUG = "labring/sealos-skills"
REPOSITORY_URL = "https://github.com/labring/sealos-skills"
PLUGIN_ID = "sealos"
PLUGIN_SELECTOR = "sealos@sealos"
DISPLAY_NAME = "Sealos"
SKILLS_SOURCE = "./skills/"
LOCAL_PLUGIN_SOURCE = "./plugins/sealos"
NATIVE_MARKETPLACE_COMMAND = "codex plugin marketplace add labring/sealos-skills"
NATIVE_INSTALL_COMMAND = "codex plugin add sealos@sealos"
FALLBACK_CODEX_COMMAND = "npx plugins add https://github.com/labring/sealos-skills --target codex"
PLATFORM_NATIVE_INSTALL = f"{NATIVE_MARKETPLACE_COMMAND} && {NATIVE_INSTALL_COMMAND}"
```

### Pattern 2: Small Requirement-Oriented Helpers

**What:** Add helpers that map to VAL categories and preserve current `require(condition, message)` output style. [VERIFIED: `scripts/validate-codex-plugin.py`, `.planning/REQUIREMENTS.md`]

**When to use:** Use one helper for README, one for platform registry exact fields, one for marketplace surfaces, and one for manifest canonical fields. [VERIFIED: codebase pattern]

**Example:**
```python
# Source: scripts/validate-codex-plugin.py existing require() pattern.
def require_readme_contract(readme: str) -> None:
    marketplace_index = readme.find(NATIVE_MARKETPLACE_COMMAND)
    install_index = readme.find(NATIVE_INSTALL_COMMAND)
    require(marketplace_index >= 0, "README includes native Codex marketplace add command")
    require(install_index >= 0, "README includes native Codex plugin install command")
    require(marketplace_index < install_index, "README lists marketplace add before plugin install")
    require(FALLBACK_CODEX_COMMAND in readme, "README includes fallback Codex npx install command")
```

### Pattern 3: Single Codex Platform Entry Extractor

**What:** Replace repeated list comprehension logic with an extractor that fails if the Codex platform entry count differs from one. [VERIFIED: current list comprehension in `scripts/validate-codex-plugin.py`]

**When to use:** Use before exact field assertions for `install`, `alternateInstall`, `invoke`, `commands`, `claim`, `runtime`, `evidence`, and `lastVerified`. [VERIFIED: `distribution/platforms.json`, `03-CONTEXT.md`]

**Example:**
```python
# Source: scripts/validate-codex-plugin.py existing Codex entry check.
def get_single_platform(platforms: dict, platform_id: str) -> dict:
    entries = [p for p in platforms.get("platforms", []) if p.get("id") == platform_id]
    require(len(entries) == 1, f"platform registry includes one {platform_id} entry")
    return entries[0]
```

### Anti-Patterns to Avoid

- **Derived source of truth from README:** Use locked constants from CONTEXT as the source, then compare README and metadata to those constants. [VERIFIED: `03-CONTEXT.md`]
- **Broad non-Codex validator expansion:** Keep Claude, CodeBuddy, Gemini, Qwen, OpenClaw, and all command-route parity for v2. [VERIFIED: `03-CONTEXT.md`, `.planning/REQUIREMENTS.md`] 
- **Silent parser gaps:** Load every Phase 3 JSON file through the validator so invalid JSON fails under the single maintainer command. [VERIFIED: `03-CONTEXT.md`]
- **Mutation probes left in the worktree:** Any failure-mode proof should restore files and end with `git diff --exit-code` for touched paths. [ASSUMED]

## Exact Fields and Commands to Assert

### Canonical Constants

| Contract Item | Exact Value | Surfaces |
|---------------|-------------|----------|
| Repository shorthand | `labring/sealos-skills` | README native command, platform install. [VERIFIED: `README.md`, `distribution/platforms.json`] |
| Repository URL | `https://github.com/labring/sealos-skills` | README fallback, plugin manifests, root marketplace, platform registry. [VERIFIED: `README.md`, JSON metadata] |
| Plugin id/name | `sealos` | `plugin.json`, `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `marketplace.json`, platform selector. [VERIFIED: JSON metadata] |
| Plugin selector | `sealos@sealos` | README native install, platform install. [VERIFIED: `README.md`, `distribution/platforms.json`] |
| Display label | `Sealos` | Plugin interface, marketplace interface, README Codex App copy, platform invoke. [VERIFIED: README and JSON metadata] |
| Skill source | `./skills/` | `plugin.json`, `.codex-plugin/plugin.json`. [VERIFIED: JSON metadata] |
| Local marketplace source | `./plugins/sealos` | `.agents/plugins/marketplace.json`. [VERIFIED: `.agents/plugins/marketplace.json`] |

### README Commands

```bash
codex plugin marketplace add labring/sealos-skills
codex plugin add sealos@sealos
npx plugins add https://github.com/labring/sealos-skills --target codex
```

The validator should assert the two native commands are present and ordered, and the fallback command is present. [VERIFIED: `README.md`, `03-CONTEXT.md`]

### `distribution/platforms.json` Codex Entry

| Field | Exact / Required Value |
|-------|------------------------|
| `id` | `codex` [VERIFIED: `distribution/platforms.json`] |
| `name` | `Codex CLI / Codex App` [VERIFIED: `distribution/platforms.json`] |
| `claim` | `verified` [VERIFIED: `distribution/platforms.json`] |
| `runtime` | `plugin` [VERIFIED: `distribution/platforms.json`] |
| `install` | `codex plugin marketplace add labring/sealos-skills && codex plugin add sealos@sealos` [VERIFIED: `distribution/platforms.json`] |
| `alternateInstall` | `npx plugins add https://github.com/labring/sealos-skills --target codex` [VERIFIED: `distribution/platforms.json`] |
| `invoke` | Must include `$sealos` and `Sealos`. [VERIFIED: `distribution/platforms.json`] |
| `commands` | `supported` [VERIFIED: `distribution/platforms.json`] |
| `evidence` | Must include `Phase 1 native marketplace add/list/install` and `codex_manifest+repo_marketplace`. [VERIFIED: `distribution/platforms.json`] |
| `lastVerified` | `2026-06-15` for this milestone state. [VERIFIED: `distribution/platforms.json`] |

### Manifest and Marketplace Fields

| File | Field | Exact / Required Value |
|------|-------|------------------------|
| `.codex-plugin/plugin.json` | `name` | `sealos` [VERIFIED: file content] |
| `.codex-plugin/plugin.json` | `repository` | `https://github.com/labring/sealos-skills` [VERIFIED: file content] |
| `.codex-plugin/plugin.json` | `skills` | `./skills/` [VERIFIED: file content] |
| `.codex-plugin/plugin.json` | `interface.displayName` | `Sealos` [VERIFIED: file content] |
| `plugin.json` | parity keys | Same as `.codex-plugin/plugin.json` for `PLUGIN_PARITY_KEYS`. [VERIFIED: `scripts/validate-codex-plugin.py`] |
| `.agents/plugins/marketplace.json` | `plugins` | Length `1`. [VERIFIED: file content] |
| `.agents/plugins/marketplace.json` | `plugins[0].name` | `sealos`. [VERIFIED: file content] |
| `.agents/plugins/marketplace.json` | `plugins[0].source.source` | `local`. [VERIFIED: file content] |
| `.agents/plugins/marketplace.json` | `plugins[0].source.path` | `./plugins/sealos`. [VERIFIED: file content] |
| `.agents/plugins/marketplace.json` | `interface.displayName` | `Sealos`. [VERIFIED: file content] |
| `marketplace.json` | `name` | `sealos`. [VERIFIED: file content] |
| `marketplace.json` | `metadata.repository` | `https://github.com/labring/sealos-skills`. [VERIFIED: file content] |
| `marketplace.json` | `plugins` | Length `1`. [VERIFIED: file content] |
| `marketplace.json` | `plugins[0].name` | `sealos`. [VERIFIED: file content] |
| `marketplace.json` | `plugins[0].source` | `./`. [VERIFIED: file content] |
| `marketplace.json` | `plugins[0].commands` | `./commands/`. [VERIFIED: file content] |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON syntax validation | Custom brace or comma scanner | `json.loads()` through existing `load_json()` | Standard parser gives exact decode failures and path-specific messages. [VERIFIED: `scripts/validate-codex-plugin.py`] |
| Path resolution | String concatenation for repository paths | `pathlib.Path` | Existing script already resolves root paths with `Path`. [VERIFIED: `scripts/validate-codex-plugin.py`] |
| CLI exit handling | Ad hoc return codes across helpers | Existing `fail()` and `require()` pattern | Current validator gives one `FAIL:` line and exits non-zero. [VERIFIED: `scripts/validate-codex-plugin.py`] |
| Temporary failure proofs | Manual unstaged edits with no restoration check | Scripted temp-copy or reversible mutation plus `git diff --exit-code` | Failure probes must leave the worktree clean after proof. [ASSUMED] |

**Key insight:** This phase is a contract validator, so exact values are an advantage; permissive parsing would reduce drift detection. [VERIFIED: `03-CONTEXT.md`; ASSUMED: exactness is preferable for maintainer contracts]

## Common Pitfalls

### Pitfall 1: README Checks Only Test Presence

**What goes wrong:** The README contains both native commands but plugin install appears before marketplace add. [VERIFIED: Phase 2 verification used ordering assertions]

**Why it happens:** Presence checks miss workflow order. [ASSUMED]

**How to avoid:** Use `find()` indexes and require marketplace-add index lower than install index. [VERIFIED: `.planning/phases/02-readme-and-metadata-alignment/02-VERIFICATION.md`]

**Warning signs:** Validator passes after swapping the two README command lines. [ASSUMED]

### Pitfall 2: Platform Registry Keeps Loose Evidence Checks

**What goes wrong:** `distribution/platforms.json` can keep the evidence token while `install` or `alternateInstall` drifts. [VERIFIED: current validator only checks evidence token and commands support]

**Why it happens:** Current validation reads the Codex entry but validates too few fields. [VERIFIED: `scripts/validate-codex-plugin.py`]

**How to avoid:** Assert exact `install`, `alternateInstall`, `claim`, `runtime`, `commands`, and key invocation substrings. [VERIFIED: `03-CONTEXT.md`, `distribution/platforms.json`]

**Warning signs:** `python3 scripts/validate-codex-plugin.py` passes after changing the Codex `install` command. [VERIFIED: current validator code path]

### Pitfall 3: Root Marketplace JSON Remains Outside Parser Coverage

**What goes wrong:** Invalid `marketplace.json` syntax can pass the validator. [VERIFIED: current validator does not load `marketplace.json`]

**Why it happens:** Current JSON parser coverage predates Phase 3's root marketplace requirement. [VERIFIED: `scripts/validate-codex-plugin.py`, `03-CONTEXT.md`]

**How to avoid:** Add `ROOT_MARKETPLACE_PATH = ROOT / "marketplace.json"` and call `load_json(ROOT_MARKETPLACE_PATH)` in `main()`. [VERIFIED: existing path and loader pattern]

**Warning signs:** `python3 -m json.tool marketplace.json` fails while `python3 scripts/validate-codex-plugin.py` still passes. [VERIFIED: current parser coverage]

### Pitfall 4: Root Marketplace Capability Drift Is Tempting Scope Creep

**What goes wrong:** Planner may expand into full cross-host skill-list parity because root `marketplace.json` is now parsed. [VERIFIED: root marketplace currently contains a skill list; `03-CONTEXT.md` defers distribution-wide parity]

**Why it happens:** Marketplace metadata includes both identity and host-specific skill exposure fields. [VERIFIED: `marketplace.json`]

**How to avoid:** For Phase 3, assert root marketplace identity and root source path; leave full non-Codex parity for v2 unless a direct Codex contract field is involved. [VERIFIED: `03-CONTEXT.md`; ASSUMED: this is the smallest compliant scope]

**Warning signs:** Plans include Claude, CodeBuddy, Gemini, Qwen, OpenClaw, or all command routes as required Phase 3 tasks. [VERIFIED: `.planning/REQUIREMENTS.md` v2 scope]

## Failure-Mode Test Ideas

| Requirement | Probe | Expected Failure |
|-------------|-------|------------------|
| VAL-01 | Temporarily change README `codex plugin marketplace add labring/sealos-skills` to another repo slug. | Validator fails with a README native marketplace command message. [ASSUMED] |
| VAL-01 | Temporarily swap the two native README commands. | Validator fails with a README command order message. [ASSUMED] |
| VAL-02 | Temporarily remove `--target codex` from the README fallback command. | Validator fails with a README fallback command message. [ASSUMED] |
| VAL-02 | Temporarily change `distribution.platforms[?id=codex].alternateInstall`. | Validator fails with a platform fallback command message. [ASSUMED] |
| VAL-03 | Temporarily change `.codex-plugin/plugin.json` `interface.displayName` to a different label. | Validator fails through manifest parity or canonical display-name assertion. [ASSUMED] |
| VAL-03 | Temporarily change `.agents/plugins/marketplace.json` `plugins[0].source.path`. | Validator fails with local source path message. [VERIFIED: existing validator already checks this field] |
| VAL-03 | Temporarily change `marketplace.json` `metadata.repository`. | Validator fails with root marketplace repository message after Phase 3 helper is added. [ASSUMED] |
| VAL-04 | Temporarily write malformed JSON to a temp copy or reversible file mutation for `marketplace.json`. | Validator fails with `invalid JSON in marketplace.json`. [ASSUMED, based on existing `load_json()` behavior] |

Implementation should restore each mutation immediately and finish with `git diff --exit-code README.md distribution/platforms.json .codex-plugin/plugin.json plugin.json .agents/plugins/marketplace.json marketplace.json scripts/validate-codex-plugin.py`. [ASSUMED]

## Code Examples

### Platform Contract Helper

```python
# Source: scripts/validate-codex-plugin.py existing require() style.
def require_platform_codex_contract(platforms: dict) -> None:
    codex = get_single_platform(platforms, "codex")
    require(codex.get("claim") == "verified", "Codex platform claim is verified")
    require(codex.get("runtime") == "plugin", "Codex platform runtime is plugin")
    require(codex.get("install") == PLATFORM_NATIVE_INSTALL, "Codex platform native install matches canonical commands")
    require(codex.get("alternateInstall") == FALLBACK_CODEX_COMMAND, "Codex platform fallback install matches canonical command")
    invoke = codex.get("invoke", "")
    require("$sealos" in invoke and DISPLAY_NAME in invoke, "Codex platform invocation names CLI and App plugin selection")
    require("codex_manifest+repo_marketplace" in codex.get("evidence", ""), "Codex platform evidence records manifest and repo marketplace")
```

### Root Marketplace Contract Helper

```python
# Source: marketplace.json current structure and scripts/validate-codex-plugin.py require() style.
def require_root_marketplace_contract(root_marketplace: dict) -> None:
    require(root_marketplace.get("name") == PLUGIN_ID, "root marketplace name is sealos")
    require(root_marketplace.get("metadata", {}).get("repository") == REPOSITORY_URL, "root marketplace repository matches canonical URL")
    plugins = root_marketplace.get("plugins", [])
    require(len(plugins) == 1, "root marketplace has one plugin entry")
    entry = plugins[0]
    require(entry.get("name") == PLUGIN_ID, "root marketplace plugin entry is sealos")
    require(entry.get("source") == "./", "root marketplace plugin source is repository root")
    require(entry.get("commands") == "./commands/", "root marketplace command source points to commands directory")
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| One-off Phase 2 README/platform assertions in verification | Durable validator checks inside `scripts/validate-codex-plugin.py` | Phase 3 | Maintainers get one repeatable drift gate. [VERIFIED: `03-CONTEXT.md`, `02-VERIFICATION.md`] |
| Validator parses four JSON files | Validator should parse five Phase 3 JSON files including root `marketplace.json` | Phase 3 | Invalid root marketplace syntax fails through maintainer command. [VERIFIED: current source; `03-CONTEXT.md`] |
| Platform registry checked for evidence token and command support | Platform registry should check exact Codex install/fallback/invocation fields | Phase 3 | Registry drift becomes visible before publishing. [VERIFIED: current source; `03-CONTEXT.md`] |

**Deprecated/outdated:**
- README-only manual drift review: Phase 3 requires executable validator coverage. [VERIFIED: `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`]
- Separate Phase 3 script: Context locks extension of `scripts/validate-codex-plugin.py`. [VERIFIED: `03-CONTEXT.md`]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Temporary reversible file mutations are the simplest practical way to prove validator failure modes. | Summary, Failure-Mode Test Ideas | Planner may choose subprocess unit tests or fixture-copy tests instead; both can still satisfy drift proof. |
| A2 | Exact command matching is safer than regex matching for this maintainer contract. | Standard Stack, Don't Hand-Roll | Planner may choose normalized whitespace handling; ensure command semantics still fail on meaningful drift. |
| A3 | Full root marketplace skill-list parity is v2 unless direct Codex identity fields drift. | Common Pitfalls | Planner could include capability-list checks and expand Phase 3 scope. |

## Open Questions

1. **Should `marketplace.json` skill-list parity include `sealos-canvas` in Phase 3?**
   - What we know: README says the one plugin installs canvas, and root `marketplace.json` has a `skills` list without `./skills/sealos-canvas`. [VERIFIED: `README.md`, `marketplace.json`]
   - What's unclear: Phase 3 context asks for identity parity, while full distribution-wide parity is deferred. [VERIFIED: `03-CONTEXT.md`]
   - Recommendation: Keep Phase 3 to root marketplace identity/source checks; record skill-list parity as v2 follow-up unless the planner maps it directly to VAL-03. [ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Python 3 | Validator execution and `json.tool` syntax checks | yes | 3.12.12 | None needed. [VERIFIED: local command output] |
| Git | Atomic commit and worktree cleanliness checks | yes | 2.50.1 | None needed. [VERIFIED: local command output] |

**Missing dependencies with no fallback:**
- None. [VERIFIED: local command output]

**Missing dependencies with fallback:**
- None. [VERIFIED: local command output]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | Validator only reads repository files. [VERIFIED: `scripts/validate-codex-plugin.py`] |
| V3 Session Management | no | Validator has no session state. [VERIFIED: `scripts/validate-codex-plugin.py`] |
| V4 Access Control | no | Validator has no authorization boundary. [VERIFIED: `scripts/validate-codex-plugin.py`] |
| V5 Input Validation | yes | Use `json.loads()` and exact string assertions for repository inputs. [VERIFIED: `scripts/validate-codex-plugin.py`] |
| V6 Cryptography | no | Validator does not handle secrets or cryptographic material. [VERIFIED: `scripts/validate-codex-plugin.py`] |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed JSON metadata lands in distribution files | Tampering | Parse all Phase 3 JSON files through `load_json()` and fail non-zero. [VERIFIED: `scripts/validate-codex-plugin.py`] |
| Installer command drift causes users to install the wrong plugin or repo | Spoofing | Assert exact repository slug, selector, URL, and source path constants. [VERIFIED: `03-CONTEXT.md`] |
| Support-claim overreach in platform registry | Information disclosure / misuse risk | Keep exact Codex-focused command and invocation claims; defer non-Codex parity. [VERIFIED: `.planning/REQUIREMENTS.md`, `03-CONTEXT.md`] |

## Sources

### Primary (HIGH confidence)

- `scripts/validate-codex-plugin.py` - current validator coverage, helper patterns, parser scope, and output style. [VERIFIED: codebase grep]
- `README.md` - current native Codex commands, fallback command, capability copy, and invocation wording. [VERIFIED: codebase grep]
- `distribution/platforms.json` - current Codex install, fallback, invocation, evidence, and verification fields. [VERIFIED: codebase grep]
- `.codex-plugin/plugin.json` and `plugin.json` - manifest identity, display label, repository URL, and root skills source. [VERIFIED: codebase grep]
- `.agents/plugins/marketplace.json` and `marketplace.json` - local Codex marketplace and root marketplace metadata. [VERIFIED: codebase grep]
- `.planning/phases/03-validator-hardening/03-CONTEXT.md` - locked decisions and scope fences. [VERIFIED: codebase grep]
- `.planning/ROADMAP.md` and `.planning/REQUIREMENTS.md` - Phase 3 goal and VAL requirements. [VERIFIED: codebase grep]
- `AGENTS.md` - project constraints, command guidance, and distribution layout. [CITED: `AGENTS.md`]

### Secondary (MEDIUM confidence)

- `.planning/phases/02-readme-and-metadata-alignment/02-VERIFICATION.md` - Phase 2 one-off assertions that Phase 3 should make durable. [VERIFIED: codebase grep]
- `.planning/codebase/TESTING.md` - testing and validation command conventions. [VERIFIED: codebase grep]

### Tertiary (LOW confidence)

- None. [VERIFIED: source list]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Existing validator uses only Python standard library modules and local Python version was verified. [VERIFIED: `scripts/validate-codex-plugin.py`, local command output]
- Architecture: HIGH - Phase context explicitly locks the validator entrypoint and Codex-focused scope. [VERIFIED: `03-CONTEXT.md`]
- Pitfalls: HIGH for parser/coverage gaps, MEDIUM for failure-probe mechanics - coverage gaps come from current source; probe style is an implementation recommendation. [VERIFIED: `scripts/validate-codex-plugin.py`; ASSUMED for probe mechanics]

**Research date:** 2026-06-15
**Valid until:** 2026-07-15 for repository-internal validation structure; refresh sooner if Codex plugin metadata format changes. [ASSUMED]
