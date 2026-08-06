# Phase 1: Native Marketplace Discovery Contract - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 delivers the native Codex marketplace discovery and install contract for the Sealos plugin. The phase proves that a maintainer can add this repository as a Codex marketplace from an isolated `HOME` and `CODEX_HOME`, list `sealos@sealos` through Codex's available plugin JSON output, and install `sealos@sealos` through Codex's native plugin installer. Runtime behavior for deploy, database, S3, canvas, and app-builder skills stays stable scope.

</domain>

<decisions>
## Implementation Decisions

### Native Codex Marketplace Identity
- **D-01:** The canonical repository source for user-facing Codex marketplace install copy is `labring/sealos-skills`.
- **D-02:** The Phase 1 pre-merge smoke can use the current worktree path (`$PWD`) as the marketplace source so discovery is proven against the candidate repository state before remote publication.
- **D-03:** The marketplace id is `sealos`, the plugin id is `sealos`, the install selector is `sealos@sealos`, and the Codex App display label is `Sealos`.
- **D-04:** Sealos uses a one-plugin model: one installable Codex plugin bundles deploy, database, S3, canvas, app-builder, and supporting cloud-native skills.

### Marketplace Exposure Surfaces
- **D-05:** `.agents/plugins/marketplace.json` is the Codex marketplace fixture for local repository testing. It must expose one installable plugin named `sealos`, with source path `./`, policy `installation: AVAILABLE`, policy `authentication: ON_INSTALL`, and category `Coding`.
- **D-06:** `marketplace.json` and `.claude-plugin/marketplace.json` must continue exposing the installable `sealos` plugin entry from repository root with `commands: ./commands/` and skill paths under `./skills/...`.
- **D-07:** `.codex-plugin/plugin.json` remains the Codex plugin manifest for identity, display copy, logo paths, capabilities, and `skills: ./skills/`.
- **D-08:** Root `skills/**` is the single canonical skill source for every host. Marketplace and plugin metadata point at root skills and never introduce a second packaged skill copy.

### Isolated Discovery and Install Smoke
- **D-09:** Every Codex marketplace smoke command for Phase 1 must run with isolated `HOME` and `CODEX_HOME` values. The smoke must avoid the user's live Codex config and plugin cache.
- **D-10:** The required smoke sequence is marketplace add, marketplace list, available plugin list, and plugin install. The list step must prove `sealos@sealos` appears before the install step is accepted as complete.
- **D-11:** Phase 1 evidence belongs under `.planning/phases/01-native-marketplace-discovery-contract/evidence/` with one file per command output.

Recommended smoke command shape for planning:

```bash
PHASE_DIR=".planning/phases/01-native-marketplace-discovery-contract"
EVIDENCE_DIR="$PHASE_DIR/evidence"
SMOKE_HOME="$(mktemp -d)"
SMOKE_CODEX_HOME="$SMOKE_HOME/.codex"
mkdir -p "$EVIDENCE_DIR"

codex --version | tee "$EVIDENCE_DIR/00-codex-version.txt"

HOME="$SMOKE_HOME" CODEX_HOME="$SMOKE_CODEX_HOME" \
  codex plugin marketplace add "$PWD" --json \
  | tee "$EVIDENCE_DIR/01-marketplace-add.json"

HOME="$SMOKE_HOME" CODEX_HOME="$SMOKE_CODEX_HOME" \
  codex plugin marketplace list --json \
  | tee "$EVIDENCE_DIR/02-marketplace-list.json"

HOME="$SMOKE_HOME" CODEX_HOME="$SMOKE_CODEX_HOME" \
  codex plugin list --available --json \
  | tee "$EVIDENCE_DIR/03-plugin-list-available.json"

HOME="$SMOKE_HOME" CODEX_HOME="$SMOKE_CODEX_HOME" \
  codex plugin add sealos@sealos --json \
  | tee "$EVIDENCE_DIR/04-plugin-add.json"
```

### Verification Contract
- **D-12:** Planning must include a machine-readable assertion that `03-plugin-list-available.json` contains an available plugin whose marketplace-qualified identity is `sealos@sealos`.
- **D-13:** Planning must include a machine-readable assertion that `04-plugin-add.json` reports successful installation of plugin `sealos` from marketplace `sealos`.
- **D-14:** Metadata validation for Phase 1 uses `python3 scripts/validate-codex-plugin.py` and JSON syntax checks for `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `marketplace.json`, `.claude-plugin/marketplace.json`, and `distribution/platforms.json`.
- **D-15:** If discovery fails, the fix target is the smallest marketplace discovery contract change needed to expose the existing Codex plugin. Deploy, database, S3, canvas, and app-builder runtime behavior stays untouched.

Recommended metadata validation command shape for planning:

```bash
PHASE_DIR=".planning/phases/01-native-marketplace-discovery-contract"
EVIDENCE_DIR="$PHASE_DIR/evidence"
mkdir -p "$EVIDENCE_DIR"

python3 scripts/validate-codex-plugin.py \
  | tee "$EVIDENCE_DIR/05-validate-codex-plugin.txt"

