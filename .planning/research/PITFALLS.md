# Domain Pitfalls

**Domain:** Codex plugin installation docs and metadata upgrade
**Researched:** 2026-06-15
**Confidence:** HIGH for repository-local risks, MEDIUM for Codex marketplace CLI behavior because the ecosystem is new and may keep changing.

## Critical Pitfalls

### Pitfall 1: Install command drift
**What goes wrong:** README install instructions move to Codex-native marketplace commands, while `distribution/platforms.json` and local validator expectations still advertise `npx plugins add https://github.com/labring/sealos-skills --target codex`.

**Warning signs:**
- `README.md` says `codex plugin marketplace add labring/sealos-skills`, but `distribution/platforms.json` `platforms[].id == "codex"` keeps the old `install` value.
- `README.md` gives a `codex plugin add ...` plugin target that does not match `.codex-plugin/plugin.json` `name`.
- The docs use a multi-plugin reference shape from `/tmp/pm-skills-ref/README.md` even though Sealos has one plugin named `sealos`.
- `scripts/validate-codex-plugin.py` passes while install commands in README and platform registry disagree.

**Why it happens:** The reference repo has a marketplace plus multiple plugin installs (`pm-toolkit@pm-skills`, etc.). Sealos has one Codex plugin identity and an existing compatibility installer path.

**Consequences:** Users follow a command that installs the wrong thing, installs from the wrong source, or leaves Codex unable to find the plugin. Roadmap work can look complete because static JSON validation still passes.

**Prevention:**
- Phase 1 should define the exact canonical Codex install sequence before editing copy:
  - `codex plugin marketplace add labring/sealos-skills`
  - `codex plugin add sealos@sealos`
- Phase 1 should keep `npx plugins add https://github.com/labring/sealos-skills --target codex` as the compatibility/local installer path and label it clearly.
- Phase 2 should update `README.md` and `distribution/platforms.json` together.
- Phase 3 should extend `scripts/validate-codex-plugin.py` to compare the Codex install command text in `README.md` against the platform registry, or add a small README command assertion.

**Phase to address:** Phase 1 install contract, Phase 2 doc/metadata alignment, Phase 3 validation.

