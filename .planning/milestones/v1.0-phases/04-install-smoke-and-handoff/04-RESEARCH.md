# Phase 04: Install Smoke and Handoff - Research

**Researched:** 2026-06-15 [VERIFIED: local date]
**Domain:** Codex plugin install smoke evidence, compatibility installer evidence, and milestone handoff [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]
**Confidence:** HIGH [VERIFIED: repository inspection + CLI help + validator run]

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### Deferred Ideas (OUT OF SCOPE)
## Deferred Ideas

- v2: distribution-wide validator for Claude, CodeBuddy, Gemini, Qwen, OpenClaw, marketplace, and command-route parity with root `skills/**`.
- v2: CI or documented local command that runs all distribution validators.
- v2: non-Codex screenshot or GIF refresh if host UI copy changes.
- Post-publication: remote marketplace smoke against `codex plugin marketplace add labring/sealos-skills` after the candidate commit is available from the public repository.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HAND-01 | Final verification includes isolated Codex native marketplace add, list, and install smoke output. [CITED: .planning/REQUIREMENTS.md] | Use the locked native Codex command sequence and JSON assertions over `01` through `04` evidence files. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md] |
| HAND-02 | Final verification includes compatibility install or discovery evidence for the `npx plugins` path. [CITED: .planning/REQUIREMENTS.md] | Use isolated `npx plugins add ... --target codex` evidence, with discovery/help/version fallback when full install is blocked. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md] |
| HAND-03 | Final handoff reports the exact files changed and any remaining non-Codex distribution follow-up. [CITED: .planning/REQUIREMENTS.md] | Generate file lists from git diff/status and carry v2 distribution follow-up from roadmap requirements. [CITED: .planning/ROADMAP.md] |
</phase_requirements>

## Summary

Phase 4 should be planned as a verification-and-handoff phase with no source implementation edits by default. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md] Native Codex evidence should be fresh against the current worktree and isolated through temporary `HOME` plus `CODEX_HOME`; the exact native command sequence is supported by `codex-cli 0.139.0` help output, including `--json`, local marketplace source paths, `--available`, and `PLUGIN@MARKETPLACE` selectors. [VERIFIED: codex CLI help]

Compatibility evidence should use `npx plugins add https://github.com/labring/sealos-skills --target codex` in an isolated environment, while recording stdout, stderr, exit code, command, and environment paths. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md] The `plugins` npm package exists as version `1.3.1`, uses bin `plugins: "dist/index.js"`, declares Node `>=18`, and has no `postinstall` script in the npm registry metadata returned during research. [VERIFIED: npm registry]

**Primary recommendation:** Plan one evidence-only task that captures native smoke, compatibility evidence or documented fallback evidence, assertion JSON, validator/JSON outputs, cleanup proof, and final handoff from git truth. [VERIFIED: repository inspection]

## Project Constraints (from AGENTS.md)

- Reply language for user-facing messages is Simplified Chinese and every user-facing reply begins with `爸爸`. [CITED: AGENTS.md]
- Code, code comments, commit messages, and pull request titles/descriptions use English. [CITED: AGENTS.md]
- Root `skills/**` is the only skill source for every host; a second packaged skill copy is forbidden. [CITED: AGENTS.md]
- Distribution metadata changes require `python3 scripts/validate-codex-plugin.py`. [CITED: AGENTS.md]
- Plugin examples use `$sealos` for Codex, `/sealos` for Claude-compatible hosts, and `/sealos-deploy` / `/sealos-database` / `/sealos-s3` only for direct `skills.sh` sections. [CITED: AGENTS.md]
- Keep `skills/sealos-deploy/evals/` in sync when skill behavior changes. [CITED: AGENTS.md]
- This phase should avoid source implementation edits unless smoke evidence proves a direct blocker in the scoped install contract. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Native Codex marketplace smoke | Agent host / local CLI | Local filesystem | Codex CLI owns marketplace registration, available listing, plugin install, and plugin cache writes; filesystem assertions verify installed payload. [VERIFIED: codex CLI help] |
| Compatibility `npx plugins` evidence | Package-manager CLI | Agent host / local CLI | `npx` invokes the `plugins` package, and the target install path writes into Codex-compatible local state when install succeeds. [VERIFIED: npm registry] |
| Assertion checks | Local verification script | Evidence files | A compact Node or Python script can parse JSON evidence and inspect installed payload paths with deterministic checks. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md] |
| Final handoff | Git metadata | Planning evidence docs | `git diff --name-only`, `git status --short`, and phase summaries are the authoritative changed-file sources. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md] |

