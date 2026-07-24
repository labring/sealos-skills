# Phase 3 Dockerfile Integration Boundary

This module defines the only dockerfile-skill behavior that `sealos-deploy`
uses in Phase 3. It is a preparation integration, not the standalone
dockerfile-skill workflow.

## Input

Process every `service_inventory` entry that Phase 5 will emit as a container
and whose `image_status` is `build_required`. This includes an implicit
single-application service for a project without Compose.

Each service must have a normalized build plan:

```json
{
  "context": ".",
  "dockerfile": "Dockerfile",
  "target": null,
  "args": [],
  "origin": null
}
```

`context` is relative to `WORK_DIR`; `dockerfile` is relative to that context.
`args` contains names only, never values.

## Existing Dockerfile

Preserve an existing effective Dockerfile by default. Single-stage builds,
root users, missing `EXPOSE`, imperfect caching, and floating base-image tags
are not blocking defects. Do not make style or optimization rewrites.

Repair only a defect that is certainly blocking the selected service, or a
defect proven by that service's actual Phase 4 build. Make the smallest change
and set `origin` to `repaired`.

## Missing Dockerfile

When the effective Dockerfile is missing, use dockerfile-skill only as
stack-analysis and template knowledge. Select from its currently maintained
templates rather than copying a fixed template list into `sealos-deploy`.
Adapt the result to the service's real context, workspace boundaries, package
manager, build command, runtime entrypoint, port, and required system
dependencies. Set `origin` to `generated`.

Do not execute dockerfile-skill's standalone workflow or treat its full
`SKILL.md`, `modules/generate.md`, or `modules/build-fix.md` as an execution
checklist. In particular, Phase 3 must not build or run images, create Compose
files, create `.env` or test-secret files, write standalone reports or
deployment documentation, change service topology, or alter unrelated source
or application configuration.

## `.dockerignore`

Preserve an existing `.dockerignore` unless a concrete build failure proves it
wrong. When it is absent, generate the smallest rules supported by the actual
context. Do not blanket-ignore `*.md`, workspace packages, migrations, scripts,
patches, configuration, or static assets. Exclude secret-bearing files only
when they are not required inputs, and retain non-secret examples.

## Output

Write no separate Phase 3 report or rating. Update only the selected service's
normalized `service_inventory[].build` plan and the narrowly required build
files described above. Phase 4 owns the `linux/amd64` build and all
`.sealos/build/<service-key>/build-result.json` artifacts.
