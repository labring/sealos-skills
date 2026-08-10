# Phase 4: Generate Sealos Template

## Path dependency gate

Before conversion or validation, ensure deferred tools for the selected deployment
source are available. Ask once to install; refuse or recheck failure → **STOP**.

| Need | Tools |
|------|-------|
| Always (this phase) | Python 3.8+ with PyYAML |
| Compose → template | `kompose` |
| Helm source | Helm 3+ |

### 5.1 Load Sealos Rules

Read the internal skill's specifications:
```
<SKILL_DIR>/../docker-to-sealos/SKILL.md                       — 7-step workflow + MUST rules
<SKILL_DIR>/../docker-to-sealos/references/sealos-specs.md     — Sealos ordering, labels, conventions
<SKILL_DIR>/../docker-to-sealos/references/conversion-mappings.md — field-level Docker→Sealos mappings
<SKILL_DIR>/../docker-to-sealos/references/example-guide.md    — representative template structure
<SKILL_DIR>/../docker-to-sealos/references/must-rules-map.yaml — executable rule coverage
```

If the project uses databases, also read:
```
<SKILL_DIR>/../docker-to-sealos/references/database-templates.md
```

If the project mentions Frappe, ERPNext, HRMS, or `bench`, also read:
```
<SKILL_DIR>/../docker-to-sealos/references/frappe-bench.md
```

### 5.2 Generate Template

Read `.sealos/analysis.json` and use `image_ref`, `port`, `databases`, and `env_vars` as inputs.

Generate the template at `.sealos/template/index.yaml` (overrides the default `template/` path from docker-to-sealos skill).
Do not create another template-generation artifact.

Before conversion or validation, require Python with PyYAML (see path dependency gate above):

```bash
PYTHON_BIN="$(command -v python3 || command -v python || true)"
if [ -z "$PYTHON_BIN" ] || ! "$PYTHON_BIN" -c 'import yaml' >/dev/null 2>&1; then
  echo "Phase 4 requires Python with PyYAML; install after user confirmation and retry." >&2
  exit 1
fi
```

When a supported root Compose file exists, use the deterministic converter as the generation baseline. Use `--dry-run` so the only written template artifact remains `.sealos/template/index.yaml`. Missing required converter capabilities or converter failure is a hard stop, not permission to hand-write around the failure.

```bash
COMPOSE_FILE=""
for candidate in docker-compose.yml docker-compose.yaml compose.yml compose.yaml; do
  if [ -f "$WORK_DIR/$candidate" ]; then
    COMPOSE_FILE="$WORK_DIR/$candidate"
    break
  fi
done

if [ -n "$COMPOSE_FILE" ]; then
  APP_NAME="$(
    "$PYTHON_BIN" -c \
      'import json, sys; value = json.load(open(sys.argv[1], encoding="utf-8"))["project"]["repo_name"]; print(value.rsplit("/", 1)[-1])' \
      "$WORK_DIR/.sealos/analysis.json"
  )" || {
    echo "Unable to read the app name from analysis.json; Phase 5 stopped." >&2
    exit 1
  }
  GITHUB_URL="$(
    "$PYTHON_BIN" -c \
      'import json, sys; value = json.load(open(sys.argv[1], encoding="utf-8"))["project"]["github_url"]; print(value or "")' \
      "$WORK_DIR/.sealos/analysis.json"
  )" || {
    echo "Unable to read the GitHub URL from analysis.json; Phase 5 stopped." >&2
    exit 1
  }
  GENERATED_TEMPLATE="$(
    "$PYTHON_BIN" "<SKILL_DIR>/../docker-to-sealos/scripts/compose_to_template.py" \
      --compose "$COMPOSE_FILE" \
      --app-name "$APP_NAME" \
      --git-repo "$GITHUB_URL" \
      --kompose-mode always \
      --no-fetch-logo \
      --dry-run
  )" || {
    echo "Deterministic Compose conversion failed; Phase 5 stopped." >&2
    exit 1
  }
  printf '%s\n' "$GENERATED_TEMPLATE" > "$WORK_DIR/.sealos/template/index.yaml"
fi
```

For converted templates, apply the resolved `analysis.json.image_ref` only to the application workload that it represents, then add the documented application-specific runtime semantics. Treat the converter's database classification as immutable: application-specific edits must not replace a KubeBlocks database `Cluster` with a Deployment, StatefulSet, Service, or other generic workload.

**Public URL detection:**
After generating the base template, check if the app needs its public URL configured:

1. Search source code for common URL config patterns:
   - Env vars: `BASE_URL`, `SITE_URL`, `APP_URL`, `NEXTAUTH_URL`, `PUBLIC_URL`, `EXTERNAL_URL`
   - Config files: `getConfig(.*[Uu]rl`, `homeUrl`, `baseUrl`, `siteUrl` in config patterns
   - Docker Compose env vars referencing `localhost` or placeholder URLs

2. If public URL is needed via env var:
   - Add the appropriate env var to the Deployment with value `https://${{ defaults.app_host }}.${{ SEALOS_CLOUD_DOMAIN }}`

3. If public URL is needed via config file (e.g., node-config):
   - Create a ConfigMap with the minimal config file
   - Add volumeMount and volume to the Deployment
   - Follow ConfigMap MUST rules (labels, naming, ordering before Deployment)

**Critical MUST rules (always apply):**
- `metadata.name`: hardcoded lowercase, no variables
- Image tag: exact version, **never `:latest`**
- PVC requests: `<= 1Gi`
- Container defaults: `cpu: 200m/20m`, `memory: 256Mi/25Mi`
- Init containers must define explicit resources; do not rely on namespace defaults. For expensive init work such as framework install, database migration, asset compilation, or `bench new-site`, allocate enough memory for the task.
- `imagePullPolicy: IfNotPresent`
- `revisionHistoryLimit: 1`
- `automountServiceAccountToken: false`
- For a locally built GHCR image, add `template.spec.imagePullSecrets: [{ name: ${{ defaults.app_name }} }]`. The Template API resolves this to the real generated instance name; the same-named Secret is created immediately after the deploy response. Omit it for anonymously pullable existing images and Docker Hub public images.
- Every `spec.defaults.<name>.value` and every present `spec.inputs.<name>.default` must deserialize as a YAML string; quote numeric-, boolean-, and null-like values, while infrastructure fields such as replicas and ports remain numeric
- **App CRD** (last resource): only `spec.data.url`, `spec.displayType`, `spec.icon`, `spec.name`, `spec.type` — no other fields (no `menuData`, `nameColor`, `template`, etc.)
- **App CRD fixed enums**: `spec.displayType` must be `normal`; `spec.type` must be `link`

### 5.3 Validate

Run the complete sibling quality gate:
```bash
"$PYTHON_BIN" "<SKILL_DIR>/../docker-to-sealos/scripts/quality_gate.py" \
  --artifacts "$WORK_DIR/.sealos/template/index.yaml"
```

Any non-zero exit stops Phase 5. Fix the existing `index.yaml` and rerun the complete gate before interactive configuration. In particular, `R052` means a Template default was parsed as a YAML number, boolean, or null instead of the string required by the Template CRD.

Template is written to `.sealos/template/index.yaml`. No separate checkpoint file — the template file's existence is sufficient for resume detection.

---

