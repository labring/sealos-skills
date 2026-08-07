# Phase 3: Build and Push

### 4.0 Choose Image Destination

Registry selection is deferred to this phase because it's only needed when building.
If Phase 2 found an existing image, this phase is skipped entirely.

Before any login step, tell the user:

```text
This app will be built locally with Docker.
Choose where to push the image:

  1. GHCR (recommended) — agent can run `gh auth login` and finish browser auth with you
  2. Docker Hub — public images only; use your existing `docker login` session, or run `docker login` in another terminal
```

Default to **GHCR** when the user says "either is fine".

Important:
- This choice is about the image registry only. Local builds still require Docker either way.
- If the user chooses GHCR, use `gh auth login` as the preferred interactive auth path.
- If the user chooses Docker Hub, treat that path as public-image only.
- If the user chooses Docker Hub and there is no active Docker Hub session, stop and ask the user to run `docker login` in another terminal before continuing.

**If the user chooses GHCR:**
```bash
gh auth status 2>/dev/null
```
If authenticated:
```bash
GH_USER=$(gh api user -q .login)
gh auth token | docker login ghcr.io -u "$GH_USER" --password-stdin
REGISTRY=ghcr
```
Important:
- Before the first GHCR push, ensure the local `gh` session has `write:packages`.
- For GHCR, `write:packages` is sufficient for both pushing and later creating the app-scoped image pull Secret. GitHub CLI may not show a separate `read:packages` entry even though pull access works.
- If the current session is missing GHCR package access, refresh with:
  `node "<SKILL_DIR>/scripts/gh-refresh-scopes.mjs" write:packages`
- When `build-push.mjs` or `ensure-image-pull-secret.mjs` runs inside a TTY, it will now ask once whether it should refresh missing GHCR scopes and, on `y`, run `gh auth refresh` in the same PTY before continuing.
- If `gh auth refresh` exits successfully but the scopes are still missing, the script will immediately fall back to a full `gh auth login --web --scopes ...` in the same PTY and only continue after re-checking the scopes.
- A successful GHCR push does **not** guarantee Sealos can pull the image.
- Treat every locally built and newly pushed GHCR image as private by default. Do not run a visibility or anonymous-pull probe; proceed immediately to the built-in image pull Secret path. For a fresh deploy, wait for the Template API to return the real instance name, then create the same-named Secret immediately. For an update, refresh the Secret before swapping the image because the real instance name is already known from state.
- Do not attempt to make the package public during deployment. Do not probe or call GitHub REST endpoints, GraphQL mutations, package settings, or other visibility-changing paths; package visibility is not a deployment prerequisite.
- Do **not** surface raw registry host/username/password/email as user-facing template inputs when local `gh auth status` is already available.

If `build-push.mjs` or `ensure-image-pull-secret.mjs` returns:
```json
{
  "action": "gh_scope_refresh_required",
  "tty_required": true,
  "suggested_command": "node <SKILL_DIR>/scripts/gh-refresh-scopes.mjs write:packages"
}
```
then the agent should:
1. Ask the user once: `Missing GitHub Packages permission for GHCR. Refresh now? (y/n)`
2. If the current script is already running in a PTY, answer `y` there and let it continue in-place
3. Otherwise run the `suggested_command` in the **current PTY/TTY session**
4. If `gh` prompts `Press Enter to open github.com in your browser...`, send `Enter` in the same PTY
5. After the refresh command exits successfully, retry the exact failed command automatically

Do not tell the user to open a separate terminal when the current agent session can run a PTY command.

If `gh` is installed but not authenticated, explicitly tell the user that GHCR push requires GitHub CLI login, then trigger:
```bash
gh auth login
```
After successful login, retry GHCR authentication and continue.

**If the user chooses Docker Hub:**
```bash
docker info 2>/dev/null | grep "Username:"
```
If a Docker Hub session exists, use it:
```bash
DOCKER_HUB_USER=<extracted username>
REGISTRY=dockerhub
```

Treat this path as **public image only**.
Do not add Docker Hub private-image credential prompts or Docker Hub pull-secret automation in `sealos-deploy`.

