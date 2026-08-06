---
phase: 12-branch-policy-documentation-and-release-audit
status: passed
candidate: ef8f2aceb2e7f0b915713419cd129fbc0454d717
source: a2efc15e95b86582469f423f6e9cae1bcfce4585
target: dbc55f0d4e572d283d3244581246823a1ca6b932
updated: 2026-08-07T05:20:00+08:00
---

# v1.1 Release Audit

This report closes the source-aware release boundary for the v1.1 design-system work. It records the immutable `main` source, the `upstream/brain-deploy-preview` target, and the release candidate captured before Phase 12 implementation commits. The audit uses Git tree reads and provider-free validators; it does not merge, push, tag, publish, authenticate to Sealos, or mutate a Kubernetes, database, or object-storage environment.

## Immutable Anchors

| Role | Ref | Recorded SHA | Evidence |
|---|---|---|---|
| Source | `main` | `a2efc15e95b86582469f423f6e9cae1bcfce4585` | `tests/fixtures/release-preservation-policy.json`, `anchor-source` |
| Preview target | `upstream/brain-deploy-preview` | `dbc55f0d4e572d283d3244581246823a1ca6b932` | `tests/fixtures/release-preservation-policy.json`, `anchor-target` |
| Release candidate | immutable commit ref | `ef8f2aceb2e7f0b915713419cd129fbc0454d717` | `tests/fixtures/release-preservation-policy.json`, `anchor-candidate` |
| Audit implementation tip | current worktree `HEAD` | `1abaa441febbef9b9736728f62e7fbcd867e407c` | local audit commits `cbe0f6d`, `143ecca`, `1abaa44` |

The comparison command was:

```text
git diff --name-status --find-renames main upstream/brain-deploy-preview
```

It returned 189 changed paths. Every changed path has a source path, target path, change type, policy ID, classification, and diagnostic in the branch-audit JSON output.

## Preservation Baseline

`python3 scripts/release-preservation-audit.py --root . --fixture tests/fixtures/release-preservation-policy.json --check` returned `ok: true` with 28 passed, 0 failed, and 0 conditional checks.

The baseline proves the following source-backed contracts before branch interpretation:

- artifact ownership and phase order for analysis, build, template, delivery, and runtime state;
- authentication, workspace, confirmation, redaction, cleanup, and rollback markers;
- prepare-only preview identity, Kaniko build request/result, and delivery manifest markers;
- Phase 8 dependency, Phase 9 service, Phase 10 Runtime Truth, and Phase 11 maintainer evidence paths;
- absent preview Canvas, BuildKit, plugin, and distribution surfaces.

The helper reads `git rev-parse`, `git show`, and `git cat-file` data. Subprocess diagnostics pass through credential-shaped redaction before JSON output.

## Branch Disposition

`python3 scripts/release-branch-audit.py --root . --fixture tests/fixtures/release-branch-policy.json --source main --target upstream/brain-deploy-preview --candidate ef8f2aceb2e7f0b915713419cd129fbc0454d717 --check` returned `ok: true`.

| Disposition | Count | Policy evidence | Result |
|---|---:|---|---|
| `aligned` | 0 changed paths; 5 directory parity rows | `skills/cloud-native-readiness/`, `skills/sealos-app-builder/`, `skills/sealos-database/`, `skills/sealos-s3/`, `skills/docker-to-sealos/` | All five directories are byte-for-byte equal to source |
| `adapted` | 66 changed paths | Preview-owned `AGENTS.md`, `README.md`, `CLAUDE.md`, `.gitignore`, Kaniko assets; documented `dockerfile-skill` Railpack delta; prepare-only deploy boundary | All rows carry explicit policy IDs |
| `excluded` | 123 changed paths | Main plugin, marketplace, distribution, branding, planning, Canvas, BuildKit, and main-only validator surfaces | All target exclusions are preserved |

The audit records 41 `sealos-deploy` paths under the explicit `manual-deploy` policy. The manual classification preserves the preview prepare flow:

1. eligibility and assess;
2. optional Railpack probe and normalized `analysis.json.build_environment` evidence;
3. image detection and Dockerfile preparation;
4. `.sealos/build-request.json` plus sandbox Kaniko build or image reuse;
5. template generation and `.sealos/delivery-manifest.json`.

The target keeps `skills/k8s-kaniko-job/` and its build request/result contract. OAuth, Template API deployment, UPDATE mode, rollout/rollback, Runtime Truth smoke, Canvas, and `skills/k8s-buildkit-job/` remain outside the preview workflow.

