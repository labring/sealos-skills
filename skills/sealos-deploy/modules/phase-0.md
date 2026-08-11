# Phase 0: Preflight

Prepare the environment, identity, and source directory. Write the Phase 0 subset of `.sealos/analysis.json`.

**Hard rules**

- Do not judge deployability (Phase 1).
- Do not build images, generate templates, or create cloud resources.
- Probe scripts detect only. They never install.
- At the end of this phase, `.sealos/analysis.json` contains **only** these fields: `runtime_profile`, `work_dir`, `repo_name`, `github_url`. Overwrite any previous file.
- Install tools only after the user replies `y`. Do not ask per package.

`<SKILL_DIR>` is the directory that contains this skill's `SKILL.md`.

Use `npx` for these tools (do not treat them as required binaries). Record the
resolved version of each `npx` tool in the deploy log once per run — `@latest`
can move mid-run and the log is the only way to reconstruct what ran:

```bash
npx -y sealos-cli@latest whoami
# login / workspace … (local identity only)

# Phase 2 scout (tree only; --preset deploy). Do not install gitingest.
npx -y @norberia/agentlens "$WORK_DIR" --preset deploy \
  -o "$WORK_DIR/.sealos/phase-2/agentlens-digest.txt"
```

## Dependency model

Phase 0 hard-stops only on **entry-required** tools. Everything else is **deferred**: probe and optionally offer install, but refusal does **not** STOP here. Hard-block deferred tools when a later phase actually needs them.

| Tier | Tools | Phase 0 | Hard block when |
|------|-------|---------|-----------------|
| A — entry | Node.js 22+ | Refuse/fail install → **STOP** | Phase 0 |
| A — entry (source) | `git` | Deferred in probe; if this run must clone a GitHub URL (or needs git metadata) and `git` is missing → ask once; refuse/fail → **STOP** | Phase 0 Step 5 |
| A — identity | Sealos via `npx -y sealos-cli@latest` | Not a binary install | Region/login/workspace failure → **STOP** (local only) |
| B — deploy/verify | `kubectl` (+ usable kubeconfig); `jq` (shell JSON parsing) | Deferred | Phase 6 / 7 / UPDATE / verify. The Phase 6 create always uses `deploy-template.mjs` (Node is entry-required) — no curl fallback |
| C — build/push | Docker CLI, daemon, Buildx; `gh` (+ login / `write:packages`); `railpack` | Deferred; `sandbox` does not require Docker/`gh` | Phase 3 local build/push or GHCR; Phase 2 when railpack must prepare a Dockerfile |
| D — template | `npm install` in `skills/docker-to-sealos` (`yaml`); `kompose`; Helm 3+ | Deferred | Phase 4 (by deployment source) |
| D — dry-run | `npm install` in `skills/sealos-deploy` (`yaml`) | Deferred | Phase 5 |
| E — optional | Git LFS / submodule tools; crane | Ask only when the repo or path needs them | That path; refuse → **STOP** |

Official-template fast path (skip Phases 2–4) must not be blocked by Docker, `gh`, railpack, kompose, or Helm.

## Step 1: Start the deploy log

Create one log for the run before any probe or install, so every Phase 0 event
lands in it (see `references/logging.md`):

```bash
mkdir -p ~/.sealos/logs
LOG_FILE=~/.sealos/logs/deploy-$(date +%Y%m%d-%H%M%S).log
echo "[$(date '+%Y-%m-%d %H:%M:%S')] === Phase 0: Preflight ===" > "$LOG_FILE"
```

Append `runtime_profile`, `work_dir`, `missing_required` / `missing_deferred`,
npx tool versions, and Sealos region/workspace (no secrets) as the steps below
produce them. Keep `$LOG_FILE` for later phases.

## Step 2: Probe environment and dependencies

```bash
node "<SKILL_DIR>/scripts/phase-0/check-running-environment.mjs"
```

The script:

1. Sets `runtime_profile` to `sandbox` when `SEALAI_DEPLOY_TASK_ID` is set, otherwise `local`.
2. Reports `present`, `missing_required`, `missing_deferred`, `missing` (union), `warnings`, and per-tool `details`.
3. Never installs anything.

`missing_required` is entry-tier only (`node`). All other probed tools land in `missing_deferred` (or warnings).

**Warnings (not STOP in Phase 0):**

- `gh` installed but not logged in
- `gh` may lack `write:packages`

These become hard blockers only when the run later chooses a GHCR push path.

## Step 3: Install entry-required dependencies

If `missing_required` is non-empty:

1. List every entry-required missing item once.
2. Ask once whether to install them.
3. User agrees → install or upgrade for the current platform → re-run the probe script.
4. User refuses, or items remain in `missing_required` after install → **STOP**.

If `missing_deferred` is non-empty, you may list them and offer one optional install batch. Refusal → **CONTINUE** (record the gap in the deploy log).

Do not install without asking. Do not ask per package.