### Pitfall 2: Marketplace-name drift
**What goes wrong:** The marketplace source name, plugin name, display name, and install target diverge across `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `distribution/platforms.json`, and `README.md`.

**Warning signs:**
- README uses `sealos-skills`, `sealos`, `Sealos`, and `labring/sealos-skills` as interchangeable install identifiers without explaining which is repo source, marketplace name, plugin id, and display name.
- README proposes `codex plugin add sealos@sealos-skills`, while `.agents/plugins/marketplace.json` is named `sealos`.
- `.codex-plugin/plugin.json` `name` remains `sealos`, but examples instruct users to invoke `$sealos-skills`.
- The Codex App selection copy says `Sealos Skills` while the manifest display name is `Sealos`.

**Why it happens:** Plugin distribution has four naming layers: GitHub repo (`labring/sealos-skills`), marketplace name (`sealos` in `.agents/plugins/marketplace.json`), plugin id (`sealos` in `.codex-plugin/plugin.json`), and display label (`Sealos`).

**Consequences:** Users can add a marketplace successfully, then fail at plugin install or look for the wrong UI label. Future maintainers may rename one surface and accidentally fork the public identity.

**Prevention:**
- Phase 1 should create a naming table in the roadmap or implementation notes:
  - Repo source: `labring/sealos-skills`
  - Marketplace id: `sealos`
  - Plugin id: `sealos`
  - Codex App label: `Sealos`
  - Codex CLI explicit mention: `@sealos` or direct natural-language request after install
- Phase 2 should use those labels consistently in `README.md`.
- Phase 3 should add validator assertions that `.agents/plugins/marketplace.json` `name`, `.agents/plugins/marketplace.json` `plugins[0].name`, `.codex-plugin/plugin.json` `name`, and `distribution/platforms.json` Codex install/invoke fields remain aligned.

**Phase to address:** Phase 1 naming contract, Phase 2 documentation, Phase 3 validator hardening.

### Pitfall 3: Overclaiming Codex command support
**What goes wrong:** Docs imply Codex exposes Claude-style slash commands or a guaranteed `$sealos` command, while current Codex plugin docs emphasize installing plugins, starting a new thread, asking Codex to use the plugin, and using `@` to choose a plugin or bundled skill.

**Warning signs:**
- README says Codex users should run `/sealos`.
- README treats `$sealos` as equivalent to a slash command with fixed command routing.
- `distribution/platforms.json` `commands` stays `"supported"` without a precise definition of support.
- `.codex-plugin/plugin.json` `longDescription` says the plugin is invoked as `$sealos in Codex or /sealos in Claude Code-compatible hosts`, while official Codex docs describe `@` plugin selection.
- Copy from `/tmp/pm-skills-ref/README.md` warning that "Codex plugins don't expose commands" is ignored.

**Consequences:** Codex users expect command semantics that belong to Claude-compatible hosts or `skills.sh`. Support issues look like runtime bugs even though the failure is a documentation claim.

**Prevention:**
- Phase 1 should choose precise Codex wording: "After install, ask Codex to use Sealos or type `@sealos` to choose the plugin/skill explicitly."
- Phase 2 should reserve `/sealos` for Claude-compatible hosts and `/sealos-deploy`, `/sealos-database`, `/sealos-s3` for direct `skills.sh` sections, matching `marketplaces/README.md`.
- Phase 2 should update `distribution/platforms.json` `commands` for Codex to a more precise value if the current `"supported"` label means plugin/skill invocation rather than slash-command routing.
- Phase 3 should add a validator check that README Codex sections do not contain `/sealos` or direct `skills.sh` command examples.

**Phase to address:** Phase 1 semantics decision, Phase 2 copy cleanup, Phase 3 command-claim validation.

### Pitfall 4: README/manifest mismatch
**What goes wrong:** The README advertises metadata, prompts, capabilities, screenshots, install flow, or asset names that differ from `.codex-plugin/plugin.json` and `.agents/plugins/marketplace.json`.

**Warning signs:**
- README says the plugin asks for Sealos auth during install, while `.agents/plugins/marketplace.json` uses `"authentication": "ON_INSTALL"` without a tested auth connector flow.
- README mentions screenshots or app UI assets that are absent from `.codex-plugin/plugin.json` `interface.screenshots`.
- README examples emphasize database or canvas prompts, while `.codex-plugin/plugin.json` `interface.defaultPrompt` omits them or exceeds the validator limit of 3.
- README links to `./assets/codex-sealos.png`, while Codex manifest assets only validate `./assets/logo.svg`.
- README says the plugin category or capabilities differ from `Coding`, `Interactive`, `Read`, `Write`.

**Consequences:** Codex App display, CLI metadata, docs, and local marketplace testing disagree. Users see one product in docs and another in the plugin browser.

**Prevention:**
- Phase 2 should update README and manifest metadata as one unit when display copy changes.
- Phase 3 should extend `scripts/validate-codex-plugin.py` to validate README-referenced assets and key README claims:
  - Codex plugin name/display name
  - canonical install commands
  - invocation wording
  - manifest asset paths
  - platform registry support claim
- Phase 3 should run:
  - `python3 scripts/validate-codex-plugin.py`
  - `python3 -m json.tool .codex-plugin/plugin.json >/dev/null`
  - `python3 -m json.tool .agents/plugins/marketplace.json >/dev/null`
  - `python3 -m json.tool distribution/platforms.json >/dev/null`

**Phase to address:** Phase 2 synchronized docs/metadata edit, Phase 3 validation.

### Pitfall 5: Validator blind spots create false confidence
**What goes wrong:** `scripts/validate-codex-plugin.py` confirms the current Codex manifest shape, but misses README drift, install-command drift, Codex-vs-Claude invocation drift, and non-Codex distribution drift.

**Warning signs:**
- Validator passes after README changes without reading `README.md`.
- Validator asserts `commands == "supported"` for Codex but does not check what that means in README.
- Validator checks only `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, and `distribution/platforms.json`; it does not check `marketplaces/README.md`, `commands/sealos.md`, `.claude-plugin/plugin.json`, or `marketplace.json`.
- Validation output says "passed" while `README.md` still advertises old `npx plugins` as the primary install path.

