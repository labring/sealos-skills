# Architecture Research: Codex Plugin Installation Upgrade

**Project:** Sealos Codex Plugin Installation Upgrade  
**Domain:** Codex plugin distribution and installation documentation  
**Researched:** 2026-06-15  
**Overall confidence:** HIGH

## Recommendation

Make README the user-facing install guide, keep `.codex-plugin/plugin.json` as the Codex plugin contract, keep `.agents/plugins/marketplace.json` as the local Codex marketplace fixture, use `distribution/platforms.json` as the support-claim registry, and extend `scripts/validate-codex-plugin.py` as the guardrail that proves those files agree.

The Codex installation upgrade should be structured as a documentation-first distribution change with validator-backed metadata parity. The root `skills/**` tree remains the only source of skill behavior. Codex installation copy should point users to native Codex marketplace commands first, with `npx plugins add ... --target codex` positioned as the compatibility/local install path.

## Evidence Reviewed

| Source | Finding | Confidence |
|--------|---------|------------|
| `.planning/PROJECT.md` | Milestone targets Codex native marketplace installation copy and metadata alignment. | HIGH |
| `.planning/codebase/ARCHITECTURE.md` | Existing architecture is plugin-first with root `skills/**` as canonical source. | HIGH |
| `.planning/codebase/STRUCTURE.md` | Distribution files are already separated by host: `.codex-plugin/`, `.agents/`, `distribution/`, `marketplace.json`. | HIGH |
| `.planning/codebase/CONCERNS.md` | Distribution metadata duplication is the main drift risk; Codex validator coverage is intentionally narrow. | HIGH |
| `README.md` | Current primary Codex install path is `npx plugins add https://github.com/labring/sealos-skills --target codex`. | HIGH |
| `.codex-plugin/plugin.json` | Codex plugin name is `sealos`; skills path is `./skills/`; display name is `Sealos`. | HIGH |
| `.agents/plugins/marketplace.json` | Local Codex marketplace fixture exposes one plugin named `sealos` from repo root. | HIGH |
| `marketplace.json` | Root marketplace name is `sealos`; plugin name is `sealos`; source is `./`. | HIGH |
| `distribution/platforms.json` | Codex install claim still points to `npx plugins add ... --target codex`. | HIGH |
| `scripts/validate-codex-plugin.py` | Validator checks Codex manifest, local marketplace, registry evidence, and asset paths. | HIGH |
| `/tmp/pm-skills-ref/README.md` | Reference README presents Codex as two native commands: add marketplace, then add plugin. | HIGH |
| Local `codex plugin --help` | Codex CLI supports `plugin marketplace add` and `plugin add`. | HIGH |

## Recommended Architecture

```text
README.md
  |
  | user-facing install contract
  v
Codex marketplace source
  |
  | codex plugin marketplace add labring/sealos-skills
  v
Root marketplace metadata
  |
  | marketplace name: sealos
  | plugin name: sealos
  v
Codex plugin installation
  |
  | codex plugin add sealos@sealos
  v
.codex-plugin/plugin.json
  |
  | plugin identity, UI copy, asset paths, skills path
  v
skills/**
  |
  | canonical skill behavior for all hosts
  v
Agent runtime invocation
  |
  | Codex CLI: $sealos
  | Codex App: select Sealos from Plugins
  v
Validation
  |
  | scripts/validate-codex-plugin.py
  | JSON syntax checks
  | optional local install/discover smoke
```

## Component Boundaries

