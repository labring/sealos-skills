---
phase: 01
plan: 01-03-validation-and-handoff
type: execute
wave: 3
depends_on:
  - 01-02-isolated-codex-smoke
files_modified:
  - .planning/phases/01-native-marketplace-discovery-contract/evidence/06-validate-codex-plugin.txt
  - .planning/phases/01-native-marketplace-discovery-contract/evidence/07-json-syntax-checks.txt
  - .planning/phases/01-native-marketplace-discovery-contract/evidence/08-phase-1-handoff.md
autonomous: true
must_haves:
  truths:
    - 'D-08: Root `skills/**` is the single canonical skill source for every host. Marketplace and plugin metadata point at root skills and never introduce a second packaged skill copy.'
    - 'D-11: Phase 1 evidence belongs under `.planning/phases/01-native-marketplace-discovery-contract/evidence/` with one file per command output.'
    - 'D-14: Metadata validation for Phase 1 uses `python3 scripts/validate-codex-plugin.py` and JSON syntax checks for `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `marketplace.json`, `.claude-plugin/marketplace.json`, and `distribution/platforms.json`.'
    - 'D-16: Phase 1 locks install identity only. README copy promotion belongs to Phase 2 after discovery and install are proven.'
    - 'D-17: Downstream documentation should describe Codex usage as selecting the Sealos plugin or asking Codex to use Sealos. Claude-compatible `/sealos` examples stay in Claude-specific sections, and direct `/sealos-deploy`, `/sealos-database`, and `/sealos-s3` entries stay in direct `skills.sh` sections.'
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
Close Phase 1 with repository validation, JSON syntax checks, evidence review, and a handoff that records the exact discovery contract for later README, registry, and validator phases.
</objective>

