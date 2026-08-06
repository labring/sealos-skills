# Phase 2: README and Metadata Alignment - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 2-README and Metadata Alignment
**Areas discussed:** Codex install priority, compatibility path, capability copy, invocation separation, metadata evidence, implementation scope

---

## Codex Install Priority

| Option | Description | Selected |
|--------|-------------|----------|
| Native marketplace first | Lead Codex Quick Start with `codex plugin marketplace add labring/sealos-skills`, followed by `codex plugin add sealos@sealos`. | ✓ |
| Compatibility installer first | Keep `npx plugins add ... --target codex` as the first Codex command. | |
| Mixed one-line install story | Present native and compatibility commands together without hierarchy. | |

**User's choice:** Native marketplace first.
**Notes:** This choice is locked by Phase 2 success criteria and Phase 1 evidence. The user explicitly instructed that the native Codex marketplace install path is primary.

---

## Compatibility Path

| Option | Description | Selected |
|--------|-------------|----------|
| Keep as compatibility/local path | Preserve `npx plugins add https://github.com/labring/sealos-skills --target codex` for compatibility and local install usage. | ✓ |
| Remove from Codex docs | Drop `npx plugins` from Codex documentation. | |
| Keep as equal peer | Present native Codex and `npx plugins` paths with equal priority. | |

**User's choice:** Keep as compatibility/local path.
**Notes:** This satisfies DOCS-04 and preserves the existing cross-host installer story while making native Codex the primary path.

---

## Installed Capability Copy

| Option | Description | Selected |
|--------|-------------|----------|
| One plugin installs all Sealos capabilities | Say one Sealos plugin installs deploy, database, S3, canvas, app-builder, and supporting cloud-native skills. | ✓ |
| List only top-level deploy/database/S3 | Keep capability copy shorter and leave supporting skills implicit. | |
| Split capabilities by host | Describe different capability sets for Codex and other hosts. | |

**User's choice:** One plugin installs all Sealos capabilities.
**Notes:** The README already has an Included Skills section; Phase 2 should connect that inventory to the Codex install story.

---

## Invocation Separation

| Option | Description | Selected |
|--------|-------------|----------|
| Codex `$sealos`, Claude `/sealos`, skills.sh direct skill entries | Keep each invocation surface in its own appropriate section. | ✓ |
| Mix Codex and Claude examples in one plugin examples block | Keep current proximity of `$sealos` and `/sealos` examples. | |
| Prefer slash commands everywhere | Use `/sealos` style across plugin examples. | |

**User's choice:** Codex `$sealos`, Claude `/sealos`, skills.sh direct skill entries.
**Notes:** This follows the user's focus decisions and `marketplaces/README.md` maintenance rules.

---

## Metadata Evidence

| Option | Description | Selected |
|--------|-------------|----------|
| Align Codex platform registry with Phase 1 native evidence | Update `distribution/platforms.json` Codex install, alternate install, evidence, and verification date to match native marketplace truth. | ✓ |
| Leave platform registry unchanged | Let README carry the new story while metadata remains on `npx plugins`. | |
| Update every host registry entry | Refresh all platform support entries during Phase 2. | |

**User's choice:** Align Codex platform registry with Phase 1 native evidence.
**Notes:** Phase 2 scope includes `distribution/platforms.json` Codex support and evidence. Broad non-Codex refresh remains deferred.

---

## Implementation Scope

| Option | Description | Selected |
|--------|-------------|----------|
| README plus Codex platform metadata | Use the shortest path: README and `distribution/platforms.json`, with `.codex-plugin/plugin.json` copy changes only if needed. | ✓ |
| Edit all manifests for consistency | Touch Codex, Claude, CodeBuddy, OpenClaw, Gemini, Qwen, and root marketplace files. | |
| Include runtime skill updates | Adjust `skills/**` behavior or skill text during Phase 2. | |

**User's choice:** README plus Codex platform metadata.
**Notes:** The user explicitly instructed to avoid runtime `skills/**` edits unless a planning artifact proves necessity.

---

## the agent's Discretion

- The user authorized autonomous choices for normal interaction decisions.
- The agent resolved the discussion toward the shortest viable path that satisfies Phase 2 success criteria.
- The agent treated `.planning/STATE.md` Phase 1 `source.path: ./` text as superseded by the Phase 1 handoff and verification artifacts that lock `source.path: "./plugins/sealos"`.

## Deferred Ideas

- Phase 3 validator hardening for README commands, fallback command, identity parity, and JSON syntax.
- Phase 4 fresh native and compatibility install smoke evidence.
- v2 distribution-wide validator and non-Codex media refresh.