## Standard Stack

### Core
| Tool / Library | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| Codex CLI | `codex-cli 0.139.0` | Native marketplace add/list/install smoke. | The installed CLI supports the required `plugin marketplace add`, `plugin marketplace list`, `plugin list --available --json`, and `plugin add --json` commands. [VERIFIED: codex CLI help] |
| Python 3 | `Python 3.12.12` | Validator, JSON parsing, and optional assertion script. | The repository validator is Python and passed in this environment. [VERIFIED: command output] |
| Node.js / npx | Node `v24.13.0`, npm/npx `11.6.2` | Run compatibility `npx plugins` command and optional JS assertions. | The compatibility path is explicitly documented as `npx plugins add ... --target codex`. [CITED: README.md] |
| `plugins` npm package | `1.3.1` | Compatibility installer invoked by `npx plugins`. | Registry metadata identifies the CLI package and bin entry used by the documented command. [VERIFIED: npm registry] |
| Git | `git version 2.50.1 (Apple Git-155)` | Handoff file list and base strategy. | Phase 4 handoff requires git-truth changed-file lists. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md] |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `python3 -m json.tool` | Python stdlib from `3.12.12` | Syntax validation for the five metadata JSON files and assertion JSON. | Use after smoke evidence and handoff files are created. [CITED: README.md] |
| `scripts/validate-codex-plugin.py` | repository script | README, manifest, marketplace, platform registry, symlink, and payload contract gate. | Run before and after evidence capture. [VERIFIED: script run] |
| `mktemp` | system utility [ASSUMED] | Create isolated smoke homes. | Use for each native and compatibility smoke root. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Python assertion script | Shell `jq` pipelines | Python avoids adding a `jq` environment dependency and matches existing validator tooling. [VERIFIED: repository inspection] |
| Local worktree native marketplace source | Remote `labring/sealos-skills` source | Local worktree validates the candidate commit before publication; remote source is a post-publication follow-up. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md] |

**Installation:** This research step installs nothing. [CITED: user request] Phase execution may invoke `npx plugins` as a compatibility installer inside isolated temp state. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `plugins` [ASSUMED] | npm | Created 2013-10-17; latest `1.3.1` published 2026-04-12. [VERIFIED: npm registry] | Not captured by `npm view`; planner should skip download-count assertions. [VERIFIED: npm registry] | `github.com/vercel-labs/plugins` [VERIFIED: npm registry] | Slopcheck installed but this version checks PyPI for `install plugins` and lacks the required `--json` mode; npm package remains `[ASSUMED]` under the package provenance rule. [VERIFIED: slopcheck output] | Approved for isolated compatibility evidence with human-readable package audit note. [ASSUMED] |

**Packages removed due to slopcheck [SLOP] verdict:** none. [VERIFIED: slopcheck output]
**Packages flagged as suspicious [SUS]:** none from npm metadata; package remains `[ASSUMED]` because official package documentation was not fetched and slopcheck did not support npm JSON verification in this environment. [VERIFIED: npm registry]

## Architecture Patterns

### System Architecture Diagram

