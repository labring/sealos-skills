# Skill Runtime Preservation Checklist

**Phase:** 05 Baseline, Ownership, and Shared Contract
**Scope:** Entry-contract additions only. Host projection repair, provider smoke, and branch-specific release work remain assigned to later phases.
**Approval rule:** A row is `approved` only when the entry contains the shared core and applicable canaries, its positive/violating baseline cases remain linked, and the listed deterministic gates pass without sensitive values.

## Crosswalk

| Skill / entry | Core and canaries | Baseline traces | Owned artifacts | Typed handoff | Terminal evidence | Deterministic gates | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `cloud-native-readiness` | Eight core sections; `CNR-ELIGIBILITY-STOP`, `CNR-ROUTE-HANDOFF` | `readiness-positive-eligible`; `readiness-violating-ineligible` | Readiness report; composed `.sealos/analysis.json` | `dockerfile-skill`; report; packaging-only action; route failure return; readiness response owner | Eligibility before score/build; score dimensions; artifact inventory; safe stop | `node skills/sealos-deploy/scripts/workload-eligibility.mjs <repo>`; `node skills/sealos-deploy/scripts/score-model.mjs <repo>`; baseline checker | approved |
| `dockerfile-skill` | Eight core sections; `DFS-RUNTIME-ACCEPT`, `DFS-OWNED-FILES`, `DFS-REDACT` | `dockerfile-positive-build-runtime`; `dockerfile-violating-build-only` | `Dockerfile`, `.dockerignore`, optional compose/entrypoint/docs, `.sealos/build/build-result.json` | `sealos-deploy`; validated packaging result; image build/reuse action; build/runtime failure return; packaging response owner | Build plus migrations/tables, HTTP/health, logs, owned-file scope, redaction | `node --check` changed helpers; skill runtime validation; baseline checker | approved |
| `docker-to-sealos` | Eight core sections; `DTS-RULE-PRECEDENCE`, `DTS-MUST-MAP`, `DTS-QUALITY-GATE` | `docker-to-sealos-positive-quality-gate`; `docker-to-sealos-violating-missing-rule` | `template/<app>/index.yaml`; validator-only topology evidence | `sealos-deploy`; final Template plus validator evidence; deploy-after-gates action; failed-rule return; converter response owner | Governance priority, MUST-map/registry coverage, complete final-template quality gate | `python3 skills/docker-to-sealos/scripts/test_check_consistency.py`; `test_check_must_coverage.py`; `test_compose_to_template.py`; `quality_gate.py` when artifact exists | approved |
| `sealos-deploy` | Eight core sections; `DEP-KUBECONFIG-SCOPE`, `DEP-CONFIRM-MUTATION`, `DEP-REDACT`, `DEP-RUNTIME-TRUTH` | `deploy-positive-runtime-truth`; `deploy-violating-missing-runtime-proof` | `.sealos/analysis.json`, `.sealos/build/build-result.json`, `.sealos/template/index.yaml`, `.sealos/state.json`, delivery manifest, one deploy log | readiness/Dockerfile/Docker-to-Sealos inputs; Canvas target with sanitized state and Runtime Truth; scoped action and failure returns | Actual App URL/live identity, auth/setup, route/port, logs/events, convergence, full footprint, cleanup/rollback evidence | `node skills/sealos-deploy/scripts/test-sealos-footprint.mjs`; `test-sealos-live-smoke.mjs`; existing deploy helper/eval gates | approved |
| `sealos-database` | Eight core sections; `DB-REUSE-ENV`, `DB-CONFIRM-PUBLIC`, `DB-REDACT-CONNECT` | `database-positive-reuse-redacted-connectivity`; `database-violating-unconfirmed-public-or-destructive` | Existing project env file and selected app key; no committed secret | Optional deploy target; redacted DB identity/env-key contract; approved Secret consumption; analyzer/CLI return; database response owner | Analyzer-first selection, list-before-create/reuse, env preservation, private connectivity/migration proof | `node skills/sealos-database/scripts/analyze-project-database.mjs <repo>`; database evals; baseline checker | approved |
| `sealos-s3` | Eight core sections; `S3-PRIVATE-REUSE`, `S3-CONFIRM-PUBLIC`, `S3-REDACT-OBJECT` | `s3-positive-private-round-trip`; `s3-violating-unconfirmed-public-or-rotation` | Existing project env file and app S3/MINIO keys; managed bucket/Secret references only when handed to deploy | Optional deploy target; private bucket/policy/env-key contract; approved object-storage wiring; analyzer/CLI return; S3 response owner | Private policy, list-before-create/reuse, authenticated upload/read or presign, cleanup, redaction | `node skills/sealos-s3/scripts/analyze-project-s3.mjs <repo>`; S3 evals; baseline checker | approved |
| `sealos-canvas` | Eight core sections; `CANVAS-DEPLOYED`, `CANVAS-READONLY`, `CANVAS-REDACT`, `CANVAS-SERVER-LIFETIME` | `canvas-positive-read-only-local-url`; `canvas-violating-missing-state-or-mutation` | `.sealos/canvas/index.html`; temporary loopback server | No mutation target; consumes sanitized `.sealos/state.json`/live summaries; server-only action; read-only failure return; Canvas response owner | Deployed state/kubeconfig precondition, permitted read calls, sanitized nodes/events, `local_url`, `html_path`, explicit server shutdown | `node skills/sealos-canvas/scripts/generate-canvas.mjs --work-dir <repo> --no-serve`; Canvas evals; baseline checker | approved |
| `sealos-app-builder` | Eight core sections; `APP-CODE-TUTORIAL`, `APP-SDK-SOURCE`, `APP-DESKTOP-VERIFY`, `APP-PUBLISH-HANDOFF` | `app-builder-positive-sdk-iframe-publish`; `app-builder-violating-tutorial-or-missing-desktop` | Project source, package manifest/lockfile, tutorial/docs | `sealos-deploy`; verified app source plus Desktop/publish evidence; deploy-after-verification action; SDK/iframe return; app-builder response owner | Correct branch, local SDK precedence, client-only session/language, outside-Desktop fallback, real iframe and publish evidence | Bundled SDK references, local-debug/test-app checklist, baseline checker | approved |

