# Phase 1 Research: Native Marketplace Discovery Contract

**Researched:** 2026-06-15
**Phase:** 01 - Native Marketplace Discovery Contract
**Status:** Complete

## Research Question

What does the executor need to know to plan a verified Codex-native marketplace discovery contract for `sealos@sealos`?

## Findings

### Marketplace Identity

The phase has one install identity with four stable labels:

| Layer | Value | Source |
|-------|-------|--------|
| Repository source | `labring/sealos-skills` | `.planning/PROJECT.md`, `.codex-plugin/plugin.json` |
| Marketplace id | `sealos` | `.agents/plugins/marketplace.json`, `marketplace.json`, `.claude-plugin/marketplace.json` |
| Plugin id | `sealos` | `.codex-plugin/plugin.json`, marketplace plugin entries |
| Codex App display label | `Sealos` | `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json` |

The execution plan should treat `sealos@sealos` as the install selector and keep root `skills/**` as the single skill source.

### Existing Metadata Shape

- `.codex-plugin/plugin.json` already declares plugin name `sealos`, display name `Sealos`, capabilities `Interactive`, `Read`, `Write`, logo paths, and `skills: ./skills/`.
- `.agents/plugins/marketplace.json` already declares a repo-local Codex marketplace named `sealos` with one plugin named `sealos`, local source `./`, installation policy `AVAILABLE`, authentication policy `ON_INSTALL`, and category `Coding`.
- `marketplace.json` and `.claude-plugin/marketplace.json` already expose one installable plugin named `sealos` from repository root with command and skill paths under root `commands/` and `skills/`.
- `distribution/platforms.json` currently records the older `npx plugins add ... --target codex` path as the Codex install claim; broader registry alignment belongs to Phase 2 and Phase 3 unless Phase 1 smoke proves a blocking metadata gap.

### Discovery Gap Hypothesis

Prior project research recorded that adding the marketplace did not list `sealos@sealos` before this milestone. The user supplied a current isolated smoke precheck from this worktree:

- `codex plugin marketplace add "$PWD" --json` succeeds and returns `marketplaceName: "sealos"` with `installedRoot` set to the current repository.
- `codex plugin marketplace list --json` succeeds and shows the `sealos` local marketplace root.
- `codex plugin list --available --json` returns `{ "installed": [], "available": [] }`.
- `codex plugin add sealos@sealos --json` fails with `Error: plugin `sealos` was not found in marketplace `sealos``.

The concrete Phase 1 failure is marketplace registration succeeds while available plugin discovery does not expose `sealos@sealos`.

### Codex 0.139.0 Black-Box Discovery Rule

User-supplied black-box experiments found the native marketplace discovery rule for Codex 0.139.0:

- `.agents/plugins/marketplace.json` can be read as the marketplace manifest.
- Each plugin entry `source.path` must point to a plugin root directory that directly contains `plugin.json`.
- With `source.path: "./"` and plugin manifest at `./.codex-plugin/plugin.json`, marketplace add succeeds, available list is empty, and install cannot find the plugin.
- With `source.path: "./.codex-plugin"`, available list can expose the plugin because that directory contains `plugin.json`, while install risks path-context failure because root `skills/**` lives outside that plugin root.
- With `source.path: "./plugin"` and both `./plugin/plugin.json` and `./plugin/skills/...` present, available list and install succeed.

The repo constraint keeps root `skills/**` as the only skill source. The minimum viable repair direction for execution is:

1. Expose a root-level `plugin.json` that Codex CLI can read directly from `source.path: "./"`.
2. Keep `.agents/plugins/marketplace.json` plugin `source.path` at `./`.
3. Keep `plugin.json` content aligned with `.codex-plugin/plugin.json`, including identity, interface fields, asset paths, and `skills: "./skills/"`.
4. Update `scripts/validate-codex-plugin.py` in Phase 1 to assert root `plugin.json` and `.codex-plugin/plugin.json` stay synchronized for key fields.

This repair keeps one root skill source and creates a second manifest surface, rather than a second skill copy.

### Required Smoke Contract

Every smoke command must use isolated `HOME` and `CODEX_HOME` values:

```bash
PHASE_DIR=".planning/phases/01-native-marketplace-discovery-contract"
EVIDENCE_DIR="$PHASE_DIR/evidence"
SMOKE_HOME="$(mktemp -d)"
SMOKE_CODEX_HOME="$SMOKE_HOME/.codex"
mkdir -p "$EVIDENCE_DIR"
```

Required sequence:

1. `codex --version`
2. `HOME="$SMOKE_HOME" CODEX_HOME="$SMOKE_CODEX_HOME" codex plugin marketplace add "$PWD" --json`
3. `HOME="$SMOKE_HOME" CODEX_HOME="$SMOKE_CODEX_HOME" codex plugin marketplace list --json`
4. `HOME="$SMOKE_HOME" CODEX_HOME="$SMOKE_CODEX_HOME" codex plugin list --available --json`
5. `HOME="$SMOKE_HOME" CODEX_HOME="$SMOKE_CODEX_HOME" codex plugin add sealos@sealos --json`

The available-list evidence must prove `sealos@sealos` appears before install is accepted as complete. The install evidence must prove plugin `sealos` was installed from marketplace `sealos`.

### Assertion Strategy

Use a compact JSON assertion helper during execution because Codex CLI output may evolve around envelope fields. The helper should parse evidence files as JSON and search recursively for:

- `sealos@sealos`, or equivalent fields with plugin name `sealos` and marketplace/source name `sealos`, in `03-plugin-list-available.json`.
- plugin name `sealos`, marketplace/source name `sealos`, and a successful installed/added status in `04-plugin-add.json`.

The assertion helper can be created under the phase evidence directory or run as a checked-in one-off execution artifact only if the executor decides it is worth preserving. The plan should require the assertion output to be saved as evidence.

### Validation Strategy

Phase 1 verification should run:

```bash
python3 scripts/validate-codex-plugin.py
python3 -m json.tool plugin.json >/dev/null
python3 -m json.tool .codex-plugin/plugin.json >/dev/null
python3 -m json.tool .agents/plugins/marketplace.json >/dev/null
python3 -m json.tool marketplace.json >/dev/null
python3 -m json.tool .claude-plugin/marketplace.json >/dev/null
python3 -m json.tool distribution/platforms.json >/dev/null
```

The validator currently checks the Codex manifest, local Codex marketplace metadata, the Codex platform registry entry, asset paths, and root `skills/` existence. Phase 1 should extend it to compare root `plugin.json` with `.codex-plugin/plugin.json` for key identity, `skills`, and `interface` fields. README-aware validation belongs to Phase 3.

### Scope Guardrails

- Runtime behavior for deploy, database, S3, canvas, app-builder, Dockerfile generation, Docker-to-Sealos conversion, and cloud-native readiness stays stable.
- Phase 1 may update metadata files only when smoke evidence proves the smallest discovery gap.
- README promotion of native install commands belongs to Phase 2.
- Registry claim and validator hardening belong to later phases unless they directly block `sealos@sealos` discovery.

## Planning Implications

The phase should be planned as three waves:

| Wave | Purpose | Dependency |
|------|---------|------------|
| 1 | Reproduce discovery and patch the minimal metadata-only gap if needed | none |
| 2 | Run isolated Codex marketplace add/list/list-available/install smoke and JSON evidence assertions | Wave 1 |
| 3 | Run repo validators, JSON syntax checks, evidence review, and handoff | Wave 2 |

## RESEARCH COMPLETE
