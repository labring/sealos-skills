# Build Request

Read `<WORK_DIR>/.sealos/build-request.json` and validate it with the owning
`sealos-deploy` schema and semantic validator.

The request is aggregate version `2.0`:

```json
{
  "version": "2.0",
  "route": "standard",
  "source": {
    "type": "sandbox-context",
    "work_dir": "/absolute/repository/path"
  },
  "services": [
    {
      "name": "web",
      "artifact_key": "web",
      "mode": "build-required",
      "image": {
        "target_image": "ghcr.io/example/app-web:build-id"
      },
      "build": {
        "context_path": ".",
        "dockerfile_path": "Dockerfile",
        "target": null,
        "build_arg_names": []
      }
    }
  ]
}
```

Initialize the matching aggregate result before processing services:

```bash
node "$SKILL_DIR/scripts/write-result.mjs" \
  --request "$WORK_DIR/.sealos/build-request.json" \
  --out "$WORK_DIR/.sealos/build-result.json" \
  --initialize true
```

For `route=official-template`, this writes a complete skipped result. Return to
the caller immediately; do not run Kubernetes or registry preflight.

For `route=standard`, require at least one service. Service names and
`artifact_key` values must each be unique.

## Service Modes

`reuse-image` requires an immutable `image_ref`, known `platforms`, recorded
`pull_access`, and no build plan or target image. Record it immediately:

```bash
node "$SKILL_DIR/scripts/write-result.mjs" \
  --request "$WORK_DIR/.sealos/build-request.json" \
  --out "$WORK_DIR/.sealos/build-result.json" \
  --service "$SERVICE" \
  --status skipped
```

`build-required` requires a tagged GHCR target and a build plan. The
Dockerfile must be inside its context. Build arguments are names only; values
must come from a private runtime file and must never enter the request.

If every service is reusable, skip all Kubernetes, S3, and GHCR write
preflight. The aggregate result should become `succeeded` after each service
is recorded.