```text
Maintainer starts Phase 4 execution
  |
  v
Create evidence dir + native temp HOME/CODEX_HOME
  |
  v
Codex CLI native flow
  |--> codex --version -> 00-codex-version.txt
  |--> marketplace add "$PWD" --json -> 01-native-marketplace-add.json
  |--> marketplace list --json -> 02-native-marketplace-list.json
  |--> plugin list --available --json -> 03-native-plugin-list-available.json
  |--> plugin add sealos@sealos --json -> 04-native-plugin-add.json
  |
  v
Native assertion script
  |--> verifies pluginId, marketplaceName, installedPath isolation, required payload files
  v
06-install-smoke-assertions.json
  |
  v
Compatibility path decision
  |--> full isolated npx install succeeds -> 05-npx-compat-install.* evidence
  |--> full install blocked -> help/version/discovery evidence + explicit fallback note
  |
  v
Validator + JSON syntax + skills diff checks
  |
  v
Git handoff generation
  |--> milestone base selection
  |--> committed changed files
  |--> uncommitted status
  |--> skills/** changes
  |--> v2 follow-up
  v
Final handoff evidence and Phase 4 verification
```

### Recommended Project Structure

```text
.planning/phases/04-install-smoke-and-handoff/
├── 04-RESEARCH.md
├── 04-PLAN.md
├── 04-VERIFICATION.md
└── evidence/
    ├── 00-codex-version.txt
    ├── 01-native-marketplace-add.json
    ├── 02-native-marketplace-list.json
    ├── 03-native-plugin-list-available.json
    ├── 04-native-plugin-add.json
    ├── 05-npx-compat-install.txt
    ├── 05-npx-compat-install.stderr.txt
    ├── 05-npx-compat-install.exitcode
    ├── 06-install-smoke-assertions.json
    ├── 07-validator-and-json-checks.txt
    ├── 08-final-handoff.md
    └── 09-smoke-env.txt
```

### Pattern 1: Isolated Native Codex Smoke
**What:** Run every state-writing Codex command with temporary `HOME` and `CODEX_HOME`. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]
**When to use:** Use for HAND-01 evidence. [CITED: .planning/REQUIREMENTS.md]
**Example:**
```bash
PHASE_DIR=".planning/phases/04-install-smoke-and-handoff"
EVIDENCE_DIR="$PHASE_DIR/evidence"
SMOKE_HOME="$(mktemp -d)"
SMOKE_CODEX_HOME="$SMOKE_HOME/.codex"
mkdir -p "$EVIDENCE_DIR" "$SMOKE_CODEX_HOME"

codex --version | tee "$EVIDENCE_DIR/00-codex-version.txt"
HOME="$SMOKE_HOME" CODEX_HOME="$SMOKE_CODEX_HOME" codex plugin marketplace add "$PWD" --json | tee "$EVIDENCE_DIR/01-native-marketplace-add.json"
HOME="$SMOKE_HOME" CODEX_HOME="$SMOKE_CODEX_HOME" codex plugin marketplace list --json | tee "$EVIDENCE_DIR/02-native-marketplace-list.json"
HOME="$SMOKE_HOME" CODEX_HOME="$SMOKE_CODEX_HOME" codex plugin list --available --json | tee "$EVIDENCE_DIR/03-native-plugin-list-available.json"
HOME="$SMOKE_HOME" CODEX_HOME="$SMOKE_CODEX_HOME" codex plugin add sealos@sealos --json | tee "$EVIDENCE_DIR/04-native-plugin-add.json"
```

### Pattern 2: Compatibility Evidence with Fallback
**What:** Prefer full isolated `npx plugins add` output; record discovery evidence if full install is blocked. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]
**When to use:** Use for HAND-02 evidence. [CITED: .planning/REQUIREMENTS.md]
**Example:**
```bash
NPX_HOME="$(mktemp -d)"
NPX_CACHE="$NPX_HOME/.npm-cache"
NPX_CODEX_HOME="$NPX_HOME/.codex"
mkdir -p "$NPX_CACHE" "$NPX_CODEX_HOME" "$EVIDENCE_DIR"

HOME="$NPX_HOME" CODEX_HOME="$NPX_CODEX_HOME" npm_config_cache="$NPX_CACHE" \
  npx plugins add https://github.com/labring/sealos-skills --target codex \
  >"$EVIDENCE_DIR/05-npx-compat-install.txt" \
  2>"$EVIDENCE_DIR/05-npx-compat-install.stderr.txt"
printf '%s\n' "$?" > "$EVIDENCE_DIR/05-npx-compat-install.exitcode"
```

