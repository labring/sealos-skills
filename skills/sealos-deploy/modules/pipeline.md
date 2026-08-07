# Deployment Pipeline

After preflight passes, run this chain. Load one file at a time.

`SKILL_DIR` is the directory that contains this skill's `SKILL.md`. Sibling skills are at `<SKILL_DIR>/../`.

Use `ENV` from preflight to choose script mode (Node.js available) or fallback mode (AI-native).

## Deploy chain

1. `modules/eligibility.md` — Phase 0.4 workload gate
2. `modules/artifacts.md` — create `.sealos/`, read config, schema rules
3. `modules/mode.md` — DEPLOY vs UPDATE, then resume checks in DEPLOY mode
4. If UPDATE mode → load `modules/update.md`, then `modules/runtime-truth.md`. Stop this chain.
5. `modules/template-fast-path.md` — Phase 0.5
6. `modules/assess.md` — Phase 1
7. `modules/detect-image.md` — Phase 2
8. `modules/dockerfile.md` — Phase 3
9. `modules/build-push.md` — Phase 4
10. `modules/template.md` — Phase 5
11. `modules/configure.md` — Phase 5.5
12. `modules/deploy.md` — Phase 6, then write state and success output
13. `modules/runtime-truth.md` — Phase 6.5 (also required from `deploy.md`)

## Update chain

1. `modules/mode.md` — confirm UPDATE mode and context
2. `modules/update.md` — build or restart, apply, verify rollout, history
3. `modules/runtime-truth.md` — accept the running app

## Rules

1. Do not start Phase 1 while Phase 0 still has unresolved entry blockers.
2. Report Docker, `gh`, builder, and registry failures early. Treat them as hard blockers only when the run needs local build or push.
3. Do not load later phase files until the current phase finishes or cleanly skips.
4. For delete order and Instance CR rules, read `references/cleanup.md`.
