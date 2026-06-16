# Phase 4: Install Smoke and Handoff - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 4-install-smoke-and-handoff
**Areas discussed:** original need and success criteria, native smoke evidence, compatibility path evidence, isolation and cleanup, final handoff contents, assumptions and risks

---

## Original Need and Success Criteria

| Option | Description | Selected |
|--------|-------------|----------|
| Fresh final evidence | Treat Phase 4 as final proof against the current post-Phase-3 repository state. | selected |
| Reuse Phase 1 evidence only | Refer to historical native smoke evidence without rerunning install checks. | |
| Expand into runtime skill validation | Re-test deploy, database, S3, canvas, or app-builder behavior. | |

**User's choice:** The user specified Phase 4 as install smoke and handoff with HAND-01, HAND-02, and HAND-03.
**Notes:** The discussion locked Phase 4 as verification and handoff work. Runtime skill behavior stays outside the phase boundary.

---

## Native Codex Smoke Evidence

| Option | Description | Selected |
|--------|-------------|----------|
| Isolated local worktree smoke | Use temporary `HOME` and `CODEX_HOME`, add the current worktree as marketplace, list available plugins, install `sealos@sealos`, and assert payload. | selected |
| Remote marketplace smoke only | Use `labring/sealos-skills` as the marketplace source for final evidence. | |
| Static validator only | Use validator output without native Codex CLI add/list/install smoke. | |

**User's choice:** The user requested exact native Codex path smoke evidence.
**Notes:** Local worktree smoke is the reliable pre-merge proof target. Remote `labring/sealos-skills` smoke belongs after publication if the remote lacks the candidate commit.

---

## Compatibility Path Evidence

| Option | Description | Selected |
|--------|-------------|----------|
| Isolated `npx plugins add` install | Run the documented compatibility command with temporary home, Codex home, and npm cache, then capture stdout, stderr, and exit code. | selected |
| Compatibility discovery evidence | Capture `npx plugins` version/help plus README and validator proof if full install is blocked by tool or network behavior. | selected |
| Skip compatibility evidence | Rely on README copy and Phase 3 validator only. | |

**User's choice:** The user requested compatibility install evidence for the `npx plugins` path.
**Notes:** Full isolated install is preferred. Discovery evidence is acceptable only with an explicit blocker note when full install cannot be made deterministic.

---

## Isolation and Cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Temporary environment roots | Use temp `HOME`, `CODEX_HOME`, npm cache, and plugin-related XDG dirs; record paths and remove them after evidence capture. | selected |
| Developer default state | Run commands against the user's normal Codex and npm state for speed. | |
| Preserve all temp dirs | Keep every smoke environment after the run for manual inspection. | |

**User's choice:** The user asked to define an isolation and cleanup strategy for commands that might touch Codex/plugin state.
**Notes:** Evidence must prove isolation. Temp dirs can be retained only for diagnosis and must be named in the handoff.

---

## Final Handoff Contents

| Option | Description | Selected |
|--------|-------------|----------|
| Evidence plus exact changed files | Include native evidence, compatibility evidence, validator output, JSON syntax checks, exact milestone changed files, Phase 4 source-edit scope, skills unchanged proof, and remaining follow-up. | selected |
| Short summary only | State that smoke passed and list broad areas changed. | |
| Source-only changelog | List changed implementation files without evidence details. | |

**User's choice:** The user requested exact final handoff artifact contents: changed files, evidence, remaining follow-up.
**Notes:** The handoff should distinguish committed milestone changes from uncommitted working-tree changes and should use git truth for file lists.

---

## Assumptions, Risks, and Tradeoffs

| Option | Description | Selected |
|--------|-------------|----------|
| State assumptions explicitly | Record local-vs-remote smoke target, `npx` variability, evidence secrecy rules, and v2 follow-up boundaries. | selected |
| Hide tradeoffs in verification | Mention only pass/fail outcomes after execution. | |
| Broaden Phase 4 to all hosts | Convert Phase 4 into distribution-wide validation. | |

**User's choice:** The user requested assumptions, risks, and tradeoffs.
**Notes:** Distribution-wide non-Codex validation remains v2 scope. Phase 4 can name non-Codex follow-up without implementing it.

---

## the agent's Discretion

- The agent selected the user's six discussion tasks as the active gray areas because the invocation already named the needed decisions.
- The agent selected local worktree native smoke as the primary pre-merge evidence path, with remote smoke as a post-publication follow-up when needed.
- The agent allowed compatibility discovery evidence only as a fallback when full isolated `npx plugins add` install is blocked.
- The agent specified evidence filename patterns and assertion expectations, while leaving exact implementation script shape to the planner/executor.

## Deferred Ideas

- Distribution-wide validator for Claude, CodeBuddy, Gemini, Qwen, OpenClaw, marketplace, and command-route parity.
- CI or documented local command that runs every distribution validator.
- Non-Codex screenshot or GIF refresh if host UI copy changes.
- Remote `labring/sealos-skills` marketplace smoke after candidate changes are published.
