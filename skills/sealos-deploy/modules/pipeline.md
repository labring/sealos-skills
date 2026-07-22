# Build And Prepare Pipeline

After preflight passes, execute the deployment eligibility gate, then Phase 1–6 in
order.

`SKILL_DIR` refers to the directory containing this skill's `SKILL.md`. Sibling skills are at `<SKILL_DIR>/../`.

Use `ENV` from preflight to choose between script mode (Node.js available) and fallback mode (AI-native).

This workflow can start from either the current workspace or an explicit GitHub URL. If preflight cloned a repository, `WORK_DIR` points to that shallow clone. If preflight reused the current workspace, `WORK_DIR` points to that sandbox-local path.

## Phase 0.4: Deployment Eligibility Gate

Run this gate before creating `.sealos/`, reading resume artifacts, readiness
scoring, Railpack probing, Dockerfile generation, image detection, or build.

Read and apply the canonical policy:
`<SKILL_DIR>/../cloud-native-readiness/knowledge/deployment-eligibility.md`.

When Node.js is available, run:

```bash
node "<SKILL_DIR>/scripts/workload-eligibility.mjs" "$WORK_DIR"
```

The script is read-only and prints the decision to stdout. Keep the parsed object as
`ELIGIBILITY_DECISION` in the current execution context; never write it to `.sealos/`
or another project file.

| Exit | Status | Action |
|------|--------|--------|
| `0` | `eligible` | Continue with the requested repository root |
| `2` | `ineligible` | Report workload type/evidence and STOP |
| `3` | `needs_review` | Inspect evidence; keep preparation blocked until explicitly resolved |
| other | execution error | Report the classifier error and STOP |

Parse stdout even for exits `2` and `3`; those are classification results, not script
failures. A mixed repository remains `needs_review` in this workflow: list the
detected units and STOP rather than selecting and preparing a nested directory.

For other `needs_review` results, inspect entry points and runtime evidence. Continue
only when the requested root itself can be explicitly resolved as `eligible`; record
that in-memory decision with `source: "ai-review"` and specific repository-relative
evidence. An ordinary desktop/mobile client cannot be overridden by a Dockerfile,
readiness score, registry image, Railpack evidence, or user willingness to proceed.

If Node.js is unavailable, perform the same review manually and keep the result in
memory. Missing or ambiguous evidence fails closed. No `.sealos/config.json` field,
`skip_phases` value, or resume state may skip or override this gate.

## Artifact Directory

All build-and-prepare outputs are written under `.sealos/` in `WORK_DIR`:

```text
<WORK_DIR>/.sealos/
├── config.json               ← optional user configuration overrides
├── analysis.json             ← project analysis snapshot
├── railpack-info.json        ← optional raw Railpack project info evidence
├── railpack-plan.json        ← optional raw Railpack build plan evidence
├── build-request.json        ← build execution contract
├── build-result.json         ← resolved image result from reuse or kaniko
├── delivery-manifest.json    ← manifest of generated workflow artifacts
└── template/
    └── index.yaml            ← Sealos template
```

JSON artifacts under `.sealos/` are governed by explicit schemas in `<SKILL_DIR>/schemas/`:

- `config.schema.json`
- `analysis.schema.json`
- `build-request.schema.json`
- `delivery-manifest.schema.json`
- `../k8s-kaniko-job/schemas/build-result.schema.json`

Validate them with:

```bash
node "<SKILL_DIR>/scripts/validate-artifacts.mjs" --dir "$WORK_DIR"
```

At the start of the pipeline:

```bash
mkdir -p "$WORK_DIR/.sealos" "$WORK_DIR/.sealos/template"
```

## Read user config

If `.sealos/config.json` exists, read it first. User-provided values take priority over auto-detection and AI inference throughout the pipeline.

Supported keys:

```json
{
  "port": 8080,
  "node_version": "20",
  "start_command": "node dist/main.js",
  "build_command": "pnpm build:prod",
  "system_deps": ["ffmpeg"],
  "base_image": "node:20-slim",
  "env_overrides": { "NODE_ENV": "production" },
  "skip_phases": ["assess"],
  "target_image": "ghcr.io/owner/repo:prepare-tag"
}
```

