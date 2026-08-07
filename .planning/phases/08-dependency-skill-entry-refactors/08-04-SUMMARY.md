---
phase: 08-dependency-skill-entry-refactors
plan: 04
subsystem: validation
tags: [fixtures, contract-tests, dependency-gates, redaction]

# Dependency graph
requires:
  - phase: 08-dependency-skill-entry-refactors
    plan: 01
    provides: readiness report and handoff contract
  - phase: 08-dependency-skill-entry-refactors
    plan: 02
    provides: Dockerfile packaging and runtime acceptance contract
  - phase: 08-dependency-skill-entry-refactors
    plan: 03
    provides: Compose conversion and validator contract
provides:
  - machine-readable dependency fixtures
  - mutation-backed contract checks
  - sequential preservation gate runner
affects: [09-service-entry-refactors, 10-deploy-orchestration, 11-host-integration]

# Tech tracking
tech-stack:
  added: [JSON dependency fixture, Python contract gate runner]
  patterns: [positive and violating contract pairs, strict topology fixture, auto-detected PyYAML runtime]

key-files:
  created:
    - tests/fixtures/skill-design-dependencies.json
    - tests/fixtures/docker-to-sealos/template/synthetic-app/index.yaml
    - tests/fixtures/docker-to-sealos/.sealos/topology-evidence/synthetic-app.yaml
    - scripts/test_dependency_skill_contract.py
    - scripts/test_dependency_skill_gates.py

key-decisions:
  - "Each dependency contract has a positive case, a violating case, typed five-field handoffs, and redaction assertions."
  - "The full gate runner selects a Python runtime with PyYAML and executes the checks sequentially so a failed boundary stops the suite."
  - "Existing baseline, safety, aggregate, Dockerfile, and Docker-to-Sealos suites remain the release evidence."

requirements-completed: [SDS-06, SDS-08]

coverage:
  - id: D1
    description: "Readiness, Dockerfile, Compose, and preview boundary contracts are fixture-backed."
    requirement: SDS-06
    verification:
      - kind: unit
        ref: "scripts/test_dependency_skill_contract.py"
        status: pass
  - id: D2
    description: "Mutation tests prove the contract suite detects removed eligibility, runtime, quality, and redaction guards."
    requirement: SDS-08
    verification:
      - kind: mutation
        ref: "contract suite: 7 tests passed"
        status: pass
  - id: D3
    description: "The complete preservation gate runs all dependency and existing skill validators."
    requirement: SDS-08
    verification:
      - kind: integration
        ref: "scripts/test_dependency_skill_gates.py"
        status: pass

# Metrics
duration: 12min
completed: 2026-08-07
status: complete
---

# Phase 8 Plan 4: Validation Summary

Phase 8 now has machine-readable evidence for the dependency entry contracts and one sequential runner for the full preservation gate.

## Accomplishments

- Added positive and violating fixtures for readiness, Dockerfile, Compose, and the prepare-only preview boundary.
- Added mutation-backed contract checks for eligibility stop, owned-file/runtime acceptance, quality-gate coupling, typed handoffs, link resolution, and redaction.
- Added a deterministic Template and TopologyEvidence fixture so the quality gate runs in strict artifact mode.
- Added a gate runner that executes contract, inventory, routing, safety, aggregate, syntax, baseline, host validators, and Docker-to-Sealos suites in order.

## Verification Evidence

- `python3 scripts/test_dependency_skill_contract.py` -> 7 tests passed.
- `python3 scripts/test_dependency_skill_gates.py` -> all dependency, baseline, host, Dockerfile, and Docker-to-Sealos gates passed.
- The strict quality gate passed against `tests/fixtures/docker-to-sealos/template/synthetic-app/index.yaml` and its matching `TopologyEvidence` artifact.

## Deviations

None. Generated Python cache files were removed after validation.

## Next Phase Readiness

The shared dependency vocabulary and preservation checks are ready for the service entry refactors in Phase 9.

---
*Phase: 08-dependency-skill-entry-refactors*
*Completed: 2026-08-07*
