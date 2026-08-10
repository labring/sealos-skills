# Registry And S3 Auth

Prepare GHCR credentials for kaniko and S3 credentials for the VersityGW context endpoint.

## GitHub Identity

Use `GITHUB_TOKEN` to fetch the GitHub login:

```bash
GITHUB_LOGIN=$(curl -fsSL \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/user | jq -r '.login')
```

If `jq` is unavailable, parse with Node.js or another structured JSON parser.

Stop if the login cannot be resolved. Do not log the token.

Preflight should already have verified that `GITHUB_TOKEN` includes `write:packages`. Do not defer that scope check to the push phase.

## Secret Names

Use unique names per build:

```text
seakills-ghcr-auth-<short-id>
seakills-kaniko-s3-<short-id>
```

## GHCR Docker Config Secret

Generate Docker auth config:

```bash
DOCKER_AUTH=$(printf '%s:%s' "$GITHUB_LOGIN" "$GITHUB_TOKEN" | base64 | tr -d '\n')
DOCKER_CONFIG_JSON=$(printf '{"auths":{"ghcr.io":{"auth":"%s"}}}' "$DOCKER_AUTH")
```

Create a Secret containing:

```text
config.json
```

```bash
kubectl create secret generic "$REGISTRY_AUTH_SECRET" \
  -n "$NAMESPACE" \
  --from-literal=config.json="$DOCKER_CONFIG_JSON" \
  --dry-run=client -o yaml | kubectl apply -f -
```

The kaniko container mounts this Secret at:

```text
/kaniko/.docker/config.json
```

Do not write the rendered JSON to logs.

## S3 Auth Secret

Create a Secret containing:

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
```

```bash
kubectl create secret generic "$S3_AUTH_SECRET" \
  -n "$NAMESPACE" \
  --from-literal=AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
  --from-literal=AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -
```

Do not write the rendered Secret YAML to logs.

## Cleanup

It is acceptable for the MVP to keep Secrets while debugging. If cleanup is implemented, only delete Secrets after logs and `.sealos/build-result.json` are written.
