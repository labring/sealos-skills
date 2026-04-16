# Run And Watch

Wait for the BuildKit Job and collect logs.

## Watch

Prefer polling Job status so both success and failure are handled clearly:

```bash
$KUBECTL get job "$JOB_NAME" -n "$NAMESPACE" -o json
```

Poll until one of these is true:

- `.status.succeeded >= 1`
- `.status.failed >= 1` and no active Pods remain
- timeout reached

Default timeout:

```text
30 minutes
```

## Collect Pod Name

```bash
POD_NAME=$($KUBECTL get pods -n "$NAMESPACE" \
  -l "job-name=$JOB_NAME" \
  -o jsonpath='{.items[0].metadata.name}')
```

## Collect Logs

Append these to `LOG_FILE`:

```bash
$KUBECTL get job "$JOB_NAME" -n "$NAMESPACE" -o yaml
$KUBECTL describe pod "$POD_NAME" -n "$NAMESPACE"
$KUBECTL logs "$POD_NAME" -n "$NAMESPACE" -c clone
$KUBECTL logs "$POD_NAME" -n "$NAMESPACE" -c buildkit
```

Before writing logs, redact:

- `GITHUB_TOKEN`
- tokenized GitHub clone URLs
- Docker auth base64 values
- Kubernetes Secret data

## Failure Handling

Read `knowledge/failure-patterns.md` when the Job fails. Classify the failure as one of:

- preflight
- clone
- dockerfile
- buildkit
- push
- kubernetes
- timeout

Use the classification in `.sealos/build-result.json`.
