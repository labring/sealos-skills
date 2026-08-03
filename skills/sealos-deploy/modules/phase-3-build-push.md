# Phase 3: Build and Push

## Purpose

Build required `linux/amd64` images. Push them to the current GitHub user GHCR namespace. Record immutable digests.

If Phase 4 requests a missing build digest, run this phase.

Do not inspect the repository again. Do not run railpack. Do not change a Dockerfile or `deployment_source`.

## Input

Read `runtime_profile` from `analysis.json`.

Read the deployment-plan pointer, the deployment source, and every build target from that source.

## Procedure

1. List repository-built targets from the selected deployment source.
2. If no target needs a build, skip this phase.
3. Start one Subagent for the first target. Do not start another build Subagent yet.
4. Give the Subagent the service key, context, Dockerfile, source path, and runtime profile.
5. In `local`, make the Subagent use Docker Buildx with `--platform linux/amd64` and `--load`. Do not use `--push`.
6. In `sandbox`, make the Subagent use the `k8s-kaniko-job` skill for a build-only Kaniko job.
7. If `k8s-kaniko-job` is unavailable, stop before creating a Kubernetes Job.
8. Start the next build Subagent only after the current target succeeds.
9. If a Dockerfile, context, or build recipe is invalid, return to Phase 2.
10. If a build still fails after one focused repair attempt, stop.
11. After every build succeeds, push all new images to `ghcr.io/<current-user>/...`.
12. Use one unique tag per pushed image. Read the immutable digest after each push.
13. Make an anonymous pull probe for every digest.
14. Record `public` or `ghcr_secret_required` for each service.
15. If a pull probe has no result, record `ghcr_secret_required`.
16. Compare the normalized GHCR namespace for every `ghcr_secret_required` image.
17. If those namespaces differ, stop.
18. Write one aggregate `.sealos/phase-3/build-result.json` file.
19. Add only `build_result` to `analysis.json`.
20. Validate the Phase 3 artifact set.

The main Agent owns all GHCR pushes. A build Subagent must not push an image.

Every private GHCR image must use the same normalized GHCR namespace.

Use `gh` for local authentication. Use the injected GitHub token in sandbox. Do not print tokens, Docker credentials, or build-argument values.

Use `scripts/write-build-result.mjs` after the pushes and pull probes finish. Give it one `--digest` and one `--pull-access` value per service.

Write this aggregate result shape:

```json
{
  "generated_at": "2026-08-03T00:00:00Z",
  "digests": {
    "web": "ghcr.io/user/app-web@sha256:<digest>"
  },
  "pull_access": {
    "web": "public"
  }
}
```

Write this pointer into `analysis.json`:

```json
{
  "build_result": ".sealos/phase-3/build-result.json"
}
```

Run this validation after both files write:

```bash
node <SKILL_DIR>/scripts/validate-artifacts.mjs --stage phase-3 --dir "<WORK_DIR>"
```

## Exit Contract

Return to Phase 4 after every required digest is available. Do not continue to any later phase.
