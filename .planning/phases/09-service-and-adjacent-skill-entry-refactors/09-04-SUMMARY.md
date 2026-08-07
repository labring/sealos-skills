---
phase: 09-service-and-adjacent-skill-entry-refactors
plan: 04
subsystem: app-builder
tags: [sdk, desktop-iframe, publish-handoff, service-contracts, redaction]

dependency_graph:
  requires: [09-01, 09-02, 09-03]
  provides: [app-builder-entry-contract, service-contract-fixture, service-contract-gate]
  affects: [10-deploy-orchestration]

key_files:
  modified:
    - skills/sealos-app-builder/SKILL.md
    - skills/sealos-app-builder/references/minimal-app-template.md
    - skills/sealos-app-builder/references/nextjs-app-router.md
  verified:
    - skills/sealos-app-builder/assets/templates/react/sealos-provider.tsx
    - skills/sealos-app-builder/assets/templates/vue/use-sealos.ts
  added:
    - tests/fixtures/skill-design-services.json
    - scripts/test_service_skill_contract.py

key_decisions:
  - "Classify create, adapt, identity, or tutorial work before loading branch-specific detail or editing."
  - "Prefer repository-local SDK/provider sources, keep initialization client-only and singular, and require explicit outside-Desktop fallback."
  - "Require real Desktop iframe, identity, language, business-data, and release evidence before a deploy handoff."
  - "Freeze database, S3, Canvas, and App Builder terminal states, redaction, links, and five-field handoffs in one offline fixture gate."

requirements_completed: [SDS-04, SDS-D06]

verification:
  - "python3 scripts/test_service_skill_contract.py (4 tests passed)"
  - "python3 -m json.tool tests/fixtures/skill-design-services.json"
  - "git diff --check"

completed: 2026-08-07
status: complete
---

# Phase 9 Plan 4: App Builder and Service Contract Summary

App Builder now exposes an explicit branch, SDK-source, Desktop iframe, fallback, and publish evidence boundary. The existing React and Vue starters resolve from their documented links and satisfy the client-only single-init contract.

## Accomplishments

- Added branch classification, source precedence, terminal-state fields, redaction rules, and typed deploy handoff evidence to the App Builder entry.
- Clarified minimal-template and Next.js placement rules for client-only initialization and Desktop-only publish evidence.
- Added positive and violating service traces for database, S3, Canvas, and App Builder, including confirmation, read-only, credential, and iframe boundaries.
- Added an offline gate for shared headings, terminal states, redaction, five-field handoffs, Markdown links, and React/Vue starter behavior.

## Verification Evidence

- Four service contract tests passed.
- All fixture JSON parsed successfully.
- Every checked entry/reference link resolves to a repository file.
- `git diff --check` passed.

## Phase Readiness

All four Phase 9 plan summaries now have implementation evidence. Phase-level UAT and goal-backward verification remain before state closure.
