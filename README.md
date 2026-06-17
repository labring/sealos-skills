# Seakills

Prepare [Sealos Cloud](https://gzg.sealos.run) deployment artifacts from your AI agent.

Seakills is a `skills.sh` skill pack centered on `/sealos-deploy`, with adjacent Sealos database and S3 skills for development setup. It helps an agent inspect a project, reuse or build a container image in a sandbox workflow, generate Sealos template artifacts for a later deploy step, and connect projects to Sealos Cloud services.

## Quick Start

Install Seakills:

```bash
npx skills add labring/seakills
```

Then run:

```text
/sealos-deploy
/sealos-database
/sealos-s3
```

Examples:

```text
/sealos-deploy
/sealos-deploy /path/to/project
/sealos-deploy https://github.com/labring-sigs/kite
/sealos-database create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos-s3 create private object storage for uploads and wire env vars
```

## How Setup Works

You only need a `skills.sh` compatible AI agent and a project to prepare.

During the prepare flow, Seakills will:

- inspect the project and resolve GitHub metadata
- detect reusable Docker Hub or GHCR images
- reuse, repair, or generate a Dockerfile
- write `.sealos/build-request.json`
- run a sandbox kaniko build only when a reusable image is not available
- generate `.sealos/template/index.yaml` and `.sealos/delivery-manifest.json`
- create or reuse Sealos Cloud databases for local development
- create or reuse Sealos S3-compatible object storage and wire env vars

## What `/sealos-deploy` Handles

On a typical prepare run, the agent will:

1. Assess the project structure and runtime needs.
2. Reuse an existing image or build one when needed.
3. Generate a Sealos template.
4. Write a delivery manifest listing the generated artifacts.

## What `/sealos-database` Handles

For a local project or Devbox that needs a cloud database, the agent will detect database signals, create or reuse a Sealos Cloud database through `sealos-cli database`, wire the expected local env key without printing secrets, and verify the app's real database path.

## What `/sealos-s3` Handles

For a project that needs S3-compatible object storage, the agent will detect storage signals, create or reuse a private bucket through `sealos-cli s3`, initialize credentials only when needed, wire the smallest safe env set, and verify upload/download or presigned URL behavior.

## Repository

[`skills/`](./skills) contains `/sealos-deploy`, `/sealos-database`, `/sealos-s3`, and the supporting skills used during the prepare and development-service flows.

## License

MIT
