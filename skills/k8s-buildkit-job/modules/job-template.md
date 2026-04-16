# Job Template

Generate a one-shot Kubernetes Job for the build.

## Job Naming

Use a unique DNS-safe name:

```text
seakills-build-<repo-slug>-<short-ref>-<timestamp>
```

Example:

```text
seakills-build-labring-kite-a1b2c3d-202604151230
```

## Generate YAML

Use:

```bash
node "$SKILL_DIR/scripts/generate-job.mjs" \
  --request "$WORK_DIR/.sealos/build-request.json" \
  --namespace "$NAMESPACE" \
  --job-name "$JOB_NAME" \
  --github-secret "$GITHUB_TOKEN_SECRET" \
  --registry-secret "$REGISTRY_AUTH_SECRET" \
  > "$WORK_DIR/.sealos/build-job.yaml"
```

Review the YAML before applying when debugging. Never include Secret data in the Job YAML.

## Apply

```bash
$KUBECTL apply -f "$WORK_DIR/.sealos/build-job.yaml"
```

## BuildKit Command Shape

The generated Job runs:

```text
buildctl-daemonless.sh build
  --frontend dockerfile.v0
  --local context=/workspace/<context_path>
  --local dockerfile=/workspace/<dockerfile-dir>
  --output type=image,name=<target_image>,push=true
```

For build args, the Job adds:

```text
--opt build-arg:KEY=value
```

## Security Context

The BuildKit container uses:

```yaml
securityContext:
  privileged: true
```

If the cluster denies privileged Pods, stop and report that this sandbox cannot run the daemonless BuildKit Job pattern without policy changes.
