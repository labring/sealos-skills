# Deployment Pipeline

After Phase 0 passes, run this chain. Load one file at a time.

`SKILL_DIR` is the directory that contains this skill's `SKILL.md`. Sibling skills are at `<SKILL_DIR>/../`.

Phase 0 writes `.sealos/analysis.json` with only `runtime_profile`, `work_dir`, `repo_name`, and `github_url`. Later phases extend that file.

## Deploy chain

1. `modules/phase-0.md` — Preflight (ends with `validate-phase-0.mjs`)
2. `modules/artifacts.md` — `.sealos/` layout, config, schema rules
3. `modules/mode.md` — DEPLOY vs UPDATE, then resume checks in DEPLOY mode
4. If UPDATE mode → load `modules/update.md`, then `modules/phase-7.md`. Stop this chain.
5. `modules/phase-1.md` — Blacklist, official template match, `official_template`
6. `modules/phase-2.md` — agentlens scout, `deployment-plan`, image prep
7. `modules/phase-3.md` — Build and push (no targets → pass through)
8. `modules/phase-4.md` — Generate Sealos template
9. `modules/phase-5.md` — Pre-deploy preparation (server dry-run → config → confirm)
10. `modules/phase-6.md` — Deploy once, write deploy-result
11. `modules/phase-7.md` — Runtime Truth, state.json, COMPLETE

## Update chain

1. `modules/mode.md` — confirm UPDATE mode and context
2. `modules/update.md` — build or restart, apply, verify rollout, history
3. `modules/phase-7.md` — accept the running app

## Rules

1. Do not enter mode detection until `validate-phase-0.mjs` passes.
2. Missing `gh` auth / `write:packages` is a Phase 0 warning. Treat it as a hard blocker only when the run needs GHCR push.
3. Do not load later phase files until the current phase finishes or cleanly skips.
4. For delete order and Instance CR rules, read `references/cleanup.md`.
