---
phase: 09-service-and-adjacent-skill-entry-refactors
plan: 03
subsystem: canvas
tags: [read-only, sanitization, local-url, server-lifetime, topology]

dependency_graph:
  requires: [09-02]
  provides: [canvas-read-only-contract, canvas-redacted-diagnostics, canvas-server-lifetime]
  affects: [10-deploy-orchestration]

key_files:
  modified:
    - skills/sealos-canvas/SKILL.md
    - skills/sealos-canvas/scripts/generate-canvas.mjs
    - skills/sealos-canvas/evals/evals.json
  added:
    - scripts/test_canvas_contract.mjs

key_decisions:
  - "Keep deployed state, kubeconfig, kubectl, and read access as preconditions before generation."
  - "Return explicit local URL/cache and server lifetime fields while keeping --no-serve deterministic for CI."
  - "Sanitize credential-shaped diagnostics and preserve only Secret/ConfigMap metadata summaries."

requirements_completed: [SDS-04, SDS-D06]

verification:
  - "node --check skills/sealos-canvas/scripts/generate-canvas.mjs"
  - "node --check scripts/test_canvas_contract.mjs"
  - "node scripts/test_canvas_contract.mjs (3 cases passed)"
  - "python3 -m json.tool skills/sealos-canvas/evals/evals.json"
  - "git diff --check"

completed: 2026-08-07
status: complete
---

# Phase 9 Plan 3: Canvas Summary

Canvas now has an independently testable read-only observation contract with explicit output and lifecycle evidence.

## Accomplishments

- Added stop, success, and error payload fields for local URL, HTML cache, sanitized diagnostics, graph counts, and server lifetime.
- Preserved fixture mode and `--no-serve` for provider-free validation while keeping live mode bounded to a temporary loopback server.
- Added deterministic tests for missing deployment state, fixture topology, redaction, and mutation-command absence.
- Extended eval coverage for server lifetime and diagnostic redaction.

## Verification Evidence

- Canvas generator and contract test syntax passed.
- Three offline Canvas contract cases passed.
- Canvas eval JSON parsed successfully.
- `git diff --check` passed.

## Next Phase Readiness

App Builder can now adopt the same terminal-state and typed-handoff vocabulary while its templates and local SDK precedence are made explicit.
