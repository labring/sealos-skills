# Run And Watch

Wait for the selected Job and always collect failure evidence:

```bash
kubectl wait --for=condition=Complete job/"$JOB_NAME" \
  -n "$NAMESPACE" \
  --timeout=30m
```

If the wait does not complete, inspect the Job conditions before classifying
the result. A nonzero wait alone is not proof that the build failed.

Resolve the selected Pod by the generated Job label, then append redacted Job,
Pod, and Kaniko log evidence to the service-private log. Never persist token,
S3 secret, Docker auth, Kubernetes Secret data, or build-arg values.

On success, read the digest written by Kaniko:

```bash
DIGEST="$(kubectl get pod "$POD_NAME" -n "$NAMESPACE" \
  -o jsonpath='{.status.containerStatuses[?(@.name=="kaniko")].state.terminated.message}')"
```

Require `sha256:` plus 64 hexadecimal characters. Then classify downstream
pull behavior without credentials:

```bash
node "$SKILL_DIR/scripts/check-image-pull.mjs" \
  --image "$TARGET_IMAGE" \
  --digest "$DIGEST" \
  > "$SERVICE_DIR/pull-check.json"
```

The classification is `anonymous`, `ghcr_secret_required`, or
`indeterminate`. This records the deployment requirement but does not create
an application pull Secret.

Classify build failures as `preflight`, `build-request`, `auth`, `context`,
`dockerfile`, `kaniko`, `push`, `kubernetes`, or `unknown`.
