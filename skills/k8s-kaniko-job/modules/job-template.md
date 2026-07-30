# Job Template

Generate one unique, DNS-safe Job for the selected service:

```bash
node "$SKILL_DIR/scripts/generate-job.mjs" \
  --request "$WORK_DIR/.sealos/build-request.json" \
  --service "$SERVICE_KEY" \
  --context "$SERVICE_DIR/context.json" \
  --namespace "$NAMESPACE" \
  --job-name "$JOB_NAME" \
  --registry-secret "$REGISTRY_AUTH_SECRET" \
  --s3-secret "$S3_AUTH_SECRET" \
  --s3-endpoint "$KANIKO_JOB_S3_ENDPOINT" \
  --aws-region "$AWS_REGION" \
  --service-account "$SERVICE_ACCOUNT_NAME" \
  ${BUILD_ARGS_SECRET:+--build-args-secret "$BUILD_ARGS_SECRET"} \
  > "$SERVICE_DIR/job.yaml"
```

When `build_arg_names` is non-empty, `BUILD_ARGS_SECRET` is required and must
contain exactly those keys. The generated Job reads them through `secretKeyRef`
environment variables and passes only `$(ENV_NAME)` references in its
arguments. Values never enter the Job YAML, build request, logs, or delivery
artifacts.

The generated executor uses:

```text
--dockerfile=<path inside tar root>
--context=s3://<bucket>/<object>
--destination=<tagged GHCR build target>
--custom-platform=linux/amd64
--digest-file=/dev/termination-log
[--target=<declared stage>]
[--build-arg=<declared name>=$(secret-backed env name)]
--cleanup
```

The Job uses the current sandbox service account, contains no credential
values, and writes the result digest to the Kaniko container termination
message.

Apply the reviewed file:

```bash
kubectl apply -f "$SERVICE_DIR/job.yaml"
```