python3 -m json.tool .codex-plugin/plugin.json >/dev/null
python3 -m json.tool .agents/plugins/marketplace.json >/dev/null
python3 -m json.tool marketplace.json >/dev/null
python3 -m json.tool .claude-plugin/marketplace.json >/dev/null
python3 -m json.tool distribution/platforms.json >/dev/null
```

### Codex Invocation Semantics
- **D-16:** Phase 1 locks install identity only. README copy promotion belongs to Phase 2 after discovery and install are proven.
- **D-17:** Downstream documentation should describe Codex usage as selecting the Sealos plugin or asking Codex to use Sealos. Claude-compatible `/sealos` examples stay in Claude-specific sections, and direct `/sealos-deploy`, `/sealos-database`, and `/sealos-s3` entries stay in direct `skills.sh` sections.

### Agent Discretion
- The planner may choose local path marketplace smoke for candidate worktree proof and remote `labring/sealos-skills` smoke for post-merge or release proof.
- The executor may choose a compact Node or Python assertion script for JSON evidence checks if shell-only inspection becomes brittle.
- The executor may update marketplace metadata only where discovery evidence proves a specific installability gap.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Scope and Requirements
- `.planning/PROJECT.md` - milestone scope, active constraints, key decisions, and out-of-scope runtime behavior.
- `.planning/REQUIREMENTS.md` - Phase 1 requirements `DISC-01`, `DISC-02`, `DISC-03`, and `META-03`.
- `.planning/ROADMAP.md` - Phase 1 goal, success criteria, dependency order, and phase boundaries.
- `.planning/STATE.md` - current project position and recorded blocker about native discovery.

### Research Inputs
- `.planning/research/SUMMARY.md` - prior finding that native marketplace discovery needs first-phase proof.
- `.planning/research/FEATURES.md` - Codex install command examples and one-plugin Sealos positioning.
- `.planning/research/PITFALLS.md` - install identity, marketplace-name drift, invocation semantics, and validator blind spots.

### Distribution Metadata
- `.codex-plugin/plugin.json` - Codex plugin identity, display metadata, capabilities, assets, and root `./skills/` pointer.
- `.agents/plugins/marketplace.json` - local Codex marketplace fixture for `sealos@sealos` discovery.
- `marketplace.json` - root marketplace metadata surface exposing plugin `sealos`.
- `.claude-plugin/marketplace.json` - mirrored marketplace metadata surface exposing plugin `sealos`.
- `distribution/platforms.json` - support-claim registry and Codex install/evidence fields.
- `marketplaces/README.md` - marketplace ownership and support-claim rules.
- `README.md` - current user-facing install and invocation documentation that later phases will align.

### Validation and Codebase Maps
- `scripts/validate-codex-plugin.py` - current Codex manifest and local marketplace validator.
- `.planning/codebase/STACK.md` - technology stack and validation command guidance.
- `.planning/codebase/ARCHITECTURE.md` - distribution layer, root skill source rule, and entry points.
- `.planning/codebase/CONVENTIONS.md` - JSON formatting, validation, and root `skills/**` source convention.
- `.planning/codebase/STRUCTURE.md` - distribution metadata file locations.
- `.planning/codebase/INTEGRATIONS.md` - Codex plugin ecosystem integration surface.
- `.planning/codebase/CONCERNS.md` - distribution metadata duplication and validator coverage risks.
- `.planning/codebase/TESTING.md` - available validation commands and coverage gaps.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.agents/plugins/marketplace.json`: already models one local Codex marketplace named `sealos` with one plugin entry named `sealos`.
- `.codex-plugin/plugin.json`: already declares Codex plugin `sealos`, display label `Sealos`, logo paths, capabilities, and `skills: ./skills/`.
- `marketplace.json` and `.claude-plugin/marketplace.json`: already expose plugin `sealos` from repository root with command and skill paths.
- `scripts/validate-codex-plugin.py`: already validates core Codex plugin identity, local marketplace shape, and Codex platform registry presence.

### Established Patterns
- Distribution-facing JSON files use readable two-space formatting.
- Repository-level validation is script-driven; `python3 scripts/validate-codex-plugin.py` is the existing Codex metadata gate.
- Root `skills/**` remains the source of truth across Codex, Claude-compatible hosts, skills.sh, and context-only extension hosts.
- Phase evidence is stored under the owning phase directory when a smoke test produces command output needed by later phases.

### Integration Points
- Codex CLI `0.139.0` supports `codex plugin marketplace add`, `codex plugin marketplace list`, `codex plugin list --available --json`, and `codex plugin add <plugin>@<marketplace> --json`.
- Phase 1 planning connects metadata files to Codex CLI smoke output under `.planning/phases/01-native-marketplace-discovery-contract/evidence/`.
- Future README alignment in Phase 2 depends on Phase 1 proving the exact native install identity.

</code_context>

<specifics>
## Specific Ideas

- Adapt the `phuryn/pm-skills` native Codex marketplace pattern to Sealos as a one-plugin marketplace: `codex plugin marketplace add labring/sealos-skills` followed by `codex plugin add sealos@sealos`.
- Use local worktree marketplace smoke for candidate changes, then use remote marketplace smoke when release evidence is needed after publication.
- Keep compatibility/local install copy (`npx plugins add https://github.com/labring/sealos-skills --target codex`) for later documentation phases while Phase 1 proves native Codex discovery.

</specifics>

<deferred>
## Deferred Ideas

- Promote native Codex install commands in `README.md` during Phase 2 after Phase 1 evidence proves discovery and install.
- Update `distribution/platforms.json` Codex install/evidence fields during Phase 2 or Phase 3 when README and validation alignment happen together.
- Harden `scripts/validate-codex-plugin.py` for README command parity and invocation wording in Phase 3.
- Add distribution-wide validation for Claude, CodeBuddy, Gemini, Qwen, OpenClaw, marketplace, and command-route parity as v2 follow-up.

</deferred>

---

*Phase: 1-Native Marketplace Discovery Contract*
*Context gathered: 2026-06-15*
