# Seakills

Prepare validated [Sealos Cloud](https://sealos.io) deployment artifacts from a
GitHub repository with a `skills.sh` compatible agent.

This branch is designed for the hosted Brain sandbox. The sandbox agent already
has these skills, a current Kubernetes identity for image builds and
non-persistent target validation, and injected GitHub credentials.

## Quick Start

```text
/sealos-deploy https://github.com/owner/repository
```

The workflow:

1. fully materializes and assesses the repository;
2. reuses the unique remotely verified official Template whose normalized
   `spec.gitRepo` matches the GitHub `owner/repo`, allowing only schema-driven
   field repairs while preserving every resource;
3. otherwise discovers the declared deployment source, complete service
   topology, and exact image evidence;
4. preserves or prepares each required Dockerfile;
5. reuses images or builds missing services with Kaniko in the current sandbox
   namespace;
6. generates and locally validates a digest-pinned Sealos Template;
7. privately renders its runtime documents and validates each one against the
   target API server with strict server-side dry-run; sandbox authorization
   failures are warnings and never cause YAML changes;
8. writes a delivery manifest and stops for the downstream deployment system.

A low readiness score is a warning, not an automatic rejection. The repository
may contain a deployable child app, documentation site, Storybook, example, or
static build even when the root is a library or monorepo.

## Outputs

Every completed handoff contains:

```text
.sealos/analysis.json
.sealos/template-references.json
.sealos/build-request.json
.sealos/build-result.json
.sealos/template/index.yaml
.sealos/delivery-manifest.json
```

The build files are aggregate multi-service artifacts. An exact official
Template still produces the same stable contract with an empty request and a
skipped result.

Required application configuration remains in Template inputs for downstream
collection. Private GHCR images add only an app-scoped pull-Secret reference;
tokens and Docker auth are never embedded in the YAML.

## Prepare-Only Boundary

`/sealos-deploy` does not ask the user to authenticate to GitHub or Sealos,
choose a region/workspace, persist the final YAML, or verify a running URL. It
finishes only after the local quality gate and target-cluster server-side
dry-run pass. The dry-run does not create runtime resources.

Adjacent `/sealos-database` and `/sealos-s3` skills remain available for
development-service workflows.

## Repository

[`skills/`](./skills) contains the source for `/sealos-deploy`,
`/sealos-database`, `/sealos-s3`, and their internal dependencies.

## License

MIT
