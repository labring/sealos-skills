# Build Request

Read and validate `.sealos/build-request.json`.

## Location

Default path:

```text
<WORK_DIR>/.sealos/build-request.json
```

If missing, stop and ask the user to run `/sealos-deploy <github-url>` first.

## Supported Modes

### reuse-image

If `mode` is `reuse-image`:

1. Do not create a Kubernetes Job.
2. Write `.sealos/build-result.json` with `status=skipped`.
3. Use `image.image_ref` as the result image.

### build-required

If `mode` is `build-required`, require:

- `source.type = "sandbox-context"`
- `source.work_dir`
- `image.target_image`
- `build.context_path`
- `build.dockerfile_path`

Stop if any required field is missing.

## Source Constraint

This MVP only supports sandbox-local Dockerfile builds. The skill packages files from `source.work_dir` and exposes the tarball through the DevBox VersityGW S3 endpoint.

`source.github_url`, `source.repo`, and `source.ref` may be present for traceability, but the build does not clone from them. Generated files such as `Dockerfile` are expected to be present under `source.work_dir`.

Stop if `source.work_dir` is missing, not absolute, or not readable from the sandbox process.

## Registry Constraint

This MVP supports `ghcr.io` output only.

If `image.target_image` does not start with `ghcr.io/`, stop and explain that other registries need additional auth handling.

## Dockerfile Path Semantics

`build.dockerfile_path` must point to a file inside `build.context_path`.

Examples:

```text
context_path=.        dockerfile_path=Dockerfile          -> --dockerfile=Dockerfile
context_path=apps/web dockerfile_path=apps/web/Dockerfile -> --dockerfile=Dockerfile
```

If the Dockerfile is outside the selected context, stop. Do not silently widen the context because that can package unrelated local files into the S3 tarball.