All fields are optional. If a field is present, it overrides the corresponding auto-detected value.

## Resume Detection

If any of these artifacts already exist:

- `.sealos/analysis.json`
- `Dockerfile`
- `.sealos/build-request.json`
- `.sealos/build-result.json`
- `.sealos/template/index.yaml`
- `.sealos/delivery-manifest.json`

report to the user:

`"Found prepare artifacts from a previous run. [list found artifacts]."`

Ask:

`"Resume from existing artifacts, or regenerate from Phase 1?"`

If restart, remove:

- `.sealos/analysis.json`
- `.sealos/build-request.json`
- `.sealos/build-result.json`
- `.sealos/template/index.yaml`
- `.sealos/delivery-manifest.json`

## Phase 1: Assess

`WORK_DIR`, `GITHUB_URL`, `REPO_NAME`, and README context are already resolved in preflight.
Use those directly — no need to re-derive.

### 1.1 Deterministic Scoring

**If Node.js available:**
```bash
node "<SKILL_DIR>/scripts/score-model.mjs" "$WORK_DIR"
```
Output: `{ "score": N, "verdict": "...", "dimensions": {...}, "signals": {...} }`

**If Node.js not available (fallback):**
Perform the scoring yourself by reading project files and applying these rules:

1. Detect language: `package.json` → Node.js, `go.mod` → Go, `requirements.txt` → Python, `pom.xml` → Java, `Cargo.toml` → Rust
2. Detect framework: read dependency files for known frameworks (Next.js, Express, FastAPI, Gin, Spring Boot, etc.)
3. Check HTTP server: does the project listen on a port?
4. Check state: external DB (PostgreSQL/MySQL/MongoDB) vs local state (SQLite)?
5. Check config: `.env.example` exists?
6. Check Docker: `Dockerfile` or `docker-compose.yml` exists?

Score 6 dimensions (0-2 each, max 12). For detailed criteria, read:
- `<SKILL_DIR>/../cloud-native-readiness/knowledge/criteria.md`
- `<SKILL_DIR>/../cloud-native-readiness/knowledge/scoring-model.md`

**Decision:**
- `score < 4` → STOP. Tell user: "This project scored {N}/12 ({verdict}). Not suitable for containerized delivery because: {dimension_details for 0-score dimensions}."
- `score >= 4` → CONTINUE.

### 1.2 AI Quick Assessment

Use structured signals from Phase 1.1 score-model output directly:
- `signals.primary_language` — primary language (priority-sorted when multiple detected)
- `signals.framework` — detected frameworks
- `signals.package_manager` — detected package manager (npm/yarn/pnpm/bun/pip/go/etc.)
- `signals.port` — detected port (from framework defaults)
- `signals.databases` — detected database types (postgres/mysql/mongodb/redis/sqlite)
- `signals.runtime_version` — runtime version with source (e.g., `{ node: "22", source: "engines" }`)
- `signals.is_monorepo`, `signals.has_docker`, `signals.has_env_example`

Focus AI effort on what the script cannot detect: env_vars classification,
complexity_tier assessment, and port override from source code (if `port_source` is "unknown").

Based on the score result and your own analysis of the project, assess:

1. Read key files: `README.md`, `package.json`/`go.mod`/`requirements.txt`, `Dockerfile` (if exists)
2. Check: Is this a web service, API, or worker with network interface?
3. Determine: ports, required env vars, database dependencies, special concerns

If the score is borderline (4-6), also read:
- `<SKILL_DIR>/../cloud-native-readiness/knowledge/criteria.md` — detailed rubrics
- `<SKILL_DIR>/../cloud-native-readiness/knowledge/anti-patterns.md` — disqualifying patterns

**STOP conditions:**
- Desktop/GUI application (Electron without server, Qt, GTK)
- Mobile app without backend
- CLI tool / library / SDK (no network service)
- No identifiable entry point or build system

