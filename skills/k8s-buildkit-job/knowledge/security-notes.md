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

## BuildKit Pod Security

The temporary BuildKit daemon Job must avoid special security settings unless the target runtime explicitly requires and supports them.

```yaml
# Do not add these fields by default:
hostUsers: false
securityContext:
  privileged: true
```

Do not add privileged mode, Pod user namespaces, or unconfined seccomp/AppArmor fields to bypass policy. Do not use the rootless BuildKit image as a fallback; it depends on rootlesskit and subuid/subgid support that may not exist on the worker.

## Kubernetes Identity

Use only the sandbox-provided kubeconfig and mounted service account identity. Do not switch to an admin kubeconfig, and do not assume the namespace is `default`. When generating the temporary BuildKit Job, carry the current sandbox service account onto the Job Pod template whenever it can be resolved.

## Secret Lifecycle

The MVP may keep Secrets for debugging. If cleanup is added, delete temporary Secrets only after:

1. Job status is known.
2. logs are saved.
3. `.sealos/build-result.json` is written.
