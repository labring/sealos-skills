---
name: k8s-buildkit-job
description: Run a temporary standard BuildKit daemon in the active Kubernetes sandbox namespace, then use sandbox-local buildctl to send the local build context and push a GHCR image. Use after sealos-deploy writes .sealos/build-request.json, or when creating, debugging, or inspecting sandbox BuildKit builds based on moby/buildkit buildkitd and buildctl.
compatibility: Requires kubectl access through the sandbox-provided kubeconfig and service account. The sandbox identity must be able to create Jobs, Services, and Secrets in the active namespace. Requires buildctl in the sandbox runtime. Requires GITHUB_TOKEN for GHCR push. This MVP supports sandbox-local build contexts and GHCR image output only.
metadata:
  author: labring
---

# K8s BuildKit Job

Run a temporary standard BuildKit daemon in the active Kubernetes sandbox, then use `buildctl` from the sandbox runtime to send the local repository context and push the resulting image to GHCR.

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
- run that temporary Job in the same namespace and service-account context as the current sandbox when it can be resolved
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

Each build creates a fresh BuildKit daemon Job and ClusterIP Service in the active sandbox namespace. The sandbox process runs `buildctl --addr tcp://<service>:1234 build` and streams the local context to that daemon. After result collection, the temporary Job and Service can be deleted.

The generated Job uses `moby/buildkit:master` and intentionally avoids special Pod security fields such as `securityContext.privileged` and `hostUsers`. Do not add rootless or Pod user namespace settings unless the target runtime is known to support them.

Do not assume the namespace is `default`, and do not switch to an admin kubeconfig. Resolve the namespace from the active sandbox context or mounted service-account metadata, and carry the current service account onto the temporary Job so the workflow stays inside the caller's permissions.

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
| `resolve-kube-context.mjs` | `node resolve-kube-context.mjs [--namespace <ns>]` | Resolve the active namespace, kube context, current pod name, and current service account from the sandbox environment |
| `check-ghcr-token.mjs` | `node check-ghcr-token.mjs --token-env GITHUB_TOKEN --require-scope write:packages` | Verify that the injected GitHub token can publish to GHCR before starting a build |
| `generate-job.mjs` | `node generate-job.mjs --request <file> --namespace <ns> --job-name <name> --service-name <name> --registry-secret <name> [--service-account <name>]` | Generate a temporary buildkitd Job + Service YAML from `build-request.json` |
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
