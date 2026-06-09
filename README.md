# Seakills

Prepare [Sealos Cloud](https://gzg.sealos.run) deployment artifacts from your AI agent.

Seakills is a `skills.sh` skill pack centered on `/sealos-deploy`. It helps an agent inspect a project, reuse or build a container image in a sandbox workflow, and generate Sealos template artifacts for a later deploy step.

## Quick Start

Install Seakills:

```bash
npx skills add labring/seakills
```

Then run:

```text
/sealos-deploy
```

Examples:

```text
/sealos-deploy
/sealos-deploy /path/to/project
/sealos-deploy https://github.com/labring-sigs/kite
```

## How Setup Works

You only need a `skills.sh` compatible AI agent and a project to prepare.

During the prepare flow, Seakills will:

- inspect the project and resolve GitHub metadata
- detect reusable Docker Hub or GHCR images
- reuse, repair, or generate a Dockerfile
- write `.sealos/build-request.json`
- run a sandbox BuildKit build only when a reusable image is not available
- generate `.sealos/template/index.yaml` and `.sealos/delivery-manifest.json`

## What `/sealos-deploy` Handles

On a typical prepare run, the agent will:

1. Assess the project structure and runtime needs.
2. Reuse an existing image or build one when needed.
3. Generate a Sealos template.
4. Write a delivery manifest listing the generated artifacts.

## Repository

[`skills/`](./skills) contains `/sealos-deploy` and the supporting skills it uses during the prepare flow.

## License

MIT
