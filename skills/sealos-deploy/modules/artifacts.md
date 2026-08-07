# Artifact Directory

All pipeline outputs are written under `.sealos/` in `WORK_DIR`:

```
<WORK_DIR>/.sealos/
├── config.json                   ← user configuration overrides (manual, committed to git)
├── template-match.json           ← Phase 0.5 template fast-path decision
├── state.json                    ← deployment state (auto-maintained after Phase 6)
├── analysis.json                 ← project analysis snapshot (regenerated each deploy)
├── build/                        ← created only if Phase 4 actually runs
│   └── build-result.json         ← Phase 4 result (`success` or `failed`)
└── template/
    └── index.yaml                ← Phase 5 Sealos template
```

**File responsibilities:**
- `config.json` — optional user overrides (port, base_image, build_command, etc.). Created manually by user, committed to git. All fields optional.
- `analysis.json` — project analysis snapshot written after Phase 1 (language, framework, port, and more). Regenerated each deploy.
- `state.json` — deployment state written after Phase 6 success. Contains `last_deploy` and `history`. Enables UPDATE mode on subsequent runs.

**Note:** When reading dockerfile-skill modules (analyze.md, generate.md, build-fix.md), they reference `docker-build/` as their default output path. In this pipeline, always write to `.sealos/build/` instead. Similarly, template output goes to `.sealos/template/` instead of `template/`.

JSON artifacts under `.sealos/` are governed by explicit schemas in `<SKILL_DIR>/schemas/`:
- `config.schema.json`
- `template-match.schema.json`
- `analysis.schema.json`
- `build-result.schema.json`
- `state.schema.json`

Validate them with:

```bash
node "<SKILL_DIR>/scripts/validate-artifacts.mjs" --dir "$WORK_DIR"
```

Writers should validate on write; readers should validate before trusting resume/update state.

At the very start of the pipeline (before Phase 1), create the base artifact directory:

```bash
mkdir -p "$WORK_DIR/.sealos" "$WORK_DIR/.sealos/template"
```

Create `"$WORK_DIR/.sealos/build"` lazily when Phase 4 starts. If Phase 2 finds an existing image and skips Phase 4, `build/` should remain absent rather than exist as an empty directory.

**Read user config (if exists):**
If `.sealos/config.json` exists, read it. User-provided values take priority over auto-detection and AI inference throughout the pipeline.

```json
{
  "port": 8080,
  "node_version": "20",
  "start_command": "node dist/main.js",
  "build_command": "pnpm build:prod",
  "system_deps": ["ffmpeg"],
  "base_image": "node:20-slim",
  "env_overrides": { "NODE_ENV": "production" },
  "skip_phases": ["assess"]
}
```
All fields are optional. If a field is present, it overrides the corresponding auto-detected value.