The Dockerfile audit accepts only the documented normalized Railpack evidence, explicit config/README/Dockerfile/lockfile precedence, raw Railpack JSON rejection, and Dockerfile-plus-Kaniko path. Undocumented Dockerfile markers fail the gate in mutation tests.

## Public Surface

`python3 scripts/public-surface-audit.py --root . --fixture tests/fixtures/public-surface-policy.json --candidate ef8f2aceb2e7f0b915713419cd129fbc0454d717 --check` returned 38 passed, 0 failed, and 1 conditional.

- Physical inventory: exactly eight `skills/*/SKILL.md` entries.
- Root `README.md` and all 12 `readmes/README.*.md` files contain the same eight skill tokens, `$sealos`, `/sealos`, `skills.sh`, and the three direct entries `/sealos-deploy`, `/sealos-database`, and `/sealos-s3`.
- `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `.qoder-plugin/plugin.json`, marketplace files, and `distribution/platforms.json` agree on version `1.2.0`.
- Manifest skill arrays contain exactly the eight `./skills/<name>` pointers; root pointers remain `./skills/`.
- `commands/sealos.md` and `distribution/platforms.json` preserve `$sealos` for Codex, `/sealos` for compatible plugin hosts, and direct `skills.sh` entries for the documented subset.
- No README or manifest edits were required in this wave because the live public projections were already synchronized.

The release-tag check is conditional because no tag points at the candidate SHA. The audit reports observed tags only and leaves tag creation and publication to a later maintainer operation.

## Quality Gates

| Gate | Result | Evidence |
|---|---|---|
| Phase 12 preservation audit | PASS: 28/28 | `scripts/release-preservation-audit.py` |
| Phase 12 branch audit | PASS: 189/189 classified; 5/5 parity | `scripts/release-branch-audit.py` |
| Phase 12 public audit | PASS: 38 passed; 1 conditional tag | `scripts/public-surface-audit.py` |
| Phase 12 regression suites | PASS: 15/15 | `python3 -m unittest scripts.test_release_preservation_audit scripts.test_release_branch_audit scripts.test_public_surface_audit` |
| Maintainer quality gate | PASS: 20 required; 1 conditional Docker; 0 failed | `scripts/maintainer-quality-gate.py` |
| Design/inventory validator | PASS: `ok: true`, no diagnostics | `scripts/validate_skill_design.py --root . --check` |
| Plugin metadata validator | PASS | `scripts/validate-codex-plugin.py --root .` |
| Dependency and Docker-to-Sealos gate | PASS | `scripts/test_dependency_skill_gates.py` |
| Deploy entry/pipeline/safety | PASS: 3 traces, 5 pipeline traces, 14 guards | `scripts/test_deploy_entry_contract.mjs`, `test_deploy_pipeline_contract.mjs`, `test_deploy_safety_contract.mjs` |
| Runtime Truth and Canvas | PASS: 9 Runtime Truth traces, 4 Canvas cases | `scripts/test_runtime_truth_contract.mjs`, `scripts/test_canvas_contract.mjs` |
| Service contracts | PASS: database 7/7, service 4/4 | `scripts/test_dependency_skill_contract.py`, `scripts/test_service_skill_contract.py` |
| Runtime helpers | PASS: live-smoke 5/5, footprint 3/3; prior log-scan evidence 12/12 | `skills/sealos-deploy/scripts/test-sealos-live-smoke.mjs`, `test-sealos-footprint.mjs`, Phase 10 verification |
| JSON and whitespace | PASS | `python3 -m json.tool`, `git diff --check` |

The optional Docker runtime is the only maintainer-gate conditional. Provider-backed runtime execution remains outside the required offline gate; Phase 10 Runtime Truth and live-helper evidence are reused by source path and timestamp.

## Requirements

| Requirement | Status | Source-backed evidence |
|---|---|---|
| `REL-01` | SATISFIED | Complete 189-path disposition, synchronized eight-skill public claims, consistent manifest versions, and tag evidence policy |
| `SDS-12` | SATISFIED | Immutable anchors, preserved runtime/safety evidence, prepare-only preview boundary, and complete deterministic gates |

## Follow-ups Outside v1.1

- Perform the maintainer-controlled `main` to `brain-deploy-preview` merge/synchronization after reviewing the 189-row disposition. This audit does not mutate either branch.
- Decide and create the release tag and publish the package after the candidate is approved. The absent tag is recorded as conditional evidence.
- Run provider-backed deploy, database, S3, Desktop, and live Runtime Truth scenarios in a named environment with explicit cleanup authorization.

No follow-up is an unresolved required gate failure. The current audit status is `passed` with two scoped publication/environment conditionals.
