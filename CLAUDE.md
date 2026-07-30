# CLAUDE.md

This branch is the prepare-only Seakills workflow for Sealos Cloud. Use the
current shared Sealos assessment, exact official-template, topology, image,
Dockerfile, conversion, security, and validation rules, while preserving the
Brain environment boundary.

## Environment Boundary

- GitHub credentials are injected; never start browser authentication.
- Missing images are built with `skills/k8s-kaniko-job/` using the active
  sandbox namespace, kubeconfig, service account, and DevBox VersityGW.
- No Docker daemon, Sealos OAuth, region selection, or workspace selection is
  part of this branch.
- Keep Template inputs unresolved for the downstream deployment system.
- Stop after `.sealos/template/index.yaml` and the delivery artifacts validate.
- Do not add deployment state, UPDATE mode, final apply/API calls,
  rollout/rollback, runtime verification, or `sealos-canvas`.

## Pipeline

```text
Preflight -> Assess -> Exact official-template lookup
  exact and safe -> copy official YAML -> validate -> finish
  otherwise -> discover full topology and images
            -> prepare per-service Dockerfiles
            -> aggregate reuse/Kaniko builds
            -> generate source-adapted Template
            -> validate -> finish
```

A low readiness score warns and continues. Stop at Phase 1 only when the
repository certainly has no reasonable project-backed online form.

Final artifacts are:

```text
.sealos/analysis.json
.sealos/template-references.json
.sealos/build-request.json
.sealos/build-result.json
.sealos/template/index.yaml
.sealos/delivery-manifest.json
```

Build request/result version `2.0` cover every final container service. Private
image credentials never enter the Template; affected workloads reference only
`${{ defaults.app_name }}`, and downstream creates the app-scoped pull Secret.

Run changed Node tests, the deploy/Kaniko suites, and the
`docker-to-sealos` quality gate. Preserve unrelated worktree changes and
untracked files.
