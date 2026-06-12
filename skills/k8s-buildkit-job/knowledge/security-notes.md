# Security Notes

The BuildKit workflow handles registry credentials. Keep it safe by default.

## Never Log

- `GITHUB_TOKEN`
- Docker auth JSON
- base64 auth strings
- Kubernetes Secret YAML content
- Secret data from `kubectl get secret -o yaml`

## Safe To Log

- Secret names
- namespace
- service account name
- Job name
- Pod name
- image reference
- BuildKit output after token redaction

## Redaction Rules

Before appending command output to logs, redact the exact `GITHUB_TOKEN` value if it is available in the environment.

## Rootless BuildKit Pods

The temporary BuildKit daemon Job must run as rootless BuildKit and stay compatible with namespaces that enforce Kubernetes Pod Security `baseline`.

```yaml
securityContext:
  runAsUser: 1000
  runAsGroup: 1000
  runAsNonRoot: true
```

Do not add `privileged: true` or unconfined seccomp/AppArmor fields to bypass policy. If rootless BuildKit fails at runtime, classify the failure from BuildKit logs and keep the Kubernetes admission policy intact.

## Kubernetes Identity

Use only the sandbox-provided kubeconfig and mounted service account identity. Do not switch to an admin kubeconfig, and do not assume the namespace is `default`. When generating the temporary BuildKit Job, carry the current sandbox service account onto the Job Pod template whenever it can be resolved.

## Secret Lifecycle

The MVP may keep Secrets for debugging. If cleanup is added, delete temporary Secrets only after:

1. Job status is known.
2. logs are saved.
3. `.sealos/build-result.json` is written.
