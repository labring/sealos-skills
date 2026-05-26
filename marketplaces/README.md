# Marketplace and Extension Manifests

This directory documents the Sealos skill pack distribution surfaces.

## Owned manifest files

- `.codex-plugin/plugin.json` — Codex plugin manifest; points directly to root `skills/`.
- `.agents/plugins/marketplace.json` — local Codex marketplace entry.
- `.claude-plugin/plugin.json` — Claude Code-compatible plugin manifest.
- `marketplace.json` — root marketplace bundle entry for Claude-compatible hosts.
- `.claude-plugin/marketplace.json` — Claude marketplace mirror of the root marketplace entry.
- `.codebuddy-plugin/marketplace.json` — CodeBuddy marketplace entry.
- `gemini-extension.json` — Gemini CLI extension manifest using `CLAUDE.md` as context.
- `qwen-extension.json` — Qwen Code extension manifest using `CLAUDE.md` as context.
- `openclaw.plugin.json` — OpenClaw / ClawHub-style bundle pointer.
- `distribution/platforms.json` — platform support registry.
- `commands/sealos.md` — plugin slash-command entry for hosts that support command directories.

## Support claims

`distribution/platforms.json` is the source of truth for host support claims:

- `verified` means this repository has a current validation command or host smoke test.
- `install-target` means a manifest is present for the host, but live host execution may still be environment-dependent.
- `context-only` means the host can ingest the repository context and skills, but slash-command exposure is not claimed.

## Maintenance rules

- Keep all manifest versions in sync with `.codex-plugin/plugin.json`.
- Keep all `skills` arrays pointed at root `./skills/...` paths.
- Do not copy skill directories into host-specific package folders.
- Keep plugin examples as `$sealos` for Codex and `/sealos` for Claude Code-compatible hosts.
- Keep `/sealos-deploy` examples only in direct `skills.sh` usage sections.

## Codex validation

- Run `python3 scripts/validate-codex-plugin.py` when Codex manifest, repo marketplace, or platform registry metadata changes.