Record for later phases: `language`, `framework`, `ports`, `env_vars`, `databases`, `has_dockerfile`

**Env var classification** (for downstream template/input handling):
When recording `env_vars`, also classify each one:
- `auto` — can be auto-generated (random secrets, internal URLs, DB connections)
- `required` — user must provide (external API keys, admin email, SMTP, OAuth)
- `optional` — has sensible default, user may customize (log level, feature flags)

Sources for env var detection:
- `.env.example` or `.env.sample` — most reliable source of required env vars
- `docker-compose.yml` `environment:` section
- README sections about configuration/environment
- Source code imports of `process.env.*` or `os.environ[]`

### 1.3 Write analysis.json

After Phase 1 completes, write `.sealos/analysis.json` with the full analysis snapshot:

```json
{
  "generated_at": "<ISO timestamp>",
  "project": {
    "github_url": "<GITHUB_URL>",
    "work_dir": "<WORK_DIR>",
    "repo_name": "<REPO_NAME>",
    "branch": "<BRANCH or null>"
  },
  "score": { "total": "<N>", "verdict": "<verdict>", "dimensions": {} },
  "language": "<signals.primary_language>",
  "all_languages": ["<all detected languages>"],
  "framework": "<detected framework>",
  "package_manager": "<npm|yarn|pnpm|bun|pip|go|cargo|maven|gradle>",
  "port": "<primary port>",
  "databases": ["<detected database types>"],
  "runtime_version": { "<language>": "<major version>", "source": "<detection source>" },
  "env_vars": {},
  "has_dockerfile": false,
  "complexity_tier": "<L1|L2|L3>",
  "image_ref": null
}
```

If `.sealos/config.json` exists, apply user overrides: e.g., if `config.json` has `"port": 8080`, use that instead of the auto-detected value. Priority: user config > script detection > AI inference.

The `image_ref` field is set to `null` initially. It will be filled in Phase 2 (if existing image found) or Phase 4 (after build).

### Present Analysis Summary

After writing `.sealos/analysis.json`, present a concise repository analysis summary to the user.
This summary should expose only the key conclusions, not the full artifact contents.

Recommended format:

```text
Repository Analysis:
  - Type: <web app | api | worker | cli | library>
  - Language: <language>
  - Framework: <framework or "none detected">
  - Port: <port or "not detected">
  - Database: <postgres/mysql/redis/... or "none detected">
  - Dockerfile: <yes/no>
  - Score: <N>/12 (<verdict>)
  - Decision: <continue | stop>
```

Output rules:
- Keep the summary short and decision-oriented
- Do not dump the full `env_vars` object or dimension-by-dimension internals unless the user asks
- Do not add a default "full details" block after this summary
- If the assessment stops the pipeline, briefly state the top blocker(s)
- If the assessment continues, state the next phase in one short line

## Phase 1.5: Railpack Build Environment Probe

Railpack is an optional detector for build environment facts. Use it to improve Dockerfile and template inputs, not to build images.

Do not run this phase when Phase 1 stops with `score < 4`.

If `ENV.railpack` is available and Node.js is available, run:

```bash
node "<SKILL_DIR>/scripts/run-railpack-probe.mjs" \
  --work-dir "$WORK_DIR" \
  --analysis "$WORK_DIR/.sealos/analysis.json" \
  --config "$WORK_DIR/.sealos/config.json"
```

The helper may write:

- `.sealos/railpack-info.json`
- `.sealos/railpack-plan.json`

It must also normalize any usable result into `analysis.json.build_environment`.

If Railpack is missing or fails, keep the pipeline moving and record:

```json
{
  "build_environment": {
    "source": "railpack",
    "status": "skipped",
    "reason": "railpack binary is not available",
    "confidence": "low",
    "evidence_paths": []
  }
}
```

### 1.5.1 Consumption rules

Downstream phases consume only `analysis.json.build_environment`, not raw Railpack JSON. Raw files are evidence for debugging.

