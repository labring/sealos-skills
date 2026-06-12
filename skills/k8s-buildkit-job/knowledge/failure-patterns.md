# Failure Patterns

Use this file when a BuildKit Job fails. Classify the failure and point the user to the smallest fix.

## preflight

Signals:

- `kubectl: command not found`
- `You must be logged in to the server`
- `cannot get namespaces "default"`
- `forbidden: User ... cannot get resource "namespaces"`
- `cannot create resource "jobs"`
- `cannot create resource "services"`
- `cannot create resource "secrets"`
- `buildctl: command not found`

Action:

- Resolve namespace and permissions from the current sandbox kubeconfig, current namespace, and mounted service account.
- Do not retry with `sudo kubectl --kubeconfig /etc/kubernetes/admin.conf`; that bypasses the sandbox permission model and can hide the real namespace-scoped failure.

## auth

Signals:

- `GITHUB_TOKEN` missing
- GitHub API `/user` returns 401 or 403
- `missing required GHCR scopes`
- `x-oauth-scopes` does not include `write:packages`
- Secret creation fails

Action:

- Provide a token with GHCR package write access and re-run the scope preflight before starting the build.
- Do not require `read:packages` for this push preflight; `write:packages` is the enforced scope.
- Do not paste the token into logs or generated YAML.

## context

Signals:

- `source.work_dir` is not readable
- `Dockerfile not found`
- `failed to walk`
- `no such file or directory`

Action:

- Confirm the sandbox process can read `source.work_dir`.
- Confirm `build.context_path` and `build.dockerfile_path` are relative to `source.work_dir`.
- Confirm Phase 3 generated files are still present in the sandbox workspace.

## dockerfile

Signals:

- `Dockerfile not found`
- `failed to read dockerfile`
- `no such file or directory`

Action:

- Confirm `build.dockerfile_path` points to a file under `source.work_dir`.
- Confirm `build.context_path` contains all files referenced by the Dockerfile.

## buildkit

Signals:

- `failed to solve`
- `executor failed running`
- package install errors
- compilation errors

Action:

- Treat as a project Dockerfile/build failure.
- Use the BuildKit logs to patch the Dockerfile or project build config.

## push

Signals:

- `denied`
- `unauthorized`
- `insufficient_scope`
- `failed to push`
- `unexpected status from HEAD request to https://ghcr.io`

Action:

- Confirm `target_image` starts with `ghcr.io/<owner>/<package>:<tag>`.
- Confirm `GITHUB_TOKEN` has `write:packages`.
- Confirm package owner permissions allow publishing.

## kubernetes

Signals:

- `privileged` denied by admission policy
- `CreateContainerConfigError`
- `ImagePullBackOff` for `moby/buildkit`
- `ErrImagePull`
- generated BuildKit Job runs as `default` service account instead of the caller's service account
- admission errors mentioning `privileged`, `seccompProfile.type: Unconfined`, or `appArmorProfile.type: Unconfined`

Action:

- For privileged or unconfined-profile denial, confirm the generated manifest uses rootless BuildKit and does not set privileged, unconfined seccomp, or unconfined AppArmor fields.
- For image pull issues, confirm the cluster can pull `moby/buildkit:master-rootless`.
- If the wrong service account was used, re-run with the current sandbox service account wired to `serviceAccountName`.

## timeout

Signals:

- Job remains active past timeout.
- Build logs show no progress.

Action:

- Inspect pod events and BuildKit logs.
- Retry with a longer timeout only after confirming the build is still making progress.
