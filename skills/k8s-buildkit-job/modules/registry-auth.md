# Registry Auth

Prepare GHCR credentials for sandbox `buildctl` and the temporary BuildKit daemon.

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

Preflight should already have verified that `GITHUB_TOKEN` includes `write:packages` and `read:packages`. Do not defer that scope check to the push phase.

## Secret Names

Use unique names per build:

```text
seakills-ghcr-auth-<short-id>
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

The BuildKit container mounts this Secret at:

```text
/root/.docker/config.json
```

Also make the same config available to sandbox `buildctl`, because BuildKit can receive registry credentials through the client session:

```bash
BUILDCTL_DOCKER_CONFIG=$(mktemp -d)
mkdir -p "$BUILDCTL_DOCKER_CONFIG"
printf '%s' "$DOCKER_CONFIG_JSON" > "$BUILDCTL_DOCKER_CONFIG/config.json"
export DOCKER_CONFIG="$BUILDCTL_DOCKER_CONFIG"
```

Do not write the rendered JSON to logs.

## Cleanup

It is acceptable for the MVP to keep Secrets while debugging. If cleanup is implemented, only delete Secrets after logs and `build-result.json` are written. Remove the temporary local `BUILDCTL_DOCKER_CONFIG` directory after the build unless debugging requires it.
