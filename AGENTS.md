# Project Agent Instructions

## What This Project Is

Seakills is the prepare-only Sealos Cloud skills pack for the `skills.sh`
ecosystem. This branch accepts a GitHub repository or current sandbox
worktree, applies the current shared Sealos analysis and Template rules, builds
missing images inside Kubernetes, validates rendered runtime resources against
the target API server without persisting them, and hands the validated YAML to
a downstream deployment system.

It must not become the user-facing local plugin/runtime workflow.

## Commands

- Most work happens under `skills/**`.
- Run Node helpers with `node <script>.mjs`.
- Keep `skills/sealos-deploy/evals/` aligned with behavior changes.
- Run `node --check` plus the matching `test-*.mjs` for changed JavaScript.
- Run the full `docker-to-sealos` quality gate when converter rules change.

## Current-to-Brain Migration Policy

The current user-facing branch is the behavioral source of truth for shared
pre-YAML work. Adopt its assessment, exact official-template lookup, source
selection, image evidence, complete topology, Dockerfile preparation,
conversion, security, and validation rules.

Adapt only the environment boundary:

- use the injected GitHub token; never start browser authentication;
- use Kaniko plus DevBox VersityGW instead of a Docker daemon;
- use the sandbox's current kubeconfig, namespace, and service account for
  image builds and the final non-persistent server-side dry-run;
- keep required Template inputs for downstream resolution;
- stop after locally and target-cluster validated YAML and delivery artifacts.

Do not add local Sealos OAuth, region/workspace selection, final Template API
deployment, persistent `kubectl apply`, deployment state, UPDATE mode,
rollout/rollback, runtime smoke verification, or `sealos-canvas`.

Keep these shared skills aligned with the current source commit unless an
environment-specific incompatibility is proven:

- `skills/cloud-native-readiness/`
- `skills/dockerfile-skill/`
- `skills/docker-to-sealos/`
- `skills/sealos-app-builder/`
- `skills/sealos-database/`
- `skills/sealos-s3/`

`skills/k8s-kaniko-job/` is Brain-owned. Do not replace it with the local
Docker/Buildx path or another image builder.

Do not import the user-facing plugin and marketplace surfaces into this branch.

## Architecture

```text
/sealos-deploy
├── cloud-native-readiness
├── dockerfile-skill
├── k8s-kaniko-job
└── docker-to-sealos

/sealos-database
/sealos-s3
```

The prepare pipeline is:

```text
Preflight
  -> Assess
  -> exact official-template lookup
     -> safe unique exact match: copy YAML -> validate -> finish
     -> otherwise:
          source/topology/image discovery
          -> per-service Dockerfile preparation
          -> aggregate image reuse/Kaniko build
          -> source-adapted Template generation
          -> local quality gate
          -> target server-side dry-run -> finish
```

Phase 1 stops only when the agent is certain there is no reasonable
project-backed online form. A low readiness score warns and continues.

## Artifact Contract

Final invariant paths:

```text
.sealos/analysis.json
.sealos/template-references.json
.sealos/build-request.json
.sealos/build-result.json
.sealos/template/index.yaml
.sealos/delivery-manifest.json
```

The build request/result are aggregate version `2.0` artifacts covering every
final container service. The official-template route uses an empty request and
a skipped result.

Explicit Helm/Kubernetes routes may also produce:

```text
.sealos/deployment-source/rendered.yaml
.sealos/deployment-source/resource-map.json
.sealos/topology-evidence/<app-name>.yaml
```

Private Kaniko context files, Jobs, logs, tokens, and Secrets are not delivery
artifacts.

## Image And Credential Rules

- Use only project-declared image evidence.
- Resolve final images to immutable SHA-256 digest refs.
- Do not pre-screen third-party images by architecture.
- Every locally built image targets `linux/amd64` and GHCR.
- Keep build-argument names in artifacts; values remain private runtime input.
- For non-anonymous images, generated workloads may reference only the
  app-scoped `${{ defaults.app_name }}` pull Secret.
- Never inline registry Secret payloads or credentials in Template YAML.
- Downstream owns application pull-Secret materialization.

## Editing Discipline

- Treat root `skills/**` as canonical.
- Inspect status and relevant diffs before editing.
- Preserve unrelated changes and untracked files.
- Keep edits scoped and remove obsolete helpers, fixtures, and docs introduced
  by the changed behavior.
- Write code, comments, commit messages, and PR text in English.

## Validation

For changed deploy/Kaniko helpers:

```bash
node --check <changed-script.mjs>
node --test skills/sealos-deploy/scripts/test-*.mjs
python3 skills/sealos-deploy/scripts/test_server_dry_run.py
node --test skills/k8s-kaniko-job/scripts/*.test.mjs
```

Validate complete handoff artifacts with:

```bash
node skills/sealos-deploy/scripts/validate-artifacts.mjs \
  --dir <work-dir> \
  --require-complete
```

For `docker-to-sealos` changes:

```bash
DOCKER_TO_SEALOS_ALLOW_EMPTY_ARTIFACTS=1 \
python3 skills/docker-to-sealos/scripts/quality_gate.py
```

Use `--artifacts /absolute/path/to/index.yaml` when a concrete Template exists.

## Safety

Keep tokens, kubeconfig content, S3 secrets, `.env` values, Docker auth, build
arguments, and connection strings out of committed files and output. Scope all
build operations and server-side dry-runs to the selected context and
namespace. Server-side dry-run must never persist runtime resources. Any manual
Kubernetes deletion requires explicit user confirmation.
