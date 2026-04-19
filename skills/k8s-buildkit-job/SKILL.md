---
name: k8s-buildkit-job
description: Run a temporary BuildKit daemon in a Kubernetes sandbox, then use sandbox-local buildctl to send the local build context and push a GHCR image. Use after sealos-deploy writes .sealos/build-request.json, or when creating, debugging, or inspecting sandbox BuildKit builds based on moby/buildkit buildkitd and buildctl.
compatibility: Requires kubectl access to a Kubernetes sandbox that can create Jobs, Services, and Secrets. Requires buildctl in the sandbox runtime. Requires GITHUB_TOKEN for GHCR push. This MVP supports sandbox-local build contexts and GHCR image output only.
metadata:
  author: labring
---

# K8s BuildKit Job

Run a temporary BuildKit daemon in the Kubernetes sandbox, then use `buildctl` from the sandbox runtime to send the local repository context and push the resulting image to GHCR.

This skill is the build executor for Seakills prepare artifacts:

```text
sealos-deploy
  -> .sealos/build-request.json
  -> k8s-buildkit-job
  -> temporary buildkitd Job + Service
  -> sandbox buildctl sends local context
  -> .sealos/build-result.json
```

## Scope

This skill does:

- read `.sealos/build-request.json`
- skip builds when `mode` is `reuse-image`
- create Kubernetes Secrets for GHCR Docker auth
- create a unique temporary BuildKit daemon Job and Service for each build
- run `buildctl` from the sandbox against that BuildKit Service
- send the sandbox-local context from `source.work_dir`
- push `image.target_image` to GHCR
- save logs under `~/.sealos/logs/`
- write `.sealos/build-result.json`

This skill does not:

- generate Dockerfiles
- persist local workspaces as Kubernetes volumes or uploaded artifacts
- modify `.sealos/template/index.yaml`
- deploy to Sealos
- run or manage a persistent shared `buildkitd` service

## Important Model

Each build creates a fresh BuildKit daemon Job and ClusterIP Service. The sandbox process runs `buildctl --addr tcp://<service>:1234 build` and streams the local context to that daemon. After result collection, the temporary Job and Service can be deleted.

The build context comes from the sandbox path in `.sealos/build-request.json` (`source.type=sandbox-context`, `source.work_dir`, `build.context_path`, and `build.dockerfile_path`). Phase 3 generated files are consumed directly from the sandbox filesystem; they do not need to be pushed to a Git ref.

## Quick Start

Execute the modules in order:

1. `modules/preflight.md` — kubectl, buildctl, namespace, token, and capability checks
2. `modules/build-request.md` — read and validate `.sealos/build-request.json`
3. `modules/registry-auth.md` — prepare GHCR auth for buildctl and buildkitd
4. `modules/job-template.md` — generate and apply the temporary BuildKit daemon Job + Service
5. `modules/run-and-watch.md` — wait for buildkitd, run buildctl, and collect logs
6. `modules/result.md` — write `.sealos/build-result.json`

## Logging

Every run should write a log file at:

```text
~/.sealos/logs/build-<YYYYMMDD-HHmmss>.log
```

Do not print or persist raw secrets, Docker auth config, or Kubernetes Secret YAML content in logs.

## Scripts

Scripts live in `scripts/` within this skill directory:

| Script | Usage | Purpose |
| --- | --- | --- |
| `generate-job.mjs` | `node generate-job.mjs --request <file> --namespace <ns> --job-name <name> --service-name <name> --registry-secret <name>` | Generate a temporary buildkitd Job + Service YAML from `build-request.json` |
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

Read `knowledge/failure-patterns.md` when a Job fails. Read `knowledge/security-notes.md` before changing token, Secret, or logging behavior.
