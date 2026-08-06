# Phase 2 Patterns: README and Metadata Alignment

**Mapped:** 2026-06-15

## Markdown Patterns

- `README.md` uses a short opening description, a `## Quick Start` section, third-level install subsections, fenced `bash` command blocks, fenced `text` example blocks, and a supported-tools table.
- Codex App guidance already references `assets/codex-sealos.png` with:
  - `![Select the Sealos plugin in Codex App](./assets/codex-sealos.png)`
- Capability inventory already lives under `## Included Skills`; Phase 2 should connect that inventory to the Codex install story and preserve the skill names.
- `marketplaces/README.md` establishes command-surface rules:
  - Codex plugin examples use `$sealos`.
  - Claude Code-compatible examples use `/sealos`.
  - Direct `/sealos-deploy` examples live in direct `skills.sh` sections.

## JSON Patterns

- Repository JSON files use two-space formatting.
- `distribution/platforms.json` stores platform support as objects in a top-level `platforms` array.
- Platform entries use string fields such as `install`, `alternateInstall`, `invoke`, `commands`, `evidence`, and `lastVerified`.
- Existing `alternateInstall` appears in the Claude Code entry, so adding `alternateInstall` to Codex follows the current registry shape.
- `.codex-plugin/plugin.json` and root `plugin.json` currently match on key fields and keep `skills: "./skills/"`.
- `.agents/plugins/marketplace.json` currently locks the native marketplace source at `./plugins/sealos`.

## Validation Patterns

- Repository-level Codex validation uses:
  - `python3 scripts/validate-codex-plugin.py`
- JSON syntax validation uses:
  - `python3 -m json.tool <file> >/dev/null`
- Current validator checks that the Codex platform evidence string contains `codex_manifest+repo_marketplace`; preserve that token while adding Phase 1 native evidence wording.
- Runtime skill preservation is verified with:
  - `git diff -- skills --exit-code`
- Text contract checks should use `rg` for exact commands in README and registry files.

## Phase 2 Planning Pattern

- Keep implementation split into two sequential plans:
  - Plan 01 owns `README.md`.
  - Plan 02 owns `distribution/platforms.json` and final metadata verification.
- Use Phase 1 evidence as the authority for native command copy.
- Keep `.codex-plugin/plugin.json`, root `plugin.json`, and `.agents/plugins/marketplace.json` as verification inputs. Edit them only when execution finds a direct identity/display conflict with the final README or registry wording.
- Keep all runtime files under `skills/**` untouched.
