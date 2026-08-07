# Phase 2 Research: README and Metadata Alignment

**Researched:** 2026-06-15  
**Confidence:** High  
**Scope:** README Codex install copy and Codex platform metadata only.

## Inputs

- Phase 2 context locks the native Codex install path as the primary story.
- Phase 1 verification and UAT passed with native marketplace add, available list, native plugin add, installed payload checks, and `git diff -- skills --exit-code`.
- Phase 1 handoff locks the final native contract:
  - `codex plugin marketplace add labring/sealos-skills`
  - `codex plugin add sealos@sealos`
  - `.agents/plugins/marketplace.json` uses `source.path: "./plugins/sealos"`
  - `plugins/sealos -> ..`
  - root `skills/**` remains the canonical skill source.

## Current Gaps

1. `README.md` opens by recommending `npx plugins`, so the Codex path remains compatibility-first.
2. `README.md` Codex Quick Start does not include the verified native command pair.
3. `README.md` lists installed skills later, but the Codex install story does not state that one plugin installs deploy, database, S3, canvas, app-builder, and supporting cloud-native skills.
4. Codex `$sealos` examples and Claude `/sealos` examples are adjacent in the plugin examples block, creating invocation-surface ambiguity.
5. The Codex row in the supported-tools table still uses `npx plugins add ... --target codex` as the install command.
6. `distribution/platforms.json` Codex entry still records the old `npx plugins` install path, old evidence text, and `lastVerified: "2026-05-21"`.
7. `.codex-plugin/plugin.json`, root `plugin.json`, and `.agents/plugins/marketplace.json` already align on identity, display label, asset paths, and `skills: "./skills/"`; Phase 2 does not need manifest edits unless README or registry wording exposes a direct identity conflict.

## Exact Target State

### README.md

- Intro names native Codex plugin installation as the recommended Codex path while preserving cross-host plugin and `skills.sh` compatibility.
- Codex Quick Start leads with:
  - `codex plugin marketplace add labring/sealos-skills`
  - `codex plugin add sealos@sealos`
- The compatibility/local Codex path remains visible with:
  - `npx plugins add https://github.com/labring/sealos-skills --target codex`
- The Codex install section states that one Sealos plugin installs:
  - `sealos-deploy`
  - `sealos-database`
  - `sealos-s3`
  - `sealos-canvas`
  - `sealos-app-builder`
  - `cloud-native-readiness`
  - `dockerfile-skill`
  - `docker-to-sealos`
- Codex examples use `$sealos`.
- Codex App guidance and `assets/codex-sealos.png` stay close to Codex install and invocation guidance.
- Claude `/sealos` examples stay in Claude-specific copy.
- Direct `/sealos-deploy`, `/sealos-database`, `/sealos-s3`, and `/sealos-canvas` examples stay in the `skills.sh` section.

### distribution/platforms.json

- Top-level `lastUpdated` becomes `2026-06-15`.
- The Codex platform entry keeps:
  - `id: "codex"`
  - `name: "Codex CLI / Codex App"`
  - `claim: "verified"`
  - `runtime: "plugin"`
  - `commands: "supported"`
- The Codex `install` field records the native command pair in existing string-field style:
  - `codex plugin marketplace add labring/sealos-skills && codex plugin add sealos@sealos`
- The Codex entry adds or updates `alternateInstall` with:
  - `npx plugins add https://github.com/labring/sealos-skills --target codex`
- The Codex `invoke` field names `$sealos` for Codex CLI and selecting `Sealos` from Plugins in Codex App.
- The Codex `evidence` field references Phase 1 native marketplace add/list/install, installed payload assertions, and retains `codex_manifest+repo_marketplace` for the existing validator.
- The Codex `lastVerified` field becomes `2026-06-15`.
- Other platform entries remain unchanged unless JSON formatting requires mechanical preservation.

## Validation Commands

Implementation should run:

- `python3 scripts/validate-codex-plugin.py`
- `python3 -m json.tool distribution/platforms.json >/dev/null`
- JSON checks for touched manifests if `.codex-plugin/plugin.json`, `plugin.json`, or `.agents/plugins/marketplace.json` change.
- `rg` checks for native commands and compatibility command in both README and platform registry.
- `git diff -- skills --exit-code`

## Source Audit