Apply precedence in this order:

1. `.sealos/config.json`
2. explicit repository instructions, README, or existing Dockerfile
3. `analysis.json.build_environment`
4. existing deterministic heuristics

Railpack fields may inform:

- package manager
- runtime version
- install command
- build command
- start command
- port
- system packages
- build-time env var hints

Railpack fields must not:

- override `.sealos/config.json`
- switch Phase 4 back to BuildKit
- replace `Dockerfile + k8s-kaniko-job`
- make `railpack build` part of this workflow

## Phase 2: Detect Existing Image

If Node.js is available:

```bash
node "<SKILL_DIR>/scripts/detect-image.mjs" "$GITHUB_URL" "$WORK_DIR"
```

Goal:

- infer deployment intent from project documentation and release/CI signals
- detect a reusable amd64 image when the project documents or publishes one
- update `analysis.json.image_ref` when `found=true`

Detection priority (conflict resolution):

1. README and docs deploy/install guides
2. GitHub Releases (API or local release notes)
3. CI workflows and package metadata
4. project files (`docker-compose`, etc.)
5. direct registry naming (`ghcr.io/<owner>/<repo>`, `docker.io/<owner>/<repo>`)
6. Docker Hub search with GitHub URL verification

Decision:

- `found=true` and `mode=reuse-image` → later build mode becomes `reuse-image`
- `mode=build-required` → later build mode becomes `build-required`, even if a registry happens to host a similarly named image
- README documents docker build / compose `--build` deployment with no prebuilt image reference → always `build-required`
- floating README tags such as `latest` should be resolved to concrete package/version tags when local metadata provides a matching version; if no matching concrete version can be verified, keep the explicit floating tag as fallback rather than emitting an untagged or variable image reference

Example output:

```json
{
  "found": true,
  "mode": "reuse-image",
  "deployment_mode": "prebuilt",
  "image": "ghcr.io/owner/repo",
  "tag": "v1.2.3",
  "source": "readme",
  "confidence": "high",
  "platforms": ["linux/amd64"],
  "evidence": [{ "source": "readme", "signal": "ghcr.io/owner/repo:v1.2.3 in README.md" }]
}
```

When README requires a source build:

```json
{
  "found": false,
  "mode": "build-required",
  "deployment_mode": "build",
  "reason": "README documents docker build deployment; skipping registry reuse",
  "evidence": [{ "source": "readme", "signal": "build instructions in README.md" }]
}
```

After Phase 2:

- if `found=true`, set `analysis.json.image_ref` to `"<image>:<tag>"`
- record `mode` from the script output for Phase 4 handoff

## Phase 3: Dockerfile

Reuse, repair, or generate a Dockerfile.

Before invoking or applying the dockerfile skill, read `analysis.json.build_environment` when present. Use it as supporting evidence for build inputs:

- prefer `build_environment.package_manager` only when `.sealos/config.json` and lockfiles do not give a stronger answer
- use `build_environment.runtime_versions` to refine base runtime versions unless config overrides exist
- use `build_environment.install_command`, `build_environment.build_command`, and `build_environment.start_command` as candidate commands, but keep README or existing Dockerfile commands when they are explicit
- include `build_environment.system_packages` when they explain native build requirements
- never copy raw `railpack-plan.json` instructions into Dockerfile without checking that they fit Dockerfile + kaniko semantics

Use internal dockerfile skill references as needed:

```text
<SKILL_DIR>/../dockerfile-skill/modules/analyze.md
<SKILL_DIR>/../dockerfile-skill/modules/generate.md
<SKILL_DIR>/../dockerfile-skill/knowledge/error-patterns.md
```

Phase 3 output:

- `Dockerfile`
- optional `.dockerignore`
- updated `analysis.json.has_dockerfile`

## Phase 3.5: Confirm Sandbox Build Context

The Kubernetes kaniko executor packages the Docker build context from `WORK_DIR`, writes a `context.tar.gz` object under the DevBox VersityGW bucket directory, then starts a temporary kaniko Job that pulls that object through S3.

