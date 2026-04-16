# Security Notes

The BuildKit Job handles GitHub and registry credentials. Keep the workflow safe by default.

## Never Log

- `GITHUB_TOKEN`
- tokenized clone URLs
- Docker auth JSON
- base64 auth strings
- Kubernetes Secret YAML content
- Secret data from `kubectl get secret -o yaml`

## Safe To Log

- Secret names
- namespace
- Job name
- Pod name
- image reference
- sanitized GitHub URL
- BuildKit output after token redaction

## Redaction Rules

Before appending command output to logs, redact:

```text
https://x-access-token:<anything>@github.com/
```

as:

```text
https://x-access-token:***@github.com/
```

Also redact the exact `GITHUB_TOKEN` value if it is available in the environment.

## Privileged Pods

The daemonless BuildKit Job uses:

```yaml
securityContext:
  privileged: true
```

This is a sandbox capability requirement for the current pattern, not a general recommendation for application workloads.

If the cluster denies privileged Pods, do not attempt to bypass policy. Report the blocker and stop.

## Secret Lifecycle

The MVP may keep Secrets for debugging. If cleanup is added, delete temporary Secrets only after:

1. Job status is known.
2. logs are saved.
3. `.sealos/build-result.json` is written.
