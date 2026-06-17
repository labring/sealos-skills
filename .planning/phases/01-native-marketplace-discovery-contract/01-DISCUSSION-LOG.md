# Phase 1: Native Marketplace Discovery Contract - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md; this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 1-Native Marketplace Discovery Contract
**Areas discussed:** Marketplace identity, marketplace exposure surfaces, isolated smoke contract, verification evidence, invocation semantics
**Mode:** Auto decisions authorized by user request

---

## Marketplace Identity

| Option | Description | Selected |
|--------|-------------|----------|
| One-plugin identity: `sealos@sealos` | Treat repository source as `labring/sealos-skills`, marketplace id as `sealos`, plugin id as `sealos`, and display label as `Sealos`. | yes |
| Multi-plugin identity | Expose individual skills as separate installable plugins. | |
| Rename marketplace to repository slug | Use `sealos-skills` as the marketplace id while keeping plugin `sealos`. | |

**User's choice:** Auto-selected one-plugin identity under the user's authorized automatic decision strategy.
**Notes:** This matches current `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `marketplace.json`, and `.claude-plugin/marketplace.json` naming while adapting the `pm-skills` reference to Sealos' one-plugin architecture.

---

## Marketplace Exposure Surfaces

| Option | Description | Selected |
|--------|-------------|----------|
| Keep root plugin source and existing metadata surfaces | Use `.agents/plugins/marketplace.json`, `marketplace.json`, `.claude-plugin/marketplace.json`, and `.codex-plugin/plugin.json` as the discovery contract around root `skills/**`. | yes |
| Add a host-specific packaged copy | Create a second skill tree for Codex marketplace installation. | |
| Move runtime skill contents during discovery work | Change deploy/database/S3/canvas/app-builder behavior while fixing discovery. | |

**User's choice:** Auto-selected root plugin source and existing metadata surfaces.
**Notes:** Phase 1 is a marketplace discovery contract. Runtime skills remain stable scope, and root `skills/**` stays canonical.

---

## Isolated Smoke Contract

| Option | Description | Selected |
|--------|-------------|----------|
| Isolated `HOME` plus `CODEX_HOME` smoke | Run all Codex marketplace add/list/install commands against temporary local state and capture JSON evidence under the phase directory. | yes |
| User home smoke | Run commands against the user's live Codex config and plugin cache. | |
| Static JSON validation only | Validate metadata files without running Codex native marketplace commands. | |

**User's choice:** Auto-selected isolated `HOME` plus `CODEX_HOME` smoke.
**Notes:** This directly satisfies `DISC-01`, `DISC-02`, and `DISC-03` without relying on the user's existing local Codex state.

---

## Verification Evidence

| Option | Description | Selected |
|--------|-------------|----------|
| Store per-command evidence in `.planning/phases/01-native-marketplace-discovery-contract/evidence/` | Capture Codex version, marketplace add, marketplace list, available plugin list, plugin add, validator output, and JSON syntax checks. | yes |
| Keep transient terminal output only | Rely on shell output from a single run. | |
| Defer evidence naming to handoff | Let later phases choose artifact paths. | |

**User's choice:** Auto-selected per-command evidence under the Phase 1 directory.
**Notes:** Evidence paths are locked now so planner and executor can produce durable proof without inventing artifact locations.

---

## Invocation Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Codex-specific wording after install | Describe Codex usage as selecting Sealos or asking Codex to use Sealos; keep `/sealos` for Claude-compatible sections and direct skill commands for skills.sh sections. | yes |
| Slash-command wording in Codex sections | Present `/sealos` as the Codex post-install interface. | |
| Direct skill install wording in Codex sections | Present `/sealos-deploy`, `/sealos-database`, and `/sealos-s3` as Codex plugin entry commands. | |

**User's choice:** Auto-selected Codex-specific wording after install.
**Notes:** Phase 1 locks install identity and semantics for downstream docs; README edits are scheduled for Phase 2.

---

## Agent Discretion

- The planner can choose local worktree marketplace smoke for candidate state and remote `labring/sealos-skills` smoke for post-publication proof.
- The executor can implement compact JSON evidence assertions with shell, Node, or Python according to the smallest reliable path.
- The executor can patch marketplace metadata only where Codex smoke output identifies a concrete discovery gap.

## Deferred Ideas

- README native install promotion belongs to Phase 2.
- Validator checks for README command parity and invocation wording belong to Phase 3.
- Distribution-wide non-Codex parity validation remains a v2 follow-up.
