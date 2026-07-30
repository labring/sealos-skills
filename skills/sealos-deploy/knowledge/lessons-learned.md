# Prepare Workflow Lessons

These rules come from failures observed while preparing Sealos deployments.

## Repository Is The Source Boundary

A root library, CLI, or monorepo is not automatically impossible to deploy.
Inspect project-backed child apps, docs, Storybook, examples, static builds,
APIs, and workers before stopping. A low readiness score is a warning, not a
rejection rule.

## Image Evidence Must Be Declared

Do not guess an image from GitHub owner/repository names or registry search.
Use README remote pull/run instructions, CI publish destinations, Compose,
rendered Helm, or Kubernetes declarations. Resolve the exact selector to a
digest and retain all source evidence.

A Dockerfile base image is not a published image of the project. One resolved
image also does not authorize dropping the other services in a declared
topology.

## Preserve Complete Topology

Application, database, worker, proxy, gateway, queue, cache, search, and
storage capabilities remain accounted for. A Sealos-native transformation may
change a resource kind only when runtime behavior and dependency wiring remain
equivalent.

Before replacing a source database with KubeBlocks, account for database names,
users, password sources, grants, initialization, scripts, mounts, commands,
data paths, variants, replicas, and consumers. Retain an annotated raw workload
when the transformation is not lossless.

## Public URL Configuration

Scan for `BASE_URL`, `SITE_URL`, `APP_URL`, `NEXTAUTH_URL`, `PUBLIC_URL`,
`EXTERNAL_URL`, and file-based localhost fallbacks. Use a normal Template env
value when the app supports one. When it reads a config file, mount the smallest
ConfigMap override with `subPath` rather than replacing the whole directory.

## Per-Service Build Plans

Every final container service owns its exact context, context-relative
Dockerfile, optional target, and build-argument names. A root Dockerfile is not
a checkpoint for every service.

Preserve working Dockerfiles and `.dockerignore` files. Repair only a proven
blocker, and retry only the failing service. A monorepo child Dockerfile may
still need repository root as context for lockfiles and sibling packages.

## Sandbox Kaniko Identity

Resolve namespace in this order:

1. explicit sandbox override
2. active kube context namespace
3. mounted service-account namespace

Carry the current service account onto the temporary Job. Never assume
`default`, query with an admin kubeconfig, or require cluster-scoped namespace
read access.

## Kaniko Context Boundary

Kaniko sees the S3 tarball, not the DevBox filesystem. Package exactly
`source.work_dir + context_path`; require the Dockerfile inside that context;
exclude repository metadata, `.sealos`, and local VersityGW stores.

A loopback VersityGW endpoint works only for the DevBox process. The separate
Job needs a Pod- or Service-reachable endpoint.

## GHCR Preflight And Pull Handoff

Validate the injected token identity and `write:packages` scope before a long
build. GHCR repository path components are lowercase.

After push, read the Kaniko digest and test anonymous pull against that digest.
Keep the immutable image for `anonymous`, `ghcr_secret_required`, and
`indeterminate`. For the latter two, put only the app-scoped
`${{ defaults.app_name }}` pull-Secret reference on affected workloads.
Credential materialization belongs to the downstream deployment system.

## Aggregate Build Contract

One version `2.0` build request covers all final container services. One
version `2.0` result records every reuse or build independently. A failed
service exposes no deployable image; the aggregate succeeds only when every
expected service is resolved.

The final delivery validator aligns routes, service identities, digests,
Template image refs, pull-Secret requirements, and manifest paths before
handoff.
