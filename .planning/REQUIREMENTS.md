# Requirements: Sealos Codex Plugin Installation Upgrade

**Defined:** 2026-06-15  
**Core Value:** Codex users can discover, install, and invoke the Sealos plugin through the most native Codex plugin flow, with README instructions and plugin metadata that match the actual repository layout.

## v1 Requirements

### Discovery

- [x] **DISC-01**: Maintainer can add this repository as a Codex marketplace in an isolated Codex home.
- [x] **DISC-02**: Maintainer can list `sealos@sealos` through `codex plugin list --available --json` after adding the marketplace.
- [x] **DISC-03**: Maintainer can install `sealos@sealos` through `codex plugin add sealos@sealos --json` in an isolated Codex home.

### Documentation

- [x] **DOCS-01**: Codex Quick Start leads with `codex plugin marketplace add labring/sealos-skills`.
- [x] **DOCS-02**: Codex Quick Start installs the plugin with `codex plugin add sealos@sealos`.
- [x] **DOCS-03**: README explains that one Sealos plugin installs deploy, database, S3, canvas, app-builder, and supporting cloud-native skills.
- [x] **DOCS-04**: README keeps `npx plugins add https://github.com/labring/sealos-skills --target codex` as a compatibility or local install path.
- [x] **DOCS-05**: README uses Codex-specific invocation wording and keeps Claude-compatible `/sealos` examples in Claude-specific sections.
- [x] **DOCS-06**: README keeps Codex App selection guidance and the existing Sealos plugin screenshot close to the Codex install path.

### Metadata

- [x] **META-01**: Codex-facing metadata consistently uses repo source `labring/sealos-skills`, marketplace id `sealos`, plugin id `sealos`, and display label `Sealos`.
- [x] **META-02**: `.codex-plugin/plugin.json` remains aligned with README Codex plugin identity, display copy, asset paths, and root `./skills/` source.
- [x] **META-03**: `marketplace.json`, `.claude-plugin/marketplace.json`, and `.agents/plugins/marketplace.json` expose the installable Sealos plugin without duplicating `skills/**`.
- [x] **META-04**: `distribution/platforms.json` records the verified Codex native install path, fallback install path, invocation wording, evidence, and verification date.

### Validation

- [x] **VAL-01**: `scripts/validate-codex-plugin.py` checks README native Codex install commands.
- [x] **VAL-02**: `scripts/validate-codex-plugin.py` checks README fallback `npx plugins` command.
- [x] **VAL-03**: `scripts/validate-codex-plugin.py` checks README/manifest/registry plugin identity parity.
- [x] **VAL-04**: JSON syntax checks pass for all touched plugin, marketplace, and platform registry files.

### Handoff

- [x] **HAND-01**: Final verification includes isolated Codex native marketplace add, list, and install smoke output.
- [x] **HAND-02**: Final verification includes compatibility install or discovery evidence for the `npx plugins` path.
- [x] **HAND-03**: Final handoff reports the exact files changed and any remaining non-Codex distribution follow-up.

## v2 Requirements

### Distribution

- **DIST-01**: Add a distribution-wide validator covering Claude, CodeBuddy, Gemini, Qwen, OpenClaw, marketplace, and command-route parity with root `skills/**`.
- **DIST-02**: Add CI or a documented local command that runs all distribution validators.
- **DIST-03**: Refresh non-Codex install screenshots or GIFs if host UI copy changes.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Deploy skill behavior changes | Current milestone targets installation and README distribution experience. |
| Database, S3, canvas, or app-builder workflow changes | These capabilities are installed by the plugin but their runtime behavior is stable scope. |
| Host-specific skill copies | Root `skills/**` is the canonical source and duplicate copies create drift. |
| Full non-Codex distribution migration | Claude, Gemini, Qwen, CodeBuddy, OpenClaw, and skills.sh are secondary unless Codex wording creates a direct inconsistency. |
| New product screenshots | Existing Codex App screenshot is sufficient for this milestone unless verification shows it has become misleading. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DISC-01 | Phase 1 | Complete |
| DISC-02 | Phase 1 | Complete |
| DISC-03 | Phase 1 | Complete |
| DOCS-01 | Phase 2 | Complete |
| DOCS-02 | Phase 2 | Complete |
| DOCS-03 | Phase 2 | Complete |
| DOCS-04 | Phase 2 | Complete |
| DOCS-05 | Phase 2 | Complete |
| DOCS-06 | Phase 2 | Complete |
| META-01 | Phase 2 | Complete |
| META-02 | Phase 2 | Complete |
| META-03 | Phase 1 | Complete |
| META-04 | Phase 2 | Complete |
| VAL-01 | Phase 3 | Complete |
| VAL-02 | Phase 3 | Complete |
| VAL-03 | Phase 3 | Complete |
| VAL-04 | Phase 3 | Complete |
| HAND-01 | Phase 4 | Complete |
| HAND-02 | Phase 4 | Complete |
| HAND-03 | Phase 4 | Complete |

**Coverage:**

- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-06-15*
*Last updated: 2026-06-15 after roadmap creation*