That downstream Job must run in the active sandbox namespace and inherit the current sandbox service account when it can be resolved. Do not assume the namespace is `default`.

Before any `mode=build-required` handoff, ensure Phase 3 build inputs are present under `WORK_DIR`, can be read by the sandbox process, and can be represented as a kaniko S3 tar context.

### 3.5.1 Resolve build paths

Determine:

```text
build.context_path      # usually "." or a subdirectory such as "site"
build.dockerfile_path   # Dockerfile path relative to WORK_DIR, such as "Dockerfile" or "site/Dockerfile"
```

These paths must be relative and must not escape the repository.

Choose the smallest context that still contains everything the Dockerfile can read. A subdirectory Dockerfile does not imply a subdirectory context.

- If the Dockerfile only copies files below its own app directory, use that app directory as `context_path`.
- If the Dockerfile copies repository-root files such as `package.json`, `pnpm-lock.yaml`, workspace manifests, `turbo.json`, or other sibling packages, use the monorepo root as `context_path` and keep `dockerfile_path` pointing at the subdirectory Dockerfile.
- For example, a Dockerfile at `apps/www/Dockerfile` that runs `turbo prune` or `COPY pnpm-lock.yaml` must use `context_path="."` and `dockerfile_path="apps/www/Dockerfile"`.

### 3.5.2 Verify local build inputs

Before invoking `k8s-kaniko-job`, verify:

```bash
test -d "$WORK_DIR/<context_path>"
test -f "$WORK_DIR/<dockerfile_path>"
```

Also verify that `dockerfile_path` is inside `context_path`. If it is outside, fix the Dockerfile location or widen the explicit context path before invoking `k8s-kaniko-job`.

Read the Dockerfile before writing the final request. Every local `COPY` or `ADD` source that exists under `WORK_DIR` must also be inside `context_path`; otherwise kaniko will package a context that cannot satisfy the Dockerfile. Do not widen blindly beyond the repository root.

### 3.5.3 Source contract

Write build requests with:

```json
"source": {
  "type": "sandbox-context",
  "github_url": "<GITHUB_URL>",
  "repo": "owner/repo",
  "ref": "<resolved workspace commit sha>",
  "work_dir": "<WORK_DIR>"
}
```

`source.ref` is retained for traceability. It is not the build source for `k8s-kaniko-job`; the build source is the sandbox-local `source.work_dir` plus `build.context_path` and `build.dockerfile_path`, packaged as `context.tar.gz`.

## Phase 4: Build

This phase replaces local image build and push with build-request generation plus image resolution.

### 4.1 Determine target image

Choose the target image in this order:

1. `.sealos/config.json.target_image`
2. `analysis.json.image_ref` if Phase 2 found a reusable image
3. `ghcr.io/<lowercase-github-token-login>/<repo>:prepare-<commit-sha-or-timestamp>` when `GITHUB_TOKEN` is available

Do not default to the source repository owner for fresh GHCR pushes. A token with `write:packages` can still fail with `DENIED: permission_denied: create_package` when the target package namespace is an organization or user that the token cannot publish to. Resolve the authenticated login with GitHub `/user`, lowercase that login before using it in a GHCR repository path, and use it as the default GHCR owner when no explicit target image is configured. GHCR repository path components must be lowercase; display-case logins such as `Che-Zhu` must become `che-zhu`. Run the kaniko GHCR preflight against the final `target_image` before creating Kubernetes resources. Explicit organization targets remain valid when the token is authorized for that namespace and the owner path is lowercase.

### 4.2 Write build-request.json

Write `.sealos/build-request.json`:

