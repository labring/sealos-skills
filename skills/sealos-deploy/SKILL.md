---
name: sealos-deploy
description: Prepare a GitHub repository or the current sandbox workspace for Sealos Cloud. Apply the current assessment, official-template, topology, per-service image, Dockerfile, and Template-generation rules; build missing images through Kaniko in the active sandbox namespace; validate the final YAML; and stop with prepare artifacts for the downstream deployment system. Use when the user asks to deploy a repository to Sealos or another cloud platform, asks to prepare or containerize it for Sealos, or invokes "/sealos-deploy".
compatibility: Git and Node.js 18+ are required. Python 3.8+ with PyYAML is required for standard Template generation. Kompose or Helm 3 is conditional on the selected deployment source. Kaniko builds additionally require the sandbox-provided kubectl context and service account, DevBox VersityGW S3 settings, and an injected GITHUB_TOKEN with GHCR write access. No Docker daemon, browser authentication, Sealos login, region selection, or workspace selection is used.
metadata:
  author: labring
---

# Sealos Deploy

Prepare a project for deployment to Sealos Cloud. This Brain branch follows
the same repository analysis, service routing, image, Dockerfile, and Template
rules as the current user-facing workflow, with one environment boundary:
after the final YAML and delivery artifacts are validated, this skill stops.
Another system performs the later deployment.

The repository is a source boundary, not necessarily one deployable root
application. A reasonable project-backed online form may be a child
application, static site, documentation site, Storybook, example, API, worker,
or a multi-service topology.

## Brain Environment Contract

- A GitHub token is injected. Never start browser authentication or ask the
  user to authenticate GitHub interactively.
- Image builds use `k8s-kaniko-job` because the sandbox has no Docker daemon.
- Build-time Kubernetes operations use the current kubeconfig, namespace, and
  service account. Never ask the user to select a Sealos region or workspace.
- The skill produces and validates `.sealos/template/index.yaml` and the same
  Brain delivery artifacts, then stops.
- Template inputs remain unresolved in the YAML for the downstream system.
- Private-image requirements are represented by workload
  `imagePullSecrets` references. Do not put registry credentials or a Secret
  payload in the Template.
- Do not create `.sealos/state.json`, detect DEPLOY/UPDATE mode, call the
  Template API, apply the final YAML, verify rollout/runtime, or perform
  rollback.

## Usage

```text
/sealos-deploy <github-url>
/sealos-deploy
```

When no URL is supplied, use the current sandbox repository if it has
resolvable GitHub metadata. A provided URL is materialized into a temporary
worktree. Kaniko always packages that sandbox-local worktree; it does not clone
source inside the build Job.

## Execution

Run in order:

1. `modules/preflight.md`
2. `modules/pipeline.md`

The pipeline is:

```text
Preflight
  -> Assess
  -> Exact official-template lookup
     -> safe unique exact match: copy official YAML and finish
     -> otherwise: discover source/topology/images
          -> prepare every required per-service build plan
          -> reuse images or build with Kaniko
          -> generate a source-adapted, digest-pinned Template
          -> validate and finish
```

Phase 1 stops only when the agent is certain that the repository has no
reasonable Sealos-compatible online form. A low readiness score warns and
continues. A failed candidate image, Dockerfile, adapter, or build rejects that
route or service attempt, not the whole repository; follow the bounded
Phase 4 → Phase 3 → Phase 4 repair loop when project-backed source remains.

## Artifacts

Delivery artifacts live under `<WORK_DIR>/.sealos/`:

```text
analysis.json
template-references.json
template-references/
deployment-source/rendered.yaml
deployment-source/resource-map.json
topology-evidence/<app>.yaml
build-request.json
build-result.json
template/index.yaml
delivery-manifest.json
```

Explicit-source and topology evidence files exist only when their route
requires them. Service-private Kaniko files under `.sealos/kaniko/` and private
logs under `~/.sealos/logs/` are execution evidence, not final delivery
artifacts.

The final handoff always includes these six invariant paths:

- `.sealos/analysis.json`
- `.sealos/template-references.json`
- `.sealos/build-request.json`
- `.sealos/build-result.json`
- `.sealos/template/index.yaml`
- `.sealos/delivery-manifest.json`

`.sealos/template-references.json` records the Phase 1.5 decision on both
routes. The official-template route writes an empty aggregate build request
and a skipped aggregate build result so downstream consumers receive one
stable artifact contract.

## Logging

Create one private log per run:

```bash
mkdir -p ~/.sealos/logs
LOG_FILE=~/.sealos/logs/prepare-$(date +%Y%m%d-%H%M%S).log
umask 077
printf '[%s] Prepare started\n' "$(date '+%Y-%m-%d %H:%M:%S')" > "$LOG_FILE"
```

Append phase boundaries and safe decisions to that file. Never log tokens,
kubeconfig content, S3 credentials, Docker auth, `.env` values, build-argument
values, or resolved Template secrets.

## Scripts

| Script | Purpose |
| --- | --- |
| `score-model.mjs` | Deterministic readiness scoring |
| `find-template-references.mjs` | Verified exact official-template decision |
| `inspect-deployment-source.mjs` | Select and render Compose, Helm, Kubernetes, or implicit source |
| `detect-image.mjs` | Inventory declared images and complete source topology; resolve exact selectors to digests |
| `validate-artifacts.mjs` | Validate all governed JSON artifacts and cross-artifact semantics |

All helpers emit structured JSON on stdout and human diagnostics on stderr.

## Internal Dependencies

```text
sealos-deploy
├── cloud-native-readiness
├── dockerfile-skill
├── k8s-kaniko-job
└── docker-to-sealos
```

`modules/dockerfile-integration.md` is the restricted Phase 3 boundary. It
overrides the standalone Dockerfile skill's build/report workflow.

## Safety

The final Template is read-only output in this workflow. Any manual deletion
of Kubernetes resources still requires explicit user confirmation. Build
credentials are temporary execution inputs and must never enter repository
artifacts or user-facing output.