<must_haves>
<truths>
- D-08: Root `skills/**` remains the single canonical skill source.
- D-11: Phase 1 evidence lives under `.planning/phases/01-native-marketplace-discovery-contract/evidence/`.
- D-14: Metadata validation uses `python3 scripts/validate-codex-plugin.py` and JSON syntax checks for `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `marketplace.json`, `.claude-plugin/marketplace.json`, and `distribution/platforms.json`.
- D-20: Phase 1 validator checks root `plugin.json` and `.codex-plugin/plugin.json` key-field parity.
- D-16: Phase 1 locks install identity only; README copy promotion belongs to Phase 2.
- D-17: Downstream documentation should use Codex-specific invocation wording and reserve Claude-compatible `/sealos` examples for Claude sections.
</truths>
</must_haves>

## Truths

- D-08: Root `skills/**` is the single canonical skill source for every host. Marketplace and plugin metadata point at root skills and never introduce a second packaged skill copy.
- D-11: Phase 1 evidence belongs under `.planning/phases/01-native-marketplace-discovery-contract/evidence/` with one file per command output.
- D-14: Metadata validation for Phase 1 uses `python3 scripts/validate-codex-plugin.py` and JSON syntax checks for `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `marketplace.json`, `.claude-plugin/marketplace.json`, and `distribution/platforms.json`.
- D-16: Phase 1 locks install identity only. README copy promotion belongs to Phase 2 after discovery and install are proven.
- D-17: Downstream documentation should describe Codex usage as selecting the Sealos plugin or asking Codex to use Sealos. Claude-compatible `/sealos` examples stay in Claude-specific sections, and direct `/sealos-deploy`, `/sealos-database`, and `/sealos-s3` entries stay in direct `skills.sh` sections.
- D-20: Phase 1 validator checks root `plugin.json` and `.codex-plugin/plugin.json` key-field parity.

## Artifacts this phase produces

- `.planning/phases/01-native-marketplace-discovery-contract/evidence/06-validate-codex-plugin.txt`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/07-json-syntax-checks.txt`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/08-phase-1-handoff.md`
- No new runtime functions, classes, commands, or skill directories

<tasks>
<task id="03.01" type="execute">
<title>Run Codex plugin validator and JSON syntax checks</title>
<read_first>
- `scripts/validate-codex-plugin.py`
- `plugin.json`
- `.codex-plugin/plugin.json`
- `.agents/plugins/marketplace.json`
- `marketplace.json`
- `.claude-plugin/marketplace.json`
- `distribution/platforms.json`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/05-native-smoke-assertions.json`
</read_first>
<action>
Run `python3 scripts/validate-codex-plugin.py` and save stdout/stderr to `.planning/phases/01-native-marketplace-discovery-contract/evidence/06-validate-codex-plugin.txt`. Run `python3 -m json.tool` against `plugin.json`, `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `marketplace.json`, `.claude-plugin/marketplace.json`, and `distribution/platforms.json`; save a line-per-file PASS transcript to `.planning/phases/01-native-marketplace-discovery-contract/evidence/07-json-syntax-checks.txt`.
</action>
<acceptance_criteria>
- `06-validate-codex-plugin.txt` exists and contains `Sealos Codex plugin integration validation passed`.
- `06-validate-codex-plugin.txt` contains a PASS line proving root `plugin.json` matches `.codex-plugin/plugin.json`.
- `07-json-syntax-checks.txt` exists and contains `PASS .codex-plugin/plugin.json`.
- `07-json-syntax-checks.txt` contains `PASS plugin.json`.
- `07-json-syntax-checks.txt` contains `PASS .agents/plugins/marketplace.json`.
- `07-json-syntax-checks.txt` contains `PASS marketplace.json`.
- `07-json-syntax-checks.txt` contains `PASS .claude-plugin/marketplace.json`.
- `07-json-syntax-checks.txt` contains `PASS distribution/platforms.json`.
</acceptance_criteria>
</task>

<task id="03.02" type="execute">
<title>Write Phase 1 evidence handoff</title>
<read_first>
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/01-marketplace-add.json`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/02-marketplace-list.json`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/03-plugin-list-available.json`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/04-plugin-add.json`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/05-native-smoke-assertions.json`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/06-validate-codex-plugin.txt`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/07-json-syntax-checks.txt`
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
</read_first>
<action>
Create `.planning/phases/01-native-marketplace-discovery-contract/evidence/08-phase-1-handoff.md`. Include the exact installed identity `sealos@sealos`, the isolated `HOME` and `CODEX_HOME` smoke policy, the evidence file list, the validator commands run, any metadata files changed, the root `plugin.json` discovery rule, and the downstream Phase 2 note that README promotion can use the proven native install path.
</action>
<acceptance_criteria>
- `08-phase-1-handoff.md` exists.
- `08-phase-1-handoff.md` contains `sealos@sealos`.
- `08-phase-1-handoff.md` contains `isolated HOME and CODEX_HOME`.
- `08-phase-1-handoff.md` contains `python3 scripts/validate-codex-plugin.py`.
- `08-phase-1-handoff.md` contains `root plugin.json`.
- `08-phase-1-handoff.md` contains `.planning/phases/01-native-marketplace-discovery-contract/evidence/03-plugin-list-available.json`.
- `08-phase-1-handoff.md` contains `.planning/phases/01-native-marketplace-discovery-contract/evidence/04-plugin-add.json`.
- `git diff -- skills` is empty.
</acceptance_criteria>
</task>
</tasks>

<verification>
- `python3 scripts/validate-codex-plugin.py`
- `python3 -m json.tool plugin.json >/dev/null`
- `python3 -m json.tool .codex-plugin/plugin.json >/dev/null`
- `python3 -m json.tool .agents/plugins/marketplace.json >/dev/null`
- `python3 -m json.tool marketplace.json >/dev/null`
- `python3 -m json.tool .claude-plugin/marketplace.json >/dev/null`
- `python3 -m json.tool distribution/platforms.json >/dev/null`
- `python3 -m json.tool .planning/phases/01-native-marketplace-discovery-contract/evidence/05-native-smoke-assertions.json >/dev/null`
- `git diff -- skills --exit-code`
</verification>

<success_criteria>
- All Phase 1 requirements `DISC-01`, `DISC-02`, `DISC-03`, and `META-03` are covered by plan evidence and validation gates.
- The handoff gives Phase 2 the verified Codex-native install identity.
- Runtime skill behavior remains untouched.
</success_criteria>