## Preservation Gates

### Entry contract

- [x] All eight physical `skills/*/SKILL.md` files expose `Identity and Discovery`, `Scope and Boundaries`, `Risk and Confirmation`, `Lifecycle Workflow`, `Progressive Disclosure`, `Output, Stop, and Error States`, `Handoffs`, and `Verification` in that order before their existing domain extensions.
- [x] Every entry uses request-scoped `success`, `stopped`, and `error` vocabulary with domain evidence, safe next action, or recovery action.
- [x] Entry-visible canary IDs retain confirmation, redaction, kubeconfig, read-only, eligibility, quality-gate, runtime-acceptance, SDK, Desktop, and server-lifetime guards where applicable.

### Runtime behavior preservation

- [x] Readiness remains eligibility-first and fail-closed before scoring, build, or deploy.
- [x] Dockerfile acceptance requires runtime/migration/HTTP/log proof after build.
- [x] Docker-to-Sealos retains entry MUST rules, `must-rules-map.yaml`, `rules-registry.yaml`, and the complete final-template quality gate.
- [x] Deploy retains auth/workspace and `KUBECONFIG` scope, confirmation for system/public/destructive/credential actions, `.sealos` artifacts, actual App URL/live identity, Runtime Truth, rollback, cleanup, and redaction.
- [x] Database and S3 retain analyzer-first create-or-reuse, env preservation, private defaults, connectivity/object evidence, and public/destructive/rotation confirmation.
- [x] Canvas remains read-only, sanitized, state/kubeconfig gated, loopback-only, request-scoped, and explicitly shuts down its temporary server.
- [x] App Builder retains code/tutorial classification, local SDK/source precedence, client-only integration, Desktop iframe verification, fallback, and publish handoff.

## Gate Record

| Command | Result | Evidence |
| --- | --- | --- |
| `node scripts/skill-design-baseline.mjs --fixture tests/fixtures/skill-design-baseline.json --check` | PASS | `ok: true`, 8 skills, 16 cases; all trace values redaction-safe |
| `node --test scripts/test-skill-design-baseline.mjs` | PASS | 5 tests passed, 0 failed |
| `python3 scripts/validate-codex-plugin.py` | PASS | Plugin metadata and root skill inventory validate |
| `python3 skills/docker-to-sealos/scripts/test_check_consistency.py` | PASS | Existing consistency suite passes |
| `python3 skills/docker-to-sealos/scripts/test_check_must_coverage.py` | PASS | MUST-map coverage remains coupled to the registry |
| `python3 skills/docker-to-sealos/scripts/test_compose_to_template.py` | PASS | Compose/template behavior remains green |
| `node skills/sealos-deploy/scripts/test-sealos-footprint.mjs` | PASS | Footprint helper contract remains green |
| `node skills/sealos-deploy/scripts/test-sealos-live-smoke.mjs` | PASS | Live-smoke helper contract remains green |
| `git diff --check` | PASS | No whitespace errors |

These gates are offline or helper-level preservation oracles. Provider smoke, host projection repair, and branch/release audit remain scoped to Phases 6-12.

## Approval

All eight rows are approved for the Phase 5 shared-contract change set. The checklist records the baseline evidence and deterministic gates used for this approval; it does not claim live cloud execution or host projection parity.
