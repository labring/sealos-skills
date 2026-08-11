# Phase 3: Build and Push

Build required images from the Phase 2 deployment source, push them, and write
`.sealos/phase-3/build-result.json`.

Do not scout the repo, run railpack, generate Dockerfiles, or modify
`deployment_source` (recipe errors → **RETURN → Phase 2**). Digest pinning is
Phase 4.

## Inputs

| Input | Source |
|-------|--------|
| `runtime_profile` | `analysis.json` (Phase 0) |
| Deployment plan | `analysis.json` → `deployment_plan` → `.sealos/phase-2/deployment-plan.json` |
| Deployment source | `deployment_source` path under `work_dir` |
| Build targets | Parsed from the deployment source (below) |

## Outputs

| Output | Path |
|--------|------|
| Build result | `.sealos/phase-3/build-result.json` (`pushed` + `pull_access`) |
| Pointer | `analysis.json` → `build_result` |

When there are no build targets, skip writing `build_result` and
**CONTINUE → Phase 4**.

## Path dependency gate

Ask once to install deferred tools; refuse or recheck failure → **STOP**.

| Profile | Need | Tools |
|---------|------|-------|
| `local` | Build | Docker CLI, daemon, Buildx |
| `local` + GHCR | Push | `gh` + `write:packages` |
| `local` + Docker Hub | Push | Active `docker login` (public images only) |
| `sandbox` | Build+push GHCR | `k8s-kaniko-job` + sandbox kubeconfig / `GITHUB_TOKEN` |

## Phase constraints

| ID | Constraint |
|----|------------|
| P3-01 | GHCR path usernames must be lowercase |
| P3-02 | All GHCR `pushed` images share one GHCR namespace |
| P3-03 | `pushed` records tag refs only (no `@sha256:`) |
| P3-04 | Build concurrency limit is 1 (no parallel builds) |
| P3-05 | Registry rules below |

### Registry rules

| Profile | Registry | Who pushes |
|---------|----------|------------|
| `local` | User may choose **GHCR** (default) or **Docker Hub** (public only) | Main agent pushes after build-only |
| `sandbox` | **GHCR only** — do not offer a choice | `k8s-kaniko-job` builds **and** pushes GHCR; main agent does **not** re-push |

## Parse build targets

When the Phase 2 plan records `build_targets`, use it directly — each entry
carries `key`, `context`, and `dockerfile`. Fall back to parsing the
deployment source only when the plan predates that field.

Infer type from `deployment_source`:

| Path | Type |
|------|------|
| `.sealos/phase-2/docker-compose.yml` | Compose |
| Directory with `Chart.yaml` | Helm |
| Single `.yaml` / `.yml` file | Kubernetes |

| Type | Targets |
|------|---------|
| Compose | Each service with `build:`; use `build.context` + `build.dockerfile` (paths relative to `work_dir`) |
| Helm / Kubernetes | Workloads that must build from this repo and already have a Dockerfile prepared in Phase 2 |

Upstream `image:`-only components are not built here.

## Procedure

### 1. Main agent — build queue

Read `runtime_profile` and list targets from `deployment_source`. No targets →
**CONTINUE → Phase 4** (do not write `build_result`).

### 2. Build (concurrency 1)

For each target, one at a time. If the host cannot start subagents, the main
agent runs the same helper commands directly under the same contract.

**`local`:**
- Subagent / helper **builds only** (`linux/amd64`), does not push.
- Example helper:
  ```bash
  node "<SKILL_DIR>/scripts/build-push.mjs" "$WORK_DIR" "<image-name>" \
    --mode build --context "<ctx>" --dockerfile "<dockerfile>"
  ```
- Invalid recipe (missing Dockerfile, bad context) → **RETURN → Phase 2** step 3.
- Still failing after remediation → **STOP**.

**`sandbox`:**
- Subagent runs `<SKILL_DIR>/../k8s-kaniko-job/` for each target (or sequential Jobs).
- Write/adapt `.sealos/build-request.json` per that skill; Kaniko **builds and pushes GHCR**.
- Main agent does not run a second registry push for that image.
- Recipe failure → **RETURN → Phase 2**; hard failure → **STOP**.

### 3. Main agent — push (`local` only)

After all local builds succeed:

1. If registry not chosen yet, ask once (GHCR recommended / Docker Hub public-only). Default GHCR when the user is indifferent. When the user picks Docker Hub, state explicitly before pushing: *"This image will be publicly pullable and contains your application code. Anyone can download it. Confirm Docker Hub?"* — proceed only on confirmation.
2. Push each built image with:
   ```bash
   node "<SKILL_DIR>/scripts/build-push.mjs" "$WORK_DIR" "<image-name>" \
     --mode push --registry ghcr|dockerhub [--user <user>] \
     [--local-tag "<local-tag>"] --image "<full-tag-ref>"
   ```
3. Tag format uses lowercase owner/repo and a unique version id.
4. Push failure → **STOP**.

### 4. Main agent — `pull_access` and `build-result.json`

For every pushed image (local push or sandbox Kaniko push), record
`pull_access` deterministically — do not probe:

| Push path | `pull_access` |
|-----------|---------------|
| GHCR (local or Kaniko) | `ghcr_secret_required` — new GHCR packages are private by default |
| Docker Hub public path | `public` |

Record `public` for GHCR only when the user states the package is already
public (existing public package reused across runs).

Write `.sealos/phase-3/build-result.json`:

```json
{
  "generated_at": "<ISO timestamp>",
  "pushed": {
    "<service-key>": "ghcr.io/user/myapp-web:20260802-web-abc123"
  },
  "pull_access": {
    "<service-key>": "public"
  }
}
```

Do not store digest tables here (Phase 4).

### 5. Main agent — `analysis.json`

Merge only:

```json
{
  "build_result": ".sealos/phase-3/build-result.json"
}
```

Do not modify Phase 0–2 fields. Skip this pointer when Phase 3 had no build targets.

### 6. Validate

When `build_result` was written:

```bash
node "<SKILL_DIR>/scripts/validate-phase-3.mjs" --dir "$WORK_DIR"
```

| ID | Check |
|----|-------|
| P3-V01–V03 | Lowercase GHCR owner; one GHCR namespace; tag refs only |
| P3-V04 | Every `pushed` key has `pull_access` |

On failure, do not CONTINUE to Phase 4. When there was no build, do not require this script.

## Stop conditions

| Result | Condition |
|--------|-----------|
| **CONTINUE → Phase 4** | All builds/pushes succeeded, or no build targets |
| **RETURN → Phase 2** | Build recipe invalid |
| **STOP** | Build/push still failing after remediation, or GHCR namespace conflict |

## Sibling skill

| Path | Use |
|------|-----|
| `<SKILL_DIR>/../k8s-kaniko-job/` | `sandbox` build+push to GHCR |
