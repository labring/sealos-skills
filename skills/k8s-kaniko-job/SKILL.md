---
name: k8s-kaniko-job
description: Build every build-required service from a Sealos aggregate build request by packaging sandbox-local contexts into DevBox VersityGW S3, running temporary Kaniko Jobs in the current Kubernetes namespace, pushing GHCR images, resolving immutable digests, and updating the aggregate .sealos/build-result.json.
compatibility: Requires the sandbox-provided kubectl context and service account, DevBox VersityGW S3 settings, and an injected GITHUB_TOKEN with GHCR write access. No Docker daemon, browser authentication, Sealos login, region selection, or workspace selection is used.
metadata:
  author: labring
---

# K8s Kaniko Job

This is the Brain prepare workflow's build executor:

```text
.sealos/build-request.json (all services)
  -> initialize .sealos/build-result.json
  -> record every reuse-image service
  -> package and build each build-required service with Kaniko
  -> resolve digest and anonymous/private pull behavior
  -> complete .sealos/build-result.json
```

The caller owns analysis, Dockerfile preparation, image reuse decisions, and
Template generation. This skill owns only the sandbox-to-GHCR build boundary.

## Invariants

- Read aggregate build request version `2.0`.
- Run only for `route=standard`; `route=official-template` initializes a
  `status=skipped` aggregate result and performs no Kubernetes work.
- Select each service explicitly with `--service <name-or-artifact-key>`.
- Preserve `services[]` as the complete result and project the requested
  `primary_service` to top-level `mode`, `image`, and `kubernetes` for Brain.
- Skip Kaniko for `mode=reuse-image`, but still record that service in the
  aggregate result.
- Use the current namespace, kubeconfig, and service account. Never select a
  region, workspace, admin kubeconfig, or another namespace implicitly.
- Build only tagged `ghcr.io` targets and finish with digest-pinned image refs.
- Never place GitHub tokens, S3 credentials, Docker auth, or build-arg values in
  committed artifacts, command output, Job annotations, or Template YAML.
- Do not call `docker`, `gh auth`, Sealos OAuth, or the Template API.
- Do not deploy the generated Sealos Template.

## Execution Order

1. `modules/build-request.md` — validate the aggregate request and initialize
   the aggregate result.
2. `modules/preflight.md` — only when at least one service requires a build,
   resolve the sandbox Kubernetes and VersityGW capabilities.
3. `modules/registry-auth.md` — create short-lived build-only GHCR and S3
   Secrets in the current namespace.
4. For each `build-required` service:
   - `modules/context.md`
   - `modules/job-template.md`
   - `modules/run-and-watch.md`
   - `modules/result.md`
5. For each `reuse-image` service, use `modules/result.md` without creating a
   Job.
6. Validate the completed result against
   `schemas/build-result.schema.json`.

Use service-scoped private working paths:

```text
.sealos/kaniko/<artifact-key>/context.json
.sealos/kaniko/<artifact-key>/job.yaml
~/.sealos/logs/build-<artifact-key>-<timestamp>.log
```

These are execution evidence, not delivery artifacts.

## Scripts

| Script | Purpose |
| --- | --- |
| `resolve-kube-context.mjs` | Resolve the active namespace, pod, service account, and kube context |
| `check-ghcr-token.mjs` | Validate the injected token and GHCR target owner before building |
| `prepare-context.mjs` | Package one selected service context into VersityGW S3 |
| `generate-job.mjs` | Generate one selected service's temporary Kaniko Job |
| `check-image-pull.mjs` | Classify the pushed digest as anonymous, private, or indeterminate |
| `write-result.mjs` | Initialize and incrementally update the aggregate result |

Read `knowledge/failure-patterns.md` for failure classification and
`knowledge/security-notes.md` before changing any credential or logging
behavior.
