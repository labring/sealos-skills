---
phase: 01
plan: 01-02-isolated-codex-smoke
type: execute
wave: 2
depends_on:
  - 01-01-metadata-discovery-contract
files_modified:
  - .planning/phases/01-native-marketplace-discovery-contract/evidence/00-codex-version.txt
  - .planning/phases/01-native-marketplace-discovery-contract/evidence/01-marketplace-add.json
  - .planning/phases/01-native-marketplace-discovery-contract/evidence/02-marketplace-list.json
  - .planning/phases/01-native-marketplace-discovery-contract/evidence/03-plugin-list-available.json
  - .planning/phases/01-native-marketplace-discovery-contract/evidence/04-plugin-add.json
  - .planning/phases/01-native-marketplace-discovery-contract/evidence/05-native-smoke-assertions.json
autonomous: true
must_haves:
  truths:
    - 'D-02: The Phase 1 pre-merge smoke can use the current worktree path (`$PWD`) as the marketplace source so discovery is proven against the candidate repository state before remote publication.'
    - 'D-03: The marketplace id is `sealos`, the plugin id is `sealos`, the install selector is `sealos@sealos`, and the Codex App display label is `Sealos`.'
    - 'D-09: Every Codex marketplace smoke command for Phase 1 must run with isolated `HOME` and `CODEX_HOME` values. The smoke must avoid the user live Codex config and plugin cache.'
    - 'D-10: The required smoke sequence is marketplace add, marketplace list, available plugin list, and plugin install. The list step must prove `sealos@sealos` appears before the install step is accepted as complete.'
    - 'D-11: Phase 1 evidence belongs under `.planning/phases/01-native-marketplace-discovery-contract/evidence/` with one file per command output.'
    - 'D-12: Planning must include a machine-readable assertion that `03-plugin-list-available.json` contains an available plugin whose marketplace-qualified identity is `sealos@sealos`.'
    - 'D-13: Planning must include a machine-readable assertion that `04-plugin-add.json` reports successful installation of plugin `sealos` from marketplace `sealos`.'
requirements:
  - DISC-01
  - DISC-02
  - DISC-03
requirements_addressed:
  - DISC-01
  - DISC-02
  - DISC-03
---

<objective>
Run the full isolated Codex marketplace smoke for the candidate worktree and save machine-checkable evidence that `sealos@sealos` is available and installable.
</objective>

<must_haves>
<truths>
- D-02: Pre-merge smoke uses the current worktree path `$PWD` as the marketplace source.
- D-03: The install selector is `sealos@sealos`.
- D-09: Every Codex marketplace smoke command uses isolated `HOME` and `CODEX_HOME`.
- D-10: The smoke sequence is marketplace add, marketplace list, available plugin list, and plugin install; available-list proof precedes install completion.
- D-11: Phase 1 evidence lives under `.planning/phases/01-native-marketplace-discovery-contract/evidence/`.
- D-12: `03-plugin-list-available.json` must prove the available plugin identity `sealos@sealos`.
- D-13: `04-plugin-add.json` must prove successful installation of plugin `sealos` from marketplace `sealos`.
</truths>
</must_haves>

## Truths

- D-02: The Phase 1 pre-merge smoke can use the current worktree path (`$PWD`) as the marketplace source so discovery is proven against the candidate repository state before remote publication.
- D-03: The marketplace id is `sealos`, the plugin id is `sealos`, the install selector is `sealos@sealos`, and the Codex App display label is `Sealos`.
- D-09: Every Codex marketplace smoke command for Phase 1 must run with isolated `HOME` and `CODEX_HOME` values. The smoke must avoid the user's live Codex config and plugin cache.
- D-10: The required smoke sequence is marketplace add, marketplace list, available plugin list, and plugin install. The list step must prove `sealos@sealos` appears before the install step is accepted as complete.
- D-11: Phase 1 evidence belongs under `.planning/phases/01-native-marketplace-discovery-contract/evidence/` with one file per command output.
- D-12: Planning must include a machine-readable assertion that `03-plugin-list-available.json` contains an available plugin whose marketplace-qualified identity is `sealos@sealos`.
- D-13: Planning must include a machine-readable assertion that `04-plugin-add.json` reports successful installation of plugin `sealos` from marketplace `sealos`.

## Artifacts this phase produces

