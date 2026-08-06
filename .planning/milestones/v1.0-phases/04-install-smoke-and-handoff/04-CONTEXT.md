# Phase 4: Install Smoke and Handoff - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 closes the milestone by capturing fresh install smoke evidence after README, metadata, and validator hardening are complete. It must record isolated native Codex marketplace add/list/install evidence, compatibility `npx plugins` path evidence, the exact changed-file handoff, and any remaining non-Codex distribution follow-up.

This phase is verification and handoff work. Source implementation files stay unchanged during discussion and should only change during execution if smoke evidence proves a direct blocker in the already-scoped install contract.

</domain>

<decisions>
## Implementation Decisions

### First-Principles Success Criteria
- **D-01:** Phase 4 succeeds when a maintainer can trust the final milestone state from evidence alone: native Codex install works, the compatibility/local `npx plugins` path is still discoverable or installable, validator output is current, changed files are exact, and remaining follow-up is explicit.
- **D-02:** The phase should treat Phase 1 native smoke as historical proof and capture fresh Phase 4 evidence against the current post-Phase-3 repository state.
- **D-03:** The final handoff should focus on install/distribution surfaces. Runtime skill behavior, Sealos Cloud deployment flows, database flows, S3 flows, canvas behavior, and app-builder behavior remain out of scope.

### Native Codex Smoke Evidence
- **D-04:** Native Codex smoke evidence must run in an isolated `HOME` and `CODEX_HOME` so marketplace registration and plugin cache writes do not touch the maintainer's normal Codex state.
- **D-05:** The native smoke sequence is locked to:
  1. `codex --version`
  2. `codex plugin marketplace add "$PWD" --json`
  3. `codex plugin marketplace list --json`
  4. `codex plugin list --available --json`
  5. `codex plugin add sealos@sealos --json`
- **D-06:** Native smoke assertions must prove that the available list contains `pluginId: "sealos@sealos"` and that plugin add succeeds for marketplace `sealos`, plugin `sealos`, with an installed cache path under the isolated `CODEX_HOME`.
- **D-07:** Native smoke should also verify installed payload completeness for at least `plugin.json`, `.codex-plugin/plugin.json`, `skills/sealos-deploy/SKILL.md`, `skills/sealos-database/SKILL.md`, `skills/sealos-s3/SKILL.md`, and `assets/logo.svg`.
- **D-08:** Use the current worktree path as the marketplace source for Phase 4 pre-merge final verification. The public README command `codex plugin marketplace add labring/sealos-skills` remains the user-facing command, and remote smoke can be listed as follow-up if the remote does not yet contain the candidate commit.

Recommended native evidence shape:

```bash
PHASE_DIR=".planning/phases/04-install-smoke-and-handoff"
EVIDENCE_DIR="$PHASE_DIR/evidence"
SMOKE_HOME="$(mktemp -d)"
SMOKE_CODEX_HOME="$SMOKE_HOME/.codex"
mkdir -p "$EVIDENCE_DIR"

codex --version | tee "$EVIDENCE_DIR/00-codex-version.txt"

HOME="$SMOKE_HOME" CODEX_HOME="$SMOKE_CODEX_HOME" \
  codex plugin marketplace add "$PWD" --json \
  | tee "$EVIDENCE_DIR/01-native-marketplace-add.json"

HOME="$SMOKE_HOME" CODEX_HOME="$SMOKE_CODEX_HOME" \
  codex plugin marketplace list --json \
  | tee "$EVIDENCE_DIR/02-native-marketplace-list.json"

HOME="$SMOKE_HOME" CODEX_HOME="$SMOKE_CODEX_HOME" \
  codex plugin list --available --json \
  | tee "$EVIDENCE_DIR/03-native-plugin-list-available.json"

HOME="$SMOKE_HOME" CODEX_HOME="$SMOKE_CODEX_HOME" \
  codex plugin add sealos@sealos --json \
  | tee "$EVIDENCE_DIR/04-native-plugin-add.json"
```

### Compatibility Path Evidence
- **D-09:** HAND-02 can be satisfied by compatibility install evidence when `npx plugins add https://github.com/labring/sealos-skills --target codex` completes in an isolated environment.
- **D-10:** If the `npx plugins` compatibility command cannot be safely or deterministically installed from the candidate worktree, Phase 4 may capture discovery/help/version evidence plus README and validator proof for the exact compatibility command. The handoff must label this as compatibility discovery evidence and explain why full install was not performed.
- **D-11:** Compatibility evidence should prefer a temporary `HOME`, `CODEX_HOME`, npm cache, and plugin-related XDG directories. Avoid writing to the user's normal Codex, plugin, npm, or agent-tool state.
- **D-12:** The compatibility evidence should record the exact command, environment paths, exit code, stdout/stderr, and any installed/discovered plugin identity fields available from the tool output.

Recommended compatibility evidence shape:

