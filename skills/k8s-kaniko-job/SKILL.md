---
name: k8s-kaniko-job
description: Package the sandbox-local Docker build context as context.tar.gz, expose it through the DevBox VersityGW S3 endpoint, run a temporary kaniko Kubernetes Job, push a GHCR image, and write .sealos/build-result.json. Use after sealos-deploy writes .sealos/build-request.json, or when creating, debugging, or inspecting kaniko + VersityGW builds.
compatibility: Requires kubectl access through the sandbox-provided kubeconfig and service account. The sandbox identity must be able to create Jobs and Secrets in the active namespace. Requires a DevBox runtime with VersityGW reachable through S3_ENDPOINT and a kaniko Job-reachable endpoint from KANIKO_JOB_S3_ENDPOINT or the current Pod IP. Requires GITHUB_TOKEN for GHCR push unless a future registry Secret handoff is added. This MVP supports sandbox-local Dockerfile builds and GHCR image output only.
metadata:
  author: labring
---

# K8s Kaniko Job

Package the local Docker build context, expose it through the DevBox VersityGW S3 endpoint, then run a temporary kaniko Job that pulls the context and pushes the resulting GHCR image.

This skill is the build executor for Seakills prepare artifacts:

```text
sealos-deploy
  -> .sealos/build-request.json
  -> k8s-kaniko-job
  -> .sealos/kaniko-context.json
  -> temporary kaniko Job
  -> .sealos/build-result.json
```

## Scope

This skill does:

- read `.sealos/build-request.json`
- skip builds when `mode` is `reuse-image`
- resolve the active sandbox namespace and service account
- resolve VersityGW S3 settings from the runtime environment
- create Kubernetes Secrets for GHCR Docker auth and kaniko S3 auth
- package `source.work_dir + build.context_path` into `context.tar.gz`
- write the context under the local VersityGW bucket directory
- create a unique temporary kaniko Job
- wait for the Job and collect logs
- write `.sealos/build-result.json`

This skill does not:

- generate Dockerfiles
- start or supervise VersityGW
- expose DevBox services publicly
- deploy the final Sealos template
- manage registry cache repositories

## Important Model

The DevBox runtime owns VersityGW. This skill only prepares the local object file under the bucket directory and gives kaniko the S3 contract:

```text
s3://kaniko-contexts/contexts/<devbox-name>/<build-id>/context.tar.gz
```

The kaniko Job fetches that tarball through:

```text
S3_ENDPOINT=<KANIKO_JOB_S3_ENDPOINT or current-pod-ip:1319>
```

The DevBox runtime defaults from `labring-actions/devbox-runtime#143` are:

```text
S3_ENDPOINT=http://127.0.0.1:1319
KANIKO_CONTEXT_S3_BUCKET=kaniko-contexts
KANIKO_CONTEXT_S3_PREFIX=contexts
KANIKO_CONTEXT_S3_BASE=s3://kaniko-contexts/contexts
KANIKO_CONTEXT_POSIX_DIR=$WORKSPACE/.versitygw-s3/kaniko-contexts/contexts
```

`S3_ENDPOINT` is local to the DevBox process. If it is loopback, derive or provide `KANIKO_JOB_S3_ENDPOINT` before generating the Job so kaniko does not try to connect to itself.

The Dockerfile must be inside `build.context_path`. If the Dockerfile sits outside the selected context, stop and fix Phase 3 or the context paths instead of silently widening the context and packaging unrelated files.

Do not assume the namespace is `default`, and do not switch to an admin kubeconfig. Resolve the namespace from the active sandbox context or mounted service-account metadata, and carry the current service account onto the temporary Job so the workflow stays inside the caller's permissions.

## Quick Start

Execute the modules in order:

1. `modules/preflight.md` — kubectl, namespace, S3, token, and capability checks
2. `modules/build-request.md` — read and validate `.sealos/build-request.json`
3. `modules/registry-auth.md` — prepare GHCR and S3 auth Secrets
4. `modules/context.md` — generate `context.tar.gz` and `.sealos/kaniko-context.json`
5. `modules/job-template.md` — generate and apply the temporary kaniko Job
6. `modules/run-and-watch.md` — wait for kaniko and collect logs
7. `modules/result.md` — write `.sealos/build-result.json`

## Logging

Every run should write a log file at:

```text
~/.sealos/logs/build-<YYYYMMDD-HHmmss>.log
```

Do not print or persist raw secrets, Docker auth config, S3 credentials, or Kubernetes Secret YAML content in logs.

## Scripts

Scripts live in `scripts/` within this skill directory:

| Script | Usage | Purpose |
| --- | --- | --- |
| `resolve-kube-context.mjs` | `node resolve-kube-context.mjs [--namespace <ns>]` | Resolve the active namespace, kube context, current pod name, and current service account from the sandbox environment |
| `check-ghcr-token.mjs` | `node check-ghcr-token.mjs --token-env GITHUB_TOKEN --require-scope write:packages` | Verify that the injected GitHub token can publish to GHCR before starting a build |
| `prepare-context.mjs` | `node prepare-context.mjs --request <file> --context-root <posix-dir> --bucket <bucket> [--prefix <s3-prefix>] --devbox <name> --build-id <id> --out <file>` | Create `context.tar.gz` and write kaniko context metadata |
| `generate-job.mjs` | `node generate-job.mjs --request <file> --context <file> --namespace <ns> --job-name <name> --registry-secret <name> --s3-secret <name> --s3-endpoint <url> [--service-account <name>]` | Generate a temporary kaniko Job YAML |
| `write-result.mjs` | `node write-result.mjs --request <file> --status <status> --out <file> ...` | Write `.sealos/build-result.json` |

## Output

The final local artifact is:

```text
.sealos/build-result.json
```

Validate it against:

```text
schemas/build-result.schema.json
```

Read `knowledge/failure-patterns.md` when a Job fails. Read `knowledge/security-notes.md` before changing token, Secret, S3, or logging behavior.