| Component | Responsibility | Files | Change Scope |
|-----------|----------------|-------|--------------|
| Install guide | Teaches Codex users the shortest native install path and the correct invocation surface. | `README.md` | Primary change area |
| Codex plugin manifest | Defines plugin identity, display metadata, prompts, asset paths, and `skills` pointer. | `.codex-plugin/plugin.json` | Keep stable unless README exposes a mismatched claim |
| Local Codex marketplace fixture | Enables local Codex marketplace testing for this repository. | `.agents/plugins/marketplace.json` | Keep aligned with plugin name and local source |
| Root marketplace metadata | Provides marketplace name and plugin entry used by native marketplace-style install flows. | `marketplace.json` | Verify name/source consistency; avoid broad host churn |
| Platform registry | Records support claims, install command, invocation, evidence, and verification date. | `distribution/platforms.json` | Update Codex install claim and evidence after README change |
| Validator | Enforces metadata parity for Codex-facing distribution files. | `scripts/validate-codex-plugin.py` | Extend only for new parity rules introduced by this milestone |
| Canonical skills | Own all deploy, database, S3, canvas, app-builder, readiness, Dockerfile, and template behavior. | `skills/**` | Out of scope for installation upgrade |

## Data Flow

### Codex Native Installation Flow

1. User reads `README.md`.
2. README instructs the user to add the Sealos marketplace:

   ```bash
   codex plugin marketplace add labring/sealos-skills
   ```

3. README instructs the user to install the single Sealos plugin:

   ```bash
   codex plugin add sealos@sealos
   ```

4. Codex resolves marketplace name `sealos` from root `marketplace.json`.
5. Codex resolves plugin entry `sealos` from that marketplace.
6. The plugin resolves Codex-specific metadata from `.codex-plugin/plugin.json`.
7. `.codex-plugin/plugin.json` points to `./skills/`.
8. Codex exposes the installed plugin as `$sealos` in CLI and as `Sealos` in the app plugin picker.

### Compatibility Installation Flow

1. README keeps the existing compatibility/local path:

   ```bash
   npx plugins add https://github.com/labring/sealos-skills --target codex
   ```

2. This path still resolves the same repository root and Codex plugin manifest.
3. It should be visually secondary to the native `codex plugin` path.

### Validation Flow

1. `README.md` install commands define the expected user path.
2. `distribution/platforms.json` records the same Codex install and invocation claims.
3. `.codex-plugin/plugin.json` and `.agents/plugins/marketplace.json` provide machine-readable plugin metadata.
4. `scripts/validate-codex-plugin.py` should assert:
   - Codex plugin name is `sealos`.
   - Codex plugin skills path is `./skills/`.
   - Local Codex marketplace has one plugin named `sealos`.
   - Local Codex marketplace points at repo root.
   - Platform registry Codex entry contains the native Codex install command.
   - Platform registry Codex invocation mentions `$sealos` and Codex App plugin selection.
   - Root `marketplace.json` name is `sealos`.
   - Root `marketplace.json` contains one plugin named `sealos`.
   - Root `marketplace.json` plugin source is `./`.

## Patterns to Follow

### Pattern 1: README Leads, Metadata Proves

**What:** Put the native Codex install sequence in README first, then make manifests and registry prove that sequence.

**When:** Any change affects install, invocation, marketplace naming, or support claims.

**Implementation shape:**

```markdown
### Codex CLI / Codex App

```bash
codex plugin marketplace add labring/sealos-skills
codex plugin add sealos@sealos
```

Use `$sealos` in Codex CLI. In Codex App, open Plugins and select Sealos.
```

**Why:** README is where users make install decisions; manifests and validator keep the instructions grounded in actual package metadata.

### Pattern 2: Single Plugin, Single Skill Source

**What:** Treat Sealos as one Codex plugin named `sealos` that loads the root `skills/**` pack.

**When:** Codex copy, manifest fields, marketplace entries, registry claims, and validator checks are updated.

**Implementation shape:**

```json
{
  "name": "sealos",
  "skills": "./skills/"
}
```

**Why:** This project bundles multiple task skills behind one Sealos plugin. A second packaged skill copy would create drift.

### Pattern 3: Cross-Host Changes Stay Deliberate

**What:** Limit this milestone to Codex install docs, Codex metadata parity, platform registry Codex fields, and Codex validation.

**When:** README touches the tool matrix or shared distribution sections.

