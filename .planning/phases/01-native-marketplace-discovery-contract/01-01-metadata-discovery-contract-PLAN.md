---
phase: 01
plan: 01-01-metadata-discovery-contract
type: execute
wave: 1
depends_on: []
files_modified:
  - plugin.json
  - .agents/plugins/marketplace.json
  - marketplace.json
  - .claude-plugin/marketplace.json
  - .codex-plugin/plugin.json
  - scripts/validate-codex-plugin.py
  - .planning/phases/01-native-marketplace-discovery-contract/evidence/01-initial-discovery.json
autonomous: true
must_haves:
  truths:
    - 'D-01: The canonical repository source for user-facing Codex marketplace install copy is `labring/sealos-skills`.'
    - 'D-02: The Phase 1 pre-merge smoke can use the current worktree path (`$PWD`) as the marketplace source so discovery is proven against the candidate repository state before remote publication.'
    - 'D-03: The marketplace id is `sealos`, the plugin id is `sealos`, the install selector is `sealos@sealos`, and the Codex App display label is `Sealos`.'
    - 'D-04: Sealos uses a one-plugin model: one installable Codex plugin bundles deploy, database, S3, canvas, app-builder, and supporting cloud-native skills.'
    - 'D-05: `.agents/plugins/marketplace.json` is the Codex marketplace fixture for local repository testing. It must expose one installable plugin named `sealos`, with source path `./`, policy `installation: AVAILABLE`, policy `authentication: ON_INSTALL`, and category `Coding`.'
    - 'D-06: `marketplace.json` and `.claude-plugin/marketplace.json` must continue exposing the installable `sealos` plugin entry from repository root with `commands: ./commands/` and skill paths under `./skills/...`.'
    - 'D-07: `.codex-plugin/plugin.json` remains the Codex plugin manifest for identity, display copy, logo paths, capabilities, and `skills: ./skills/`.'
    - 'D-08: Root `skills/**` is the single canonical skill source for every host. Marketplace and plugin metadata point at root skills and never introduce a second packaged skill copy.'
    - 'D-15: If discovery fails, the fix target is the smallest marketplace discovery contract change needed to expose the existing Codex plugin. Deploy, database, S3, canvas, and app-builder runtime behavior stays untouched.'
    - 'D-18: Codex 0.139.0 requires each marketplace plugin `source.path` to directly contain `plugin.json`.'
    - 'D-19: Phase 1 exposes root `plugin.json` with key fields synchronized to `.codex-plugin/plugin.json` and `skills: "./skills/"`.'
    - 'D-20: Phase 1 validator checks root `plugin.json` and `.codex-plugin/plugin.json` key-field parity.'
requirements:
  - DISC-01
  - DISC-02
  - DISC-03
  - META-03
requirements_addressed:
  - DISC-01
  - DISC-02
  - DISC-03
  - META-03
---

<objective>
Prove the current metadata shape that Codex native marketplace discovery reads, then apply the smallest metadata-only fix needed to expose the existing `sealos@sealos` plugin from the candidate worktree.
</objective>

<must_haves>
<truths>
- D-01: Repository source identity is `labring/sealos-skills`.
- D-02: Pre-merge smoke uses the current worktree path `$PWD` as the marketplace source.
- D-03: Marketplace id, plugin id, and install selector are `sealos`, `sealos`, and `sealos@sealos`.
- D-04: One Sealos plugin bundles deploy, database, S3, canvas, app-builder, and supporting cloud-native skills.
- D-05: `.agents/plugins/marketplace.json` exposes one installable plugin named `sealos` with source path `./`, installation `AVAILABLE`, authentication `ON_INSTALL`, and category `Coding`.
- D-06: `marketplace.json` and `.claude-plugin/marketplace.json` expose installable plugin `sealos` from root with `commands: ./commands/` and skill paths under `./skills/...`.
- D-07: `.codex-plugin/plugin.json` remains the Codex plugin manifest and points `skills` to `./skills/`.
- D-08: Root `skills/**` is the only canonical skill source.
- D-18: Codex 0.139.0 requires each marketplace plugin `source.path` to directly contain `plugin.json`.
- D-19: Phase 1 exposes root `plugin.json` with key fields synchronized to `.codex-plugin/plugin.json` and `skills: "./skills/"`.
- D-20: Phase 1 validator checks root `plugin.json` and `.codex-plugin/plugin.json` key-field parity.
- D-15: Discovery failure is fixed with the smallest marketplace discovery contract change and leaves runtime behavior untouched.
</truths>
</must_haves>

## Truths

