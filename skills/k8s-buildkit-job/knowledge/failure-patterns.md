# Failure Patterns

Use this file when a BuildKit Job fails. Classify the failure and point the user to the smallest fix.

## preflight

Signals:

- `kubectl: command not found`
- `You must be logged in to the server`
- `cannot create resource "jobs"`
- `cannot create resource "secrets"`

Action:

- Resolve kubectl access or namespace permissions.
- If needed, retry with `sudo kubectl --kubeconfig /etc/kubernetes/admin.conf`.

## auth

Signals:

- `GITHUB_TOKEN` missing
- GitHub API `/user` returns 401 or 403
- Secret creation fails

Action:

- Provide a token with repo read access and GHCR package write access.
- Do not paste the token into logs or generated YAML.

## clone

Signals:

- `Authentication failed`
- `Repository not found`
- `couldn't find remote ref`
- `pathspec ... did not match`

Action:

- Confirm `source.github_url` and `source.ref`.
- Confirm the token can read the repository.
- Confirm generated Dockerfile changes are committed to that ref.

## dockerfile

Signals:

- `Dockerfile not found`
- `failed to read dockerfile`
- `no such file or directory`

Action:

- Confirm `build.dockerfile_path` points to a file in the GitHub ref.
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

Action:

- For privileged denial, the sandbox policy must allow privileged BuildKit Jobs.
- For image pull issues, confirm the cluster can pull `moby/buildkit:master` and `alpine/git`.

## timeout

Signals:

- Job remains active past timeout.
- Build logs show no progress.

Action:

- Inspect pod events and BuildKit logs.
- Retry with a longer timeout only after confirming the build is still making progress.
