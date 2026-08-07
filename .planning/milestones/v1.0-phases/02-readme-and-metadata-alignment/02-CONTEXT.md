# Phase 2: README and Metadata Alignment - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase aligns the public Codex install story and Codex-facing metadata after Phase 1 proved native marketplace discovery and installation. The deliverable is documentation and metadata clarity: README Codex Quick Start, compatibility/local install wording, installed capability copy, invocation surfaces, Codex App selection guidance, and `distribution/platforms.json` Codex support/evidence fields.

Runtime skill behavior under `skills/**` stays stable. Claude-compatible `/sealos` examples stay in Claude-specific sections. Direct `/sealos-deploy`, `/sealos-database`, and `/sealos-s3` examples stay in direct `skills.sh` sections.

</domain>

<decisions>
## Implementation Decisions

### Native Codex Install Story
- **D-01:** Make native Codex marketplace installation the primary Codex Quick Start path.
- **D-02:** The Codex Quick Start command order is fixed:
  1. `codex plugin marketplace add labring/sealos-skills`
  2. `codex plugin add sealos@sealos`
- **D-03:** Present `npx plugins add https://github.com/labring/sealos-skills --target codex` as the compatibility or local install path, not the primary Codex path.
- **D-04:** Keep the README intro consistent with this priority by describing the recommended Codex path as native Codex plugin installation, while preserving the repo's cross-host plugin and `skills.sh` compatibility.

### Installed Capability Contract
- **D-05:** README must make clear that one Sealos plugin installs deploy, database, S3, canvas, app-builder, and supporting cloud-native skills.
- **D-06:** Capability wording should map to existing root skill source: `sealos-deploy`, `sealos-database`, `sealos-s3`, `sealos-canvas`, `sealos-app-builder`, `cloud-native-readiness`, `dockerfile-skill`, and `docker-to-sealos`.
- **D-07:** Do not create or imply a second packaged skill copy; root `skills/**` remains canonical for every host.

### Invocation Surfaces
- **D-08:** Codex examples use `$sealos` and Codex App selection guidance.
- **D-09:** Claude-compatible `/sealos` examples remain in Claude-specific sections.
- **D-10:** Direct `/sealos-deploy`, `/sealos-database`, `/sealos-s3`, and `/sealos-canvas` examples remain in the direct `skills.sh` section.
- **D-11:** Codex App guidance and the existing `assets/codex-sealos.png` screenshot should stay close to the Codex install and invocation guidance.

### Metadata Alignment
- **D-12:** `distribution/platforms.json` Codex entry should record the native install path as primary and the `npx plugins` command as an alternate or compatibility install path.
- **D-13:** `distribution/platforms.json` Codex evidence should point to Phase 1 native marketplace evidence, including isolated marketplace add/list/install and payload assertions.
- **D-14:** Codex identity fields must remain aligned across README and metadata: repository `labring/sealos-skills`, marketplace id `sealos`, plugin id `sealos`, install identity `sealos@sealos`, display label `Sealos`.
- **D-15:** `.agents/plugins/marketplace.json` Phase 1 truth is locked: `source.path` is `./plugins/sealos`, and `plugins/sealos` is a symlink to the repository root.
- **D-16:** `.codex-plugin/plugin.json` remains the Codex manifest with `skills: "./skills/"`. Phase 2 may adjust copy only when it directly supports README/metadata alignment.

### Scope Control
- **D-17:** Avoid editing runtime `skills/**` in Phase 2 unless a planning artifact proves a required README/metadata claim cannot be made accurately without a skill change.
- **D-18:** Preserve non-Codex metadata unless Codex wording creates a direct inconsistency. Claude, CodeBuddy, OpenClaw, Gemini, Qwen, and generic repo importer changes belong outside this phase unless they are required to keep examples separated.
- **D-19:** Phase 3 owns validator hardening. Phase 2 should still leave the documentation and metadata in a shape that Phase 3 can validate.

### the agent's Discretion
- The user authorized autonomous choices for normal interaction decisions. The recommended shortest path is to update README and `distribution/platforms.json` only, then run existing metadata validation and JSON syntax checks during implementation.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap and Requirements
- `.planning/ROADMAP.md` — Phase 2 goal, success criteria, phase dependencies, and requirement mapping.
- `.planning/REQUIREMENTS.md` — DOCS-01 through DOCS-06 and META-01, META-02, META-04 acceptance requirements.
- `.planning/STATE.md` — Current milestone state and accumulated decisions. Treat the Phase 1 `source.path: ./` note as superseded by Phase 1 handoff evidence.