### Anti-Patterns to Avoid
- **Writing smoke state into normal user homes:** This can pollute maintainer Codex/plugin/npm state and weakens evidence isolation. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]
- **Using remote marketplace smoke before publication as the only proof:** The candidate commit may not exist on `labring/sealos-skills` yet, so local worktree smoke is the reliable pre-merge evidence target. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]
- **Committing temp homes or caches:** Evidence files under the phase directory are the intended durable artifacts. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]
- **Handoff from memory:** Changed-file handoff should be generated from git diff/status truth. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Native plugin install behavior | Custom copy/install script | `codex plugin marketplace add/list` and `codex plugin add` | Codex CLI is the system under test and exposes JSON outputs for assertions. [VERIFIED: codex CLI help] |
| Compatibility installer behavior | Manual copy into Codex cache | `npx plugins add ... --target codex` | The documented compatibility path should be tested through the documented installer. [CITED: README.md] |
| JSON syntax validation | Ad hoc regex checks | `python3 -m json.tool` | README documents this validation path for the metadata JSON files. [CITED: README.md] |
| Metadata drift validation | Manual checklist only | `python3 scripts/validate-codex-plugin.py` | The validator already checks README, manifests, marketplace source, platform registry, symlink, and required payload. [VERIFIED: script run] |

**Key insight:** The phase value is reproducible evidence from the actual install tools plus git truth; custom simulations would weaken the handoff. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]

## Common Pitfalls

### Pitfall 1: Native Smoke Pollutes Maintainer State
**What goes wrong:** Marketplace registration or plugin cache files land in the maintainer's normal Codex home. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]
**Why it happens:** Commands run without temporary `HOME` and `CODEX_HOME`. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]
**How to avoid:** Create `SMOKE_HOME` and `SMOKE_CODEX_HOME`, use them for every state-writing Codex command, and record paths in `09-smoke-env.txt`. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]
**Warning signs:** Evidence paths under `/Users/longnv/.codex` outside the temp root. [VERIFIED: Phase 1 evidence shape]

### Pitfall 2: Install Success Without Payload Proof
**What goes wrong:** `codex plugin add` succeeds while required skills/assets are missing from the installed cache. [VERIFIED: Phase 1 verification]
**Why it happens:** Installer result JSON reports the cache path but does not by itself prove all required files are present. [VERIFIED: Phase 1 evidence shape]
**How to avoid:** Parse `04-native-plugin-add.json`, read `installedPath`, and check `plugin.json`, `.codex-plugin/plugin.json`, required `skills/**/SKILL.md`, and `assets/logo.svg`. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]
**Warning signs:** Assertion JSON lacks `installed_payload_complete: true`. [VERIFIED: Phase 1 evidence shape]

### Pitfall 3: Compatibility Evidence Overclaims
**What goes wrong:** The handoff claims `npx plugins` install passed when only discovery/help/version evidence was captured. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]
**Why it happens:** Network/package-manager variability or local installer side effects block full install. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]
**How to avoid:** Record exit code, stdout, stderr, and classify the result as full compatibility install evidence or compatibility discovery evidence. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]
**Warning signs:** Missing `.exitcode` file or missing stderr file for `05-npx-compat-install`. [ASSUMED]

### Pitfall 4: Ambiguous Milestone Base
**What goes wrong:** Final changed-file handoff includes too many files or misses early milestone changes. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]
**Why it happens:** Worktree history includes planning bootstrap, phase docs, and source edits across many commits. [VERIFIED: git log]
**How to avoid:** Use `git merge-base HEAD upstream/main` as the default full-milestone base candidate and state the chosen base. [VERIFIED: git command]
**Warning signs:** Handoff omits `git status --short` or the selected base SHA. [ASSUMED]

## Code Examples

