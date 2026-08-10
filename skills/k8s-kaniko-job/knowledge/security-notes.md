# Security Notes

The kaniko workflow handles registry and S3 credentials. Keep it safe by default.

## Never Log

- `GITHUB_TOKEN`
- `AWS_SECRET_ACCESS_KEY`
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
- S3 endpoint host without credentials
- kaniko output after token redaction

## Redaction Rules

Before appending command output to logs, redact exact values for:

- `GITHUB_TOKEN`
- `AWS_SECRET_ACCESS_KEY`
- Docker auth base64 values

## Context Packaging

The context tarball may contain application source code. Keep it inside the DevBox-local VersityGW bucket directory and expose it only through the cluster-internal S3 endpoint.

Do not package `.git` or `.sealos`.

Do not silently widen `build.context_path` when the Dockerfile is outside the context. That can expose unrelated local files.

## Kubernetes Identity

Use only the sandbox-provided kubeconfig and mounted service account identity. Do not switch to an admin kubeconfig, and do not assume the namespace is `default`. When generating the temporary kaniko Job, carry the current sandbox service account onto the Job Pod template whenever it can be resolved.

## Secret Lifecycle

The MVP may keep Secrets for debugging. If cleanup is added, delete temporary Secrets only after:

1. Job status is known.
2. logs are saved.
3. `.sealos/build-result.json` is written.
