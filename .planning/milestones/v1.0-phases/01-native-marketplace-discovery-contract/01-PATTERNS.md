# Phase 1 Pattern Map: Native Marketplace Discovery Contract

**Mapped:** 2026-06-15
**Phase:** 01 - Native Marketplace Discovery Contract
**Status:** Complete

## Files and Roles

| File | Role | Existing Pattern |
|------|------|------------------|
| `.codex-plugin/plugin.json` | Codex plugin manifest | Two-space JSON, `name: sealos`, `skills: ./skills/`, display metadata under `interface` |
| `plugin.json` | Codex native marketplace plugin root manifest | Must sit directly under the marketplace plugin `source.path` root and mirror `.codex-plugin/plugin.json` key fields |
| `.agents/plugins/marketplace.json` | Repo-local Codex marketplace fixture | Two-space JSON, top-level `name: sealos`, one plugin entry with local source `./` and install policy |
| `marketplace.json` | Root marketplace metadata | Two-space JSON, one plugin entry named `sealos`, root source `./`, `commands: ./commands/`, explicit root skill paths |
| `.claude-plugin/marketplace.json` | Claude-compatible marketplace mirror | Same shape as root `marketplace.json` |
| `distribution/platforms.json` | Support claim registry | Two-space JSON, platform entries with `install`, `invoke`, `commands`, `evidence`, `lastVerified` |
| `scripts/validate-codex-plugin.py` | Codex distribution validator | Python CLI with `load_json`, `require`, and exact path/name assertions |
| `marketplaces/README.md` | Maintainer rules | Markdown list of owned manifests and validation rule reminders |
| `.planning/phases/01-native-marketplace-discovery-contract/evidence/*` | Execution evidence | Phase-local generated command outputs for later review |

## Concrete Existing Patterns

### Codex native plugin root lookup

Codex 0.139.0 discovers installable plugins by resolving each marketplace plugin `source.path`, then reading `plugin.json` directly from that resolved plugin root. A plugin manifest nested at `.codex-plugin/plugin.json` is useful to repository tooling, while Codex native marketplace discovery requires a direct `plugin.json` at the source root.

For this repository, the intended source root is `./`, so Phase 1 should create or maintain:

```text
plugin.json                    # direct Codex native plugin root manifest
.codex-plugin/plugin.json       # existing Codex plugin metadata surface
skills/                         # canonical skill source referenced by both manifests
```

Both manifest files should keep the same `name`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`, `skills`, and `interface` values.

### Local Codex marketplace entry

` .agents/plugins/marketplace.json` uses this installability contract:

```json
{
  "name": "sealos",
  "plugins": [
    {
      "name": "sealos",
      "source": {
        "source": "local",
        "path": "./"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Coding"
    }
  ]
}
```

The executor should preserve the one-plugin structure and root source unless smoke output proves Codex native discovery needs a specific metadata addition.

### Root marketplace entry

`marketplace.json` and `.claude-plugin/marketplace.json` mirror the same one-plugin model:

```json
{
  "name": "sealos",
  "plugins": [
    {
      "name": "sealos",
      "source": "./",
      "commands": "./commands/",
      "skills": [
        "./skills/sealos-deploy",
        "./skills/sealos-database",
        "./skills/sealos-s3",
        "./skills/sealos-app-builder",
        "./skills/cloud-native-readiness",
        "./skills/dockerfile-skill",
        "./skills/docker-to-sealos"
      ]
    }
  ]
}
```

The executor should keep all skill references under root `./skills/...`.

### Validator style

`scripts/validate-codex-plugin.py` uses direct JSON reads and exact assertions:

```python
require(plugin.get("name") == "sealos", "Codex plugin name is sealos")
require(plugin.get("skills") == "./skills/", "Codex plugin points to root skills directory")
require(entry.get("source", {}).get("path") == "./", "Codex marketplace points at repo root")
```

Execution tasks should use the same style for any small assertion helper: exact names, exact paths, and explicit failure messages. Phase 1 should add direct parity checks between `plugin.json` and `.codex-plugin/plugin.json`.

## Data Flow

```text
Codex marketplace source ($PWD)
  -> Codex reads marketplace metadata
  -> plugin source path ./ contains plugin.json
  -> available plugin list exposes sealos@sealos
  -> plugin add installs .codex-plugin/plugin.json
  -> plugin loads root ./skills/
```

Phase 1 evidence should prove the first three arrows. Runtime skill behavior begins after install and remains outside this phase.

## Landmines

- `.agents/plugins/marketplace.json` may be hidden by ignore rules in some checkouts, so execution handoff should include git status checks when this file changes.
- `distribution/platforms.json` currently records the older compatibility install command; Phase 1 should record discovery truth in evidence and leave broader support-claim rewrite for Phase 2 unless install smoke requires an immediate metadata correction.
- Root `plugin.json` and `.codex-plugin/plugin.json` create two manifest surfaces. The Phase 1 validator must keep key fields synchronized.
- JSON evidence from Codex CLI may use envelope fields, so assertions should recursively inspect objects and arrays.

## PATTERN MAPPING COMPLETE
