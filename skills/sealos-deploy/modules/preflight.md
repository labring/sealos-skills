# Phase 0: Preflight

Resolve a complete, trustworthy source worktree and classify capabilities
before creating project artifacts.

## 1. Capability Scan

Check on every run:

```bash
git --version
node --version

PYTHON_BIN="$(command -v python3 || command -v python || true)"
if [ -n "$PYTHON_BIN" ]; then
  "$PYTHON_BIN" --version
  "$PYTHON_BIN" -c 'import yaml'
fi

kompose version 2>/dev/null || true
helm version --short 2>/dev/null || true
kubectl version --client 2>/dev/null || true
kubectl config current-context 2>/dev/null || true

test -n "${GITHUB_TOKEN:-}"
test -n "${S3_ENDPOINT:-${AWS_ENDPOINT_URL_S3:-${AWS_ENDPOINT_URL:-}}}"
test -n "${AWS_SECRET_ACCESS_KEY:-${SEALOS_DEVBOX_JWT_SECRET:-${DEVBOX_JWT_SECRET:-}}}"
test -n "${SEALOS_CLOUD_DOMAIN:-}"
test -n "${SEALOS_CERT_SECRET_NAME:-}"
```

Record booleans and versions without printing secret values.

Immediate blockers:

- `git` is missing
- Node.js is missing or older than 18
- neither a supplied GitHub URL nor the current Git worktree identifies a
  GitHub repository
- the exact current commit cannot be fully materialized

Conditional blockers:

- Python 3.8+ or PyYAML is required only on the standard Template route
- Kompose is required only for a selected Compose route
- Helm 3+ is required only for a selected Helm route
- kubectl plus the current target context, namespace, service account, cloud
  domain, and certificate Secret name are required before any route can
  complete the Phase 6 target-cluster validation gate
- VersityGW settings and `GITHUB_TOKEN` GHCR write access are required only
  when at least one final container service must be built

No Docker daemon, Sealos authentication, region selection, workspace
selection, or browser-based GitHub authentication belongs to preflight.
Never use an admin kubeconfig fallback or guess a cloud domain, namespace,
certificate Secret, or service account.

Invoking this skill authorizes installation of path-selected dependencies when
the sandbox can install them safely. Install only after the source route or
repository content mechanism establishes the need, then rerun the exact check.
If installation would require a new external authorization or cannot be
verified, stop with the unresolved capability.

## 2. Resolve the Worktree

For an explicit GitHub URL:

```bash
WORK_DIR="$(mktemp -d)"
WORK_DIR_IS_TEMP=true
git clone --depth 1 --no-checkout "$GITHUB_URL" "$WORK_DIR"
```

Use the injected token through the sandbox's existing credential helper or a
private, process-local askpass mechanism when the repository needs
authentication. Never embed the token in the clone URL, persist it in
`.git/config`, or print it.

Without a URL, use `${CODEX_GATEWAY_CWD:-$PWD}` only when it is the intended
Git worktree and its origin resolves to GitHub. Preserve all tracked,
untracked, and ignored user files.

Resolve and record:

```bash
git -c safe.directory="$WORK_DIR" -C "$WORK_DIR" rev-parse --is-inside-work-tree
git -c safe.directory="$WORK_DIR" -C "$WORK_DIR" remote get-url origin
git -c safe.directory="$WORK_DIR" -C "$WORK_DIR" branch --show-current
git -c safe.directory="$WORK_DIR" -C "$WORK_DIR" rev-parse HEAD
git -c safe.directory="$WORK_DIR" -C "$WORK_DIR" status --porcelain=v1 --untracked-files=all
```

Normalize the repository as `owner/repo` and retain the exact source ref.

## 3. Materialize the Current Commit

A successful clone does not prove that the checkout contains every tracked
source input. Before reading the README or assessing the project:

1. inspect repository-owned metadata and actual checkout state for content
   mechanisms, placeholders, gitlinks, nested repositories, or missing objects;
2. identify the required tool or built-in Git operation from that evidence;
3. install a trustworthy missing tool only when this repository requires it;
4. check out and materialize the exact current commit and recursive content
   with the existing injected credentials;
5. run the mechanism's integrity check.

Git LFS and submodules are examples, not an allowlist. For a local worktree,
compare status before and after and never reset, clean, replace, or discard user
changes.

Stop before Phase 1 only when the source still cannot be materialized into a
trustworthy analyzable worktree. This step creates no `.sealos` artifact.

## 4. Select Conditional Source Dependencies

Perform a read-only source-shape check:

1. honor a valid `.sealos/config.json` `deployment_source`;
2. otherwise select the first canonical root Compose file;
3. otherwise select one parent Helm chart;
4. otherwise select one supported Kubernetes manifest root/file;
5. otherwise select `implicit-single-service`.

The implicit route means only that no directly usable declared topology was
found. It does not prove that the repository root is one application.

Independent multiple Helm charts or Kubernetes roots require explicit project
configuration; do not guess. Install only the chosen adapter dependency.
Python with PyYAML remains required for every standard Phase 5 route.

## 5. Read Project Evidence

Read the first matching README plus dependency manifests, workspace metadata,
CI workflows, Dockerfiles, and selected deployment-source files. Extract:

- project purpose and reasonable online form
- language, framework, package manager, and runtime
- service boundaries and ports
- exact build/run instructions
- declared images
- required environment variables and dependencies

## 6. Ready Summary

Report briefly:

- worktree, GitHub repository, branch/ref, and source mode
- whether the current commit is fully materialized
- selected source route and adapter readiness
- Node/Python readiness
- whether target kubectl context and Template-rendering built-ins are resolved
- whether build-only token and VersityGW capabilities are present

Do not describe missing conditional build capabilities as blockers until Phase
2 proves that a build is necessary. Missing target-cluster validation
capabilities become blockers only if the pipeline otherwise reaches the final
handoff gate.