**Implementation shape:** Update Claude, Gemini, Qwen, CodeBuddy, OpenClaw, and skills.sh wording only where Codex wording creates a direct inconsistency in shared tables.

**Why:** Existing non-Codex paths have separate manifests and support-claim semantics. Codex install copy can improve without triggering broad distribution churn.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Adding a Codex-Specific Skill Copy

**What:** Creating `.codex-plugin/skills/` or another host-specific skill tree.

**Consequence:** Skill behavior drifts across Codex, Claude-compatible hosts, `skills.sh`, Gemini, Qwen, and generic importers.

**Preferred structure:** Keep `.codex-plugin/plugin.json` pointing to `./skills/`.

### Anti-Pattern 2: Updating README Without Registry Parity

**What:** README says `codex plugin marketplace add ...` while `distribution/platforms.json` still records only `npx plugins add ... --target codex`.

**Consequence:** Future maintainers see two competing install contracts.

**Preferred structure:** Update `distribution/platforms.json` in the same phase as README and validate it.

### Anti-Pattern 3: Treating Codex as Slash-Command Equivalent

**What:** Claiming Codex exposes `/sealos` or direct `/sealos-deploy` as the primary plugin interface.

**Consequence:** Users expect Claude-compatible command behavior in Codex.

**Preferred structure:** Codex examples use `$sealos`; Claude-compatible examples use `/sealos`; direct `skills.sh` examples use `/sealos-deploy`, `/sealos-database`, and `/sealos-s3`.

### Anti-Pattern 4: Broad Marketplace Refactors During Install Copy Work

**What:** Rewriting Claude, CodeBuddy, Gemini, Qwen, OpenClaw, and skills.sh metadata while improving Codex installation copy.

**Consequence:** The milestone grows into a distribution-wide migration with larger validation needs.

**Preferred structure:** Keep host-specific files stable unless Codex consistency requires a direct edit.

## Suggested Build Order

### Phase 1: Establish Codex Install Contract

**Files:** `README.md`

**Work:**
- Put `codex plugin marketplace add labring/sealos-skills` first for Codex.
- Put `codex plugin add sealos@sealos` second.
- Keep `npx plugins add https://github.com/labring/sealos-skills --target codex` as compatibility/local install.
- Keep Codex invocation as `$sealos` and Codex App plugin selection.

**Verification:**
- Confirm every Codex install example uses the plugin name `sealos`.
- Confirm README keeps `skills.sh` direct skill commands in the `skills.sh` section.

### Phase 2: Align Registry and Metadata Claims

