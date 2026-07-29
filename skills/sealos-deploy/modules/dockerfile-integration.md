# Phase 3 Dockerfile Integration Boundary

This module defines the only dockerfile-skill behavior that `sealos-deploy`
uses in Phase 3. It is a preparation integration, not the standalone
dockerfile-skill workflow.

## Input

Process every `service_inventory` entry that Phase 5 will emit as a container
and whose `image_status` is `build_required`. For a project without declared
topology, process the actual services AI established from repository evidence;
do not assume that the repository root is the application.

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
`args` contains names only, never values. The application source and build
context may differ: a child workspace, Storybook, documentation site, example,
or static build can require the repository root as its dependency boundary.

## Existing Dockerfile

Preserve an existing effective Dockerfile by default. Single-stage builds,
root users, missing `EXPOSE`, imperfect caching, and floating base-image tags
are not blocking defects. Do not make style or optimization rewrites.

Repair only a defect that is certainly blocking the selected service, or a
defect proven by that service's actual Phase 4 build. Make the smallest change
and set `origin` to `repaired`.

An actual failure resolving or pulling a Dockerfile `FROM` or `COPY --from`
image is a proven blocker. If the source still establishes an equivalent build
and runtime contract, repair or reconstruct that Dockerfile with an accessible
compatible base, then retry the service. Re-derive paths, entrypoint, user,
server configuration, and port instead of blindly swapping the base image.

## Missing Dockerfile

When the effective Dockerfile is missing, use dockerfile-skill only as
stack-analysis and template knowledge. Select from its currently maintained
templates rather than copying a fixed template list into `sealos-deploy`.
Use the whole repository's project-owned evidence to choose a reasonable
deployable form, then adapt the result to its real context, workspace
boundaries, package manager, build command, output, runtime entrypoint, port,
and required system dependencies. Static output served by the final container
is a valid runtime contract even when the source itself does not listen on a
port. Set `origin` to `generated`.

Do not execute dockerfile-skill's standalone workflow or treat its full
`SKILL.md`, `modules/generate.md`, or `modules/build-fix.md` as an execution
checklist. In particular, Phase 3 must not build or run images, create Compose
files, create `.env` or test-secret files, write standalone reports or
deployment documentation, change service topology, or alter unrelated source
or application configuration.

A missing root start command, unfamiliar stack metadata, or one unusable build
route does not reject the repository. Continue through relevant application
directories, workspace scripts, examples, Storybooks, documentation builds,
and project-owned CI/deploy workflows. Stop only after concrete preparation or
build evidence leaves no reasonable project-backed deployment form.

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
