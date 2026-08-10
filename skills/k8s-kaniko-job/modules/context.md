# Context

Package the Docker build context and expose it through the local VersityGW bucket directory.

## Build ID

Use a unique ID per build:

```bash
SHORT_REF="$(node -e 'const r=require(process.argv[1]); process.stdout.write((r.source.ref || "unknown").slice(0, 12))' "$WORK_DIR/.sealos/build-request.json")"
BUILD_ID="build-${SHORT_REF}-$(date +%Y%m%d%H%M%S)"
```

Use the DevBox name resolved in preflight:

```bash
DEVBOX_NAME="${SEALOS_DEVBOX_NAME:-${DEVBOX_NAME:-${HOSTNAME:-devbox}}}"
```

## Generate context.tar.gz

Run:

```bash
node "$SKILL_DIR/scripts/prepare-context.mjs" \
  --request "$WORK_DIR/.sealos/build-request.json" \
  --context-root "$KANIKO_CONTEXT_POSIX_DIR" \
  --bucket "$KANIKO_CONTEXT_S3_BUCKET" \
  --prefix "$KANIKO_CONTEXT_S3_PREFIX" \
  --devbox "$DEVBOX_NAME" \
  --build-id "$BUILD_ID" \
  --out "$WORK_DIR/.sealos/kaniko-context.json"
```

This writes:

```text
$KANIKO_CONTEXT_POSIX_DIR/<devbox-name>/<build-id>/context.tar.gz
$WORK_DIR/.sealos/kaniko-context.json
```

## Packaging Rules

The tarball contains `source.work_dir + build.context_path`.

The script excludes only:

```text
.git
.sealos
```

Do not add broad exclusions such as `node_modules`, `dist`, or `build` by default. Dockerfile `COPY` and `.dockerignore` semantics are the source of truth; broad exclusions can remove files that the Dockerfile intentionally needs.

## Verify

When debugging, inspect the tarball without printing file contents:

```bash
tar -tzf "$(node -e 'const m=require(process.argv[1]); process.stdout.write(m.context.tar_path)' "$WORK_DIR/.sealos/kaniko-context.json")" | head -100
```

Confirm the Dockerfile path in `.sealos/kaniko-context.json.kaniko.dockerfile` exists inside the tar root.
