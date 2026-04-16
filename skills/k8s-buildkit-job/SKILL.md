---
name: k8s-buildkit-job
description: Run one-shot Kubernetes Jobs that use daemonless BuildKit to build and push container images from GitHub repositories. Use after sealos-deploy writes .sealos/build-request.json, or when creating, debugging, or inspecting Kubernetes build jobs based on moby/buildkit and buildctl-daemonless.sh.
compatibility: Requires kubectl access to a Kubernetes sandbox that can create Jobs and Secrets. Requires GITHUB_TOKEN for GitHub clone and GHCR push. This MVP supports GitHub repository sources and GHCR image output only.
metadata:
  author: labring
---

# K8s BuildKit Job

Run a one-shot Kubernetes Job that builds a GitHub repository with daemonless BuildKit and pushes the resulting image to GHCR.

This skill is the build executor for Seakills prepare artifacts:

```text
sealos-deploy
  -> .sealos/build-request.json
  -> k8s-buildkit-job
  -> Kubernetes BuildKit Job
  -> .sealos/build-result.json
```

## Scope

This skill does:

- read `.sealos/build-request.json`
- skip builds when `mode` is `reuse-image`
- create Kubernetes Secrets for GitHub token and GHCR Docker auth
- create a unique one-shot BuildKit Job for each build
- clone the GitHub repo/ref inside the Job
- run `buildctl-daemonless.sh build`
- push `image.target_image` to GHCR
- save logs under `~/.sealos/logs/`
- write `.sealos/build-result.json`

This skill does not:

- generate Dockerfiles
- upload local workspaces into Kubernetes
- build uncommitted local changes
- modify `.sealos/template/index.yaml`
- deploy to Sealos
- run or manage a persistent `buildkitd` service

## Important Model

A completed Kubernetes Job is not callable. Each build creates a fresh Job with a unique name. The Job starts a Pod, the Pod runs BuildKit, the build finishes, and the Pod exits.

The build context comes from the GitHub URL and ref in `.sealos/build-request.json`. Any generated `Dockerfile` or source changes must already exist in that GitHub ref before this skill runs.

## Quick Start

Execute the modules in order:

1. `modules/preflight.md` — kubectl, namespace, token, and capability checks
2. `modules/build-request.md` — read and validate `.sealos/build-request.json`
3. `modules/registry-auth.md` — prepare GitHub and GHCR Kubernetes Secrets
4. `modules/job-template.md` — generate and apply the one-shot BuildKit Job
5. `modules/run-and-watch.md` — wait for completion and collect logs
6. `modules/result.md` — write `.sealos/build-result.json`

## Logging

Every run should write a log file at:

```text
~/.sealos/logs/build-<YYYYMMDD-HHmmss>.log
```

Do not print or persist raw secrets, tokenized clone URLs, Docker auth config, or Kubernetes Secret YAML content in logs.

## Scripts

Scripts live in `scripts/` within this skill directory:

| Script | Usage | Purpose |
| --- | --- | --- |
| `generate-job.mjs` | `node generate-job.mjs --request <file> --namespace <ns> --job-name <name> --github-secret <name> --registry-secret <name>` | Generate a BuildKit Job YAML from `build-request.json` |
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
