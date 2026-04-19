# Run And Watch

Wait for the BuildKit daemon, run sandbox `buildctl`, and collect logs.

## Wait For BuildKitd

Wait until the BuildKit daemon Pod is ready and the Service has endpoints:

```bash
kubectl wait --for=condition=Ready pod \
  -n "$NAMESPACE" \
  -l "seakills.dev/buildkitd-job=$JOB_NAME" \
  --timeout=120s

kubectl get endpoints "$SERVICE_NAME" -n "$NAMESPACE" -o json
```

Stop if no ready endpoint exists.

## Run buildctl

Resolve paths from `.sealos/build-request.json`:

```text
context = source.work_dir + "/" + build.context_path
dockerfile = source.work_dir + "/" + dirname(build.dockerfile_path)
```

Run:

```bash
BUILDKIT_HOST="tcp://$SERVICE_NAME.$NAMESPACE.svc.cluster.local:1234"

buildctl --addr "$BUILDKIT_HOST" build \
  --frontend dockerfile.v0 \
  --local "context=$CONTEXT_PATH" \
  --local "dockerfile=$DOCKERFILE_DIR" \
  --output "type=image,name=$TARGET_IMAGE,push=true"
```

Add one `--opt build-arg:KEY=value` per `build.build_args` entry.

Capture stdout and stderr to `LOG_FILE`, redacting secrets. The build succeeds only if `buildctl` exits 0.

Default timeout:

```text
30 minutes for the `buildctl` process
```

## Collect Pod Name

```bash
POD_NAME=$(kubectl get pods -n "$NAMESPACE" \
  -l "seakills.dev/buildkitd-job=$JOB_NAME" \
  -o jsonpath='{.items[0].metadata.name}')
```

## Collect Logs

Append these to `LOG_FILE`:

```bash
kubectl get job "$JOB_NAME" -n "$NAMESPACE" -o yaml
kubectl get service "$SERVICE_NAME" -n "$NAMESPACE" -o yaml
kubectl describe pod "$POD_NAME" -n "$NAMESPACE"
kubectl logs "$POD_NAME" -n "$NAMESPACE" -c buildkitd
```

Before writing logs, redact:

- `GITHUB_TOKEN`
- Docker auth base64 values
- Kubernetes Secret data

## Failure Handling

Read `knowledge/failure-patterns.md` when the build fails. Classify the failure as one of:

- preflight
- dockerfile
- buildkit
- push
- kubernetes
- timeout

Use the classification in `.sealos/build-result.json`.