- `.planning/phases/01-native-marketplace-discovery-contract/evidence/00-codex-version.txt`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/01-marketplace-add.json`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/02-marketplace-list.json`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/03-plugin-list-available.json`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/04-plugin-add.json`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/05-native-smoke-assertions.json`
- No new runtime functions, classes, commands, or skill directories

<tasks>
<task id="02.01" type="execute">
<title>Run isolated marketplace add, list, available-list, and install smoke</title>
<read_first>
- `.planning/phases/01-native-marketplace-discovery-contract/01-CONTEXT.md`
- `.planning/phases/01-native-marketplace-discovery-contract/01-RESEARCH.md`
- `.agents/plugins/marketplace.json`
- `plugin.json`
- `.codex-plugin/plugin.json`
- `marketplace.json`
</read_first>
<action>
Set `PHASE_DIR=".planning/phases/01-native-marketplace-discovery-contract"`, `EVIDENCE_DIR="$PHASE_DIR/evidence"`, `SMOKE_HOME="$(mktemp -d)"`, and `SMOKE_CODEX_HOME="$SMOKE_HOME/.codex"`. Create the evidence directory. Save `codex --version` to `00-codex-version.txt`. Run and save these commands in order: `HOME="$SMOKE_HOME" CODEX_HOME="$SMOKE_CODEX_HOME" codex plugin marketplace add "$PWD" --json` to `01-marketplace-add.json`; `HOME="$SMOKE_HOME" CODEX_HOME="$SMOKE_CODEX_HOME" codex plugin marketplace list --json` to `02-marketplace-list.json`; `HOME="$SMOKE_HOME" CODEX_HOME="$SMOKE_CODEX_HOME" codex plugin list --available --json` to `03-plugin-list-available.json`; `HOME="$SMOKE_HOME" CODEX_HOME="$SMOKE_CODEX_HOME" codex plugin add sealos@sealos --json` to `04-plugin-add.json`.
</action>
<acceptance_criteria>
- All five evidence files exist under `.planning/phases/01-native-marketplace-discovery-contract/evidence/`.
- `01-marketplace-add.json`, `02-marketplace-list.json`, `03-plugin-list-available.json`, and `04-plugin-add.json` each pass `python3 -m json.tool <file> >/dev/null`.
- `03-plugin-list-available.json` is produced before `04-plugin-add.json` in the execution transcript.
- `03-plugin-list-available.json` contains available plugin identity `sealos@sealos` after the root `plugin.json` fix.
- `04-plugin-add.json` records a successful install of `sealos@sealos` after the root `plugin.json` fix.
- No command writes to the user's live `HOME` or live `CODEX_HOME`; each Codex command explicitly sets `HOME="$SMOKE_HOME"` and `CODEX_HOME="$SMOKE_CODEX_HOME"`.
</acceptance_criteria>
</task>

<task id="02.02" type="execute">
<title>Assert JSON evidence for available and installed identities</title>
<read_first>
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/03-plugin-list-available.json`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/04-plugin-add.json`
- `.planning/phases/01-native-marketplace-discovery-contract/01-RESEARCH.md`
</read_first>
<action>
Create a compact assertion command or helper that recursively scans JSON values. Assert that `03-plugin-list-available.json` contains `sealos@sealos` or fields equivalent to marketplace `sealos` plus plugin `sealos`. Assert that `04-plugin-add.json` contains plugin `sealos`, marketplace or source `sealos`, and a successful installed or added status. Save assertion results to `.planning/phases/01-native-marketplace-discovery-contract/evidence/05-native-smoke-assertions.json` with keys `available_contains_sealos_at_sealos`, `install_reports_sealos_from_sealos`, `passed`, and `checked_files`.
</action>
<acceptance_criteria>
- `05-native-smoke-assertions.json` exists and passes `python3 -m json.tool .planning/phases/01-native-marketplace-discovery-contract/evidence/05-native-smoke-assertions.json >/dev/null`.
- `05-native-smoke-assertions.json` contains `"available_contains_sealos_at_sealos": true`.
- `05-native-smoke-assertions.json` contains `"install_reports_sealos_from_sealos": true`.
- `05-native-smoke-assertions.json` contains `"passed": true`.
</acceptance_criteria>
</task>
</tasks>

<verification>
- `python3 -m json.tool .planning/phases/01-native-marketplace-discovery-contract/evidence/01-marketplace-add.json >/dev/null`
- `python3 -m json.tool .planning/phases/01-native-marketplace-discovery-contract/evidence/02-marketplace-list.json >/dev/null`
- `python3 -m json.tool .planning/phases/01-native-marketplace-discovery-contract/evidence/03-plugin-list-available.json >/dev/null`
- `python3 -m json.tool .planning/phases/01-native-marketplace-discovery-contract/evidence/04-plugin-add.json >/dev/null`
- `python3 -m json.tool .planning/phases/01-native-marketplace-discovery-contract/evidence/05-native-smoke-assertions.json >/dev/null`
</verification>

<success_criteria>
- `DISC-01` is satisfied by isolated marketplace add evidence.
- `DISC-02` is satisfied by available-list evidence containing `sealos@sealos`.
- `DISC-03` is satisfied by install evidence for `sealos@sealos`.
</success_criteria>
