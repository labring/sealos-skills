# Phase 2: Discover and image preparation

Detect an existing image or prepare a Dockerfile for local build.

## Phase 2: Detect Existing Image

### 2.S Source-Ready Static Site Image Path

Before registry discovery, check the in-memory eligibility decision. When its reason
codes contain `SOURCE_READY_STATIC_SITE`, the requested project has a root
`index.html`, a public asset tree that can be served without transformation, and no
higher-priority build, server-runtime, container, or sensitive-file signal.

Set `STATIC_NGINX_IMAGE_BUILD=true` and update `.sealos/analysis.json` with
`language: "html"`, `framework: "static_html"`, `package_manager: null`, port
`8080`, and `image_ref: null`. Skip existing-image discovery for this source-only
tree and continue to Phase 3. Phase 3 must generate the pinned static Nginx
Dockerfile, and Phase 4 must build and push it through the same registry path as
every other locally built image.

This path is intentionally evidence-based and fail-closed. File count, extension,
and directory depth are not deployment decisions. Preserve arbitrary regular public
assets and their relative paths, including nested directories, while excluding
repository metadata through `.dockerignore`. Give an existing container contract
precedence over this path. Route build/runtime manifests and server-source signals
through ordinary analysis. Stop for possible secrets, symbolic links, or a missing
root `index.html`. Never silently omit a business asset from the image.

The remaining Phase 2 instructions apply when `STATIC_NGINX_IMAGE_BUILD` is false.

**If Node.js available:**
```bash
## With GitHub URL:
node "<SKILL_DIR>/scripts/detect-image.mjs" "$GITHUB_URL" "$WORK_DIR"
## Local project without GitHub URL:
node "<SKILL_DIR>/scripts/detect-image.mjs" "$WORK_DIR"
```
The script auto-detects GitHub URL from `git remote` if only a directory is given.

Output: `{ "found": true, "image": "...", "tag": "...", ... }` or `{ "found": false }`

**If Node.js not available (fallback — use curl):**

1. Parse owner/repo from `GITHUB_URL` (if empty, try `git -C "$WORK_DIR" remote get-url origin`)
2. If still no GitHub URL, skip Docker Hub / GHCR checks and only scan project files for image references
3. Docker Hub check (try `<owner>/<repo>`, then `<repo>/<repo>` if different):
```bash
curl -sf "https://hub.docker.com/v2/namespaces/<owner>/repositories/<repo>/tags?page_size=10"
## If not found and owner != repo:
curl -sf "https://hub.docker.com/v2/namespaces/<repo>/repositories/<repo>/tags?page_size=10"
```
4. GHCR check:
```bash
TOKEN=$(curl -sf "https://ghcr.io/token?scope=repository:<owner>/<repo>:pull" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -sf -H "Authorization: Bearer $TOKEN" "https://ghcr.io/v2/<owner>/<repo>/tags/list"
```
5. **docker-compose.yml scan** — AI reads `docker-compose.yml` / `docker-compose.yaml` (already in Phase 1 context) and extracts `image:` fields. Exclude infrastructure images (postgres, mysql, redis, mongo, etc.). For each candidate, verify with curl against Docker Hub or GHCR.
6. **CI workflow scan** — AI reads `.github/workflows/*.yml` and extracts `docker push` targets, `images:` fields, and `tags:` references. Verify each candidate.
7. Search `README.md` for `ghcr.io/` references, `docker run/pull` commands, and `hub.docker.com/r/<ns>/<repo>` URLs
8. **Docker Hub search API** (catch-all) — if nothing found above:
```bash
curl -sf "https://hub.docker.com/v2/search/repositories/?query=<repo>&page_size=5"
## For each result, fetch detail and check if full_description mentions github.com/<owner>/<repo>
curl -sf "https://hub.docker.com/v2/repositories/<ns>/<repo>/"
```
9. For any candidate, verify amd64: `docker manifest inspect <image>:<tag>`

Prefer versioned tags (`v1.2.3`) over `latest`.

### Phase 2 Post-Verification (AI)

After Phase 2 produces a result, the AI should cross-validate:

