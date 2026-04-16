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

- `source.github_url`
- `source.repo`
- `source.ref`
- `image.target_image`
- `build.context_path`
- `build.dockerfile_path`

Stop if any required field is missing.

## Source Constraint

This MVP only supports GitHub repository sources. The Kubernetes Job clones the GitHub URL and ref from `build-request.json`; it does not use local files.

If generated files such as `Dockerfile` are only present locally, the build will fail or build stale source. Ensure they are committed and available from `source.ref`.

## Registry Constraint

This MVP supports `ghcr.io` output only.

If `image.target_image` does not start with `ghcr.io/`, stop and explain that other registries need additional auth handling.

## Dockerfile Path Semantics

`build.dockerfile_path` points to a file. BuildKit's `--local dockerfile=` needs the containing directory.

Examples:

```text
Dockerfile              -> --local dockerfile=/workspace
apps/web/Dockerfile     -> --local dockerfile=/workspace/apps/web
```

The generated Job script validates that the file exists before BuildKit starts.
