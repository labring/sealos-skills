# Phase 1 Handoff: Native Marketplace Discovery Contract

## Verified Contract

- Installed identity: `sealos@sealos`
- Marketplace id: `sealos`
- Plugin id: `sealos`
- Display label: `Sealos`
- Native marketplace source path: `.agents/plugins/marketplace.json` uses `source.path: "./.codex-plugin"`
- Install-root manifest: `.codex-plugin/.codex-plugin/plugin.json`
- Install-root manifest skill path: `skills: "../skills/"`
- Install-root manifest logo paths: `../assets/logo.svg`
- Root discovery manifest: root plugin.json mirrors `.codex-plugin/plugin.json` and keeps `skills: "./skills/"`
- Main Codex manifest: `.codex-plugin/plugin.json` keeps `skills: "./skills/"`
- Canonical skill source: root `skills/**`

## Smoke Policy

Every native Codex smoke command in this phase used isolated HOME and CODEX_HOME values. This keeps marketplace registration, plugin cache, and install output separate from the developer's normal Codex environment.

## Evidence Files

- `.planning/phases/01-native-marketplace-discovery-contract/evidence/00-codex-version.txt`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/01-marketplace-add.json`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/02-marketplace-list.json`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/03-plugin-list-available.json`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/04-plugin-add.json`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/05-native-smoke-assertions.json`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/06-validate-codex-plugin.txt`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/07-json-syntax-checks.txt`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/08-phase-1-handoff.md`

## Validator Commands

```bash
python3 scripts/validate-codex-plugin.py
python3 -m json.tool plugin.json >/dev/null
python3 -m json.tool .codex-plugin/plugin.json >/dev/null
python3 -m json.tool .agents/plugins/marketplace.json >/dev/null
python3 -m json.tool marketplace.json >/dev/null
python3 -m json.tool .claude-plugin/marketplace.json >/dev/null
python3 -m json.tool distribution/platforms.json >/dev/null
python3 -m json.tool .planning/phases/01-native-marketplace-discovery-contract/evidence/05-native-smoke-assertions.json >/dev/null
git diff -- skills --exit-code
```

## Metadata Files Changed in Phase 1

- `plugin.json` - Root Codex discovery manifest. It mirrors `.codex-plugin/plugin.json` key fields and keeps `skills: "./skills/"`.
- `.agents/plugins/marketplace.json` - Native Codex marketplace entry. Final passing value is `source.path: "./.codex-plugin"`.
- `.codex-plugin/.codex-plugin/plugin.json` - Install-root manifest shim. It points back to root skills through `../skills/` and root logo assets through `../assets/logo.svg`.
- `scripts/validate-codex-plugin.py` - Validator now checks root manifest parity, install-root manifest parity, Codex marketplace source path, and referenced asset/skills paths.

## Phase 2 Note

Phase 2 can promote the proven native install path in README and metadata copy:

```bash
codex plugin marketplace add labring/sealos-skills
codex plugin add sealos@sealos
```

Codex usage copy should describe selecting the Sealos plugin or asking Codex to use Sealos. Claude-compatible `/sealos` examples belong in Claude-specific sections. Direct `/sealos-deploy`, `/sealos-database`, and `/sealos-s3` entries belong in direct `skills.sh` sections.
