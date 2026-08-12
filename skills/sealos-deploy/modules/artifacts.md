# Artifact Directory

All pipeline outputs are written under `.sealos/` in `WORK_DIR`:

```
<WORK_DIR>/.sealos/
├── config.json                   ← user configuration overrides (manual, committed to git)
├── state.json                    ← deployment state (auto-maintained after Phase 7)
├── analysis.json                 ← Phase 0–2 fields; later phases add pointers
├── phase-2/
│   ├── agentlens-digest.txt
│   ├── deployment-plan.json
│   └── docker-compose.yml        ← non-Helm/K8s only
├── phase-3/
│   └── build-result.json         ← when Phase 3 builds/pushes
├── phase-4/
│   ├── image-resolution.json     ← digests + image configs (resolve-images.ts)
│   ├── conversion-report.json    ← converter decisions / required actions
│   ├── image-digests.json        ← legacy alternative to image-resolution.json
│   ├── source/
│   ├── rendered.yaml
│   └── resource-map.json
├── phase-5/
│   └── prepare-result.json       ← after dry-run + user confirm
├── phase-6/
│   └── deploy-result.json        ← after successful create
└── template/
    └── index.yaml                ← Phase 1 official fetch, or Phase 4 generated template
```

**File responsibilities:**
- `config.json` — optional user overrides. Created manually by user, committed to git.
- `analysis.json` — Phase 0: four fields. Phase 1: adds `official_template`. Phase 2: adds `deployment_plan`. Phase 3 may add `build_result`.
- `phase-2/deployment-plan.json` — Phase 2 plan with `deployment_source` (read by Phase 3 and Phase 4).
- `phase-2/agentlens-digest.txt` — deploy-focused path tree for scout.
- `phase-5/prepare-result.json` — Phase 5: template sha256, dry-run passed, user confirmed.
- `phase-6/deploy-result.json` — Phase 6: template sha256 (matches Phase 5) and `app_name`.
- `template/index.yaml` — Phase 1 official fetch or Phase 4 generated template.
- `state.json` — deployment state after Phase 7 success; enables UPDATE mode.

JSON artifacts under `.sealos/` are governed by schemas in `<SKILL_DIR>/schemas/`:
- `config.schema.json`
- `analysis.schema.json`
- `deployment-plan.schema.json`
- `build-result.schema.json`
- `image-digests.schema.json`
- `prepare-result.schema.json`
- `deploy-result.schema.json`
- `state.schema.json`

Validator split: each phase runs its own `validate-phase-N.mjs` at the phase
boundary; `validate-artifacts.mjs` is the full sweep for resume, debug, or
cross-phase checks.

Validate them with:

```bash
node "<SKILL_DIR>/scripts/validate-artifacts.mjs" --dir "$WORK_DIR"
```

Phase 0 already creates `"$WORK_DIR/.sealos"` (with a `.gitignore` that keeps
everything except `config.json` out of the user's repository) when it writes
`analysis.json`. After Phase 0 validation:

```bash
mkdir -p "$WORK_DIR/.sealos" "$WORK_DIR/.sealos/template" "$WORK_DIR/.sealos/phase-2"
```

**Read user config (if exists):**
If `.sealos/config.json` exists, read it. User-provided values take priority over auto-detection and AI inference. Every field has a defined consumer — do not add fields without one:

```json
{
  "deployment_source": "deploy/docker-compose.yml",
  "public_service": "web",
  "port": 8080,
  "node_version": "20",
  "start_command": "node dist/main.js",
  "build_command": "pnpm build:prod",
  "system_deps": ["ffmpeg"],
  "base_image": "node:20-slim",
  "env_overrides": { "NODE_ENV": "production" }
}
```

| Field | Consumed by |
|-------|-------------|
| `deployment_source` | Phase 2 source selection (skips inference) |
| `public_service` | Phase 2 plan / Phase 4 network selection |
| `port`, `node_version`, `start_command`, `build_command`, `system_deps`, `base_image` | Phase 2 Dockerfile preparation |
| `env_overrides` | Phase 5 configuration collection |

All fields are optional. If a field is present, it overrides the corresponding auto-detected value.
