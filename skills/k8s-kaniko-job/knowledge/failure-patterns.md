# Failure Patterns

Use this file when a kaniko Job fails. Classify the failure and point the user to the smallest fix.

## preflight

Signals:

- `kubectl: command not found`
- `You must be logged in to the server`
- `cannot get namespaces "default"`
- `forbidden: User ... cannot get resource "namespaces"`
- `cannot create resource "jobs"`
- `cannot create resource "secrets"`
- `S3_ENDPOINT is missing`
- `AWS_SECRET_ACCESS_KEY is missing`

Action:

- Resolve namespace and permissions from the current sandbox kubeconfig, current namespace, and mounted service account.
- Confirm the DevBox runtime injects `S3_ENDPOINT`.
- Confirm `AWS_SECRET_ACCESS_KEY`, `SEALOS_DEVBOX_JWT_SECRET`, or `DEVBOX_JWT_SECRET` is available.
- Do not retry with an admin kubeconfig or hard-code Sealos internal CR lookups.

## auth

Signals:

- `GITHUB_TOKEN` missing
- GitHub API `/user` returns 401 or 403
- `missing required GHCR scopes`
- `x-oauth-scopes` does not include `write:packages`
- Secret creation fails

Action:

- Provide a token with GHCR package write access and re-run the scope preflight before starting the build.
- Do not paste the token into logs or generated YAML.

## context

Signals:

- `source.work_dir` is not readable
- `build.context_path does not exist`
- `build.dockerfile_path must be inside build.context_path`
- `tar failed`
- kaniko reports missing files that should have been in the context
- Dockerfile copies root workspace files but `build.context_path` points at a subdirectory

Action:

- Confirm `build.context_path` and `build.dockerfile_path` are relative to `source.work_dir`.
- Confirm the Dockerfile is inside the selected context.
- If a subdirectory Dockerfile copies root files such as `pnpm-lock.yaml`, `package.json`, workspace manifests, `turbo.json`, or sibling packages, set `context_path="."` and keep `dockerfile_path` at the subdirectory Dockerfile.
- Inspect `.sealos/kaniko-context.json` and `tar -tzf` output.

## dockerfile

Signals:

- `Dockerfile not found`
- `failed to read dockerfile`
- `no such file or directory`

Action:

- Confirm `.sealos/kaniko-context.json.kaniko.dockerfile` points to a file inside the tar root.
- Confirm `build.context_path` contains all files referenced by Dockerfile `COPY` and `ADD`.

## kaniko

Signals:

- `error building image`
- `error building stage`
- package install errors
- compilation errors

Action:

- Treat as a project Dockerfile/build failure.
- Use the kaniko logs to patch the Dockerfile or project build config.

## push

Signals:

- `denied`
- `unauthorized`
- `insufficient_scope`
- `failed to push`
- registry auth errors for `ghcr.io`
- `repository can only contain the characters ...`

Action:

- Confirm `target_image` starts with `ghcr.io/<owner>/<package>:<tag>`.
- Confirm every GHCR repository path component is lowercase. Lowercase display-case GitHub logins before using them as the target owner.
- Confirm `GITHUB_TOKEN` has `write:packages`.
- Confirm package owner permissions allow publishing.

## kubernetes

Signals:

- `CreateContainerConfigError`
- `ImagePullBackOff` for kaniko
- `ErrImagePull`
- generated kaniko Job runs as `default` service account instead of the caller's service account

Action:

- Confirm the cluster can pull the kaniko executor image.
- If the wrong service account was used, re-run with the current sandbox service account wired to `serviceAccountName`.
- Inspect pod events and kaniko logs.

## timeout

Signals:

- Job remains active past timeout.
- Build logs show no progress.

Action:

- Inspect pod events and kaniko logs.
- Retry with a longer timeout only after confirming the build is still making progress.
