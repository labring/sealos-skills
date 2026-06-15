# Phase 04 Install Smoke Final Handoff

- milestone_base: `9ee2d3ac269b4d5b1c81ba43be979c0c7cdac03b`
- milestone_base_source: `git merge-base HEAD upstream/main`
- HAND-01: native Codex smoke evidence passed.
- HAND-02: compatibility evidence status `discovery_evidence`; exact command `npx plugins add https://github.com/labring/sealos-skills --target codex`.
- HAND-03: git-truth changed-file handoff, cleanup proof, validation transcript, and secret scan are recorded.
- Downstream closeout artifacts: `04-VERIFICATION.md` and `04-UAT.md` must cite this evidence set.

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

## Validator and Final Evidence
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

### planning/evidence
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
- `.planning/phases/04-install-smoke-and-handoff/04-01-PLAN.md`
- `.planning/phases/04-install-smoke-and-handoff/04-01-SUMMARY.md`
- `.planning/phases/04-install-smoke-and-handoff/04-02-PLAN.md`
- `.planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md`
- `.planning/phases/04-install-smoke-and-handoff/04-DISCUSSION-LOG.md`
- `.planning/phases/04-install-smoke-and-handoff/04-RESEARCH.md`
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
- `.planning/phases/04-install-smoke-and-handoff/evidence/09-native-smoke-env.txt`
- `.planning/phases/04-install-smoke-and-handoff/evidence/10-compat-smoke-env.txt`
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
- none

## Current Working Tree Status
```
?? .planning/phases/04-install-smoke-and-handoff/evidence/07-validator-and-json-checks.txt
?? .planning/phases/04-install-smoke-and-handoff/evidence/08-milestone-files.txt
```

## Phase 4 Uncommitted Files at Handoff Generation
- none

## remaining non-Codex distribution follow-up
- v2 distribution-wide validator for Claude-compatible hosts, CodeBuddy, Gemini, Qwen, OpenClaw, marketplaces, and command-route parity.
- CI or documented local command that runs the full distribution validation set.
- Non-Codex screenshot/GIF refresh after host UI copy changes.
- Post-publication remote smoke for `codex plugin marketplace add labring/sealos-skills` after candidate commits are published upstream.
