# Phase 04 Install Smoke Final Handoff

- milestone_base: `9ee2d3ac269b4d5b1c81ba43be979c0c7cdac03b`
- milestone_base_source: `git merge-base HEAD upstream/main`
- HAND-01: native Codex smoke evidence passed.
- HAND-02: compatibility evidence status `discovery_evidence`; exact command `npx plugins add https://github.com/labring/sealos-skills --target codex`.
- HAND-03: git-truth changed-file handoff, cleanup proof, validation transcript, secret scan, UAT, verification, and phase.complete state are recorded from current HEAD plus this final closeout refresh bundle.
- autonomous package gate approval: recorded in `evidence/05-npx-package-audit.json` and imported by `evidence/11-install-smoke-assertions.json`; approval scope is limited to isolated compatibility evidence.
- Phase complete state bundle: `.planning/ROADMAP.md` and `.planning/STATE.md` are part of this final closeout commit.
- Downstream closeout artifacts: `04-VERIFICATION.md` and `04-UAT.md` are committed and included in the milestone file list.

## Native Evidence
- `evidence/00-codex-version.txt`
- `evidence/01-native-marketplace-add.json`
- `evidence/02-native-marketplace-list.json`
- `evidence/03-native-plugin-list-available.json`
- `evidence/04-native-plugin-add.json`
- `evidence/06-native-smoke-assertions.json`
- `evidence/09-native-smoke-env.txt`

## Compatibility Evidence
- `evidence/05-npx-package-audit.json`
- `evidence/05-npx-compat-install.txt`
- `evidence/05-npx-compat-install.stderr.txt`
- `evidence/05-npx-compat-install.exitcode`
- `evidence/05-npx-compat-discovery.json`
- `evidence/10-compat-smoke-env.txt`

## Package Gate Approval Record
- approval_record: `autonomous_package_gate_approval`
- source: user delegated autonomous interaction-gate decisions during Phase 4 execution.
- package: `plugins@1.3.1`
- repository: `git+https://github.com/vercel-labs/plugins.git`
- bin: `plugins -> dist/index.js`
- postinstall: absent for the tested version.
- integrity: npm registry integrity and registry tarball metadata recorded.
- scope: isolated compatibility evidence only, using temp HOME, CODEX_HOME, npm cache, XDG cache, and XDG config paths.

## Validator and Final Evidence
- `04-VERIFICATION.md`
- `04-UAT.md`
- `evidence/07-validator-and-json-checks.txt`
- `evidence/08-milestone-files.txt`
- `evidence/08-working-tree-status.txt`
- `evidence/08-skills-files.txt`
- `evidence/08-phase-4-uncommitted-files.txt`
- `evidence/08-final-handoff.md`
- `evidence/11-install-smoke-assertions.json`
- `evidence/12-secret-scan.txt`
- `evidence/13-cleanup-verification.txt`

## Changed Files by Group
### docs
- `AGENTS.md`
- `README.md`

### metadata
- `.agents/plugins/marketplace.json`
- `distribution/platforms.json`
- `plugin.json`

### metadata/assets
- `plugins/sealos`

