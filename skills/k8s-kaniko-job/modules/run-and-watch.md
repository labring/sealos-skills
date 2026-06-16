# Run And Watch

Wait for the kaniko Job and collect logs.

## Wait For Job

Run:

```bash
kubectl wait --for=condition=Complete job/"$JOB_NAME" \
  -n "$NAMESPACE" \
  --timeout=30m
```

If this exits non-zero, check whether the Job failed:

```bash
kubectl get job "$JOB_NAME" -n "$NAMESPACE" -o json
```

Treat a failed Job as a build failure and continue to log collection before writing `.sealos/build-result.json`.

## Collect Pod Name

```bash
POD_NAME=$(kubectl get pods -n "$NAMESPACE" \
  -l "seakills.dev/kaniko-job=$JOB_NAME" \
  -o jsonpath='{.items[0].metadata.name}')
```

## Collect Logs

Append these to `LOG_FILE`:

```bash
kubectl get job "$JOB_NAME" -n "$NAMESPACE" -o yaml
kubectl describe pod "$POD_NAME" -n "$NAMESPACE"
kubectl logs "$POD_NAME" -n "$NAMESPACE" -c kaniko
```

Before writing logs, redact:

- `GITHUB_TOKEN`
- `AWS_SECRET_ACCESS_KEY`
- Docker auth base64 values
- Kubernetes Secret data

## Failure Handling

Read `knowledge/failure-patterns.md` when the build fails. Classify the failure as one of:

- preflight
- context
- dockerfile
- kaniko
- push
- kubernetes
- timeout

Use the classification in `.sealos/build-result.json`.
