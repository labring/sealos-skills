# Sealos Codex Plugin Installation Upgrade

## What This Is

Sealos Skills is a plugin-first skill pack for deploying projects, connecting Sealos Cloud services, and building Sealos Desktop apps from AI agent workflows. This project improves the Codex plugin installation experience by using `phuryn/pm-skills` as the reference for native Codex marketplace installation copy, then aligning the README and required plugin metadata so Codex users can install and invoke Sealos with fewer decisions.

The work is for developers using Codex CLI or Codex App who want Sealos deployment, database, S3, canvas, and app-builder skills available as a managed plugin.

## Core Value

Codex users can discover, install, and invoke the Sealos plugin through the most native Codex plugin flow, with README instructions and plugin metadata that match the actual repository layout.

## Requirements

### Validated

- ✓ The repository is already a Sealos Skills and Codex plugin package with root `skills/**` as the only skill source — existing
- ✓ `.codex-plugin/plugin.json` points Codex to `./skills/` and defines the `sealos` plugin identity — existing
- ✓ `.agents/plugins/marketplace.json` supports local Codex marketplace testing — existing
- ✓ `scripts/validate-codex-plugin.py` validates the Codex manifest, local marketplace entry, platform registry, and asset paths — existing
- ✓ The README already documents Sealos deploy, database, S3, canvas, app-builder, and multi-host distribution concepts — existing

### Active

- [ ] Make Codex native marketplace installation the primary Codex install path in `README.md`, following the reference shape from `phuryn/pm-skills`.
- [ ] Keep `npx plugins add ... --target codex` as a compatible or local install path with clear positioning.
- [ ] Align Codex install copy with the actual Sealos plugin name, marketplace name, invocation surface, and Codex App selection flow.
- [ ] Verify `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `distribution/platforms.json`, and README examples agree after the copy changes.
- [ ] Run the Codex plugin validator and JSON syntax checks after changing distribution-facing files.

### Out of Scope

- Reworking the deploy, database, S3, canvas, or app-builder skill workflows — this milestone targets install/distribution experience.
- Creating a second packaged copy of `skills/**` — root `skills/**` remains the only skill source.
- Redesigning all non-Codex distribution flows — Claude, Gemini, Qwen, CodeBuddy, OpenClaw, and skills.sh paths stay consistent unless touched by Codex wording.
- Adding new runtime capabilities to Codex plugins — this milestone documents and validates current plugin support.

## Context

The current README recommends `npx plugins add https://github.com/labring/sealos-skills --target codex` as the main Codex install path. The reference project `phuryn/pm-skills` presents Codex installation through native marketplace commands:

```bash
codex plugin marketplace add phuryn/pm-skills
codex plugin add pm-toolkit@pm-skills
```

For Sealos, the comparable target is a single plugin install from the Sealos marketplace rather than many plugin installs. The README should teach the expected Codex path first, then keep `npx plugins` as a fallback or compatibility path. Existing codebase mapping identifies distribution metadata duplication as a fragile area, so any README change must be checked against manifests and validators.

Relevant current files:

- `README.md` — primary install and usage documentation
- `.codex-plugin/plugin.json` — Codex plugin manifest
- `.agents/plugins/marketplace.json` — local Codex marketplace entry
- `distribution/platforms.json` — platform support and evidence registry
- `scripts/validate-codex-plugin.py` — Codex manifest validator
- `marketplaces/README.md` — marketplace rules and support-claim ownership
- `skills/**/SKILL.md` — canonical skill source

## Constraints

- **Single skill source**: Root `skills/**` stays canonical for Codex, skills.sh, and every host manifest — prevents drift across packaged copies.
- **Codex accuracy**: README commands must match actual Codex plugin naming and repository marketplace behavior — users should be able to follow commands directly.
- **Support claims**: Codex plugin documentation must reflect current command and skill exposure semantics — prevents overclaiming unsupported slash-command behavior.
- **Validation**: Distribution-facing changes must pass `python3 scripts/validate-codex-plugin.py` and JSON syntax checks — keeps manifest and registry drift visible.
- **Scope**: The milestone optimizes install and README experience — deploy/runtime skill behavior stays stable.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use `phuryn/pm-skills` as the install-copy reference | It shows Codex native marketplace setup and plain-language Codex differences clearly | — Pending |
| Prioritize Codex marketplace commands for Codex users | Codex users should see Codex-native commands before cross-host installer syntax | — Pending |
| Keep `npx plugins add` documented as a compatibility/local path | The repo already supports it and it remains useful for local testing | — Pending |
| Keep root `skills/**` as the only skill source | Existing architecture depends on one canonical skill tree across hosts | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-15 after initialization*
