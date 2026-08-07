# Phase 12: Branch Policy, Documentation, and Release Audit - Discussion Log

> **Audit trail only.** Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-07
**Phase:** 12-Branch Policy, Documentation, and Release Audit
**Mode:** `--auto`
**Areas discussed:** audit anchors, file classification, preview boundary, public claims, verification and release boundary

---

## Audit anchors

| Option | Description | Selected |
|--------|-------------|----------|
| Immutable SHAs | Record source main, target preview, and current release-candidate commits before analysis. | ✓ |
| Moving branch names | Re-resolve branch tips throughout the audit. | |
| Current worktree only | Treat the worktree as the complete source and target evidence. | |

**Auto selection:** Immutable SHAs (recommended)
**Notes:** Source `main` is `a2efc15e95b86582469f423f6e9cae1bcfce4585`; target `upstream/brain-deploy-preview` is `dbc55f0d4e572d283d3244581246823a1ca6b932`; release candidate `HEAD` is `ef8f2aceb2e7f0b915713419cd129fbc0454d717`.

## File classification

| Option | Description | Selected |
|--------|-------------|----------|
| Three-way aligned/adapted/excluded rows | Classify every source-to-target path with policy evidence and final disposition. | ✓ |
| Narrative branch summary | Describe major differences without a complete path inventory. | |
| Raw diff attachment | Store the diff as the primary release report. | |

**Auto selection:** Three-way aligned/adapted/excluded rows (recommended)
**Notes:** The report must expose source content, target content, policy rule, and disposition for each changed path.

## Preview boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Preserve prepare-only flow | Keep Railpack probe, Dockerfile, Kaniko, template, and delivery artifacts; exclude full deploy/runtime and Canvas surfaces. | ✓ |
| Converge preview to full main workflow | Replace prepare artifacts with OAuth, Template API, UPDATE, Runtime Truth, and Canvas. | |
| Freeze all changes | Carry no shared fixes into the preview audit. | |

**Auto selection:** Preserve prepare-only flow (recommended)
**Notes:** `AGENTS.md` is authoritative; five skill directories align with main, `dockerfile-skill` keeps only the documented Railpack delta, and `sealos-deploy` is reviewed manually.

## Public claims and versions

| Option | Description | Selected |
|--------|-------------|----------|
| Canonical inventory plus host projections | Use root eight-skill inventory and synchronize README siblings, manifests, platform evidence, and versions. | ✓ |
| Root README only | Update the root README and leave localized and manifest claims for a later task. | |
| Manifest-first inventory | Treat one host manifest as the source for public claims. | |

**Auto selection:** Canonical inventory plus host projections (recommended)
**Notes:** Host syntax remains `$sealos` for Codex, `/sealos` for compatible plugin hosts, and direct `/sealos-*` only in skills.sh sections.

## Verification and release boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Offline required gate plus referenced runtime evidence | Run all deterministic validators and cite existing sanitized Runtime Truth/live-smoke evidence. | ✓ |
| Provider-backed release run | Perform new login, cluster, database, bucket, or deployment operations during the audit. | |
| Documentation-only review | Skip executable gates and rely on manual inspection. | |

**Auto selection:** Offline required gate plus referenced runtime evidence (recommended)
**Notes:** Provider mutation, merge, push, tag, and publication remain outside the phase boundary.

## the agent's Discretion

- Choose the smallest deterministic report generator and stable Markdown table schema.
- Group identical aligned rows for readability while retaining a path-level manifest.
- Reuse prior phase evidence by commit and path rather than copying sensitive or redundant payloads.

## Deferred Ideas

- A later maintainer operation can perform the actual main-to-preview synchronization after this release audit.
- Provider-backed release smoke and release publication require a named environment, credentials, and cleanup authority.

