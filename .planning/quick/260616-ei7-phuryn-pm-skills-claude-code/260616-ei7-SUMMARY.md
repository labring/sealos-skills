---
quick_id: 260616-ei7
slug: phuryn-pm-skills-claude-code
status: complete
completed_at: "2026-06-16"
implementation_commit: c9c7a6c
---

# Quick Summary: Claude Code Native Install Optimization

## Result

Claude Code install guidance now uses the native Claude Code marketplace CLI flow as the primary path:

```bash
claude plugin marketplace add labring/sealos-skills
claude plugin install sealos@sealos
```

The cross-host installer command remains documented as the compatibility path:

```bash
npx plugins add https://github.com/labring/sealos-skills --target claude-code
```

## Files Changed

- `README.md` — promotes the native Claude Code install block, keeps `/sealos` usage examples, moves Codex examples back under the Codex section, and documents Claude JSON validation commands.
- `distribution/platforms.json` — updates `claude-code.install`, `alternateInstall`, evidence, and `lastVerified`.
- `scripts/validate-codex-plugin.py` — adds README, platform registry, `.claude-plugin/plugin.json`, and `.claude-plugin/marketplace.json` checks for the Claude Code install contract.

## Verification

- PASS: `python3 scripts/validate-codex-plugin.py`
- PASS: `python3 -m json.tool distribution/platforms.json >/dev/null`
- PASS: `python3 -m json.tool marketplace.json >/dev/null`
- PASS: `python3 -m json.tool .claude-plugin/plugin.json >/dev/null`
- PASS: `python3 -m json.tool .claude-plugin/marketplace.json >/dev/null`
- PASS: README section order assertion for native Claude install before npx fallback
- PASS: platform registry assertion for Claude install, fallback, invoke, claim, and `lastVerified`
- PASS: `rg` confirms the native and fallback Claude Code commands are present in README, platform registry, and validator.

## Reference

Used the phuryn/pm-skills README as the install-flow reference for native Claude Code marketplace commands.