If no Docker Hub session exists, tell the user:
```
Docker Hub push requires a local Docker Hub login session.
Please run `docker login` in another terminal, then continue this deploy.
```

### 4.1 Build & Push

Tag format: `<lowercase-owner-or-user>/<lowercase-repo-name>:YYYYMMDD-HHMMSS` (e.g., `ghcr.io/zhujingyang/kite:20260304-143022`). Normalize the registry namespace and repository name to lowercase before constructing the image reference. The timestamp ensures same-day rebuilds never collide.

Before invoking the build helper, create the build artifact directory:

```bash
mkdir -p "$WORK_DIR/.sealos/build"
```

**If Node.js available:**
```bash
node "<SKILL_DIR>/scripts/build-push.mjs" "$WORK_DIR" "<repo-name>" --registry ghcr
node "<SKILL_DIR>/scripts/build-push.mjs" "$WORK_DIR" "<repo-name>" --registry dockerhub --user "<user>"
```
Run the command that matches the user's chosen destination:
- GHCR: `node "<SKILL_DIR>/scripts/build-push.mjs" "$WORK_DIR" "<repo-name>" --registry ghcr`
- Docker Hub: `node "<SKILL_DIR>/scripts/build-push.mjs" "$WORK_DIR" "<repo-name>" --registry dockerhub`

Output: `{ "success": true, "image": "...", "registry": "ghcr" }` or `{ "success": false, "error": "..." }`

For GHCR success, `build-push.mjs` returns `requires_image_pull_secret: true`. Continue immediately with the GHCR image and let Phase 6 create/update the pull Secret automatically from `gh auth token`. Do not check or change package visibility.
If Phase 2 reused an existing public image, do **not** trigger the GHCR pull-secret flow.

**If Node.js not available (fallback — run docker directly):**
```bash
TAG=$(date +%Y%m%d-%H%M%S)
```

If the user chose GHCR:
```bash
GH_USER=$(gh api user -q .login)
gh auth token | docker login ghcr.io -u "$GH_USER" --password-stdin
IMAGE="ghcr.io/$(printf '%s' "$GH_USER" | tr '[:upper:]' '[:lower:]')/<lowercase-repo-name>:$TAG"
docker buildx build --platform linux/amd64 -t "$IMAGE" --push -f Dockerfile "$WORK_DIR"
```

If the user chose Docker Hub:
```bash
DOCKER_HUB_USER=$(docker info 2>/dev/null | sed -n 's/^ Username: //p')
IMAGE="$(printf '%s' "$DOCKER_HUB_USER" | tr '[:upper:]' '[:lower:]')/<lowercase-repo-name>:$TAG"
docker buildx build --platform linux/amd64 -t "$IMAGE" --push -f Dockerfile "$WORK_DIR"
```

If `$IMAGE` is a newly built GHCR image, mark that Phase 6 must create/update the namespace image pull Secret. A fresh deploy must use the real instance name returned by the Template API; an update may refresh the known same-named Secret before rollout. Do not run visibility or anonymous-pull probes and do not attempt any package-visibility mutation.
If the run is using an existing public image instead of a new local build, skip this secret-creation path.

### 4.2 Error Handling

If build fails:
1. Read the error output
2. Load error patterns from internal skill:
   ```
   <SKILL_DIR>/../dockerfile-skill/knowledge/error-patterns.md
   ```
3. Match the error → apply fix to Dockerfile → retry
4. Also consult if needed:
   ```
   <SKILL_DIR>/../dockerfile-skill/knowledge/system-deps.md
   <SKILL_DIR>/../dockerfile-skill/knowledge/best-practices.md
   ```
5. Max 3 retry attempts
6. If still failing → inform user with the specific error and suggest manual review

### 4.3 Record Result

Always write `.sealos/build/build-result.json` when Phase 4 runs:

- Success: `outcome: "success"` plus pushed image metadata
- Failure: `outcome: "failed"` plus the captured error message

This avoids leaving an empty `build/` directory after a failed build and makes resume/debug behavior inspectable.

On success, record `IMAGE_REF` from the build output. The build result file is at `.sealos/build/build-result.json`.

### Update analysis.json

On successful build, update `.sealos/analysis.json` to set `image_ref` to the built image reference.

---