```bash
PHASE_DIR=".planning/phases/04-install-smoke-and-handoff"
EVIDENCE_DIR="$PHASE_DIR/evidence"
NPX_HOME="$(mktemp -d)"
NPX_CACHE="$NPX_HOME/.npm-cache"
NPX_CODEX_HOME="$NPX_HOME/.codex"
mkdir -p "$EVIDENCE_DIR" "$NPX_CACHE" "$NPX_CODEX_HOME"

HOME="$NPX_HOME" CODEX_HOME="$NPX_CODEX_HOME" npm_config_cache="$NPX_CACHE" \
  npx plugins add https://github.com/labring/sealos-skills --target codex \
  >"$EVIDENCE_DIR/05-npx-compat-install.txt" \
  2>"$EVIDENCE_DIR/05-npx-compat-install.stderr.txt"
echo $? > "$EVIDENCE_DIR/05-npx-compat-install.exitcode"
```

### Isolation and Cleanup
- **D-13:** Each smoke path should write its temporary root path to an environment evidence file before cleanup, for example `06-smoke-env.txt`, so reviewers can confirm isolation.
- **D-14:** Cleanup should remove temporary smoke homes after evidence and assertions are captured. If preserving a temp home is needed for debugging, the evidence must say so and name the retained path.
- **D-15:** Smoke commands must avoid `git add .` and avoid staging generated caches. Evidence files under the Phase 4 directory are the only expected new files from smoke execution.
- **D-16:** The final verification should run `python3 scripts/validate-codex-plugin.py`, `python3 -m json.tool` for the five Codex metadata JSON files, `git diff -- skills --exit-code`, and focused assertions over Phase 4 evidence JSON/text.

### Final Handoff Artifact
- **D-17:** The final handoff should live under `.planning/phases/04-install-smoke-and-handoff/evidence/` or the Phase 4 summary/verification documents and must include:
  - native evidence files captured in this phase
  - compatibility evidence files captured in this phase
  - validator and JSON syntax check results
  - exact changed files for the whole milestone, grouped by source, metadata, docs, planning, and evidence
  - exact source implementation files changed during Phase 4
  - exact files under `skills/**` changed during the milestone, expected to be none for this milestone
  - remaining non-Codex distribution follow-up, expected to reference v2 distribution-wide validation, CI/documented all-distribution command, and non-Codex screenshot/GIF refresh
- **D-18:** The changed-file handoff should be generated from git truth, using commands such as `git diff --name-only <milestone-base>..HEAD`, `git status --short`, and phase summaries. If the milestone base is ambiguous, use the first milestone commit parent and state the chosen base explicitly.
- **D-19:** The handoff should distinguish committed milestone changes from uncommitted working-tree changes at the moment of handoff.

### Risks and Tradeoffs
- **D-20:** Native remote smoke against `labring/sealos-skills` can fail before the branch is published. The reliable pre-merge evidence target is the local worktree marketplace source, with remote smoke deferred until after publication if needed.
- **D-21:** Full `npx plugins` install may have host-specific side effects or network/package-manager variability. Isolated install is preferred; discovery/help/version evidence is acceptable only with a clear note when full install is blocked.
- **D-22:** Evidence files may contain absolute temporary paths. They may be committed because they prove isolation, but they must not contain tokens, kubeconfig data, auth files, npm tokens, API keys, or user secrets.

### the agent's Discretion
- The planner may choose a compact Node or Python assertion script for Phase 4 evidence checks if direct shell parsing becomes brittle.
- The executor may choose exact evidence filenames as long as the final verification and handoff map them clearly to HAND-01, HAND-02, and HAND-03.
- The executor may retain a failed-smoke temp directory only when needed for diagnosis and only if the handoff records the retained path and cleanup reason.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap and Requirements
- `.planning/ROADMAP.md` - Phase 4 goal, dependencies, HAND-01 through HAND-03 mapping, and success criteria.
- `.planning/REQUIREMENTS.md` - Handoff requirements and v2 deferred distribution scope.
- `.planning/STATE.md` - Current milestone state and accumulated decisions from Phases 1 through 3.
- `.planning/PROJECT.md` - core value, constraints, out-of-scope runtime behavior, and validation expectations.

