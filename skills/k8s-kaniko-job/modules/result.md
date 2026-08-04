# Result

Write `.sealos/build/build-result.json` after every run.

## Path

```text
<WORK_DIR>/.sealos/build/build-result.json
```

## Success

For a successful build:

```bash
node "$SKILL_DIR/scripts/write-result.mjs" \
  --request "$WORK_DIR/.sealos/build/build-request.json" \
  --out "$WORK_DIR/.sealos/build/build-result.json" \
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
  --request "$WORK_DIR/.sealos/build/build-request.json" \
  --out "$WORK_DIR/.sealos/build/build-result.json" \
  --status failed \
  --namespace "$NAMESPACE" \
  --job "$JOB_NAME" \
  --pod "$POD_NAME" \
  --log-file "$LOG_FILE" \
  --error-phase kaniko \
  --error-message "Kaniko build failed; see logs.local_file"
```

## Final Response

Report:

- status
- image ref
- `build-result.json` path
- log file path
- kaniko Job and Pod names when applicable

Do not include secrets.

## Cleanup

The generated Job uses `ttlSecondsAfterFinished` for automatic Kubernetes cleanup. Do not issue an interactive `kubectl delete` from the non-interactive sandbox flow. Executor auth Secrets remain scoped to the sandbox namespace and are owned by the sandbox lifecycle until an owner-reference cleanup contract is available.
