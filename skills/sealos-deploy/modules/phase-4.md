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
| Image resolution (digests + image configs) | `.sealos/phase-4/image-resolution.json` |
| Conversion report | `.sealos/phase-4/conversion-report.json` |
| Source snapshot | `.sealos/phase-4/source/` |
| Helm render | `.sealos/phase-4/rendered.yaml` (Helm only) |
| Resource map | `.sealos/phase-4/resource-map.json` |

`image-digests.json` remains accepted as a legacy alternative to
`image-resolution.json` for resumed runs.

## Path dependency gate

Ask once to install deferred tools; refuse or recheck failure → **STOP**.

| Need | Tools |
|------|-------|
| Always | Node.js 22+; `npm install` in `skills/docker-to-sealos` (`yaml`) |
| Compose → template | `kompose` |
| Helm source | Helm 3+ |

Digest and image-config resolution uses `resolve-images.ts` (plain registry
HTTPS with a `docker buildx imagetools` fallback) — `crane` is not required.

## Phase constraints

| ID | Constraint |
|----|------------|
| P4-01 | Do not create cloud resources or push images |
| P4-02 | Do not modify `deployment_source` |
| P4-03 | Do not write digests into `build-result.json` |
| P4-04 | Every container image in the final template is digest-pinned via `image-resolution.json` (KubeBlocks-replaced database images are exempt; converter gate/init images use fixed version tags) |
| P4-05 | Deploy gate = `check-consistency.ts` rule subset only (never full `quality_gate.py`) |

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

### 4. Resolve images → `image-resolution.json`

One command resolves every non-database compose image to a digest-pinned
reference for `linux/amd64` **and** captures the image runtime config (user,
exposed ports) that drives securityContext emission:

```bash
node --experimental-strip-types \
  "<SKILL_DIR>/../docker-to-sealos/scripts/resolve-images.ts" \
  --compose "$WORK_DIR/.sealos/phase-4/source/docker-compose.yml" \
  --output "$WORK_DIR/.sealos/phase-4/image-resolution.json"
```

- Database services replaced by KubeBlocks are excluded automatically.
- Images built in-repo (Phase 3): pass the pushed tag refs with
  `--extra "<ref1>,<ref2>"` so they are pinned from `build-result.json` →
  `pushed` values.
- Explicit version tags resolve to `repository:tag@sha256:...` (tag kept for
  readability, digest decides the pull); floating tags resolve to
  `repository@sha256:...`.
- An image with no `linux/amd64` manifest is an error → **STOP**.
- Do not write digests back to `build-result.json`. Resolution failure → **STOP**.

### 5. Convert (converter consumes the resolution file)

| Type | Conversion |
|------|------------|
| Compose | `compose-to-template.ts` below |
| Helm | Adapt from `rendered.yaml` |
| Kubernetes | Adapt from the snapshot manifest |

Compose invocation (use flat `repo_name` / `github_url` from `analysis.json`;
pass `--url` / `--description` from repo evidence and any
`resource_hints` recorded in the Phase 2 plan):

```bash
APP_NAME="$(
  jq -r '.repo_name|split("/")|last' "$WORK_DIR/.sealos/analysis.json"
)"
GITHUB_URL="$(
  jq -r '.github_url // empty' "$WORK_DIR/.sealos/analysis.json"
)"
COMPOSE_FILE="$WORK_DIR/.sealos/phase-4/source/docker-compose.yml"
GENERATED="$(node --experimental-strip-types \
  "<SKILL_DIR>/../docker-to-sealos/scripts/compose-to-template.ts" \
  --compose "$COMPOSE_FILE" \
  --app-name "$APP_NAME" \
  --git-repo "$GITHUB_URL" \
  --url "<official app URL from repo/README>" \
  --description "<one-line app description>" \
  --profile deploy \
  --image-resolution "$WORK_DIR/.sealos/phase-4/image-resolution.json" \
  --report "$WORK_DIR/.sealos/phase-4/conversion-report.json" \
  --kompose-mode always \
  --no-fetch-logo \
  --dry-run)" || { echo "Compose conversion failed; STOP." >&2; exit 1; }
printf '%s\n' "$GENERATED" > "$WORK_DIR/.sealos/template/index.yaml"
```

The converter now emits digest-pinned images, database readiness
initContainers, custom-database init Jobs, bootstrap-credential inputs,
generated-secret defaults, public-URL envs, probes (with startup floors),
securityContext for non-root images writing volumes, and evidence-based
resource tiers. **Read `conversion-report.json` before anything else:**

1. Resolve every `required_action` item (for example a symbolic image user
   that needs a numeric uid, or an unsafe database name).
2. Review `decision` items against the repo evidence — especially derived
   public-URL envs (host-only vs scheme format) and generated-secret defaults
   with upstream format constraints.
3. Then apply the remaining agent overlay:
   - Add `imagePullSecrets: [{ name: ${{ defaults.app_name }} }]` only when
     `build-result.json` → `pull_access.<key>` is `ghcr_secret_required`.
   - Apply conversion constraints below that need repo judgment (public
     service selection among multiple candidates, file-based config
     ConfigMaps, official Kubernetes doc alignment).
   - Write `.sealos/phase-4/resource-map.json` mapping source workloads →
     template resources.
4. Do not drop services. Treat converter DB classification as immutable.

Invalid recipe / incomplete topology → **RETURN → Phase 2**.

### 6. Deploy gate (not quality_gate)

```bash
DOCKER_TO_SEALOS="<SKILL_DIR>/../docker-to-sealos"
# Single source of truth for the deploy-gate rule subset lives next to the
# rules registry — never hardcode rule IDs here.
DEPLOY_GATE_ONLY="$(cat "$DOCKER_TO_SEALOS/references/deploy-gate-rules.txt")"
node --experimental-strip-types "$DOCKER_TO_SEALOS/scripts/check-consistency.ts" \
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
| P4-V01 | Each `image-resolution.json` entry (or legacy `image-digests.json` entry) is `repository[:tag]@sha256:...` |
| P4-V02 | Every template container `image` is in the resolution table (converter gate/init images exempt; table may hold extra entries for KubeBlocks-replaced database images) |
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
- First document is the Template CR with no conditional rendering (R060); `defaults` values use built-in variables/functions only (R061)
- App CRD: only `spec.data.url`, `displayType=normal`, `type=link`, plus `icon`/`name` as required

**Runtime contract (apply during overlay):**
- Probes follow the health-check mapping in `conversion-mappings.md` (Compose `healthcheck` / official endpoints, R024). When no `start_period` evidence exists, emit the default `startupProbe` window (~120s) so slow cold starts are not killed.
- When a non-root image writes to a mounted volume (PVC or `volumeClaimTemplates`), set pod `securityContext` (`runAsNonRoot`, image UID `runAsUser`/`runAsGroup`, `fsGroup`, `fsGroupChangePolicy: OnRootMismatch`) per `runtime-log-hygiene.md`; move first-run permission or config bootstrap into initContainers.

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
| `<SKILL_DIR>/../docker-to-sealos/` | Compose conversion + deploy-gate `check-consistency.ts` |
