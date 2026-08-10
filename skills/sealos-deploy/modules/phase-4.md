# Phase 4: Generate Sealos Template

Read `deployment_source` from Phase 2, pin every container image digest, convert to
`.sealos/template/index.yaml`, then pass the deploy gate.

Do not create cloud resources. Do not push images. Do not modify `deployment_source`
(invalid → **RETURN → Phase 2**). Digest tables belong in `image-digests.json` only
(**P4-03**). Digest pinning replaces any old `image_ref` habit.

Official-template fast path (Phase 1) skips this phase.

## Inputs

| Input | Source |
|-------|--------|
| Analysis | `.sealos/analysis.json` |
| Deployment plan | `analysis.json` → `deployment_plan` → `.sealos/phase-2/deployment-plan.json` |
| Deployment source | `deployment_source` under `work_dir` |
| Build result | `.sealos/phase-3/build-result.json` when Phase 3 built/pushed |

## Outputs

| Output | Path |
|--------|------|
| Sealos template | `.sealos/template/index.yaml` |
| Digest table | `.sealos/phase-4/image-digests.json` |
| Source snapshot | `.sealos/phase-4/source/` |
| Helm render | `.sealos/phase-4/rendered.yaml` (Helm only) |
| Resource map | `.sealos/phase-4/resource-map.json` |

## Path dependency gate

Ask once to install deferred tools; refuse or recheck failure → **STOP**.

| Need | Tools |
|------|-------|
| Always | Python 3.8+ with PyYAML |
| Compose → template | `kompose` |
| Helm source | Helm 3+ |
| Digest resolve | Registry inspect tool (`crane`, or equivalent) |

## Phase constraints

| ID | Constraint |
|----|------------|
| P4-01 | Do not create cloud resources or push images |
| P4-02 | Do not modify `deployment_source` |
| P4-03 | Do not write digests into `build-result.json` |
| P4-04 | Pin digest for every container image in the deployment source |
| P4-05 | Deploy gate = `check_consistency.py` rule subset only (never full `quality_gate.py`) |

## Procedure

### 1. Entry and resume

If `.sealos/template/index.yaml` already exists → follow `modules/mode.md` interrupt
resume. Otherwise continue.

### 2. Read plan and gate missing builds

```bash
# Prefer top-level analysis fields from Phase 0:
#   repo_name, github_url, work_dir, deployment_plan, build_result
```

Resolve `deployment_source` from `.sealos/phase-2/deployment-plan.json`. Infer type:

| Path | Type |
|------|------|
| `.sealos/phase-2/docker-compose.yml` | Compose |
| Directory with `Chart.yaml` | Helm |
| Single `.yaml` / `.yml` | Kubernetes |

If the source still has build-required components and `build_result` is missing →
**RETURN → Phase 3**.

### 3. Snapshot under `.sealos/phase-4/source/`

Do not re-scout the repo. Copy only the deployment source:

| Type | Action |
|------|--------|
| Compose | Copy `deployment_source` into `source/` (keep filename) |
| Helm | Copy chart into `source/`; `helm template` → `.sealos/phase-4/rendered.yaml` |
| Kubernetes | Copy manifest into `source/` |

### 4. Pin digests → `image-digests.json`

Enumerate every container image from the deployment source / snapshot. Keys match
workload / service names in the source.

| Image source | Resolve from |
|--------------|--------------|
| Built in-repo | `build-result.json` → `pushed` tag refs |
| Upstream `image:` | Tag refs in the deployment source |

Resolve each to `repository@sha256:...` for `linux/amd64`. Write:

```json
{
  "generated_at": "<ISO timestamp>",
  "digests": {
    "<workload-key>": "ghcr.io/user/app@sha256:..."
  }
}
```

Do not write digests back to `build-result.json`. Resolution failure → **STOP**.

### 5. Convert, then agent overlay digests

Convert by source type. Converter may emit provisional images; **the main agent then
overwrites every workload `image` / `originImageName` from `image-digests.json`**
(no `--image-override` flag required).

| Type | Conversion |
|------|------------|
| Compose | `compose_to_template.py` with `--kompose-mode always`, `--dry-run`, write stdout to `.sealos/template/index.yaml` |
| Helm | Adapt from `rendered.yaml` |
| Kubernetes | Adapt from the snapshot manifest |

Compose example (use flat `repo_name` / `github_url` from `analysis.json`):

