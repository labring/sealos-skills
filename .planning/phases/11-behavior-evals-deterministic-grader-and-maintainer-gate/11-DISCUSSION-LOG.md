# Phase 11: Behavior Evals, Deterministic Grader, and Maintainer Gate - Discussion Log

> **Audit trail only.** Decisions are captured in `11-CONTEXT.md`.

**Date:** 2026-08-06
**Phase:** 11-behavior-evals-deterministic-grader-and-maintainer-gate
**Areas discussed:** behavior fixture coverage, deterministic grader, maintainer gate and evidence policy

## Behavior fixture coverage

| Option | Description | Selected |
|--------|-------------|----------|
| Extend the existing structured trace fixture | Preserve one canonical trace contract and add only observable fields required by the phase | ✓ |
| Create a second independent trace format | Split behavior coverage across unrelated schemas | |

**Decision:** Extend the existing trace fixture and add missing skill-local eval suites plus router cases.

## Deterministic grader

| Option | Description | Selected |
|--------|-------------|----------|
| Offline fixture-driven grader | Use standard-library or Node.js checks against committed traces and temporary mutations | ✓ |
| Provider-backed trajectory runner | Require external provider sessions for the maintainer gate | |

**Decision:** Keep the required gate deterministic and provider-free; retain provider-backed benchmarking for a later scope.

## Maintainer gate and evidence policy

| Option | Description | Selected |
|--------|-------------|----------|
| Compose existing validators behind one JSON-producing command | Reuse current owners, aggregate actionable diagnostics, and fail on any component | ✓ |
| Duplicate all checks in a new monolithic validator | Move parsing and policy into one new implementation | |

**Decision:** Compose the current validators, document the command and optional prerequisites, and preserve synthetic redacted evidence.

## the agent's Discretion

- Exact helper names, fixture file locations, assertion details, and command orchestration may follow existing repository conventions.

## Deferred Ideas

- Provider-backed trajectories, remote sessions, and release evidence remain Phase 12 or v2 scope.
