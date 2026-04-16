# Result

Write `.sealos/build-result.json` after every run.

## Path

```text
<WORK_DIR>/.sealos/build-result.json
```

## Success

For a successful build:

```bash
node "$SKILL_DIR/scripts/write-result.mjs" \
  --request "$WORK_DIR/.sealos/build-request.json" \
  --out "$WORK_DIR/.sealos/build-result.json" \
  --status succeeded \
  --namespace "$NAMESPACE" \
  --job "$JOB_NAME" \
  --pod "$POD_NAME" \
  --log-file "$LOG_FILE"
```

## Failure

For a failed build:

```bash
node "$SKILL_DIR/scripts/write-result.mjs" \
  --request "$WORK_DIR/.sealos/build-request.json" \
  --out "$WORK_DIR/.sealos/build-result.json" \
  --status failed \
  --namespace "$NAMESPACE" \
  --job "$JOB_NAME" \
  --pod "$POD_NAME" \
  --log-file "$LOG_FILE" \
  --error-phase buildkit \
  --error-message "BuildKit build failed; see logs.local_file"
```

## Skipped

For `mode=reuse-image`, write a skipped result:

```bash
node "$SKILL_DIR/scripts/write-result.mjs" \
  --request "$WORK_DIR/.sealos/build-request.json" \
  --out "$WORK_DIR/.sealos/build-result.json" \
  --status skipped \
  --log-file "$LOG_FILE"
```

## Final Response

Report:

- status
- image ref
- `build-result.json` path
- log file path
- Job and Pod names when applicable

Do not include secrets.