```bash
PYTHON_BIN="$(command -v python3 || command -v python)"
APP_NAME="$(
  "$PYTHON_BIN" -c \
    'import json,sys; print(json.load(open(sys.argv[1],encoding="utf-8"))["repo_name"].rsplit("/",1)[-1])' \
    "$WORK_DIR/.sealos/analysis.json"
)"
GITHUB_URL="$(
  "$PYTHON_BIN" -c \
    'import json,sys; v=json.load(open(sys.argv[1],encoding="utf-8")).get("github_url"); print(v or "")' \
    "$WORK_DIR/.sealos/analysis.json"
)"
COMPOSE_FILE="$WORK_DIR/.sealos/phase-4/source/docker-compose.yml"
GENERATED="$("$PYTHON_BIN" "<SKILL_DIR>/../docker-to-sealos/scripts/compose_to_template.py" \
  --compose "$COMPOSE_FILE" \
  --app-name "$APP_NAME" \
  --git-repo "$GITHUB_URL" \
  --kompose-mode always \
  --no-fetch-logo \
  --dry-run)" || { echo "Compose conversion failed; STOP." >&2; exit 1; }
printf '%s\n' "$GENERATED" > "$WORK_DIR/.sealos/template/index.yaml"
```

After conversion, main agent:

1. Replace each workload container `image` and matching `originImageName` with the
   digest from `image-digests.json` for that key.
2. Add `imagePullSecrets: [{ name: ${{ defaults.app_name }} }]` only when
   `build-result.json` → `pull_access.<key>` is `ghcr_secret_required`.
3. Apply conversion constraints below (network, DB, public URL, MUST rules).
4. Write `.sealos/phase-4/resource-map.json` mapping source workloads → template resources.
5. Do not drop services. Treat converter DB classification as immutable.

Invalid recipe / incomplete topology → **RETURN → Phase 2**.

### 6. Deploy gate (not quality_gate)

```bash
DOCKER_TO_SEALOS="<SKILL_DIR>/../docker-to-sealos"
DEPLOY_GATE_ONLY="R001,R002,R003,R004,R005,R006,R008,R009,R010,R011,R012,R015,R017,R019,R020,R026,R028,R032,R033,R034,R035,R039,R045,R048,R051,R052"
"$PYTHON_BIN" "$DOCKER_TO_SEALOS/scripts/check_consistency.py" \
  --skill "$DOCKER_TO_SEALOS/SKILL.md" \
  --references "$DOCKER_TO_SEALOS/references" \
  --rules-file "$DOCKER_TO_SEALOS/references/rules-registry.yaml" \
  --artifacts "$WORK_DIR/.sealos/template/index.yaml" \
  --only "$DEPLOY_GATE_ONLY"
```

Do **not** run `quality_gate.py`. Failure → **STOP**. After fixes, re-pin (step 4),
reconvert/overlay (step 5), and rerun the gate.

### 7. Validate

```bash
node "<SKILL_DIR>/scripts/validate-phase-4.mjs" --dir "$WORK_DIR"
```

| ID | Check |
|----|-------|
| P4-V01 | Each `image-digests.json` entry is `repository@sha256:...` |
| P4-V02 | Every template container `image` matches the digest table |
| P4-V03 | `build-result.json` `pushed` values contain no `@sha256:` (when present) |
| P4-V04 | Deploy gate subset passes |

On failure, do not **CONTINUE → Phase 5**.

## Conversion constraints

**Network:** `ports` = public candidates; `expose` = internal Service. Multiple
candidates → resolve from Ingress, README, role, or `.sealos/config.json`
`public_service`. Rewrite internal refs to Service FQDN.

**Public URL:** If the app needs `BASE_URL` / `SITE_URL` / `APP_URL` / `NEXTAUTH_URL`
/ similar, set `https://${{ defaults.app_host }}.${{ SEALOS_CLOUD_DOMAIN }}` (env or
ConfigMap). Follow ConfigMap MUST ordering.

**Databases:** External → keep external; supported service DB → KubeBlocks; SQLite →
in-app; otherwise keep source workload with `docker-to-sealos.kubeblocks-fallback-reason`.

**Resources / MUST (apply during overlay):**
- `metadata.name` hardcoded lowercase
- Image refs are digests only (never `:latest`)
- PVC requests `<= 1Gi`
- Default container resources when missing: cpu `200m`/`20m`, memory `256Mi`/`25Mi`
- Init containers need explicit resources
- `imagePullPolicy: IfNotPresent`, `revisionHistoryLimit: 1`, `automountServiceAccountToken: false`
- Template defaults/inputs string-typed (R052)
- App CRD: only `spec.data.url`, `displayType=normal`, `type=link`, plus `icon`/`name` as required

Prefer platform resource ladder + requests-from-limits (R038) and KubeBlocks
dbprovider labels (R040); deploy gate does not enforce those two.

## Stop conditions

| Result | Condition |
|--------|-----------|
| **CONTINUE → Phase 5** | Deploy gate + `validate-phase-4` pass |
| **RETURN → Phase 3** | Build-required components missing `build_result` |
| **RETURN → Phase 2** | Invalid deployment source |
| **STOP** | Digest resolve, conversion, overlay, or deploy gate failed |

## Sibling skill

| Path | Use |
|------|-----|
| `<SKILL_DIR>/../docker-to-sealos/` | Compose conversion + deploy-gate `check_consistency.py` |
