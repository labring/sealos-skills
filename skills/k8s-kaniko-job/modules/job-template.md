# Job Template

Generate a temporary kaniko Job for the build.

## Job Naming

Use unique DNS-safe names:

```text
seakills-kaniko-<repo-slug>-<short-ref>-<timestamp>
```

Example:

```text
seakills-kaniko-labring-kite-a1b2c3d-202604151230
```

## Generate YAML

Resolve the code-owned build deadline from Brain's runtime contract when the
Job is created. The resolver clamps the configured duration to the absolute
remaining deadline and the 1800-second hard maximum. It rejects an elapsed
absolute deadline instead of creating orphaned work. Callers without the
additive fields retain the 1800-second fallback:

```bash
BUILD_DEADLINE_SECONDS="$(
  node "$SKILL_DIR/scripts/resolve-build-deadline.mjs" \
    "$WORK_DIR/.sealos/build-runtime.json"
)"
```

Use:

```bash
node "$SKILL_DIR/scripts/generate-job.mjs" \
  --request "$WORK_DIR/.sealos/build/build-request.json" \
  --context "$WORK_DIR/.sealos/build/kaniko-context.json" \
  --namespace "$NAMESPACE" \
  --job-name "$JOB_NAME" \
  --registry-secret "$REGISTRY_AUTH_SECRET" \
  --s3-secret "$S3_AUTH_SECRET" \
  --s3-endpoint "$KANIKO_JOB_S3_ENDPOINT" \
  --active-deadline-seconds "$BUILD_DEADLINE_SECONDS" \
  --aws-region "$AWS_REGION" \
  ${SERVICE_ACCOUNT_NAME:+--service-account "$SERVICE_ACCOUNT_NAME"} \
  > "$WORK_DIR/.sealos/build/kaniko-job.yaml"
```

Review the YAML before applying when debugging. Never include Secret data in the manifest.

## Apply

```bash
kubectl apply -f "$WORK_DIR/.sealos/build/kaniko-job.yaml"
```

## Kaniko Command Shape

The generated Job runs:

```text
/kaniko/executor
  --dockerfile=<Dockerfile path inside tar root>
  --context=s3://kaniko-contexts/contexts/<devbox-name>/<build-id>/context.tar.gz
  --destination=<target_image>
  --custom-platform=linux/amd64
  --cleanup
```

For build args, the Job adds:

```text
--build-arg=KEY=value
```

The Job also sets:

```text
spec.activeDeadlineSeconds # min(runtime duration, absolute remaining time, 1800)
S3_ENDPOINT             # must be reachable from the kaniko Job Pod
S3_FORCE_PATH_STYLE=true
AWS_EC2_METADATA_DISABLED=true
AWS_REGION
AWS_ACCESS_KEY_ID       from Secret
AWS_SECRET_ACCESS_KEY   from Secret
```

If the current sandbox service account was resolved in preflight, set `serviceAccountName` on the generated Job Pod template. Do not let the temporary build Pod silently fall back to the namespace `default` service account.
