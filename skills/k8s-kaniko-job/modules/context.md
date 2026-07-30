# Context

Package one selected `build-required` service at a time:

```bash
SERVICE_KEY="<artifact-key>"
BUILD_ID="${SERVICE_KEY}-$(date +%Y%m%d%H%M%S)"
SERVICE_DIR="$WORK_DIR/.sealos/kaniko/$SERVICE_KEY"
mkdir -p "$SERVICE_DIR"

node "$SKILL_DIR/scripts/prepare-context.mjs" \
  --request "$WORK_DIR/.sealos/build-request.json" \
  --service "$SERVICE_KEY" \
  --context-root "$KANIKO_CONTEXT_POSIX_DIR" \
  --bucket "$KANIKO_CONTEXT_S3_BUCKET" \
  --prefix "$KANIKO_CONTEXT_S3_PREFIX" \
  --devbox "$DEVBOX_NAME" \
  --build-id "$BUILD_ID" \
  --out "$SERVICE_DIR/context.json"
```

The tarball contains exactly
`source.work_dir + service.build.context_path`. The helper excludes repository
metadata, `.sealos`, and the local VersityGW runtime stores. It does not
silently exclude dependency or build directories; `.dockerignore` and the
Dockerfile remain the source of truth.

The metadata records the selected service identity. The Job generator rejects
metadata that does not match the selected request service.

The Dockerfile must be inside the selected context. A monorepo Dockerfile may
live in a subdirectory while using repository root as context, but the context
must never be widened implicitly.