```json
{
  "version": "1.0",
  "generated_at": "<ISO timestamp>",
  "source": {
    "type": "sandbox-context",
    "github_url": "<GITHUB_URL>",
    "repo": "owner/repo",
    "ref": "<resolved workspace commit sha>",
    "work_dir": "<WORK_DIR>"
  },
  "mode": "build-required",
  "image": {
    "image_ref": null,
    "target_image": "ghcr.io/<lowercase-github-token-login>/repo:prepare-<tag>"
  },
  "build": {
    "context_path": "<context path, e.g. . or site>",
    "dockerfile_path": "<Dockerfile path, e.g. Dockerfile or site/Dockerfile>",
    "build_args": {}
  },
  "runtime": {
    "port": 3000
  }
}
```

For a self-contained subdirectory app, use the real relative paths, for example `context_path="site"` and `dockerfile_path="site/Dockerfile"`. For a monorepo app whose Dockerfile reads root workspace files, use a root context with the subdirectory Dockerfile, for example `context_path="."` and `dockerfile_path="apps/www/Dockerfile"`.

If Phase 2 found a reusable image, use:

```json
{
  "version": "1.0",
  "generated_at": "<ISO timestamp>",
  "source": {
    "type": "sandbox-context",
    "github_url": "<GITHUB_URL>",
    "repo": "owner/repo",
    "ref": "<resolved workspace commit sha>",
    "work_dir": "<WORK_DIR>"
  },
  "mode": "reuse-image",
  "image": {
    "image_ref": "ghcr.io/owner/repo:v1.2.3",
    "target_image": null
  },
  "build": {
    "context_path": "<context path, e.g. . or site>",
    "dockerfile_path": "<Dockerfile path, e.g. Dockerfile or site/Dockerfile>",
    "build_args": {}
  },
  "runtime": {
    "port": 3000
  }
}
```

Important:

- always write `build-request.json`
- `mode=reuse-image` means no Kubernetes Job is needed
- `mode=build-required` means Phase 4 must now call `k8s-kaniko-job`
- when `mode=build-required`, `source.work_dir`, `build.context_path`, and `build.dockerfile_path` must point to readable sandbox-local build inputs

### 4.3 Resolve build-result.json

`sealos-deploy` owns the overall chain, but delegates actual build execution to the sibling skill:

```text
<SKILL_DIR>/../k8s-kaniko-job/
```

#### Branch A: reuse-image

If `mode=reuse-image`, do not run kaniko. Write `.sealos/build-result.json` directly via the sibling helper:

```bash
node "<SKILL_DIR>/../k8s-kaniko-job/scripts/write-result.mjs" \
  --request "$WORK_DIR/.sealos/build-request.json" \
  --out "$WORK_DIR/.sealos/build-result.json" \
  --status skipped \
  --log-file "$LOG_FILE"
```

The resulting `build-result.json` is still required, because later phases consume a single resolved-image contract.

#### Branch B: build-required

If `mode=build-required`, require these capabilities at this point:

- `kubectl`
- `S3_ENDPOINT`, `AWS_ENDPOINT_URL_S3`, or `AWS_ENDPOINT_URL` from the DevBox runtime
- `KANIKO_JOB_S3_ENDPOINT` when the local S3 endpoint is loopback and current Pod IP cannot be resolved
- `AWS_SECRET_ACCESS_KEY`, `SEALOS_DEVBOX_JWT_SECRET`, or `DEVBOX_JWT_SECRET`
- `GITHUB_TOKEN`
- permission to create Jobs and Secrets, and to read Pods and Pod logs in the active namespace through the sandbox-provided kubeconfig and current service account

Then execute the `k8s-kaniko-job` workflow using the just-written `.sealos/build-request.json`:

1. run `../k8s-kaniko-job/modules/preflight.md`
2. run `../k8s-kaniko-job/modules/build-request.md`
3. run `../k8s-kaniko-job/modules/registry-auth.md`
4. run `../k8s-kaniko-job/modules/context.md`
5. run `../k8s-kaniko-job/modules/job-template.md`
6. run `../k8s-kaniko-job/modules/run-and-watch.md`
7. run `../k8s-kaniko-job/modules/result.md`

Expected output:

- `.sealos/build-result.json`

Stop the pipeline if `.sealos/build-result.json.status` is `failed`.