### planning/core
- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/codebase/ARCHITECTURE.md`
- `.planning/codebase/CONCERNS.md`
- `.planning/codebase/CONVENTIONS.md`
- `.planning/codebase/INTEGRATIONS.md`
- `.planning/codebase/STACK.md`
- `.planning/codebase/STRUCTURE.md`
- `.planning/codebase/TESTING.md`
- `.planning/config.json`

### planning/phase-1
- `.planning/phases/01-native-marketplace-discovery-contract/01-01-metadata-discovery-contract-PLAN.md`
- `.planning/phases/01-native-marketplace-discovery-contract/01-01-metadata-discovery-contract-SUMMARY.md`
- `.planning/phases/01-native-marketplace-discovery-contract/01-02-isolated-codex-smoke-PLAN.md`
- `.planning/phases/01-native-marketplace-discovery-contract/01-02-isolated-codex-smoke-SUMMARY.md`
- `.planning/phases/01-native-marketplace-discovery-contract/01-03-validation-and-handoff-PLAN.md`
- `.planning/phases/01-native-marketplace-discovery-contract/01-03-validation-and-handoff-SUMMARY.md`
- `.planning/phases/01-native-marketplace-discovery-contract/01-CONTEXT.md`
- `.planning/phases/01-native-marketplace-discovery-contract/01-DISCUSSION-LOG.md`
- `.planning/phases/01-native-marketplace-discovery-contract/01-PATTERNS.md`
- `.planning/phases/01-native-marketplace-discovery-contract/01-RESEARCH.md`
- `.planning/phases/01-native-marketplace-discovery-contract/01-REVIEW-FIX.md`
- `.planning/phases/01-native-marketplace-discovery-contract/01-REVIEW.md`
- `.planning/phases/01-native-marketplace-discovery-contract/01-UAT.md`
- `.planning/phases/01-native-marketplace-discovery-contract/01-VERIFICATION.md`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/00-codex-version.txt`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/01-initial-discovery.json`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/01-marketplace-add.json`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/02-marketplace-list.json`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/03-plugin-list-available.json`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/04-plugin-add.json`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/04-sibling-marketplace-surfaces.json`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/05-native-smoke-assertions.json`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/06-validate-codex-plugin.txt`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/07-json-syntax-checks.txt`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/08-phase-1-handoff.md`
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/09-native-payload-smoke-env.txt`

### planning/phase-2
- `.planning/phases/02-readme-and-metadata-alignment/02-01-PLAN.md`
- `.planning/phases/02-readme-and-metadata-alignment/02-01-SUMMARY.md`
- `.planning/phases/02-readme-and-metadata-alignment/02-02-PLAN.md`
- `.planning/phases/02-readme-and-metadata-alignment/02-02-SUMMARY.md`
- `.planning/phases/02-readme-and-metadata-alignment/02-CONTEXT.md`
- `.planning/phases/02-readme-and-metadata-alignment/02-DISCUSSION-LOG.md`
- `.planning/phases/02-readme-and-metadata-alignment/02-PATTERNS.md`
- `.planning/phases/02-readme-and-metadata-alignment/02-RESEARCH.md`
- `.planning/phases/02-readme-and-metadata-alignment/02-REVIEW-FIX.md`
- `.planning/phases/02-readme-and-metadata-alignment/02-REVIEW.md`
- `.planning/phases/02-readme-and-metadata-alignment/02-UAT.md`
- `.planning/phases/02-readme-and-metadata-alignment/02-VERIFICATION.md`

### planning/phase-3
- `.planning/phases/03-validator-hardening/03-01-PLAN.md`
- `.planning/phases/03-validator-hardening/03-01-SUMMARY.md`
- `.planning/phases/03-validator-hardening/03-CONTEXT.md`
- `.planning/phases/03-validator-hardening/03-DISCUSSION-LOG.md`
- `.planning/phases/03-validator-hardening/03-PATTERNS.md`
- `.planning/phases/03-validator-hardening/03-RESEARCH.md`
- `.planning/phases/03-validator-hardening/03-REVIEW-FIX.md`
- `.planning/phases/03-validator-hardening/03-REVIEW.md`
- `.planning/phases/03-validator-hardening/03-UAT.md`
- `.planning/phases/03-validator-hardening/03-VERIFICATION.md`

### planning/phase-4
- `.planning/phases/04-install-smoke-and-handoff/04-01-PLAN.md`
- `.planning/phases/04-install-smoke-and-handoff/04-01-SUMMARY.md`
- `.planning/phases/04-install-smoke-and-handoff/04-02-PLAN.md`
- `.planning/phases/04-install-smoke-and-handoff/04-02-SUMMARY.md`
- `.planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md`
- `.planning/phases/04-install-smoke-and-handoff/04-DISCUSSION-LOG.md`
- `.planning/phases/04-install-smoke-and-handoff/04-RESEARCH.md`
- `.planning/phases/04-install-smoke-and-handoff/04-REVIEW-FIX.md`
- `.planning/phases/04-install-smoke-and-handoff/04-REVIEW.md`
- `.planning/phases/04-install-smoke-and-handoff/04-UAT.md`
- `.planning/phases/04-install-smoke-and-handoff/04-VERIFICATION.md`
- `.planning/phases/04-install-smoke-and-handoff/evidence/00-codex-version.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/01-native-marketplace-add.json`
- `.planning/phases/04-install-smoke-and-handoff/evidence/02-native-marketplace-list.json`
- `.planning/phases/04-install-smoke-and-handoff/evidence/03-native-plugin-list-available.json`
- `.planning/phases/04-install-smoke-and-handoff/evidence/04-native-plugin-add.json`
- `.planning/phases/04-install-smoke-and-handoff/evidence/05-npx-compat-discovery.json`
- `.planning/phases/04-install-smoke-and-handoff/evidence/05-npx-compat-install.exitcode`
- `.planning/phases/04-install-smoke-and-handoff/evidence/05-npx-compat-install.stderr.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/05-npx-compat-install.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/05-npx-package-audit.json`
- `.planning/phases/04-install-smoke-and-handoff/evidence/06-native-smoke-assertions.json`
- `.planning/phases/04-install-smoke-and-handoff/evidence/07-validator-and-json-checks.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/08-final-handoff.md`
- `.planning/phases/04-install-smoke-and-handoff/evidence/08-milestone-files.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/08-phase-4-uncommitted-files.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/08-skills-files.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/08-working-tree-status.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/09-native-smoke-env.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/10-compat-smoke-env.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/11-install-smoke-assertions.json`
- `.planning/phases/04-install-smoke-and-handoff/evidence/12-secret-scan.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/13-cleanup-verification.txt`

### planning/research
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/FEATURES.md`
- `.planning/research/PITFALLS.md`
- `.planning/research/STACK.md`
- `.planning/research/SUMMARY.md`

### source/validation
- `scripts/validate-codex-plugin.py`

## Phase 4 Source Implementation Changes
- none

