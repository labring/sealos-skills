# Artifact Directory

All pipeline outputs are written under `.sealos/` in `WORK_DIR`:

```
<WORK_DIR>/.sealos/
├── config.json                   ← user configuration overrides (manual, committed to git)
├── state.json                    ← deployment state (auto-maintained after Phase 6)
├── analysis.json                 ← Phase 0 (4 fields); Phase 1 adds official_template; later phases extend
├── build/                        ← created only if Phase 3 actually runs
│   └── build-result.json         ← Phase 3 result (`success` or `failed`)
└── template/
    └── index.yaml                ← Phase 1 official fetch, or Phase 4 generated template
```

**File responsibilities:**
- `config.json` — optional user overrides (port, base_image, build_command, etc.). Created manually by user, committed to git. All fields optional.
- `analysis.json` — Phase 0 overwrites with `runtime_profile`, `work_dir`, `repo_name`, `github_url` only. Phase 1 adds `official_template` (`null` or a labring-actions raw URL) and preserves the four Phase 0 fields. Later phases may add pointers such as `deployment_plan`. Do not treat a Phase 0-only file as Phase 1 complete. Full `analysis.schema.json` validation applies once Phase 1 has written `official_template`.
- `state.json` — deployment state written after Phase 6 success. Contains `last_deploy` and `history`. Enables UPDATE mode on subsequent runs.
- `template/index.yaml` — written by Phase 1 on an exact official-template match (verbatim fetch), or by Phase 4 on the standard path.

**Note:** When reading dockerfile-skill modules (analyze.md, generate.md, build-fix.md), they reference `docker-build/` as their default output path. In this pipeline, always write to `.sealos/build/` instead. Similarly, template output goes to `.sealos/template/` instead of `template/`.

JSON artifacts under `.sealos/` are governed by explicit schemas in `<SKILL_DIR>/schemas/`:
- `config.schema.json`
- `analysis.schema.json`
- `build-result.schema.json`
- `state.schema.json`

Validate them with:

```bash
node "<SKILL_DIR>/scripts/validate-artifacts.mjs" --dir "$WORK_DIR"
```

Writers should validate on write; readers should validate before trusting resume/update state.

Phase 0 already creates `"$WORK_DIR/.sealos"` when it writes `analysis.json`. After Phase 0 validation, ensure the template directory exists:

```bash
mkdir -p "$WORK_DIR/.sealos" "$WORK_DIR/.sealos/template"
```

Create `"$WORK_DIR/.sealos/build"` lazily when Phase 3 starts. If Phase 2 finds an existing image and skips Phase 3, `build/` should remain absent rather than exist as an empty directory.

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
