# Phase 0: Preflight

Detect the sandbox environment, clone the GitHub project, and determine whether the build-and-prepare workflow can complete.

Preflight must not require:

- local Docker daemon
- `docker buildx`
- Sealos login
- region selection
- workspace or namespace switching
- GitHub auth prompts at entry
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
buildctl --version 2>/dev/null || true
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
ENV.buildctl
ENV.github_token
```

Notes:

- `git` is required because this workflow only accepts GitHub URLs.
- `node` is recommended because helper scripts are written in Node.js.
- `curl` and `jq` are optional accelerators.
- `kubectl` and `buildctl` may be available in the sandbox for a later BuildKit phase, but they are not entry prerequisites.
- `GITHUB_TOKEN` may exist in the sandbox for a later source materialization or BuildKit phase, but this skill does not prompt for or refresh GitHub auth.

## Step 2: Capability Classification

Classify findings into:

- immediate stop conditions
- warnings only
- explicit non-requirements

### 2.1 Immediate Stop Conditions

Stop before pipeline work only when one of these is true:

- the user did not provide a GitHub URL
- `git` is unavailable
- Node.js is unavailable and the environment cannot run the included helper scripts

### 2.2 Warnings Only

Report but do not stop:

- `python3` missing
- `jq` missing
- `kubectl` missing
- `buildctl` missing
- `GITHUB_TOKEN` missing

`kubectl` is a conditional blocker only if Phase 4 resolves to `mode=build-required`.

`buildctl`, `kubectl`, and `GITHUB_TOKEN` are conditional blockers only if Phase 4 resolves to `mode=build-required`.

`GITHUB_TOKEN` is used for GHCR push credentials, not for GitHub clone inside the BuildKit job.

### 2.3 Explicit Non-Requirements

Tell the user these are intentionally out of scope for this version:

- Docker daemon and registry login
- Sealos OAuth auth
- region switching
- workspace and namespace switching
- direct deploy and rollout operations

## Step 3: Resolve Project Context

Determine what GitHub repository the skill is preparing.

### 3.1 Resolve Working Directory

```bash
WORK_DIR=$(mktemp -d)
git clone --depth 1 "<github-url>" "$WORK_DIR"
GITHUB_URL="<github-url>"
```

Reject any input that is not a GitHub URL. Do not fall back to a local path or the current directory.

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

Parse `owner/repo` from the GitHub URL. That metadata is reused in detect-image and build handoff.

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
- whether a later sandbox BuildKit phase would be able to run if the project needs a new image

Example:

```text
Preflight summary:
  - Project: /path/to/repo
  - GitHub repo: owner/repo
  - Source ref: <commit sha>
  - Node.js: ready
  - kubectl: available in sandbox
  - GITHUB_TOKEN: injected
  - Docker / Sealos auth / deploy API: not required at entry
  - BuildKit readiness: buildctl, kubectl, and GITHUB_TOKEN will only matter if no reusable image is found
```
