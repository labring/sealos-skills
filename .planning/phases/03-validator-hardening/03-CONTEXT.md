# Phase 3: Validator Hardening - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 turns the Phase 2 README and Codex metadata contract into an executable maintainer validation gate. The deliverable is stronger validation that fails when native Codex install commands, fallback `npx plugins` install copy, plugin identity, marketplace identity, platform registry fields, or JSON syntax drift from the locked contract.

Runtime skill behavior stays stable. Phase 4 owns fresh native and compatibility install smoke evidence.

</domain>

<decisions>
## Implementation Decisions

### First-Principles Success Criteria
- **D-01:** Treat `scripts/validate-codex-plugin.py` as the maintainer-facing distribution gate for this phase.
- **D-02:** A passing Phase 3 validator run should mean the README, Codex manifest, root discovery manifest, Codex marketplace entry, root marketplace entry, and platform registry all agree on the Codex install contract.
- **D-03:** The goal is drift detection. The validator should fail loudly when a maintainer changes a command, plugin id, repository id, display label, source path, or JSON file shape in a way that breaks the Phase 2 contract.

### Locked Codex Contract
- **D-04:** Canonical repository shorthand is `labring/sealos-skills`; canonical repository URL is `https://github.com/labring/sealos-skills`.
- **D-05:** Canonical marketplace id is `sealos`, plugin id/name is `sealos`, install selector is `sealos@sealos`, and display label is `Sealos`.
- **D-06:** Canonical native README command order is:

```bash
codex plugin marketplace add labring/sealos-skills
codex plugin add sealos@sealos
```

- **D-07:** Canonical fallback/local Codex command is:

```bash
npx plugins add https://github.com/labring/sealos-skills --target codex
```

- **D-08:** `.codex-plugin/plugin.json` and root `plugin.json` keep key-field parity and `skills: "./skills/"`.
- **D-09:** `.agents/plugins/marketplace.json` keeps one plugin entry named `sealos` with `source.path: "./plugins/sealos"`; `plugins/sealos` remains the repository-root symlink source.
- **D-10:** `distribution/platforms.json` Codex entry keeps native install as primary, `alternateInstall` as the fallback command, `$sealos` / Codex App selection as invocation copy, and Phase 1 evidence wording.

### Validator Gap Resolution
- **D-11:** Extend the existing Python validator rather than adding a separate Phase 3 script.
- **D-12:** README checks should validate exact command presence and native command ordering. This covers VAL-01 and VAL-02 directly.
- **D-13:** Identity parity checks should compare README text, `.codex-plugin/plugin.json`, root `plugin.json`, `.agents/plugins/marketplace.json`, `marketplace.json`, and `distribution/platforms.json` against the locked canonical values. This covers VAL-03.
- **D-14:** JSON syntax coverage should be part of the maintainer validation path for the relevant plugin, marketplace, and platform registry files. The minimum Phase 3 set is `.codex-plugin/plugin.json`, root `plugin.json`, `.agents/plugins/marketplace.json`, `marketplace.json`, and `distribution/platforms.json`.
- **D-15:** Keep the validation surface Codex-focused. Distribution-wide parity for Claude, CodeBuddy, Gemini, Qwen, OpenClaw, and every command route remains v2 scope.

### Verification Expectations
- **D-16:** Phase 3 verification should run `python3 scripts/validate-codex-plugin.py` and explicit JSON syntax checks for every touched plugin, marketplace, and platform registry JSON file.
- **D-17:** Planning should include at least one drift-failure proof for each VAL requirement category where practical: README native command, fallback command, identity parity, and JSON syntax.
- **D-18:** Source changes in Phase 3 should stay limited to validation and any directly related validation documentation. Runtime skill files under `skills/**` remain untouched.

### the agent's Discretion
- The planner may decide whether JSON syntax checks are enforced solely through `load_json()` calls inside `scripts/validate-codex-plugin.py` or through explicit helper checks plus the existing parser behavior, as long as maintainers get one clear failing command.
- The executor may factor canonical values into constants inside `scripts/validate-codex-plugin.py` if that keeps future command and identity checks readable.
- The executor may keep explicit `python3 -m json.tool` commands in verification evidence even when the validator already parses those files.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap and Requirements
- `.planning/ROADMAP.md` - Phase 3 goal, dependencies, VAL-01 through VAL-04 mapping, and success criteria.
- `.planning/REQUIREMENTS.md` - Validation requirements and v2 deferred distribution-wide validator scope.
- `.planning/STATE.md` - Current milestone state and Phase 1/2 decisions carried into Phase 3.
- `.planning/PROJECT.md` - core value, constraints, and active requirement that distribution-facing changes pass validator and JSON syntax checks.

