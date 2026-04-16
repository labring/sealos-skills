# Registry Auth

Prepare Kubernetes Secrets for GitHub clone and GHCR push.

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

## Secret Names

Use unique names per build:

```text
seakills-github-token-<short-id>
seakills-ghcr-auth-<short-id>
```

## GitHub Token Secret

Create a generic Secret containing the token for the clone init container:

```bash
$KUBECTL create secret generic "$GITHUB_TOKEN_SECRET" \
  -n "$NAMESPACE" \
  --from-literal=token="$GITHUB_TOKEN" \
  --dry-run=client -o yaml | $KUBECTL apply -f -
```

Do not write the rendered YAML to logs.

## GHCR Docker Config Secret

Generate Docker auth config:

```json
{
  "auths": {
    "ghcr.io": {
      "auth": "base64(<github-login>:<GITHUB_TOKEN>)"
    }
  }
}
```

Create a Secret containing:

```text
config.json
```

The BuildKit container mounts this Secret at:

```text
/root/.docker/config.json
```

## Cleanup

It is acceptable for the MVP to keep Secrets while debugging. If cleanup is implemented, only delete Secrets after logs and `build-result.json` are written.