**Files:** `distribution/platforms.json`, potentially `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `marketplace.json`

**Work:**
- Update the Codex `install` value to the native Codex command sequence or add a primary/alternate install split.
- Keep `invoke` aligned with `$sealos` and Codex App selection.
- Keep `.codex-plugin/plugin.json` stable if its fields already match README.
- Keep `.agents/plugins/marketplace.json` stable if local source and plugin name remain correct.
- Verify `marketplace.json` supports `sealos@sealos` through marketplace name `sealos` and plugin name `sealos`.

**Verification:**
- Run JSON syntax checks.
- Inspect fields with a structured JSON reader before editing validator logic.

### Phase 3: Extend Codex Validator

**Files:** `scripts/validate-codex-plugin.py`

**Work:**
- Add root `marketplace.json` validation.
- Add Codex install command parity validation against `distribution/platforms.json`.
- Add invocation parity checks for `$sealos` and Codex App selection.
- Preserve current checks for asset paths, category, capabilities, and `./skills/`.

**Verification:**

```bash
python3 scripts/validate-codex-plugin.py
python3 -m json.tool .codex-plugin/plugin.json >/dev/null
python3 -m json.tool .agents/plugins/marketplace.json >/dev/null
python3 -m json.tool marketplace.json >/dev/null
python3 -m json.tool distribution/platforms.json >/dev/null
```

### Phase 4: Optional Local Codex Smoke

**Files:** no source edits expected

**Work:**
- Use local Codex commands to confirm command syntax remains current:

  ```bash
  codex plugin marketplace add --help
  codex plugin add --help
  ```

- If safe for the maintainer environment, test a local marketplace install from a disposable Codex config.

**Verification:**
- Confirm the CLI accepts the documented command shape.
- Confirm installed plugin resolves as `sealos` when a disposable config is used.

## Scalability Considerations

| Concern | Near Term | Later |
|---------|-----------|-------|
| More Codex install surfaces | Keep README plus registry in sync through validator checks. | Add an automated README-command extraction check if install docs grow. |
| More Sealos skills | Add skills under root `skills/**`; keep `.codex-plugin/plugin.json` pointing to `./skills/`. | Add distribution-wide validation for all advertised skill paths. |
| More host manifests | Keep this milestone Codex-scoped. | Add a sibling validator for Claude, CodeBuddy, Gemini, Qwen, OpenClaw, and marketplace parity. |
| Codex CLI command evolution | Prefer documented `codex plugin` commands and local `--help` verification. | Revalidate during release updates and update README plus registry together. |

## Roadmap Implications

Recommended phase structure:

1. **Codex README Install Copy** - Highest user impact, lowest blast radius.
   - Addresses native Codex install path and invocation clarity.
   - Avoids manifest churn before the target user contract is written.

2. **Registry and Manifest Parity** - Makes README claims machine-readable.
   - Addresses `distribution/platforms.json`, `marketplace.json`, `.codex-plugin/plugin.json`, and `.agents/plugins/marketplace.json` agreement.
   - Avoids support-claim drift.

3. **Validation Upgrade** - Turns the install contract into a durable guardrail.
   - Addresses future drift across README-facing fields and Codex metadata.
   - Avoids repeating manual parity checks.

4. **Codex Smoke Verification** - Confirms the documented command shape against the installed CLI.
   - Addresses confidence in native `codex plugin` command syntax.
   - Keeps runtime skill behavior out of scope.

## Open Questions

| Question | Impact | Recommendation |
|----------|--------|----------------|
| Should `distribution/platforms.json` store both primary and alternate Codex install commands? | Medium | Use `install` for native Codex commands and `alternateInstall` for `npx plugins add ... --target codex`. |
| Should README call `npx plugins` a compatibility path or a local testing path? | Low | Use "compatibility/local install" because the existing repo already supports it. |
| Should validator parse README install commands directly? | Low | Defer. Registry parity gives enough protection for this milestone. |
| Should non-Codex marketplace files be normalized now? | Medium | Defer to a distribution-wide validation milestone. |

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Component boundaries | HIGH | Confirmed by current architecture docs and actual files. |
| Native Codex command shape | HIGH | Confirmed with local `codex plugin --help`, `codex plugin marketplace add --help`, and `codex plugin add --help`. |
| Marketplace selector `sealos@sealos` | HIGH | Root `marketplace.json` name is `sealos` and plugin entry is `sealos`; Codex help documents `PLUGIN@MARKETPLACE`. |
| Validator upgrade scope | HIGH | Existing Python validator already covers the right Codex files and can be extended surgically. |
| Cross-host impact | MEDIUM | Existing files are clear, but this research did not run full installs for Claude, CodeBuddy, Gemini, Qwen, or OpenClaw. |

## Sources

- `.planning/PROJECT.md`
- `.planning/codebase/ARCHITECTURE.md`
- `.planning/codebase/STRUCTURE.md`
- `.planning/codebase/CONCERNS.md`
- `README.md`
- `.codex-plugin/plugin.json`
- `.agents/plugins/marketplace.json`
- `marketplace.json`
- `distribution/platforms.json`
- `scripts/validate-codex-plugin.py`
- `/tmp/pm-skills-ref/README.md`
- `/tmp/pm-skills-ref/.claude-plugin/marketplace.json`
- Local CLI: `codex plugin --help`, `codex plugin marketplace add --help`, `codex plugin add --help`