**Consequences:** Roadmap phases ship a polished README that contradicts manifests. Later maintainers trust the validator and propagate the mismatch to additional marketplace files.

**Prevention:**
- Phase 3 should add README-aware checks for exact command snippets and forbidden command placement.
- Phase 3 should add a small distribution parity section that checks every advertised Codex path exists and every Codex install command matches the registry.
- Phase 4 should add broader distribution validation only after the Codex upgrade lands, because this milestone's blast radius is Codex-first.
- The roadmap should treat "validator passed" as necessary, then require a manual command matrix review before merge.

**Phase to address:** Phase 3 validator hardening, Phase 4 distribution-wide follow-up.

## Moderate Pitfalls

### Pitfall 6: Copying the reference repo too literally
**What goes wrong:** The Sealos README copies the `pm-skills` pattern for installing many plugins from one marketplace, even though Sealos exposes one plugin that bundles all skills.

**Warning signs:**
- README contains several `codex plugin add ...` lines for `sealos-deploy`, `sealos-database`, `sealos-s3`, or `sealos-canvas`.
- README calls individual skills "plugins."
- The install section tells users to cherry-pick skills from the marketplace.

**Prevention:** Phase 1 should translate the reference pattern into a one-plugin Sealos model. Phase 2 should keep individual skills listed under "Included Skills" and keep installation as one plugin add.

**Phase to address:** Phase 1 reference adaptation, Phase 2 README edit.

### Pitfall 7: Compatibility path demoted into obscurity
**What goes wrong:** Moving the primary path to Codex-native marketplace commands hides the existing `npx plugins add ... --target codex` path that is still useful for local testing and cross-host compatibility.

**Warning signs:**
- `npx plugins add` disappears from `README.md`.
- `distribution/platforms.json` still lists only `npx plugins`, while README lists only native Codex commands.
- Contributor docs lose the fastest local smoke path for plugin install.

**Prevention:** Phase 2 should keep a short "Compatibility/local install" subsection. Phase 3 should verify both native and compatibility commands are documented with distinct purposes.

**Phase to address:** Phase 2 install documentation, Phase 3 doc validation.

### Pitfall 8: Support claim dates and evidence become stale
**What goes wrong:** `distribution/platforms.json` keeps `lastVerified` and `evidence` from May 2026 after a June 2026 install-flow change.

**Warning signs:**
- `lastUpdated` remains `2026-05-28` after this milestone.
- Codex `lastVerified` remains `2026-05-21`.
- Evidence still says `npx plugins discover . --remote + codex_manifest+repo_marketplace` with no native Codex marketplace check.

**Prevention:** Phase 3 should update `lastUpdated`, Codex `lastVerified`, and evidence text after validation. Use the actual validation command names and keep claims proportional to what was tested.

**Phase to address:** Phase 3 validation and registry update.

### Pitfall 9: Gitignored marketplace files vanish from commits
**What goes wrong:** `.agents/` is commonly ignored, and `.agents/plugins/marketplace.json` may be left unstaged even after metadata changes.

**Warning signs:**
- `git status --ignored` shows `.agents/plugins/marketplace.json` ignored or unstaged.
- README references a marketplace entry change that is absent from the diff.
- Validator passes locally because the file exists in the working tree, then CI or reviewer checkout lacks the intended update.

**Prevention:** Phase 3 should include `git status --short --ignored .agents/plugins/marketplace.json` in verification notes and use `git add -f .agents/plugins/marketplace.json` when staging is required by the orchestrator.

