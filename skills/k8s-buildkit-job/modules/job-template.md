# Job Template

Generate a temporary BuildKit daemon Job and Service for the build.

## Job Naming

Use unique DNS-safe names:

```text
seakills-buildkitd-<repo-slug>-<short-ref>-<timestamp>
seakills-buildkitd-<repo-slug>-<short-ref>-<timestamp>-svc
```

Example:

```text
seakills-buildkitd-labring-kite-a1b2c3d-202604151230
seakills-buildkitd-labring-kite-a1b2c3d-202604151230-svc
```

## Generate YAML

Use:

```bash
node "$SKILL_DIR/scripts/generate-job.mjs" \
  --request "$WORK_DIR/.sealos/build-request.json" \
  --namespace "$NAMESPACE" \
  --job-name "$JOB_NAME" \
  --service-name "$SERVICE_NAME" \
  --registry-secret "$REGISTRY_AUTH_SECRET" \
  > "$WORK_DIR/.sealos/buildkitd.yaml"
```

Review the YAML before applying when debugging. Never include Secret data in the manifest.

## Apply

```bash
$KUBECTL apply -f "$WORK_DIR/.sealos/buildkitd.yaml"
```

## BuildKit Command Shape

After the Service has endpoints, run `buildctl` from the sandbox runtime, not inside the BuildKit daemon Pod:

```text
buildctl --addr tcp://<service-name>.<namespace>.svc.cluster.local:1234 build
  --frontend dockerfile.v0
  --local context=<source.work_dir>/<context_path>
  --local dockerfile=<source.work_dir>/<dockerfile-dir>
  --output type=image,name=<target_image>,push=true
```

For build args, the Job adds:

```text
--opt build-arg:KEY=value
```

The local paths must be readable from the sandbox process running `buildctl`; this is how Phase 3 generated Dockerfiles are consumed without pushing them to GitHub.

## Security Context

The BuildKit daemon container uses:

```yaml
securityContext:
  privileged: true
```

If the cluster denies privileged Pods, stop and report that this sandbox cannot run the BuildKit daemon pattern without policy changes.
