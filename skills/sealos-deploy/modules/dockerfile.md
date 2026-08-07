# Phase 3: Dockerfile

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