## Phase 5: Generate Sealos Template

Generate `.sealos/template/index.yaml` using the existing `docker-to-sealos` guidance.

Key rules:

- emit a valid Sealos application template
- use `analysis.json`, detected env vars, and resolved image information from `.sealos/build-result.json`
- always point the template to `build-result.json.image.image_ref`
- do not read `build-request.json.image.target_image` directly once `build-result.json` exists
- every `spec.defaults.<name>.value` and every present `spec.inputs.<name>.default` must deserialize as a YAML string; quote numeric-, boolean-, and null-like values, while infrastructure fields such as replicas and ports remain numeric

References:

```text
<SKILL_DIR>/../docker-to-sealos/references/example-guide.md
<SKILL_DIR>/../docker-to-sealos/references/must-rules-map.yaml
```

If required env vars need user input, collect them here and apply them to the template.

After `index.yaml` is generated, validate it with the sibling `docker-to-sealos` checker before continuing:

```bash
PYTHON_BIN="$(command -v python3 || command -v python)"
"$PYTHON_BIN" "<SKILL_DIR>/../docker-to-sealos/scripts/check_consistency.py" \
  --skill "<SKILL_DIR>/../docker-to-sealos/SKILL.md" \
  --references "<SKILL_DIR>/../docker-to-sealos/references" \
  --rules-file "<SKILL_DIR>/../docker-to-sealos/references/rules-registry.yaml" \
  --artifacts "$WORK_DIR/.sealos/template/index.yaml"
```

Fix any failures before running the GHCR pull-secret patcher or writing the delivery manifest. An `R052` violation means a Template default was parsed as a YAML number, boolean, or null instead of the string required by the Template CRD.

### 5.1 Inline GHCR pull Secret (POC)

When `.sealos/build-result.json` indicates a freshly built private GHCR image, inline the sandbox GitHub token into the template so the cluster can pull the image without a separate deploy step.

Trigger when either:

- `build-result.json.registry.pull_auth_required` is `true`, or
- `mode=build-required` and `status=succeeded`

After `index.yaml` is generated, run:

```bash
node "<SKILL_DIR>/scripts/patch-template-pull-secret.mjs" \
  --template "$WORK_DIR/.sealos/template/index.yaml" \
  --build-result "$WORK_DIR/.sealos/build-result.json" \
  --token-env GITHUB_TOKEN
```

This script:

- inserts a `kubernetes.io/dockerconfigjson` Secret named `${{ defaults.app_name }}` immediately after the Template document, because the Template API requires the first YAML document to be `kind: Template`
- adds `imagePullSecrets` to managed `Deployment` / `StatefulSet` documents
- uses the same GHCR auth shape as `k8s-kaniko-job/modules/registry-auth.md`

POC constraints:

- requires `GITHUB_TOKEN` in the sandbox
- writes registry credentials into `.sealos/template/index.yaml`
- do not commit the patched template to git
- skip this step for `mode=reuse-image` unless a future detector marks `pull_auth_required`

## Phase 6: Finish

Write `.sealos/delivery-manifest.json`:

```json
{
  "version": "1.0",
  "generated_at": "<ISO timestamp>",
  "artifacts": [
    ".sealos/analysis.json",
    ".sealos/build-request.json",
    ".sealos/build-result.json",
    ".sealos/template/index.yaml",
    "Dockerfile"
  ],
  "template_path": ".sealos/template/index.yaml",
  "build_request_path": ".sealos/build-request.json",
  "build_result_path": ".sealos/build-result.json"
}
```

If `.sealos/railpack-info.json` or `.sealos/railpack-plan.json` exist, include those paths in `artifacts` as optional evidence files.

Run validation:

```bash
node "<SKILL_DIR>/scripts/validate-artifacts.mjs" --dir "$WORK_DIR"
```

At the end, present:

- whether the project reused an existing image or completed a kaniko job
- where `build-request.json` is
- where `build-result.json` is
- where `index.yaml` is
- which artifacts were generated under `.sealos/`