## Milestone skills/** Changes
- `none`

## Current Working Tree Status
This handoff was refreshed while the final phase.complete closeout bundle was pending commit. The pre-commit state records the bundle truthfully, and the expected post-commit state is a clean `worktree-agent-phase-01` working tree.

```text
## worktree-agent-phase-01
 M .planning/ROADMAP.md
 M .planning/STATE.md
 M .planning/phases/04-install-smoke-and-handoff/evidence/08-final-handoff.md
 M .planning/phases/04-install-smoke-and-handoff/evidence/08-milestone-files.txt
 M .planning/phases/04-install-smoke-and-handoff/evidence/08-phase-4-uncommitted-files.txt
 M .planning/phases/04-install-smoke-and-handoff/evidence/08-working-tree-status.txt
 M .planning/phases/04-install-smoke-and-handoff/evidence/11-install-smoke-assertions.json
 M .planning/phases/04-install-smoke-and-handoff/evidence/12-secret-scan.txt
```

## Phase 4 Uncommitted Files at Handoff Generation
These files form the final closeout refresh bundle and are committed by the same final handoff commit:

- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/phases/04-install-smoke-and-handoff/evidence/08-milestone-files.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/08-working-tree-status.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/08-phase-4-uncommitted-files.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/08-final-handoff.md`
- `.planning/phases/04-install-smoke-and-handoff/evidence/11-install-smoke-assertions.json`
- `.planning/phases/04-install-smoke-and-handoff/evidence/12-secret-scan.txt`

## Phase 4 Files Included in Current Milestone Diff
- `.planning/phases/04-install-smoke-and-handoff/04-01-PLAN.md`
- `.planning/phases/04-install-smoke-and-handoff/04-01-SUMMARY.md`
- `.planning/phases/04-install-smoke-and-handoff/04-02-PLAN.md`
- `.planning/phases/04-install-smoke-and-handoff/04-02-SUMMARY.md`
- `.planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md`
- `.planning/phases/04-install-smoke-and-handoff/04-DISCUSSION-LOG.md`
- `.planning/phases/04-install-smoke-and-handoff/04-RESEARCH.md`
- `.planning/phases/04-install-smoke-and-handoff/04-REVIEW-FIX.md`
- `.planning/phases/04-install-smoke-and-handoff/04-REVIEW.md`
- `.planning/phases/04-install-smoke-and-handoff/04-UAT.md`
- `.planning/phases/04-install-smoke-and-handoff/04-VERIFICATION.md`
- `.planning/phases/04-install-smoke-and-handoff/evidence/00-codex-version.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/01-native-marketplace-add.json`
- `.planning/phases/04-install-smoke-and-handoff/evidence/02-native-marketplace-list.json`
- `.planning/phases/04-install-smoke-and-handoff/evidence/03-native-plugin-list-available.json`
- `.planning/phases/04-install-smoke-and-handoff/evidence/04-native-plugin-add.json`
- `.planning/phases/04-install-smoke-and-handoff/evidence/05-npx-compat-discovery.json`
- `.planning/phases/04-install-smoke-and-handoff/evidence/05-npx-compat-install.exitcode`
- `.planning/phases/04-install-smoke-and-handoff/evidence/05-npx-compat-install.stderr.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/05-npx-compat-install.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/05-npx-package-audit.json`
- `.planning/phases/04-install-smoke-and-handoff/evidence/06-native-smoke-assertions.json`
- `.planning/phases/04-install-smoke-and-handoff/evidence/07-validator-and-json-checks.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/08-final-handoff.md`
- `.planning/phases/04-install-smoke-and-handoff/evidence/08-milestone-files.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/08-phase-4-uncommitted-files.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/08-skills-files.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/08-working-tree-status.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/09-native-smoke-env.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/10-compat-smoke-env.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/11-install-smoke-assertions.json`
- `.planning/phases/04-install-smoke-and-handoff/evidence/12-secret-scan.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/13-cleanup-verification.txt`

## Phase Complete Closeout State
- `.planning/ROADMAP.md` records Phase 4 as complete in the milestone roadmap.
- `.planning/STATE.md` records status `completed`, total plans completed `8`, and Phase 04 plan count `2`.
- `04-UAT.md` records PASS and accepts the maintainer closeout workflow.
- `04-VERIFICATION.md` records status `passed` and score `6/6 must-haves verified`.

## remaining non-Codex follow-up
- v2 distribution-wide validator for Claude-compatible hosts, CodeBuddy, Gemini, Qwen, OpenClaw, marketplaces, and command-route parity.
- CI or documented local command that runs the full distribution validation set.
- Non-Codex screenshot/GIF refresh after host UI copy changes.
- Post-publication remote smoke for `codex plugin marketplace add labring/sealos-skills` after candidate commits are published upstream.

## Final Recommendation
Final status: milestone ready to close. Phase 4 native install evidence, compatibility discovery evidence, review closure, UAT, verification, phase.complete state, cleanup proof, secret scan, and handoff file lists are aligned for final repository handoff.