### Prior Phase Truths
- `.planning/phases/01-native-marketplace-discovery-contract/01-CONTEXT.md` - locked marketplace id, plugin id, install selector, one-plugin model, and single skill source.
- `.planning/phases/01-native-marketplace-discovery-contract/01-VERIFICATION.md` - passed native marketplace add/list/install, installed payload, and current validator contract.
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/08-phase-1-handoff.md` - final Phase 1 handoff for `plugins/sealos -> ..`, root payload, native command pair, and validation commands.
- `.planning/phases/02-readme-and-metadata-alignment/02-CONTEXT.md` - locked README command order, fallback path, capability copy, invocation split, and metadata alignment decisions.
- `.planning/phases/02-readme-and-metadata-alignment/02-VERIFICATION.md` - exact Phase 2 checks that Phase 3 should move into the durable validator.

### Files to Validate
- `scripts/validate-codex-plugin.py` - existing Codex plugin validation entrypoint and Phase 3 implementation target.
- `README.md` - user-facing native install commands, fallback command, one-plugin capability copy, and invocation guidance.
- `.codex-plugin/plugin.json` - Codex plugin manifest with identity, display label, assets, capabilities, and `skills: "./skills/"`.
- `plugin.json` - root Codex discovery manifest that mirrors key Codex manifest fields.
- `.agents/plugins/marketplace.json` - local Codex marketplace entry for `sealos@sealos` discovery.
- `marketplace.json` - root marketplace metadata surface exposing plugin `sealos`.
- `distribution/platforms.json` - platform registry with Codex install, alternate install, invocation, evidence, and verification date.

### Codebase Maps
- `.planning/codebase/TESTING.md` - repository validation and Python test conventions.
- `.planning/codebase/CONVENTIONS.md` - Python validator style, JSON formatting, and validation command guidance.
- `.planning/codebase/STRUCTURE.md` - distribution metadata file locations and where to add validation rules.
- `.planning/codebase/CONCERNS.md` - distribution metadata duplication and validator coverage risks.
- `.planning/codebase/ARCHITECTURE.md` - distribution layer, validator responsibility, and single root `skills/**` source constraint.
- `.planning/codebase/STACK.md` - Python 3 validation runtime and JSON metadata surfaces.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/validate-codex-plugin.py`: already has `load_json()`, `require()`, `require_manifest_parity()`, symlink checks, payload checks, manifest identity checks, marketplace checks, and Codex platform registry checks.
- `README.md`: Phase 2 already contains the exact native command pair, fallback command, one-plugin capability copy, `$sealos` usage, and Codex App selection guidance.
- `distribution/platforms.json`: Codex entry already records native install, `alternateInstall`, invocation, Phase 1 evidence, and `lastVerified: "2026-06-15"`.
- `.codex-plugin/plugin.json` and `plugin.json`: both already carry matching `name: "sealos"`, repository URL, display label, and `skills: "./skills/"`.
- `.agents/plugins/marketplace.json`: already exposes one local Codex marketplace plugin named `sealos` from `./plugins/sealos`.
- `marketplace.json`: already exposes the root marketplace plugin named `sealos` with repository metadata and root skill paths.

### Established Patterns
- Repository-level validation is script-driven through `python3 scripts/validate-codex-plugin.py`.
- Python validation scripts print `PASS:` / `FAIL:` messages and exit non-zero on failure.
- JSON files use readable two-space formatting.
- Root `skills/**` is the single canonical skill source across Codex, Claude-compatible hosts, `skills.sh`, and context-only hosts.

### Integration Points
- Phase 3 should move the Phase 2 one-off README and registry assertions into `scripts/validate-codex-plugin.py`.
- README's validation section currently lists `python3 scripts/validate-codex-plugin.py` plus JSON syntax checks for `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, and `distribution/platforms.json`; Phase 3 may need to align that documented command set with the hardened validator scope.
- The validator already parses `.codex-plugin/plugin.json`, root `plugin.json`, `.agents/plugins/marketplace.json`, and `distribution/platforms.json`; adding `README.md` and `marketplace.json` checks fits the existing ownership boundary.

</code_context>

<specifics>
## Specific Ideas

- Simplest viable implementation path:
  1. Add canonical constants for repository id, repository URL, plugin id, display label, native commands, and fallback command.
  2. Load README text and root `marketplace.json` in the existing validator.
  3. Add README exact command and order checks.
  4. Add identity parity checks across README, both plugin manifests, both marketplace surfaces, and the Codex platform registry.
  5. Ensure every relevant JSON file is parsed by the validation command, then verify with explicit `python3 -m json.tool` commands for touched JSON files.
- The implementation should preserve the current concise PASS/FAIL output style so maintainers can see the exact drift source.
- Phase 3 can reuse Phase 2 verification assertions as the checklist for durable validator checks.

</specifics>

<deferred>
## Deferred Ideas

- Phase 4: capture fresh native Codex marketplace add/list/install evidence and compatibility install evidence after validator hardening.
- v2: add a distribution-wide validator for Claude, CodeBuddy, Gemini, Qwen, OpenClaw, marketplace, and command-route parity.
- v2: add CI or a documented top-level validation command that runs every distribution validator.

</deferred>

---

*Phase: 3-Validator Hardening*
*Context gathered: 2026-06-15*
