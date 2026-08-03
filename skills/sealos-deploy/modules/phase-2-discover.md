# Phase 2: Discover and Prepare Images

## Purpose

Select one deployment source and prepare every required Dockerfile. Write a deployment plan that points to that source.

Do not build or push an image. Do not generate the final YAML. Do not modify `official_template`.

## Input

Read `.sealos/analysis.json`, the selected source workspace, and the Phase 1 route.

For the standard route, run this phase.

## Procedure

1. Read `README*`, `CONTRIBUTING*`, deployment files, workspace files, and CI files.
2. Run `gitingest` only on deployment and CI evidence. Do not ingest all source files.
3. Write the result to `.sealos/phase-2/gitingest-digest.txt`.
4. Record the main findings in the phase log.
5. Start one Subagent for the deployment-source decision and image preparation.
6. Give the Subagent the `analysis.json` path, the gitingest digest path, and a short evidence handoff.
7. Require the Subagent to write `.sealos/phase-2/deployment-plan.json`.
8. Require the Subagent to select one source in this order: Helm, Kubernetes, then Compose.
9. Require the Subagent to preserve the full runtime topology, including databases, queues, caches, and workers.
10. Require the Subagent to prepare a build configuration for every repository-built container.
11. Do not infer a published image from an organization or repository name.
12. If a working repository Dockerfile exists, reuse it.
13. If no Dockerfile works, run `railpack info` and `railpack plan`.
14. Read the railpack output before you write a replacement Dockerfile.
15. Prefer `.sealos/phase-2/` for generated Dockerfiles.
16. For a selected Helm or Kubernetes source with a build-reference requirement, patch only that deployment source.
17. Keep all other user source files unchanged.
18. For a Compose or implicit route, write the canonical Compose file to `.sealos/phase-2/docker-compose.yml`.
19. For a Compose or implicit route, set `deployment_source` to `.sealos/phase-2/docker-compose.yml`.
20. For a Helm route, point `deployment_source` at the chart root.
21. For a Kubernetes route, point `deployment_source` at one manifest file.
22. Validate `deployment-plan.json`.
23. Add only `deployment_plan` to `analysis.json`.
24. Validate the full Phase 2 artifact set.

Use `scripts/inspect-deployment-source.mjs` as evidence. Its output does not replace the Subagent decision.

The deployment plan has this contract:

```json
{
  "generated_at": "2026-08-03T00:00:00Z",
  "deployment_source": ".sealos/phase-2/docker-compose.yml"
}
```

Write this pointer into `analysis.json`:

```json
{
  "deployment_plan": ".sealos/phase-2/deployment-plan.json"
}
```

Run this validation after both files write:

```bash
node <SKILL_DIR>/scripts/validate-artifacts.mjs --stage phase-2 --dir "<WORK_DIR>"
```

## Stop Conditions

If no complete deployment source can be selected, stop.

If a repository-built service has no usable Dockerfile, stop.

If the deployment plan or full analysis artifact does not validate, stop.

## Exit Contract

If one plan source is valid and all builds have Dockerfiles, continue to Phase 4.