If Docker is installed but the daemon is not running, you may ask to start it now; refusal is not a Phase 0 STOP (hard-block later if this run needs local build).

## Step 4: Prepare identity (`local` only)

`sandbox` skips this step. Do not guide region, login, or workspace selection in `sandbox`.

### Sealos via sealos-cli

Resolve the default region in this order, then ask the user to confirm or
choose:

1. `region` in `~/.sealos/auth.json` when a previous login exists (the region
   the user actually works in).
2. `default_region` in `<SKILL_DIR>/config.json` otherwise. `regions` in the
   same file lists the known choices.

```bash
npx -y sealos-cli@latest whoami
npx -y sealos-cli@latest login <region-url>
npx -y sealos-cli@latest workspace list
npx -y sealos-cli@latest workspace current
npx -y sealos-cli@latest workspace switch <workspace-id-or-team-name>
```

1. Select the Sealos Cloud region.
2. Complete login when `whoami` shows unauthenticated or expired auth.
3. Select the target workspace when more than one exists. If only one exists, use it.
4. Confirm auth metadata and kubeconfig exist under `~/.sealos/` and are usable. Do not print their contents.

If region, login, or workspace cannot be confirmed → **STOP**.

### GitHub CLI session

Missing `gh` is deferred. If `gh` is present but auth/`write:packages` is incomplete, record a warning and continue. Enforce login or scope refresh only when a later phase selects GHCR push.

## Step 5: Enter the source directory

| Source | Action |
| --- | --- |
| GitHub repository URL | Shallow clone (`--depth 1`) into a working directory |
| Local project directory | Use the given path |
| No argument | Use `$(pwd)` |

If this step must run `git clone` (or otherwise needs `git`) and `git` is missing:

1. Ask once whether to install `git`.
2. Refuse or install/recheck failure → **STOP**.

Always use a shallow clone when cloning. Never fetch full history:

```bash
git clone --depth 1 "<github-url>" "$WORK_DIR"
```

`sandbox`: if the workspace already has source, use that path. Clone only when needed and the source is absent (still `--depth 1`).

Resolve:

- `work_dir` — absolute analyzable path
- `repo_name` — directory name or URL parse result
- `github_url` — from the argument or `git remote get-url origin` when it is GitHub; otherwise `null`

```bash
git -C "$WORK_DIR" rev-parse --is-inside-work-tree 2>/dev/null
git -C "$WORK_DIR" remote get-url origin 2>/dev/null
```

If the source cannot be resolved, entered, or cloned → **STOP**.

## Step 6: Optional submodules and Git LFS

If the repository declares submodules or Git LFS:

1. Ask once whether to install the needed tools and fetch objects.
2. On agreement, install if needed, then fetch submodules / LFS objects.
3. On refusal or failure → **STOP**.

If the repository does not declare them, skip. Do not install tools only because a README mentions a command.

## Step 7: Write `analysis.json` and `.sealos/.gitignore`

```bash
mkdir -p "$WORK_DIR/.sealos"
```

Write `$WORK_DIR/.sealos/.gitignore` when it does not exist, so pipeline
artifacts and deployment state stay out of the user's repository while
`config.json` (a user-authored override file) remains committable:

```
*
!.gitignore
!config.json
```

Overwrite `$WORK_DIR/.sealos/analysis.json` with **only**:

```json
{
  "runtime_profile": "local",
  "work_dir": "/absolute/path/to/project",
  "repo_name": "my-app",
  "github_url": "https://github.com/owner/repo"
}
```

Then validate:

```bash
node "<SKILL_DIR>/scripts/validate-phase-0.mjs" --dir "$WORK_DIR"
```

On validation failure → **STOP**. Do not enter mode detection.

## Stop conditions

| Result | Condition |
| --- | --- |
| **STOP** | `runtime_profile` cannot be determined |
| **STOP** | User refuses **entry-required** dependency install, or install/recheck leaves `missing_required` non-empty |
| **STOP** | Clone/metadata needs `git` and user refuses install or install fails |
| **STOP** | `local`: region, login, or workspace not confirmed; auth/kubeconfig unusable |
| **STOP** | Project source cannot be resolved, entered, or cloned |
| **STOP** | Submodules/LFS required but refused or fetch failed |
| **STOP** | `analysis.json` cannot be written or `validate-phase-0.mjs` fails |
| **CONTINUE** | Entry checks pass (deferred gaps allowed) → load `modules/artifacts.md`, then `modules/mode.md` |

## Ready summary

Report a short status only:

```text
Project:
  ✓ <repo_name> (<work_dir>)
  ✓ github: <github_url or "none">

Environment:
  ✓ runtime_profile: <local|sandbox>
  ✓ entry-required dependencies
  ○ deferred missing: <list or "none">
  ○ gh auth / write:packages <ok or warning — GHCR push path only>

Auth (local only):
  ✓ Sealos region <region>
  ✓ workspace <id>
```

Then continue the pipeline.
