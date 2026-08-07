# Roadmap: Sealos Codex Plugin Installation Upgrade

## Overview

This MVP upgrades the Sealos Codex plugin install experience from a compatibility-first path to a Codex-native marketplace path, then aligns README copy, metadata claims, validator coverage, and install smoke evidence around one installable plugin: `sealos@sealos`.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Native Marketplace Discovery Contract** - Prove the Sealos repository exposes an installable `sealos@sealos` plugin through Codex native marketplace discovery. (completed 2026-06-15)
- [x] **Phase 2: README and Metadata Alignment** - Make the verified native path the primary Codex install story and align metadata, registry claims, and invocation wording. (completed 2026-06-15)
- [x] **Phase 3: Validator Hardening** - Extend validation so README commands, fallback install copy, plugin identity, and JSON syntax drift fail loudly. (completed 2026-06-15)
- [x] **Phase 4: Install Smoke and Handoff** - Capture native and compatibility install evidence, then hand off the exact changed files and remaining follow-up. (completed 2026-06-15)

## Phase Details

### Phase 1: Native Marketplace Discovery Contract

**Goal:** Maintainers can add this repository as a Codex marketplace and install `sealos@sealos` from an isolated Codex environment.
**Mode:** mvp
**Depends on:** Nothing (first phase)
**Requirements:** DISC-01, DISC-02, DISC-03, META-03
**Success Criteria** (what must be TRUE):

  1. Maintainer can add the repository as a Codex marketplace in an isolated `HOME` and `CODEX_HOME`.
  2. Maintainer can see `sealos@sealos` in `codex plugin list --available --json`.
  3. Maintainer can install `sealos@sealos` with `codex plugin add sealos@sealos --json`.
  4. Marketplace metadata exposes the installable Sealos plugin while root `skills/**` remains the single canonical skill source.

**Plans:** 3/3 plans complete

### Phase 2: README and Metadata Alignment

**Goal:** Codex users see a README and metadata contract that teaches the verified native install path, compatibility path, installed capabilities, and correct invocation surface.
**Mode:** mvp
**Depends on:** Phase 1
**Requirements:** DOCS-01, DOCS-02, DOCS-03, DOCS-04, DOCS-05, DOCS-06, META-01, META-02, META-04
**Success Criteria** (what must be TRUE):

  1. Reader sees `codex plugin marketplace add labring/sealos-skills` before the plugin install command in the Codex Quick Start.
  2. Reader sees `codex plugin add sealos@sealos` as the native Codex plugin install command.
  3. Reader understands that one Sealos plugin installs deploy, database, S3, canvas, app-builder, and supporting cloud-native skills.
  4. Reader sees `npx plugins add https://github.com/labring/sealos-skills --target codex` as the compatibility or local install path.
  5. Reader sees Codex-specific invocation and Codex App selection guidance near the Sealos plugin screenshot, while Claude-compatible command examples remain in Claude-specific sections.

**Plans:** 2/2 plans complete

Plans:

- [x] 02-01-PLAN.md — Align README Codex native install, compatibility path, capabilities, and invocation wording.
- [x] 02-02-PLAN.md — Align Codex platform metadata and run existing validation gates.

### Phase 3: Validator Hardening

**Goal:** Maintainers can run validation that catches README, manifest, marketplace, platform registry, fallback install, and JSON syntax drift.
**Mode:** mvp
**Depends on:** Phase 2
**Requirements:** VAL-01, VAL-02, VAL-03, VAL-04
**Success Criteria** (what must be TRUE):

  1. `scripts/validate-codex-plugin.py` fails when README native Codex install commands are absent or mismatched.
  2. `scripts/validate-codex-plugin.py` fails when the README fallback `npx plugins` command is absent or mismatched.
  3. `scripts/validate-codex-plugin.py` fails when README, manifest, marketplace, or platform registry plugin identity diverges.
  4. JSON syntax checks pass for every touched plugin, marketplace, and platform registry file.

**Plans:** 1/1 plans complete

Plans:

- [x] 03-01-PLAN.md — Harden the Codex validator for README commands, fallback install, identity parity, platform registry fields, JSON syntax coverage, and targeted drift-failure proof.

### Phase 4: Install Smoke and Handoff

**Goal:** Maintainers finish the milestone with native install evidence, compatibility install evidence, and a clear changed-file handoff.
**Mode:** mvp
**Depends on:** Phase 3
**Requirements:** HAND-01, HAND-02, HAND-03
**Success Criteria** (what must be TRUE):

  1. Final verification records isolated Codex native marketplace add, available-list, and install smoke output.
  2. Final verification records compatibility install or discovery evidence for the `npx plugins` path.
  3. Final handoff reports the exact files changed during the milestone.
  4. Final handoff names any remaining non-Codex distribution follow-up.

**Plans:** 2/2 plans complete

Plans:

- [x] 04-01-PLAN.md — Capture isolated native Codex install smoke evidence and native payload assertions.
- [x] 04-02-PLAN.md — Capture compatibility evidence, aggregate assertions, cleanup proof, validation transcript, and final changed-file handoff.

## Requirement Coverage

| Requirement | Phase |
|-------------|-------|
| DISC-01 | Phase 1 |
| DISC-02 | Phase 1 |
| DISC-03 | Phase 1 |
| DOCS-01 | Phase 2 |
| DOCS-02 | Phase 2 |
| DOCS-03 | Phase 2 |
| DOCS-04 | Phase 2 |
| DOCS-05 | Phase 2 |
| DOCS-06 | Phase 2 |
| META-01 | Phase 2 |
| META-02 | Phase 2 |
| META-03 | Phase 1 |
| META-04 | Phase 2 |
| VAL-01 | Phase 3 |
| VAL-02 | Phase 3 |
| VAL-03 | Phase 3 |
| VAL-04 | Phase 3 |
| HAND-01 | Phase 4 |
| HAND-02 | Phase 4 |
| HAND-03 | Phase 4 |

**Coverage:** 20/20 v1 requirements mapped.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Native Marketplace Discovery Contract | 3/3 | Complete    | 2026-06-15 |
| 2. README and Metadata Alignment | 2/2 | Complete    | 2026-06-15 |
| 3. Validator Hardening | 1/1 | Complete    | 2026-06-15 |
| 4. Install Smoke and Handoff | 2/2 | Complete    | 2026-06-15 |