| Source | ID | Requirement or Decision | Plan | Status | Notes |
|---|---|---|---|---|
| GOAL | Phase 2 | Codex users see README and metadata contract for native install, compatibility path, capabilities, and invocation surface. | 02-01, 02-02 | COVERED | README delivers user-facing contract; platform registry records metadata contract. |
| REQ | DOCS-01 | Codex Quick Start leads with `codex plugin marketplace add labring/sealos-skills`. | 02-01 | COVERED | README task makes native marketplace add first. |
| REQ | DOCS-02 | Codex Quick Start installs with `codex plugin add sealos@sealos`. | 02-01 | COVERED | README task places command after marketplace add. |
| REQ | DOCS-03 | README explains one plugin installs deploy, database, S3, canvas, app-builder, and supporting cloud-native skills. | 02-01 | COVERED | README task connects capability contract to Codex install. |
| REQ | DOCS-04 | README keeps `npx plugins add https://github.com/labring/sealos-skills --target codex` as compatibility/local path. | 02-01 | COVERED | README task keeps exact command under compatibility/local Codex copy. |
| REQ | DOCS-05 | README uses Codex-specific invocation and keeps `/sealos` examples in Claude sections. | 02-01 | COVERED | README task separates `$sealos`, `/sealos`, and direct `skills.sh` entries. |
| REQ | DOCS-06 | README keeps Codex App selection guidance and screenshot close to Codex install path. | 02-01 | COVERED | README task keeps screenshot near Codex guidance. |
| REQ | META-01 | Codex-facing metadata uses repo `labring/sealos-skills`, marketplace `sealos`, plugin `sealos`, label `Sealos`. | 02-01, 02-02 | COVERED | README and registry checks assert identity. |
| REQ | META-02 | `.codex-plugin/plugin.json` remains aligned with README identity, display copy, assets, and root `./skills/`. | 02-02 | COVERED | Plan verifies manifest parity and validator pass. |
| REQ | META-04 | `distribution/platforms.json` records native install path, compatibility path, invocation, evidence, and date. | 02-02 | COVERED | Registry task updates Codex entry. |
| RESEARCH | R-01 | README currently leads with `npx plugins` and lacks native commands. | 02-01 | COVERED | Quick Start rewrite. |
| RESEARCH | R-02 | README capability contract is separated from install story. | 02-01 | COVERED | Capability paragraph in Codex section. |
| RESEARCH | R-03 | README currently interleaves Codex and Claude examples. | 02-01 | COVERED | Invocation separation task. |
| RESEARCH | R-04 | Platform registry Codex entry is stale. | 02-02 | COVERED | Registry update task. |
| RESEARCH | R-05 | Existing validator expects `codex_manifest+repo_marketplace` evidence token. | 02-02 | COVERED | Registry action preserves token while adding Phase 1 evidence. |
| CONTEXT | D-01 | Native Codex marketplace installation is primary. | 02-01 | COVERED | README Quick Start priority. |
| CONTEXT | D-02 | Command order is fixed: marketplace add, then plugin add. | 02-01 | COVERED | README order check. |
| CONTEXT | D-03 | `npx plugins` is compatibility/local path. | 02-01, 02-02 | COVERED | README and registry alternate install. |
| CONTEXT | D-04 | README intro aligns with native priority and cross-host compatibility. | 02-01 | COVERED | README intro rewrite. |
| CONTEXT | D-05 | README states one plugin installs all Sealos capabilities. | 02-01 | COVERED | Capability copy. |
| CONTEXT | D-06 | Capability wording maps to existing root skill source. | 02-01 | COVERED | Exact skill list. |
| CONTEXT | D-07 | Root `skills/**` remains canonical. | 02-01, 02-02 | COVERED | Scope and `git diff -- skills` gate. |
| CONTEXT | D-08 | Codex examples use `$sealos` and Codex App selection guidance. | 02-01 | COVERED | Codex examples and screenshot placement. |
| CONTEXT | D-09 | Claude `/sealos` examples remain in Claude sections. | 02-01 | COVERED | Invocation separation. |
| CONTEXT | D-10 | Direct `/sealos-*` examples remain in `skills.sh` section. | 02-01 | COVERED | Direct skill section preserved. |
| CONTEXT | D-11 | Codex App guidance and screenshot stay close to Codex install and invocation. | 02-01 | COVERED | Screenshot proximity check. |
| CONTEXT | D-12 | Platform registry records native install primary and `npx plugins` alternate. | 02-02 | COVERED | Codex entry update. |
| CONTEXT | D-13 | Platform evidence points to Phase 1 native marketplace evidence. | 02-02 | COVERED | Evidence field update. |
| CONTEXT | D-14 | Codex identity fields remain aligned. | 02-01, 02-02 | COVERED | README/registry/manifest checks. |
| CONTEXT | D-15 | `.agents/plugins/marketplace.json` truth stays `source.path: "./plugins/sealos"`. | 02-02 | COVERED | Validator and optional JSON check. |
| CONTEXT | D-16 | `.codex-plugin/plugin.json` keeps `skills: "./skills/"`; copy changes only if directly needed. | 02-02 | COVERED | Validator and parity checks. |
| CONTEXT | D-17 | Runtime `skills/**` edits stay outside Phase 2. | 02-01, 02-02 | COVERED | `git diff -- skills --exit-code`. |
| CONTEXT | D-18 | Preserve non-Codex metadata unless Codex wording creates direct inconsistency. | 02-01, 02-02 | COVERED | Plan limits edits to README and Codex registry. |
| CONTEXT | D-19 | Phase 3 owns validator hardening; Phase 2 leaves docs/metadata ready for validation. | 02-01, 02-02 | COVERED | Existing validator and grep checks only. |

No source items are missing.