### Phase 1 Truths
- `.planning/phases/01-native-marketplace-discovery-contract/01-VERIFICATION.md` — Passed verification for native marketplace discovery, install, payload completeness, and single skill source.
- `.planning/phases/01-native-marketplace-discovery-contract/01-UAT.md` — UAT acceptance checks confirming `sealos@sealos` native install and installed payload completeness.
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/08-phase-1-handoff.md` — Final locked contract for Phase 2: `source.path: "./plugins/sealos"`, `plugins/sealos -> ..`, root payload, native command pair, and invocation-surface guidance.

### User-Facing Documentation
- `README.md` — Primary file to align. Current gap: Codex Quick Start leads with `npx plugins add ... --target codex`; Claude examples sit near Codex examples; Codex native marketplace commands are absent.
- `assets/codex-sealos.png` — Existing Codex App screenshot referenced by README and should remain near Codex App selection guidance.
- `marketplaces/README.md` — Maintainer rules: `$sealos` for Codex, `/sealos` for Claude-compatible hosts, direct `/sealos-deploy` only in `skills.sh` usage sections.

### Codex Metadata
- `distribution/platforms.json` — Codex platform support registry. Current gap: Codex `install` still uses the compatibility `npx plugins` path, evidence predates Phase 1, and `lastVerified` is stale.
- `.agents/plugins/marketplace.json` — Native Codex marketplace entry. Locked Phase 1 source path is `./plugins/sealos`.
- `.codex-plugin/plugin.json` — Codex plugin manifest with `name: "sealos"`, display label `Sealos`, `skills: "./skills/"`, and interface copy.
- `plugin.json` — Root native discovery manifest added in Phase 1; key fields mirror `.codex-plugin/plugin.json`.

### Cross-Host Metadata
- `marketplace.json` — Claude-compatible root marketplace entry. Read to preserve non-Codex examples and skill lists.
- `.claude-plugin/marketplace.json` — Claude marketplace mirror. Read to preserve Claude-specific `/sealos` surface.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `README.md`: already has a Quick Start, "Other supported AI tools" table, `skills.sh` section, screenshot placement, "Why Use the Plugin", and "Included Skills"; Phase 2 can reorganize and rewrite rather than add a new documentation structure.
- `assets/codex-sealos.png`: existing Codex App screenshot already referenced in README; keep it near Codex-specific instructions.
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/*`: native smoke evidence can back `distribution/platforms.json` Codex evidence text.

### Established Patterns
- Markdown files use short sections, concise operational copy, and fenced command blocks.
- JSON files use two-space formatting.
- Distribution support claims live in `distribution/platforms.json`; maintainer rules live in `marketplaces/README.md`.
- Root `skills/**` is the single source for skills across Codex, Claude-compatible hosts, `skills.sh`, and context-only extensions.

### Integration Points
- README Codex Quick Start must coordinate with `distribution/platforms.json` Codex `install`, alternate install, invocation, evidence, and verification date fields.
- `.agents/plugins/marketplace.json` must stay at `source.path: "./plugins/sealos"`.
- `.codex-plugin/plugin.json` and root `plugin.json` should stay aligned for plugin identity and source path claims.
- Existing validation command is `python3 scripts/validate-codex-plugin.py`; Phase 3 will extend it to make README drift fail loudly.

</code_context>

<specifics>
## Specific Ideas

- Recommended shortest path: edit README and `distribution/platforms.json`; only touch `.codex-plugin/plugin.json` if its copy conflicts with the final README contract.
- README Codex Quick Start should lead with the native commands, then include a clearly labeled compatibility/local path:

```bash
codex plugin marketplace add labring/sealos-skills
codex plugin add sealos@sealos
```

```bash
npx plugins add https://github.com/labring/sealos-skills --target codex
```

- Codex App selection guidance should sit beside the screenshot and use direct wording: select **Sealos** from **Plugins**, then ask Codex to use Sealos for the task.
- Claude `/sealos` examples should appear under Claude Code support or the supported-tools table, away from the Codex Quick Start examples.

</specifics>

<deferred>
## Deferred Ideas

- Phase 3: add validator checks for README native Codex install commands, README fallback command, identity parity, and JSON syntax coverage.
- Phase 4: capture fresh native and compatibility install smoke evidence after docs and validator alignment.
- v2: distribution-wide validator for all non-Codex hosts.
- v2: CI or documented local command that runs all distribution validators.
- v2: non-Codex screenshot or GIF refresh.

</deferred>

---

*Phase: 2-README and Metadata Alignment*
*Context gathered: 2026-06-15*