- D-01: The canonical repository source for user-facing Codex marketplace install copy is `labring/sealos-skills`.
- D-02: The Phase 1 pre-merge smoke can use the current worktree path (`$PWD`) as the marketplace source so discovery is proven against the candidate repository state before remote publication.
- D-03: The marketplace id is `sealos`, the plugin id is `sealos`, the install selector is `sealos@sealos`, and the Codex App display label is `Sealos`.
- D-04: Sealos uses a one-plugin model: one installable Codex plugin bundles deploy, database, S3, canvas, app-builder, and supporting cloud-native skills.
- D-05: `.agents/plugins/marketplace.json` is the Codex marketplace fixture for local repository testing. It must expose one installable plugin named `sealos`, with source path `./`, policy `installation: AVAILABLE`, policy `authentication: ON_INSTALL`, and category `Coding`.
- D-06: `marketplace.json` and `.claude-plugin/marketplace.json` must continue exposing the installable `sealos` plugin entry from repository root with `commands: ./commands/` and skill paths under `./skills/...`.
- D-07: `.codex-plugin/plugin.json` remains the Codex plugin manifest for identity, display copy, logo paths, capabilities, and `skills: ./skills/`.
- D-08: Root `skills/**` is the single canonical skill source for every host. Marketplace and plugin metadata point at root skills and never introduce a second packaged skill copy.
- D-15: If discovery fails, the fix target is the smallest marketplace discovery contract change needed to expose the existing Codex plugin. Deploy, database, S3, canvas, and app-builder runtime behavior stays untouched.
- D-18: Codex 0.139.0 requires each marketplace plugin `source.path` to directly contain `plugin.json`.
- D-19: Phase 1 exposes root `plugin.json` with key fields synchronized to `.codex-plugin/plugin.json` and `skills: "./skills/"`.
- D-20: Phase 1 validator checks root `plugin.json` and `.codex-plugin/plugin.json` key-field parity.

## Artifacts this phase produces

- `.planning/phases/01-native-marketplace-discovery-contract/evidence/01-initial-discovery.json`
- `plugin.json`
- Optional metadata-only diffs in `.agents/plugins/marketplace.json`, `marketplace.json`, `.claude-plugin/marketplace.json`, or `.codex-plugin/plugin.json`
- `scripts/validate-codex-plugin.py` parity assertions for root `plugin.json`
- No new runtime functions, classes, commands, or skill directories