### Native Assertion Script Pattern
```python
# Source: local Phase 1 evidence shape and Phase 4 CONTEXT
import json
from pathlib import Path

evidence = Path(".planning/phases/04-install-smoke-and-handoff/evidence")
available = json.loads((evidence / "03-native-plugin-list-available.json").read_text())
install = json.loads((evidence / "04-native-plugin-add.json").read_text())
installed_path = Path(install["installedPath"])
required_payload = [
    "plugin.json",
    ".codex-plugin/plugin.json",
    "skills/sealos-deploy/SKILL.md",
    "skills/sealos-database/SKILL.md",
    "skills/sealos-s3/SKILL.md",
    "assets/logo.svg",
]
checks = {
    "available_contains_sealos_at_sealos": any(
        item.get("pluginId") == "sealos@sealos" for item in available.get("available", [])
    ),
    "install_reports_sealos_from_sealos": install.get("name") == "sealos" and install.get("marketplaceName") == "sealos",
    "installed_payload_checks": {path: (installed_path / path).exists() for path in required_payload},
}
checks["installed_payload_complete"] = all(checks["installed_payload_checks"].values())
checks["passed"] = checks["available_contains_sealos_at_sealos"] and checks["install_reports_sealos_from_sealos"] and checks["installed_payload_complete"]
(evidence / "06-install-smoke-assertions.json").write_text(json.dumps(checks, indent=2) + "\n")
raise SystemExit(0 if checks["passed"] else 1)
```