**Phase to address:** Phase 3 verification, final handoff.

## Minor Pitfalls

### Pitfall 10: Codex App UI copy ages quickly
**What goes wrong:** README gives exact button labels and UI path for Codex App; official UI labels may change.

**Warning signs:**
- README over-specifies lower-left button position and exact modal labels.
- Screenshot `assets/codex-sealos.png` becomes visually outdated.

**Prevention:** Phase 2 should keep UI copy outcome-oriented: "open Plugins, search/select Sealos, then start a new thread." Keep screenshots helpful but secondary to commands.

**Phase to address:** Phase 2 README edit.

### Pitfall 11: LongDescription carries cross-host language
**What goes wrong:** `.codex-plugin/plugin.json` `interface.longDescription` mentions Claude `/sealos` invocation inside a Codex manifest.

**Warning signs:**
- Codex plugin browser text includes `/sealos`.
- README tries to explain Claude-compatible hosts inside the Codex-specific manifest paragraph.

**Prevention:** Phase 2 should make Codex manifest copy Codex-specific. Keep Claude invocation in README and Claude manifests.

**Phase to address:** Phase 2 manifest copy review.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Phase 1: Install contract | Importing the `pm-skills` multi-plugin model directly | Write the Sealos-specific identity matrix before editing docs |
| Phase 1: Invocation semantics | Treating Codex plugin use as slash-command routing | Use official Codex wording: ask Codex directly or select `@sealos` |
| Phase 2: README rewrite | Native commands, compatibility commands, and app UI copy diverge | Keep one Codex install section with native path first and compatibility path second |
| Phase 2: Metadata alignment | Manifest copy and README copy describe different product surfaces | Update README, `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, and `distribution/platforms.json` as one change set |
| Phase 3: Validation | Existing validator misses README and command-claim drift | Add README command assertions and run JSON syntax checks |
| Phase 3: Handoff | Generated files under `.agents/` are present locally but absent from the eventual commit | Check ignored/staged state for `.agents/plugins/marketplace.json` |
| Phase 4: Follow-up | Codex-specific fixes leave Claude, CodeBuddy, Gemini, Qwen, and OpenClaw claims stale | Add distribution-wide parity validation in a separate follow-up |

## Roadmap Prevention Strategy

1. **Phase 1: Contract before copy.** Define canonical Sealos marketplace identity, install commands, invocation semantics, and support-claim vocabulary. Use `/tmp/pm-skills-ref/README.md` as a pattern source, then adapt it to Sealos' one-plugin architecture.
2. **Phase 2: Synchronized docs and metadata.** Edit `README.md`, `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `distribution/platforms.json`, and `marketplaces/README.md` together when user-facing Codex wording changes.
3. **Phase 3: Validation that reads docs.** Extend `scripts/validate-codex-plugin.py` or add a focused check so README install commands, invocation wording, registry claims, and manifest identity are tested together.
4. **Phase 4: Distribution parity follow-up.** After Codex install docs are correct, add a broader validator for `.claude-plugin/plugin.json`, `marketplace.json`, `.claude-plugin/marketplace.json`, `.codebuddy-plugin/marketplace.json`, `gemini-extension.json`, `qwen-extension.json`, `openclaw.plugin.json`, and `commands/sealos.md`.

## Sources

- `README.md`
- `.planning/PROJECT.md`
- `.planning/codebase/CONCERNS.md`
- `.planning/codebase/TESTING.md`
- `.codex-plugin/plugin.json`
- `.agents/plugins/marketplace.json`
- `distribution/platforms.json`
- `scripts/validate-codex-plugin.py`
- `marketplaces/README.md`
- `/tmp/pm-skills-ref/README.md`
- OpenAI Codex plugins docs: https://developers.openai.com/codex/plugins
- OpenAI Codex build plugins docs: https://developers.openai.com/codex/plugins/build
