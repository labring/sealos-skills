# Phase 0: Preflight

Detect the sandbox environment, resolve the project, and determine whether the prepare workflow can complete.

This version is prepare-only. Preflight must not require:

- local Docker daemon
- `docker buildx`
- Sealos login
- region selection
- workspace or namespace switching
- GitHub auth prompts
- direct deploy access

## Step 1: Environment Detection

Run these checks on every execution:

```bash
git --version 2>/dev/null
node --version 2>/dev/null
python3 --version 2>/dev/null
curl --version 2>/dev/null | head -1
which jq 2>/dev/null
kubectl version --client 2>/dev/null || true
printenv GITHUB_TOKEN >/dev/null
```

Record:

```text
ENV.git
ENV.node
ENV.python
ENV.curl
ENV.jq
ENV.kubectl
ENV.github_token
```

Notes:

- `git` is required when cloning a GitHub URL or when deriving repository metadata.
- `node` is recommended because helper scripts are written in Node.js.
- `curl` and `jq` are optional accelerators.
- `kubectl` may be available in the sandbox for a future build-job skill, but this skill does not execute jobs.
- `GITHUB_TOKEN` may exist in the sandbox, but this skill does not prompt for or refresh GitHub auth.

## Step 2: Capability Classification

Classify findings into:

- immediate stop conditions
- warnings only
- explicit non-requirements

### 2.1 Immediate Stop Conditions

Stop before pipeline work only when one of these is true:

- the user provided a GitHub URL and `git` is unavailable
- Node.js is unavailable and the environment cannot run the included helper scripts

### 2.2 Warnings Only

Report but do not stop:

- `python3` missing
- `jq` missing
- `kubectl` missing
- `GITHUB_TOKEN` missing

### 2.3 Explicit Non-Requirements

Tell the user these are intentionally out of scope for this version:

- Docker daemon and registry login
- Sealos OAuth auth
- region switching
- workspace and namespace switching
- build job creation and monitoring
- direct deploy and rollout operations

## Step 3: Resolve Project Context

Determine what repository the skill is preparing.

### 3.1 Resolve Working Directory

```bash
# A) User provided a GitHub URL
WORK_DIR=$(mktemp -d)
git clone --depth 1 "<github-url>" "$WORK_DIR"
GITHUB_URL="<github-url>"

# B) User provided a local path
WORK_DIR="<local-path>"

# C) No input
WORK_DIR="$(pwd)"
```

### 3.2 Detect Git Metadata

```bash
git -C "$WORK_DIR" rev-parse --is-inside-work-tree 2>/dev/null
git -C "$WORK_DIR" remote get-url origin 2>/dev/null
git -C "$WORK_DIR" branch --show-current 2>/dev/null
git -C "$WORK_DIR" rev-parse HEAD 2>/dev/null
```

Record:

```text
PROJECT.work_dir
PROJECT.is_git
PROJECT.github_url
PROJECT.repo_name
PROJECT.branch
PROJECT.commit_sha
```

If `PROJECT.github_url` exists, parse `owner/repo`. That metadata is reused in detect-image and build handoff.

### 3.3 Read README

Read the first matching README:

```bash
ls "$WORK_DIR"/README* "$WORK_DIR"/readme* 2>/dev/null | head -1
```

Extract:

- project description
- language and framework clues
- run/build instructions
- Docker image references
- env var references

Store the key findings in `PROJECT.readme_summary`.

## Step 4: Ready Summary

At the end of preflight, present:

- resolved working directory
- detected GitHub repository and ref
- whether assessment and image detection can run
- whether sandbox helpers like `kubectl` and `GITHUB_TOKEN` are present
- which old deploy-time dependencies are intentionally not required

Example:

```text
Preflight summary:
  - Project: /path/to/repo
  - GitHub repo: owner/repo
  - Source ref: <commit sha>
  - Node.js: ready
  - kubectl: available in sandbox
  - GITHUB_TOKEN: injected
  - Docker / Sealos auth / deploy API: not required in prepare-only mode
```