### Handoff File List Commands
```bash
# Source: Phase 4 CONTEXT and git inspection
MILESTONE_BASE="$(git merge-base HEAD upstream/main)"
git diff --name-only "$MILESTONE_BASE"..HEAD | sort > "$EVIDENCE_DIR/08-milestone-files.txt"
git status --short > "$EVIDENCE_DIR/08-working-tree-status.txt"
git diff --name-only "$MILESTONE_BASE"..HEAD -- skills | sort > "$EVIDENCE_DIR/08-skills-files.txt"
git diff --name-only HEAD -- .planning/phases/04-install-smoke-and-handoff | sort > "$EVIDENCE_DIR/08-phase-4-uncommitted-files.txt"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Compatibility-first Codex install via `npx plugins add ... --target codex` | Native Codex marketplace add plus `codex plugin add sealos@sealos`, with `npx plugins` retained as compatibility/local path | Phase 2 on 2026-06-15 [CITED: .planning/phases/02-readme-and-metadata-alignment/02-VERIFICATION.md] | README and platform metadata now lead with native Codex install. [VERIFIED: README.md] |
| Trusting install success alone | Install success plus installed payload assertions | Phase 1 on 2026-06-15 [CITED: .planning/phases/01-native-marketplace-discovery-contract/01-VERIFICATION.md] | Native smoke checks catch missing `skills/**` and asset payload. [VERIFIED: Phase 1 evidence] |
| Manual metadata review | `scripts/validate-codex-plugin.py` with README, manifest, marketplace, platform registry, symlink, and payload checks | Phase 3 on 2026-06-15 [CITED: .planning/phases/03-validator-hardening/03-VERIFICATION.md] | Maintainers have a single Codex-focused drift gate. [VERIFIED: script run] |

**Deprecated/outdated:**
- Treating `npx plugins add ... --target codex` as the primary Codex path is outdated for this milestone; README now presents native Codex install first. [VERIFIED: README.md]
- Treating non-Codex distribution-wide validation as v1 scope is outside Phase 4; it is v2 deferred work. [CITED: .planning/REQUIREMENTS.md]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `mktemp` is available and sufficient for smoke temp roots. | Standard Stack | Planner may need to use another temp-directory mechanism. |
| A2 | Missing `.exitcode` or stderr file is a useful warning sign for compatibility evidence quality. | Common Pitfalls | Verifier may accept weaker evidence unless the plan makes these files mandatory. |
| A3 | `plugins` package is acceptable for isolated evidence despite package provenance remaining `[ASSUMED]`. | Package Legitimacy Audit | Planner should add an explicit human-readable audit checkpoint around the compatibility command. |

## Open Questions

1. **Should Phase 4 attempt full `npx plugins` install or use discovery evidence first?**
   - What we know: The context permits full isolated install and allows discovery/help/version fallback when full install is blocked. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]
   - What's unclear: Whether the executor's network/package-manager state will make full compatibility install deterministic during execution. [ASSUMED]
   - Recommendation: Plan full isolated install first, then write fallback evidence only on a real non-zero or unsafe condition. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]

2. **Which milestone base should the final handoff use?**
   - What we know: `git merge-base HEAD upstream/main` returned `9ee2d3ac269b4d5b1c81ba43be979c0c7cdac03b` during research. [VERIFIED: git command]
   - What's unclear: Whether the executor should include planning bootstrap files before the first implementation commit in the public handoff. [ASSUMED]
   - Recommendation: Use `git merge-base HEAD upstream/main` for full milestone truth and include a second grouped list for source/distribution-facing files. [VERIFIED: git command]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Codex CLI | Native smoke | yes | `codex-cli 0.139.0` [VERIFIED: command output] | Phase blocked if absent because HAND-01 requires native smoke. [CITED: .planning/REQUIREMENTS.md] |
| Node.js | `npx plugins` and optional JS assertions | yes | `v24.13.0` [VERIFIED: command output] | Use Python assertions for checks; compatibility evidence still needs npx. [ASSUMED] |
| npm / npx | Compatibility evidence | yes | `11.6.2` [VERIFIED: command output] | Discovery/help evidence fallback if full install fails. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md] |
| Python 3 | Validator and JSON assertions | yes | `3.12.12` [VERIFIED: command output] | Use Node assertion script if Python becomes unavailable. [ASSUMED] |
| Git | Final handoff | yes | `2.50.1 (Apple Git-155)` [VERIFIED: command output] | Phase blocked because HAND-03 requires git-truth file lists. [CITED: .planning/REQUIREMENTS.md] |
| slopcheck | Package legitimacy audit | partial | installed; `--json` unsupported [VERIFIED: command output] | Use registry metadata and mark package provenance `[ASSUMED]`. [VERIFIED: npm registry] |

**Missing dependencies with no fallback:**
- None detected for research. [VERIFIED: command output]

**Missing dependencies with fallback:**
- slopcheck JSON mode is unavailable; fallback is text output plus npm metadata with `[ASSUMED]` package provenance. [VERIFIED: command output]

## Validation Architecture

Skipped because `.planning/config.json` sets `workflow.nyquist_validation` to `false`. [VERIFIED: .planning/config.json]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | Phase 4 install smoke should avoid Sealos auth, kubeconfig, npm tokens, and API credentials. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md] |
| V3 Session Management | no | No application session behavior is in scope. [CITED: .planning/REQUIREMENTS.md] |
| V4 Access Control | no | No runtime authorization surface is changed. [CITED: .planning/REQUIREMENTS.md] |
| V5 Input Validation | yes | Parse JSON evidence with Python `json` or Node `JSON.parse` and assert exact expected fields. [VERIFIED: Phase 1 evidence shape] |
| V6 Cryptography | no | No cryptographic implementation is in scope. [CITED: .planning/REQUIREMENTS.md] |

### Known Threat Patterns for Install Evidence

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secret leakage in committed evidence | Information Disclosure | Commit command output only after scanning for tokens, kubeconfig data, auth files, npm tokens, API keys, and user secrets. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md] |
| Host-state pollution | Tampering | Run native and compatibility smoke with temp `HOME`, `CODEX_HOME`, npm cache, and plugin-related dirs. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md] |
| Misleading compatibility claim | Repudiation | Record exact command, env paths, exit code, stdout, stderr, and label fallback evidence accurately. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md] |

## Command Plan for Planner

### Native Codex Isolated Smoke

Expected command outputs:
- `00-codex-version.txt`: output from `codex --version`. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]
- `01-native-marketplace-add.json`: JSON with marketplace name and installed/root path. [VERIFIED: Phase 1 evidence shape]
- `02-native-marketplace-list.json`: JSON containing marketplace `sealos` and the local worktree root. [VERIFIED: Phase 1 evidence shape]
- `03-native-plugin-list-available.json`: JSON containing `available[]` with `pluginId: "sealos@sealos"`. [VERIFIED: Phase 1 evidence shape]
- `04-native-plugin-add.json`: JSON containing `pluginId`, `name`, `marketplaceName`, `version`, `installedPath`, and `authPolicy`. [VERIFIED: Phase 1 evidence shape]
- `09-smoke-env.txt`: temp roots, cleanup status, and retained-path note if any. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]

Required assertions:
- `available_contains_sealos_at_sealos == true`. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]
- `install_reports_sealos_from_sealos == true`. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]
- `installedPath` is under the isolated `CODEX_HOME`. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]
- Required payload files exist under `installedPath`. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]

### Compatibility Evidence

Expected full-install outputs:
- `05-npx-compat-install.txt`: stdout from the compatibility installer. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]
- `05-npx-compat-install.stderr.txt`: stderr from the compatibility installer. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]
- `05-npx-compat-install.exitcode`: numeric exit code. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]

Fallback strategy:
- If full install fails due to package/network/host behavior, capture `npx --version`, `npm view plugins version repository.url homepage scripts.postinstall --json`, and the README/validator proof that the exact fallback command remains documented. [VERIFIED: npm registry]
- Label fallback as compatibility discovery evidence in the handoff. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]

### Final Handoff Strategy

Base commit recommendation:
- Use `git merge-base HEAD upstream/main` as the default milestone base and record the SHA in `08-final-handoff.md`; this returned `9ee2d3ac269b4d5b1c81ba43be979c0c7cdac03b` during research. [VERIFIED: git command]
- Include `git status --short` at the handoff moment to separate committed and uncommitted changes. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]
- Include a `skills/**` diff list and expect Phase 4 itself to leave source implementation files unchanged unless smoke evidence reveals a scoped blocker. [CITED: .planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md]

Recommended verification commands:
```bash
python3 scripts/validate-codex-plugin.py
python3 -m json.tool .codex-plugin/plugin.json >/dev/null
python3 -m json.tool plugin.json >/dev/null
python3 -m json.tool .agents/plugins/marketplace.json >/dev/null
python3 -m json.tool marketplace.json >/dev/null
python3 -m json.tool distribution/platforms.json >/dev/null
python3 -m json.tool .planning/phases/04-install-smoke-and-handoff/evidence/06-install-smoke-assertions.json >/dev/null
git diff -- skills --exit-code
git status --short
```

## Sources

### Primary (HIGH confidence)
- `.planning/phases/04-install-smoke-and-handoff/04-CONTEXT.md` - locked Phase 4 decisions, smoke commands, fallback policy, cleanup, and handoff requirements.
- `.planning/REQUIREMENTS.md` - HAND-01, HAND-02, HAND-03 and v2 deferred distribution requirements.
- `.planning/ROADMAP.md` - Phase 4 goal, success criteria, dependencies, and completed prior phases.
- `README.md` - native Codex install, compatibility install, capability list, and validation block.
- `scripts/validate-codex-plugin.py` - current validator scope and required payload constants.
- `codex plugin --help`, `codex plugin marketplace --help`, `codex plugin marketplace add --help`, `codex plugin list --help`, `codex plugin add --help` - command support and flags.
- `python3 scripts/validate-codex-plugin.py` - current validator passed in research environment.

### Secondary (MEDIUM confidence)
- npm registry via `npm view plugins --json` - package version, repository, bin, engine, and absence of postinstall metadata.
- Phase 1/2/3 `*-VERIFICATION.md`, `*-UAT.md`, and Phase 1 evidence JSON - previous proof shape and current milestone truth.

### Tertiary (LOW confidence)
- Slopcheck text output for `plugins` - installed slopcheck checked PyPI and lacked the requested npm JSON mode, so npm package legitimacy remains `[ASSUMED]`.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - CLI versions, help output, validator run, npm metadata, and repository files were inspected in this session.
- Architecture: HIGH - Phase 4 CONTEXT locks the command flow and evidence responsibilities.
- Pitfalls: HIGH - Native payload pitfalls are backed by Phase 1 verification and evidence; compatibility-installer risks are backed by Phase 4 CONTEXT.

**Research date:** 2026-06-15
**Valid until:** 2026-06-22 for install CLI behavior because Codex CLI and `plugins` package are fast-moving distribution surfaces. [ASSUMED]
