# Deployment Pipeline

After Phase 0 passes, run this chain. Load one file at a time.

`SKILL_DIR` is the directory that contains this skill's `SKILL.md`. Sibling skills are at `<SKILL_DIR>/../`.

Use `ENV` from Phase 0 to choose script mode (Node.js available) or fallback mode (AI-native).

## Deploy chain

1. `modules/phase-0.md` — Preflight
2. `modules/artifacts.md` — create `.sealos/`, read config, schema rules
3. `modules/mode.md` — DEPLOY vs UPDATE, then resume checks in DEPLOY mode
4. If UPDATE mode → load `modules/update.md`, then `modules/phase-7.md`. Stop this chain.
5. `modules/phase-1.md` — Eligibility, template fast path, project signals
6. `modules/phase-2.md` — Detect image or prepare Dockerfile
7. `modules/phase-3.md` — Build and push
8. `modules/phase-4.md` — Generate Sealos template
9. `modules/phase-5.md` — Interactive configuration
10. `modules/phase-6.md` — Deploy, write state, success output
11. `modules/phase-7.md` — Runtime Truth Pass

## Update chain

1. `modules/mode.md` — confirm UPDATE mode and context
2. `modules/update.md` — build or restart, apply, verify rollout, history
3. `modules/phase-7.md` — accept the running app

## Rules

1. Do not start Phase 1 while Phase 0 still has unresolved entry blockers.
2. Report Docker, `gh`, builder, and registry failures early. Treat them as hard blockers only when the run needs local build or push.
3. Do not load later phase files until the current phase finishes or cleanly skips.
4. For delete order and Instance CR rules, read `references/cleanup.md`.