<tasks>
<task id="01.01" type="execute">
<title>Inspect current marketplace identity and discoverability baseline</title>
<read_first>
- `.planning/phases/01-native-marketplace-discovery-contract/01-CONTEXT.md`
- `.planning/phases/01-native-marketplace-discovery-contract/01-RESEARCH.md`
- `.planning/phases/01-native-marketplace-discovery-contract/01-PATTERNS.md`
- `.agents/plugins/marketplace.json`
- `marketplace.json`
- `.claude-plugin/marketplace.json`
- `.codex-plugin/plugin.json`
- `plugin.json` if present
- `scripts/validate-codex-plugin.py`
</read_first>
<action>
Create `.planning/phases/01-native-marketplace-discovery-contract/evidence/`. Preserve the known precheck result in `.planning/phases/01-native-marketplace-discovery-contract/evidence/01-initial-discovery.json` with top-level keys `marketplace_add`, `marketplace_list`, `plugin_list_available`, `plugin_add`, and `diagnosis`. The diagnosis must record that marketplace add returned `marketplaceName: "sealos"`, marketplace list showed the `sealos` local root, available list returned `{ "installed": [], "available": [] }`, and `codex plugin add sealos@sealos --json` failed with `plugin `sealos` was not found in marketplace `sealos``. If rerunning the baseline, use `TMP_ROOT="$(mktemp -d)"`, `SMOKE_HOME="$TMP_ROOT/home"`, and `SMOKE_CODEX_HOME="$TMP_ROOT/codex-home"` for every Codex command.
</action>
<acceptance_criteria>
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/01-initial-discovery.json` exists.
- The evidence file is valid JSON according to `python3 -m json.tool .planning/phases/01-native-marketplace-discovery-contract/evidence/01-initial-discovery.json >/dev/null`.
- The evidence file records `available` as an empty array before the fix.
- The evidence file records the install failure message `plugin `sealos` was not found in marketplace `sealos`` before the fix.
- The command environment in the transcript or execution notes records non-empty `TMP_ROOT`, `SMOKE_HOME`, and `SMOKE_CODEX_HOME` values.
- No files under `skills/` are modified by this task.
</acceptance_criteria>
</task>

<task id="01.02" type="execute">
<title>Expose a root plugin manifest for Codex native discovery</title>
<read_first>
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/01-initial-discovery.json`
- `.agents/plugins/marketplace.json`
- `.codex-plugin/plugin.json`
- `plugin.json` if present
- `scripts/validate-codex-plugin.py`
- `.planning/codebase/CONVENTIONS.md`
</read_first>
<action>
Create or update root `plugin.json` so Codex native marketplace discovery can read a plugin manifest directly from marketplace plugin `source.path: "./"`. Copy the key manifest content from `.codex-plugin/plugin.json`, preserving `name: "sealos"`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`, `skills: "./skills/"`, and the complete `interface` object. Keep `.agents/plugins/marketplace.json` plugin `source.path` as `./`. Do not create a `plugin/skills` directory and do not copy root `skills/**`.
</action>
<acceptance_criteria>
- `plugin.json` exists at repository root.
- `python3 -m json.tool plugin.json >/dev/null` exits 0.
- `plugin.json` contains `"name": "sealos"` and `"skills": "./skills/"`.
- `plugin.json` `interface.displayName` is `Sealos`.
- `.agents/plugins/marketplace.json` still contains `"path": "./"`.
- `find . -path './plugin/skills*' -print` produces no output.
- `git diff -- skills` is empty.
</acceptance_criteria>
</task>

<task id="01.03" type="execute">
<title>Add manifest parity validation for the root plugin manifest</title>
<read_first>
- `scripts/validate-codex-plugin.py`
- `plugin.json`
- `.codex-plugin/plugin.json`
- `.agents/plugins/marketplace.json`
- `marketplace.json`
- `.claude-plugin/marketplace.json`
- `.planning/codebase/CONVENTIONS.md`
</read_first>
<action>
Update `scripts/validate-codex-plugin.py` to load root `plugin.json` and assert parity with `.codex-plugin/plugin.json` for these keys: `name`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`, `skills`, and `interface`. Keep the existing assertions for `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `distribution/platforms.json`, logo paths, category, capabilities, and root `skills/`.
</action>
<acceptance_criteria>
- `python3 scripts/validate-codex-plugin.py` exits 0 after the root manifest is added.
- Validator output contains a PASS line proving root `plugin.json` exists.
- Validator output contains a PASS line proving root `plugin.json` matches `.codex-plugin/plugin.json` for key fields.
- `.agents/plugins/marketplace.json` still contains `"name": "sealos"`, `"path": "./"`, `"installation": "AVAILABLE"`, and `"authentication": "ON_INSTALL"`.
- `.codex-plugin/plugin.json` still contains `"name": "sealos"` and `"skills": "./skills/"`.
- `git diff -- skills` is empty.
</acceptance_criteria>
</task>

<task id="01.04" type="execute">
<title>Retain sibling marketplace surfaces without introducing skill copies</title>
<read_first>
- `marketplace.json`
- `.claude-plugin/marketplace.json`
- `.codex-plugin/plugin.json`
- `marketplaces/README.md`
- `.planning/codebase/CONVENTIONS.md`
</read_first>
<action>
Inspect `marketplace.json` and `.claude-plugin/marketplace.json` after root `plugin.json` is added. Preserve plugin `name: sealos`, root source `./`, `commands: ./commands/`, and root `./skills/...` paths. Apply only metadata changes that are directly required by the Codex native discovery contract or by parity with the root plugin manifest.
</action>
<acceptance_criteria>
- If metadata changes, `git diff -- plugin.json .agents/plugins/marketplace.json marketplace.json .claude-plugin/marketplace.json .codex-plugin/plugin.json scripts/validate-codex-plugin.py` shows only discovery metadata and validator parity changes.
- `.agents/plugins/marketplace.json` still contains `"name": "sealos"`, `"path": "./"`, `"installation": "AVAILABLE"`, and `"authentication": "ON_INSTALL"`.
- `.codex-plugin/plugin.json` still contains `"name": "sealos"` and `"skills": "./skills/"`.
- `marketplace.json` and `.claude-plugin/marketplace.json` still contain `"commands": "./commands/"` and all skill paths start with `"./skills/"`.
- `git diff -- skills` is empty.
</acceptance_criteria>
</task>
</tasks>

<verification>
- `python3 -m json.tool plugin.json >/dev/null`
- `python3 -m json.tool .agents/plugins/marketplace.json >/dev/null`
- `python3 -m json.tool marketplace.json >/dev/null`
- `python3 -m json.tool .claude-plugin/marketplace.json >/dev/null`
- `python3 -m json.tool .codex-plugin/plugin.json >/dev/null`
- `python3 scripts/validate-codex-plugin.py`
- `git diff -- skills --exit-code`
</verification>

<success_criteria>
- `DISC-01` has a local isolated marketplace-add baseline.
- `META-03` remains satisfied by one installable Sealos plugin exposed through marketplace metadata.
- Any metadata correction is limited to discovery fields and preserves root `skills/**` as the only skill source.
</success_criteria>
