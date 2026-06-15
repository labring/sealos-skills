# Phase 3: Validator Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 3-Validator Hardening
**Areas discussed:** Original need, validator coverage boundary, identity source of truth, JSON syntax strategy, scope control

---

## Original Need

| Option | Description | Selected |
|--------|-------------|----------|
| Executable drift gate | Make maintainer validation fail when README, manifest, marketplace, registry, fallback install, or JSON syntax drift from Phase 2 truth. | yes |
| Fresh install smoke | Re-run native and compatibility installs as this phase's main outcome. | |
| Documentation audit | Keep validation as manual README and metadata review. | |

**User's choice:** Execute Phase 3 discussion for validator hardening with VAL-01 through VAL-04.
**Notes:** The success criterion is a durable maintainer command that catches drift. Phase 4 owns fresh install smoke evidence.

---

## Validator Coverage Boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Harden existing Codex validator | Extend `scripts/validate-codex-plugin.py` to check README commands, fallback install, identity parity, and JSON syntax. | yes |
| Add broad distribution validator | Cover every non-Codex host and command route in the same phase. | |
| Keep one-off assertions | Leave README and registry checks in verification docs. | |

**User's choice:** Recommended simplest viable scope selected through the current phase request.
**Notes:** The existing validator already owns Codex manifest, marketplace, platform registry, symlink, and payload checks, so extending it fits the current repository pattern.

---

## Identity Source of Truth

| Option | Description | Selected |
|--------|-------------|----------|
| Canonical Phase 1/2 values | Use locked values: repo `labring/sealos-skills`, URL `https://github.com/labring/sealos-skills`, marketplace `sealos`, plugin `sealos`, selector `sealos@sealos`, label `Sealos`, skills `./skills/`. | yes |
| Derive identity from README | Treat README strings as the source and compare metadata to the current prose. | |
| Manifest-only identity | Compare only `.codex-plugin/plugin.json` and root `plugin.json`. | |

**User's choice:** Canonical values from prior phase decisions.
**Notes:** Phase 1 proved native install identity; Phase 2 aligned README and platform registry to that identity.

---

## JSON Syntax Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Validator parses relevant JSON | Ensure the maintainer validator loads every relevant plugin, marketplace, and platform registry JSON file. | yes |
| External json.tool only | Keep JSON syntax checks outside the validator command. | |
| Current parser coverage | Keep the current four-file parser coverage. | |

**User's choice:** Validator parses the relevant Phase 3 JSON set.
**Notes:** Explicit `python3 -m json.tool` checks remain useful verification evidence for touched JSON files, even when the validator already parses them.

---

## Scope Control

| Option | Description | Selected |
|--------|-------------|----------|
| Codex-focused validator hardening | Cover VAL-01 through VAL-04 and leave runtime skills unchanged. | yes |
| Bundle Phase 4 install smoke | Add install smoke evidence capture to Phase 3. | |
| Broaden to all host manifests | Cover Claude, CodeBuddy, Gemini, Qwen, OpenClaw, and full command-route parity now. | |

**User's choice:** Codex-focused validator hardening.
**Notes:** Runtime skill files stay stable. Non-Codex distribution-wide validation remains v2 scope.

---

## the agent's Discretion

- The planner may decide exact helper names and constant layout inside `scripts/validate-codex-plugin.py`.
- The executor may keep explicit `json.tool` verification commands even if validator JSON parsing covers the same files.

## Deferred Ideas

- Phase 4 install smoke and handoff evidence.
- v2 distribution-wide validator.
- v2 CI or documented top-level validation command.
