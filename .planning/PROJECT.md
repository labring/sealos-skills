# Sealos Skills

## What This Is

Sealos Skills is a plugin-first skills repository for deploying projects, connecting Sealos Cloud services, inspecting deployed resources, and building Sealos Desktop apps from AI agent workflows. It serves developers and maintainers across Codex, Claude Code-compatible hosts, Qoder, skills.sh, and other supported distribution surfaces from one canonical `skills/**` tree.

The current work establishes a consistent skill design system across all eight skills and their host adapters, using Ponytail's source-of-truth, focused-skill, progressive-disclosure, adapter, and behavioral-validation mechanisms as evidence-backed design references.

## Core Value

AI agents can reliably select and execute the right Sealos workflow with preserved safety, runtime truth, and host-consistent behavior.

## Current Milestone: v1.1 Skill Design System Optimization

**Goal:** Establish a consistent, concise, maintainable, and verifiable skill design system across all Sealos skills and supported host adapters.

**Target features:**
- A shared skill design contract for triggers, boundaries, safety, workflow, output, and progressive disclosure.
- Focused `SKILL.md` entry points for all eight skills, with detailed knowledge routed to owned modules and references.
- A canonical inventory and routing contract across `$sealos`, `/sealos`, direct skills.sh entry points, and host manifests.
- Validation for inventory, routing, descriptions, versions, host adapters, and load-bearing safety rules.
- Behavioral evals for skill selection, progressive loading, confirmation gates, output contracts, and cross-skill handoffs.
- A maintainer guide and quality gate for future skill additions and changes.

## Requirements

### Validated

- ✓ The repository is already a Sealos Skills and Codex plugin package with root `skills/**` as the only skill source — existing
- ✓ `.codex-plugin/plugin.json` points Codex to `./skills/` and defines the `sealos` plugin identity — existing
- ✓ `.agents/plugins/marketplace.json` supports local Codex marketplace testing — existing
- ✓ `scripts/validate-codex-plugin.py` validates the Codex manifest, local marketplace entry, platform registry, and asset paths — existing
- ✓ The README already documents Sealos deploy, database, S3, canvas, app-builder, and multi-host distribution concepts — existing
- ✓ Codex native marketplace installation is the primary Codex install path and matches the `sealos@sealos` identity — v1.0
- ✓ `npx plugins add ... --target codex` remains documented as a compatibility and local install path — v1.0
- ✓ README, Codex manifests, marketplace metadata, and platform evidence agree on install and invocation semantics — v1.0
- ✓ `scripts/validate-codex-plugin.py` checks the native install path, fallback path, plugin identity, and JSON metadata — v1.0

### Active

- [ ] Define one shared design contract for every Sealos skill entry point.
- [ ] Apply the contract to all eight skills while preserving their runtime and safety semantics.
- [ ] Align plugin routing and skill inventory across supported host adapters.
- [ ] Extend validation to catch design-contract, routing, inventory, version, and safety-rule drift.
- [ ] Add behavior-focused evals for routing, progressive loading, confirmation, output, and handoff behavior.
- [ ] Document the design system and the verification path for maintainers.

### Out of Scope

- New Sealos Cloud runtime capabilities — this milestone focuses on skill design quality and current behavior preservation.
- Product-level changes to deploy, database, S3, canvas, app-builder, readiness, Dockerfile, or Compose conversion semantics — existing runtime contracts are the baseline.
- A second packaged copy of `skills/**` — root `skills/**` remains the canonical implementation source.
- Host-specific forks of skill behavior — adapters expose the shared skills through host-native metadata and routing.

## Context

Ponytail keeps one rich runtime skill source, small single-purpose companion skills, host-specific adapters, generated or checked copies, lifecycle-aware behavior, and tests that tie user-facing claims to shipped files and observable behavior. Its strongest transferable lesson is the ownership model: canonical behavior lives once, each adapter has a narrow contract, and drift is made executable through tests.

Sealos Skills already has stronger domain-specific runtime contracts, structured modules, helper scripts, and safety gates. Its current design surface is broader and less uniform: entry files range from 116 to 383 lines, routing and inventory are repeated across several host files, only the deploy skill has dedicated eval fixtures, and high-value safety or output conventions vary by skill. The milestone applies the transferable mechanisms while retaining Sealos-specific depth.

Relevant current files:

- `README.md` — primary install and usage documentation
- `.codex-plugin/plugin.json` — Codex plugin manifest
- `.agents/plugins/marketplace.json` — local Codex marketplace entry
- `distribution/platforms.json` — platform support and evidence registry
- `scripts/validate-codex-plugin.py` — Codex manifest validator
- `marketplaces/README.md` — marketplace rules and support-claim ownership
- `skills/**/SKILL.md` — canonical skill source

## Constraints

- **Single skill source**: Root `skills/**` stays canonical for every host and distribution surface — prevents implementation drift.
- **Behavior preservation**: Existing runtime, safety, secret-handling, destructive-action, and verification contracts remain authoritative — protects deployed workloads and user data.
- **Progressive disclosure**: Entry skills keep routing and load-bearing rules visible while detailed protocols live in owned modules, references, and knowledge files — reduces prompt load without hiding required behavior.
- **Host accuracy**: `$sealos`, `/sealos`, and direct skills.sh entry points retain their verified host-specific meanings — prevents invocation ambiguity.
- **Validation**: Every design-system change leaves an executable check for the contract it introduces — makes drift visible before release.
- **Compatibility**: The `main` to `brain-deploy-preview` merge policy remains authoritative for branch-owned deploy and distribution surfaces — preserves the prepare-only branch architecture.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use `phuryn/pm-skills` as the install-copy reference | It shows Codex native marketplace setup and plain-language Codex differences clearly | ✓ Good |
| Prioritize Codex marketplace commands for Codex users | Codex users should see Codex-native commands before cross-host installer syntax | ✓ Good |
| Keep `npx plugins add` documented as a compatibility/local path | The repo already supports it and it remains useful for local testing | ✓ Good |
| Keep root `skills/**` as the only skill source | Existing architecture depends on one canonical skill tree across hosts | ✓ Good |
| Use Ponytail as a design-mechanism reference | Its source ownership, focused skills, adapters, and behavior tests transfer cleanly while Sealos retains domain semantics | — Pending |
| Cover all eight skills and supported host adapters in v1.1 | A partial rollout would leave routing, inventory, and design contracts inconsistent | — Pending |
| Continue roadmap numbering at Phase 5 | v1.1 extends the completed four-phase v1.0 milestone | — Pending |

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
*Last updated: 2026-08-06 after starting milestone v1.1*