### Prior Phase Truths
- `.planning/phases/01-native-marketplace-discovery-contract/01-CONTEXT.md` - locked native marketplace identity, isolated smoke shape, payload assertion expectations, and single skill source rule.
- `.planning/phases/01-native-marketplace-discovery-contract/01-VERIFICATION.md` - passed native marketplace add/list/install proof and installed payload completeness checks.
- `.planning/phases/01-native-marketplace-discovery-contract/01-UAT.md` - UAT acceptance proof for native discovery, install, payload completeness, and root skill source.
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/08-phase-1-handoff.md` - final Phase 1 handoff for `plugins/sealos -> ..`, native command pair, payload files, and validator commands.
- `.planning/phases/02-readme-and-metadata-alignment/02-CONTEXT.md` - locked README native command order, compatibility path, capability copy, invocation split, and platform registry expectations.
- `.planning/phases/02-readme-and-metadata-alignment/02-VERIFICATION.md` - passed README and metadata alignment checks.
- `.planning/phases/03-validator-hardening/03-CONTEXT.md` - locked validator behavior and JSON metadata scope.
- `.planning/phases/03-validator-hardening/03-VERIFICATION.md` - passed validator hardening checks and negative drift proof.
- `.planning/phases/03-validator-hardening/03-01-SUMMARY.md` - exact Phase 3 implementation scope and next-phase readiness note.

### Distribution and Validation Files
- `README.md` - current user-facing native Codex install path, compatibility path, plugin capabilities, invocation guidance, and maintainer validation block.
- `scripts/validate-codex-plugin.py` - maintainer-facing drift gate for README, manifests, marketplace, platform registry, and JSON shape.
- `distribution/platforms.json` - Codex native install, alternate install, invocation, evidence, and non-Codex follow-up signals.
- `.agents/plugins/marketplace.json` - native Codex marketplace fixture using `source.path: "./plugins/sealos"`.
- `.codex-plugin/plugin.json` - Codex plugin manifest with identity, display metadata, assets, and `skills: "./skills/"`.
- `plugin.json` - root Codex discovery manifest mirroring the Codex plugin manifest.
- `marketplace.json` - root marketplace metadata used by cross-host plugin installers.
- `plugins/sealos` - symlink to repository root used by the Codex marketplace source.

### Codebase Maps
- `.planning/codebase/STACK.md` - validation commands, runtimes, and plugin distribution surfaces.
- `.planning/codebase/ARCHITECTURE.md` - distribution layer, root skill source constraint, and validator responsibility.
- `.planning/codebase/INTEGRATIONS.md` - Codex plugin ecosystem and `npx plugins` distribution host integration points.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/validate-codex-plugin.py`: already validates the README native command block, fallback command, root and Codex manifests, Codex marketplace entry, root marketplace entry, platform registry, symlink source, and required installed payload paths.
- `.planning/phases/01-native-marketplace-discovery-contract/evidence/*`: provides the proven shape for native Codex smoke evidence and payload assertions.
- `README.md`: already contains the current native and compatibility install commands that Phase 4 should verify rather than rewrite.
- `distribution/platforms.json`: already records Codex native install, alternate install, invocation, Phase 1 evidence, and v2-aged non-Codex entries.

### Established Patterns
- Evidence lives under the owning phase directory in an `evidence/` subdirectory.
- Metadata validation uses `python3 scripts/validate-codex-plugin.py` plus explicit JSON syntax checks.
- Native Codex marketplace testing uses isolated `HOME` and `CODEX_HOME`.
- JSON and text evidence are committed when they are the durable proof of a distribution or smoke-test contract.
- Root `skills/**` remains the only skill source across Codex, skills.sh, Claude-compatible hosts, and context-only hosts.

### Integration Points
- Codex CLI commands: `codex plugin marketplace add`, `codex plugin marketplace list`, `codex plugin list --available --json`, and `codex plugin add sealos@sealos --json`.
- Compatibility installer command: `npx plugins add https://github.com/labring/sealos-skills --target codex`.
- Codex marketplace source path: `.agents/plugins/marketplace.json` points at `./plugins/sealos`, and `plugins/sealos` resolves to repository root.
- Final handoff must coordinate `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, prior phase summaries, git history, and working-tree status.

</code_context>

<specifics>
## Specific Ideas

- Capture fresh Phase 4 evidence under `.planning/phases/04-install-smoke-and-handoff/evidence/` with numbered files matching command order.
- Include a machine-readable assertion file such as `06-install-smoke-assertions.json` with booleans for native list, native install, native payload, compatibility evidence, validator pass, JSON syntax pass, and skills unchanged.
- Include a human-readable handoff such as `07-final-handoff.md` naming exact changed files and remaining v2 follow-up.
- Use local worktree native marketplace smoke for final pre-merge confidence, then identify remote `labring/sealos-skills` smoke as post-publication follow-up when appropriate.
- Keep final wording precise: Codex plugin install is verified; non-Codex distribution-wide validation remains v2 scope.

</specifics>

<deferred>
## Deferred Ideas

- v2: distribution-wide validator for Claude, CodeBuddy, Gemini, Qwen, OpenClaw, marketplace, and command-route parity with root `skills/**`.
- v2: CI or documented local command that runs all distribution validators.
- v2: non-Codex screenshot or GIF refresh if host UI copy changes.
- Post-publication: remote marketplace smoke against `codex plugin marketplace add labring/sealos-skills` after the candidate commit is available from the public repository.

</deferred>

---

*Phase: 4-Install Smoke and Handoff*
*Context gathered: 2026-06-15*
