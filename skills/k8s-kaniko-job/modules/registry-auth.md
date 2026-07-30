# Registry And S3 Auth

Create unique, build-only Kubernetes Secrets in the current sandbox namespace:

```text
seakills-ghcr-auth-<short-id>
seakills-kaniko-s3-<short-id>
seakills-build-args-<short-id>  # only when the selected service needs values
```

Resolve the GitHub login from the injected `GITHUB_TOKEN`. Build the Docker
config in memory, write it to a mode-`0600` system temporary file outside
`WORK_DIR`, and create the unique Secret without putting the payload in argv:

```bash
umask 077
AUTH_TEMP_DIR="$(mktemp -d)"
chmod 700 "$AUTH_TEMP_DIR"
trap 'rm -rf -- "$AUTH_TEMP_DIR"' EXIT
DOCKER_CONFIG_FILE="$AUTH_TEMP_DIR/config.json"
printf '%s' "$DOCKER_CONFIG_JSON" > "$DOCKER_CONFIG_FILE"
kubectl create secret generic "$REGISTRY_AUTH_SECRET" \
  -n "$NAMESPACE" \
  --from-file=config.json="$DOCKER_CONFIG_FILE"
```

Put the S3 values in a separate private env file and create the unique S3
Secret the same way:

```bash
S3_AUTH_FILE="$AUTH_TEMP_DIR/s3.env"
printf 'AWS_ACCESS_KEY_ID=%s\nAWS_SECRET_ACCESS_KEY=%s\n' \
  "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" > "$S3_AUTH_FILE"
kubectl create secret generic "$S3_AUTH_SECRET" \
  -n "$NAMESPACE" \
  --from-env-file="$S3_AUTH_FILE"
```

Do not save or print any rendered Secret, raw token, auth base64 value, or S3
secret. These Secrets authorize image building only. They are never copied
into `.sealos/template/index.yaml`.

For a selected service with `build_arg_names`, resolve values into a private
mode-`0600` env file outside `WORK_DIR`, verify that its keys exactly equal the
declared names, then create the unique build-args Secret without putting values
in argv or stdout:

```bash
kubectl create secret generic "$BUILD_ARGS_SECRET" \
  -n "$NAMESPACE" \
  --from-env-file="$PRIVATE_BUILD_ARGS_FILE"
```

Do not reuse one service's build-args Secret for another service.

Temporary-resource deletion still requires explicit user confirmation under
the repository safety policy. The generated Job has a TTL for controller
cleanup; do not issue an unconfirmed manual `kubectl delete`.
