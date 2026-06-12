# Job Template

Generate a temporary rootless BuildKit daemon Job and Service for the build.

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
  ${SERVICE_ACCOUNT_NAME:+--service-account "$SERVICE_ACCOUNT_NAME"} \
  > "$WORK_DIR/.sealos/buildkitd.yaml"
```

Review the YAML before applying when debugging. Never include Secret data in the manifest.

## Apply

```bash
kubectl apply -f "$WORK_DIR/.sealos/buildkitd.yaml"
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

If the current sandbox service account was resolved in preflight, set `serviceAccountName` on the generated Job Pod template. Do not let the temporary build Pod silently fall back to the namespace `default` service account.

## Rootless Security Context

The generated Job uses `moby/buildkit:master-rootless` and must stay compatible with namespaces that enforce the Kubernetes Pod Security `baseline` profile. Do not set `securityContext.privileged: true`, `seccompProfile.type: Unconfined`, or `appArmorProfile.type: Unconfined` in this workflow.

The BuildKit daemon container uses:

```yaml
securityContext:
  runAsUser: 1000
  runAsGroup: 1000
  runAsNonRoot: true
```

The daemon image is started with `--oci-worker-no-process-sandbox`, matching the rootless Kubernetes pattern from BuildKit. This avoids privileged Pod admission failures, but some Dockerfiles can still fail at runtime if they require kernel features unavailable to rootless BuildKit.
