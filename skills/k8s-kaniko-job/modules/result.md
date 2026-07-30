# Result

Update `<WORK_DIR>/.sealos/build-result.json` after every service.

For a reusable image:

```bash
node "$SKILL_DIR/scripts/write-result.mjs" \
  --request "$WORK_DIR/.sealos/build-request.json" \
  --out "$WORK_DIR/.sealos/build-result.json" \
  --service "$SERVICE_KEY" \
  --status skipped
```

For a successful Kaniko build:

```bash
node "$SKILL_DIR/scripts/write-result.mjs" \
  --request "$WORK_DIR/.sealos/build-request.json" \
  --out "$WORK_DIR/.sealos/build-result.json" \
  --service "$SERVICE_KEY" \
  --status succeeded \
  --digest "$DIGEST" \
  --pull-access "$PULL_ACCESS" \
  --namespace "$NAMESPACE" \
  --job "$JOB_NAME" \
  --pod "$POD_NAME" \
  --log-file "$LOG_FILE"
```

For failure:

```bash
node "$SKILL_DIR/scripts/write-result.mjs" \
  --request "$WORK_DIR/.sealos/build-request.json" \
  --out "$WORK_DIR/.sealos/build-result.json" \
  --service "$SERVICE_KEY" \
  --status failed \
  --error-phase "$ERROR_PHASE" \
  --error-message "$SAFE_ERROR_MESSAGE" \
  ${NAMESPACE:+--namespace "$NAMESPACE"} \
  ${JOB_NAME:+--job "$JOB_NAME"} \
  ${POD_NAME:+--pod "$POD_NAME"} \
  ${LOG_FILE:+--log-file "$LOG_FILE"}
```

Failed services have no deployable `image_ref`. The aggregate becomes failed
if any service fails, succeeded only when every expected service has either
been reused or built, and remains in progress while services are outstanding.

Before returning to `sealos-deploy`, validate:

- schema version and route match the request
- `expected_services` equals the request service count
- each request service appears exactly once
- every usable image is immutable
- successful built images record Kaniko Job, digest, platform, log path, and
  pull classification

Report only status, service names, immutable image refs, and safe evidence
paths. Do not include credentials.
