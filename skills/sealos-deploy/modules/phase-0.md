# Phase 0: Preflight

Prepare the environment, identity, and source directory. Write the Phase 0 subset of `.sealos/analysis.json`.

**Hard rules**

- Do not judge deployability (Phase 1).
- Do not build images, generate templates, or create cloud resources.
- Probe scripts detect only. They never install.
- At the end of this phase, `.sealos/analysis.json` contains **only** these fields: `runtime_profile`, `work_dir`, `repo_name`, `github_url`. Overwrite any previous file.

`SKILL_DIR` is the directory that contains this skill's `SKILL.md`.

Prefer an existing `sealos-cli` binary. If it is missing, use `npx -y sealos-cli@latest ...` for one-off commands. Do not add `sealos-cli` to the required binary install list.

```bash
SEALOS_CLI=(sealos-cli)
if ! command -v sealos-cli >/dev/null 2>&1; then
  SEALOS_CLI=(npx -y sealos-cli@latest)
fi
```

## Step 1: Probe environment and dependencies

```bash
node "<SKILL_DIR>/scripts/phase-0/check-running-environment.mjs"
```

The script:

1. Sets `runtime_profile` to `sandbox` when `SEALAI_DEPLOY_TASK_ID` is set, otherwise `local`.
2. Reports `present`, `missing`, `warnings`, and per-tool `details`.
3. Never installs anything.

**Required for `local` and `sandbox`:**

git, Node.js 18+, Python 3.8+, PyYAML, gitingest, kompose, Helm 3+, kubectl, curl, jq

**Required for `local` only:**

`gh` (binary), Docker CLI, running Docker daemon, Docker Buildx, railpack

`sandbox` does not require Docker or `gh`. `sandbox` already includes railpack.

**Warnings (not STOP in Phase 0):**

- `gh` installed but not logged in
- `gh` may lack `write:packages`

These become hard blockers only when the run later chooses a GHCR push path.

## Step 2: Install missing dependencies

If `missing` is non-empty:

1. List every missing item once.
2. Ask once whether to install them.
3. User agrees → install or upgrade for the current platform → re-run the probe script.
4. User refuses, or items remain missing after install → **STOP**.

Do not install without asking. Do not ask per package.

If Docker is installed but the daemon is not running, ask the user, then start the daemon (macOS: open Docker Desktop; Linux: `sudo systemctl start docker` when appropriate).

## Step 3: Prepare identity (`local` only)

`sandbox` skips this step. Do not guide region, login, or workspace selection in `sandbox`.

### Sealos via sealos-cli

Read regions from `<SKILL_DIR>/config.json` (`default_region`, `regions`). Ask the user to confirm or choose a region.

```bash
"${SEALOS_CLI[@]}" whoami
"${SEALOS_CLI[@]}" login <region-url>
"${SEALOS_CLI[@]}" workspace list
"${SEALOS_CLI[@]}" workspace current
"${SEALOS_CLI[@]}" workspace switch <workspace-id-or-team-name>
```

1. Select the Sealos Cloud region.
2. Complete login when `whoami` shows unauthenticated or expired auth.
3. Select the target workspace when more than one exists. If only one exists, use it.
4. Confirm auth metadata and kubeconfig exist under `~/.sealos/` and are usable. Do not print their contents.

If region, login, or workspace cannot be confirmed → **STOP**.

### GitHub CLI session

If `gh` is missing from PATH after Step 2, that is already a STOP from required deps.

If `gh` is present but auth/`write:packages` is incomplete, record a warning and continue. Enforce login or scope refresh only when a later phase selects GHCR push.

## Step 4: Enter the source directory

| Source | Action |
| --- | --- |
| GitHub repository URL | Shallow clone (`--depth 1`) into a working directory |
| Local project directory | Use the given path |
| No argument | Use `$(pwd)` |

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

## Step 5: Optional submodules and Git LFS

If the repository declares submodules or Git LFS:

1. Ask once whether to install the needed tools and fetch objects.
2. On agreement, install if needed, then fetch submodules / LFS objects.
3. On refusal or failure → **STOP**.

If the repository does not declare them, skip. Do not install tools only because a README mentions a command.

## Step 6: Write `analysis.json`

```bash
mkdir -p "$WORK_DIR/.sealos"
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

## Step 7: Start the deploy log

Create one log for the run (see `references/logging.md`):

```bash
mkdir -p ~/.sealos/logs
LOG_FILE=~/.sealos/logs/deploy-$(date +%Y%m%d-%H%M%S).log
echo "[$(date '+%Y-%m-%d %H:%M:%S')] === Phase 0: Preflight ===" > "$LOG_FILE"
```

Append `runtime_profile`, `work_dir`, dependency outcome, and Sealos region/workspace (no secrets). Keep `$LOG_FILE` for later phases.

## Stop conditions

| Result | Condition |
| --- | --- |
| **STOP** | `runtime_profile` cannot be determined |
| **STOP** | User refuses required dependency install, or install/recheck fails |
| **STOP** | `local`: region, login, or workspace not confirmed; auth/kubeconfig unusable |
| **STOP** | Project source cannot be resolved, entered, or cloned |
| **STOP** | Submodules/LFS required but refused or fetch failed |
| **STOP** | `analysis.json` cannot be written or `validate-phase-0.mjs` fails |
| **CONTINUE** | All checks pass → load `modules/artifacts.md`, then `modules/mode.md` |

## Ready summary

Report a short status only:

```text
Project:
  ✓ <repo_name> (<work_dir>)
  ✓ github: <github_url or "none">

Environment:
  ✓ runtime_profile: <local|sandbox>
  ✓ required dependencies
  ○ gh auth / write:packages <ok or warning — GHCR push path only>

Auth (local only):
  ✓ Sealos region <region>
  ✓ workspace <id>
```

Then continue the pipeline.