1. **If `source` is `dockerhub` or `ghcr`** (direct owner/repo match) — high confidence, no extra validation needed.
2. **If `source` is `compose`, `ci-workflow`, `dockerhub-readme`, or `dockerhub-search`** — cross-check with project context:
   - Does the README mention this image or its namespace?
   - Does `docker-compose.yml` reference it?
   - Does the Docker Hub repo description link back to this GitHub project?
   - If multiple signals agree → high confidence. If only one signal → note as medium confidence in your assessment.
3. **If `found: false`** — the AI should use its Phase 1 analysis context to attempt one more check: if Phase 1 identified a Docker image name from project docs or code that the script didn't find, try verifying it manually with curl.

### Update analysis.json

If an existing image is found, update `.sealos/analysis.json` to set `image_ref` to `{image}:{tag}`.

**Decision:**
- Found amd64 image → record `IMAGE_REF = {image}:{tag}`, **skip to Phase 5**
- Not found → continue to Phase 3

---


---

## Phase 3: Dockerfile

### 3.1 Check Existing Dockerfile

If `WORK_DIR/Dockerfile` exists:
1. Read it and assess quality
2. Reasonable (multi-stage or appropriate for language) → use directly, go to Phase 4
3. Problematic (uses `:latest`, runs as root, missing essential deps) → fix, then Phase 4

### 3.2 Generate Dockerfile

If no Dockerfile exists, generate one.

**Load the appropriate template from the internal dockerfile-skill:**
```
<SKILL_DIR>/../dockerfile-skill/templates/static-nginx.dockerfile
<SKILL_DIR>/../dockerfile-skill/templates/golang.dockerfile
<SKILL_DIR>/../dockerfile-skill/templates/nodejs-express.dockerfile
<SKILL_DIR>/../dockerfile-skill/templates/nodejs-nextjs.dockerfile
<SKILL_DIR>/../dockerfile-skill/templates/python-fastapi.dockerfile
<SKILL_DIR>/../dockerfile-skill/templates/python-django.dockerfile
<SKILL_DIR>/../dockerfile-skill/templates/java-springboot.dockerfile
```

Read the template matching the detected language/framework, then adapt it:
- Replace placeholder ports with detected ports
- Adjust build commands based on actual package manager (npm/yarn/pnpm/bun)
- Add system dependencies if needed
- Set correct entry point

When `STATIC_NGINX_IMAGE_BUILD=true`, copy
`<SKILL_DIR>/../dockerfile-skill/templates/static-nginx.dockerfile` as the project
Dockerfile without adding a ConfigMap publication path or a frontend build stage.
The pinned unprivileged Nginx image serves the recursively copied source-ready asset
tree on port `8080`. Copy
`<SKILL_DIR>/../dockerfile-skill/templates/static-nginx.dockerignore` to
`$WORK_DIR/.dockerignore`; do not use the generic ignore list below, because arbitrary
public assets such as Markdown downloads must not be silently omitted.

**Pre-load Phase 1 analysis for analyze.md:**

Read `.sealos/analysis.json` before running analyze.md. The following fields are available
as pre-loaded context, so analyze.md can skip its overlapping detection steps:
`language`, `framework`, `package_manager`, `port`, `databases`, `has_dockerfile`, `complexity_tier`.

**For detailed analysis guidance, read:**
```
<SKILL_DIR>/../dockerfile-skill/modules/analyze.md    — 17-step analysis process
<SKILL_DIR>/../dockerfile-skill/modules/generate.md   — generation rules and best practices
```

**Validate generated Dockerfile:**

After generating the Dockerfile, run validation if Node.js is available:
```bash
node "<SKILL_DIR>/../dockerfile-skill/scripts/validate-dockerfile.mjs" "$WORK_DIR/Dockerfile" --port=<detected_port> --json
```
If validation reports errors, fix the Dockerfile before proceeding to Phase 4.
If Node.js is not available, manually verify the Validation Checklist in generate.md.

**Key Dockerfile principles:**
- Multi-stage build when compilation is required; source-ready static sites use the single-stage pinned Nginx template
- Pin base image versions (never `:latest`)
- Run as a non-root user (for example USER 1001, or the static Nginx image's USER 101)
- Proper `.dockerignore`

For non-static-image paths, also generate `.dockerignore`:
```
.git
node_modules
__pycache__
.env
.env.local
*.md
.vscode
.idea
.sealos
Dockerfile
.dockerignore
```

---

