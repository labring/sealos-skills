# Phase 0: Preflight

Detect the sandbox environment, resolve the target repository, and determine whether the build-and-prepare workflow can complete.

## Step 1: Environment Detection

Run these checks on every execution:

```bash
git --version 2>/dev/null
node --version 2>/dev/null
python3 --version 2>/dev/null
curl --version 2>/dev/null | head -1
which jq 2>/dev/null
kubectl version --client 2>/dev/null || true
railpack --version 2>/dev/null || true
printenv GITHUB_TOKEN >/dev/null
printenv S3_ENDPOINT >/dev/null || printenv AWS_ENDPOINT_URL_S3 >/dev/null || printenv AWS_ENDPOINT_URL >/dev/null
printenv AWS_SECRET_ACCESS_KEY >/dev/null || printenv SEALOS_DEVBOX_JWT_SECRET >/dev/null || printenv DEVBOX_JWT_SECRET >/dev/null
```

Record:

```text
ENV.git
ENV.node
ENV.python
ENV.curl
ENV.jq
ENV.kubectl
ENV.railpack
ENV.github_token
ENV.s3_endpoint
ENV.s3_secret
```

Notes:

- `git` is required because this workflow needs git metadata either from the current workspace or from the cloned GitHub repository.
- `node` is recommended because helper scripts are written in Node.js.
- `curl` and `jq` are optional accelerators.
- `kubectl` may be available in the sandbox for a later kaniko phase, but it is not an entry prerequisite.
- `GITHUB_TOKEN` may exist in the sandbox for a later source materialization or kaniko phase, but this skill does not prompt for or refresh GitHub auth.
- `S3_ENDPOINT` and the S3 secret may exist in the DevBox runtime for a later kaniko phase, but they are conditional blockers only when a new image must be built.
- `railpack` is an optional build-environment detector. It strengthens Dockerfile generation inputs when available, but it must not become an entry blocker.

## Step 2: Capability Classification

Classify findings into:

- immediate stop conditions
- conditional build capabilities
- optional accelerators

### 2.1 Immediate Stop Conditions

Stop before pipeline work only when one of these is true:

- the user did not provide a GitHub URL and the current workspace cannot be resolved to a GitHub-backed git repository
- `git` is unavailable
- Node.js is unavailable and the environment cannot run the included helper scripts

### 2.2 Conditional Build Capabilities

Record these capabilities for Phase 4:

- `kubectl` missing
- `GITHUB_TOKEN` missing
- `S3_ENDPOINT`, `AWS_ENDPOINT_URL_S3`, and `AWS_ENDPOINT_URL` missing
- `AWS_SECRET_ACCESS_KEY`, `SEALOS_DEVBOX_JWT_SECRET`, and `DEVBOX_JWT_SECRET` missing

`kubectl`, VersityGW S3 settings, and `GITHUB_TOKEN` are conditional blockers only if Phase 4 resolves to `mode=build-required`.

`GITHUB_TOKEN` is used for GHCR push credentials, not for GitHub clone inside the kaniko job.

### 2.3 Optional Accelerators

Record but do not stop:

- `python3` missing
- `jq` missing
- `railpack` missing

## Step 3: Resolve Project Context

Determine what repository the skill is preparing and where the build will run from.

### 3.1 Resolve Working Directory

Use this order:

1. If the user explicitly provided a GitHub URL:

```bash
WORK_DIR=$(mktemp -d)
git clone --depth 1 "<github-url>" "$WORK_DIR"
GITHUB_URL="<github-url>"
```

2. Otherwise, if the current directory is already a git worktree, use it directly:

```bash
WORK_DIR="${CODEX_GATEWAY_CWD:-$PWD}"
GIT_CMD=(git -c safe.directory="$WORK_DIR")
```

3. If the current directory is not a git worktree but `REPO_URL` exists and points at GitHub, use `REPO_URL` as `GITHUB_URL` and clone it.

Reject only when neither an explicit GitHub URL nor a current git workspace with resolvable GitHub metadata exists.

### 3.2 Detect Git Metadata

```bash
git -c safe.directory="$WORK_DIR" -C "$WORK_DIR" rev-parse --is-inside-work-tree 2>/dev/null
git -c safe.directory="$WORK_DIR" -C "$WORK_DIR" remote get-url origin 2>/dev/null
git -c safe.directory="$WORK_DIR" -C "$WORK_DIR" branch --show-current 2>/dev/null
git -c safe.directory="$WORK_DIR" -C "$WORK_DIR" rev-parse HEAD 2>/dev/null
```

Record:

```text
PROJECT.work_dir
PROJECT.is_git
PROJECT.github_url
PROJECT.repo_name
PROJECT.branch
PROJECT.commit_sha
PROJECT.source_mode
```

Resolve `PROJECT.github_url` from the explicit input first, then `REPO_URL`, then the local `origin` remote when it is a GitHub URL. Parse `owner/repo` from that GitHub URL. That metadata is reused in detect-image, image naming, and build traceability.

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
- source mode: current workspace or cloned GitHub URL
- detected GitHub repository and ref
- whether assessment and image detection can run
- whether sandbox helpers like `kubectl` and `GITHUB_TOKEN` are present
- whether VersityGW S3 settings appear to be present
- whether Railpack build-environment probing is available
- whether a later kaniko phase would use the active sandbox namespace and current service account
- whether a later sandbox kaniko phase would be able to run if the project needs a new image

Example:

```text
Preflight summary:
  - Project: /path/to/repo
  - Source mode: current-workspace
  - GitHub repo: owner/repo
  - Source ref: <commit sha>
  - Node.js: ready
  - kubectl: available in sandbox
  - GITHUB_TOKEN: injected
  - Build identity: active sandbox namespace + current service account
  - kaniko readiness: kubectl, VersityGW S3 settings, and GITHUB_TOKEN will only matter if no reusable image is found
```
