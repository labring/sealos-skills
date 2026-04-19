# Build And Prepare Pipeline

After preflight passes, execute Phase 1–6 in order.

`SKILL_DIR` refers to the directory containing this skill's `SKILL.md`. Sibling skills are at `<SKILL_DIR>/../`.

Use `ENV` from preflight to choose between script mode (Node.js available) and fallback mode (AI-native).

This workflow can start from either the current workspace or an explicit GitHub URL. If preflight cloned a repository, `WORK_DIR` points to that shallow clone. If preflight reused the current workspace, `WORK_DIR` points to that sandbox-local path.

## Artifact Directory

All build-and-prepare outputs are written under `.sealos/` in `WORK_DIR`:

```text
<WORK_DIR>/.sealos/
├── config.json               ← optional user configuration overrides
├── analysis.json             ← project analysis snapshot
├── build-request.json        ← build execution contract
├── build-result.json         ← resolved image result from reuse or BuildKit
├── delivery-manifest.json    ← manifest of generated workflow artifacts
└── template/
    └── index.yaml            ← Sealos template
```

JSON artifacts under `.sealos/` are governed by explicit schemas in `<SKILL_DIR>/schemas/`:

- `config.schema.json`
- `analysis.schema.json`
- `build-request.schema.json`
- `delivery-manifest.schema.json`
- `../k8s-buildkit-job/schemas/build-result.schema.json`

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

This version does not support deploy state or update mode.

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

### 1.1 Deterministic Scoring

If Node.js is available:

```bash
node "<SKILL_DIR>/scripts/score-model.mjs" "$WORK_DIR"
```

Output: `{ "score": N, "verdict": "...", "dimensions": {...}, "signals": {...} }`

If Node.js is not available, perform the scoring by reading project files directly and applying:

```text
<SKILL_DIR>/../cloud-native-readiness/knowledge/scoring-criteria.md
```

### 1.2 Decision

- `score < 4` → stop and explain why the project is not suitable for containerized delivery
- `score >= 4` → continue

### 1.3 Write analysis.json

After Phase 1, write `.sealos/analysis.json`:

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
  "package_manager": "<package manager>",
  "port": "<primary port>",
  "databases": ["<detected database types>"],
  "runtime_version": { "<language>": "<major version>", "source": "<detection source>" },
  "env_vars": {},
  "has_dockerfile": false,
  "complexity_tier": "<L1|L2|L3>",
  "image_ref": null
}
```

If `.sealos/config.json` exists, apply user overrides.

## Phase 2: Detect Existing Image

If Node.js is available:

```bash
node "<SKILL_DIR>/scripts/detect-image.mjs" "$GITHUB_URL" "$WORK_DIR"
```

Goal:

- detect a reusable amd64 image from Docker Hub, GHCR, compose files, workflows, or README
- update `analysis.json.image_ref` if one is found

Decision:

- reusable image found → later build mode becomes `reuse-image`
- no reusable image → later build mode becomes `build-required`

## Phase 3: Dockerfile

Reuse, repair, or generate a Dockerfile.

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

The Kubernetes BuildKit executor runs a temporary `buildkitd` Job and Service. The sandbox process runs `buildctl` and sends the local build context from `WORK_DIR`.

That downstream Job must run in the active sandbox namespace and inherit the current sandbox service account when it can be resolved. Do not assume the namespace is `default`.

Before any `mode=build-required` handoff, ensure Phase 3 build inputs are present under `WORK_DIR` and can be read by the sandbox process.

### 3.5.1 Resolve build paths

Determine:

```text
build.context_path      # usually "." or a subdirectory such as "site"
build.dockerfile_path   # Dockerfile path relative to WORK_DIR, such as "Dockerfile" or "site/Dockerfile"
```

These paths must be relative and must not escape the repository.

For the current repository layout, prefer the actual application directory. Do not force root `Dockerfile` when the project uses a subdirectory Dockerfile.

### 3.5.2 Verify local build inputs

Before invoking `k8s-buildkit-job`, verify:

```bash
test -d "$WORK_DIR/<context_path>"
test -f "$WORK_DIR/<dockerfile_path>"
buildctl --version
```

If any check fails, stop before invoking `k8s-buildkit-job`.

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

`source.ref` is retained for traceability. It is not the build source for `k8s-buildkit-job`; the build source is the sandbox-local `source.work_dir` plus `build.context_path` and `build.dockerfile_path`.

## Phase 4: Build

This phase replaces local image build and push with build-request generation plus image resolution.

### 4.1 Determine target image

Choose the target image in this order:

1. `.sealos/config.json.target_image`
2. `analysis.json.image_ref` if Phase 2 found a reusable image
3. `ghcr.io/<owner>/<repo>:prepare-<commit-sha-or-timestamp>` if GitHub repo is known

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
    "target_image": "ghcr.io/owner/repo:prepare-<tag>"
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

For a subdirectory app, use the real relative paths, for example `context_path="site"` and `dockerfile_path="site/Dockerfile"`.

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
- `mode=build-required` means Phase 4 must now call `k8s-buildkit-job`
- when `mode=build-required`, `source.work_dir`, `build.context_path`, and `build.dockerfile_path` must point to readable sandbox-local build inputs

### 4.3 Resolve build-result.json

`sealos-deploy` owns the overall chain, but delegates actual build execution to the sibling skill:

```text
<SKILL_DIR>/../k8s-buildkit-job/
```

#### Branch A: reuse-image

If `mode=reuse-image`, do not run BuildKit. Write `.sealos/build-result.json` directly via the sibling helper:

```bash
node "<SKILL_DIR>/../k8s-buildkit-job/scripts/write-result.mjs" \
  --request "$WORK_DIR/.sealos/build-request.json" \
  --out "$WORK_DIR/.sealos/build-result.json" \
  --status skipped \
  --log-file "$LOG_FILE"
```

The resulting `build-result.json` is still required, because later phases consume a single resolved-image contract.

#### Branch B: build-required

If `mode=build-required`, require these capabilities at this point:

- `kubectl`
- `buildctl`
- `GITHUB_TOKEN`
- permission to create Jobs, Services, Pods, and Secrets in the active namespace through the sandbox-provided kubeconfig and current service account

Then execute the `k8s-buildkit-job` workflow using the just-written `.sealos/build-request.json`:

1. run `../k8s-buildkit-job/modules/preflight.md`
2. run `../k8s-buildkit-job/modules/build-request.md`
3. run `../k8s-buildkit-job/modules/registry-auth.md`
4. run `../k8s-buildkit-job/modules/job-template.md`
5. run `../k8s-buildkit-job/modules/run-and-watch.md`
6. run `../k8s-buildkit-job/modules/result.md`

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

References:

```text
<SKILL_DIR>/../docker-to-sealos/references/example-guide.md
<SKILL_DIR>/../docker-to-sealos/references/must-rules-map.yaml
```

If required env vars need user input, collect them here and apply them to the template.

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

Run validation:

```bash
node "<SKILL_DIR>/scripts/validate-artifacts.mjs" --dir "$WORK_DIR"
```

At the end, present:

- whether the project reused an existing image or completed a BuildKit job
- where `build-request.json` is
- where `build-result.json` is
- where `index.yaml` is
- which artifacts were generated under `.sealos/`
