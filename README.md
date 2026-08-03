# Sealos Skills

<!-- README-I18N:START -->

**English** | [简体中文](./readmes/README.zh-CN.md) | [繁體中文](./readmes/README.zh-TW.md) | [日本語](./readmes/README.ja.md) | [한국어](./readmes/README.ko.md) | [Español](./readmes/README.es.md) | [Français](./readmes/README.fr.md) | [Deutsch](./readmes/README.de.md) | [Português (Brasil)](./readmes/README.pt-BR.md) | [Русский](./readmes/README.ru.md) | [العربية](./readmes/README.ar.md) | [हिन्दी](./readmes/README.hi.md) | [Bahasa Indonesia](./readmes/README.id.md)

<!-- README-I18N:END -->

Prepare [Sealos Cloud](https://sealos.io) deployment YAML from your AI agent.

Sealos Skills is a plugin-first skill pack for Sealos Cloud development. It helps an AI agent inspect a project, prepare deployment artifacts and YAML, connect Sealos Cloud databases and object storage, build or reuse a container image, and view deployed resources in a local read-only canvas.

`sealos-deploy` prepares YAML only. It stops after Phase 4 and does not deploy or update workloads.

The recommended Codex path is native Codex plugin installation. Cross-host plugin installs, `skills.sh`, and context-only extension hosts such as Gemini CLI and Qwen Code use the same root `skills/**` source.

## Quick Start

### Recommended: install in Codex

Add this repository as a Codex marketplace, then install the Sealos plugin:

```bash
codex plugin marketplace add labring/sealos-skills
codex plugin add sealos@sealos
```

One Sealos plugin installs the deploy, database, S3, canvas, app-builder, and supporting cloud-native skills from root `skills/**`: `sealos-deploy`, `sealos-database`, `sealos-s3`, `sealos-canvas`, `sealos-app-builder`, `cloud-native-readiness`, `dockerfile-skill`, and `docker-to-sealos`.

For compatibility and local Codex testing, install the same plugin with:

```bash
npx plugins add https://github.com/labring/sealos-skills --target codex
```

After installation in Codex, use the plugin from Codex:

- **Codex CLI:** type `$sealos`
- **Codex App:** click the **+** button in the lower-left corner of the chat input, choose **Plugins**, then choose **Sealos**

![Select the Sealos plugin in Codex App](./assets/codex-sealos.png)

Codex examples:

```text
$sealos prepare a Sealos deployment YAML for this repo
$sealos prepare a Sealos deployment YAML for /path/to/project
$sealos prepare a Sealos deployment YAML for https://github.com/labring-sigs/kite
$sealos create a cloud Postgres database for this repo and wire DATABASE_URL
$sealos create private S3 object storage for uploads and wire env vars
```

### Install in Claude Code

Add this repository as a Claude Code marketplace, then install the Sealos plugin:

```bash
claude plugin marketplace add labring/sealos-skills
claude plugin install sealos@sealos
```

For compatibility with cross-host plugin installers, install the same plugin with:

```bash
npx plugins add https://github.com/labring/sealos-skills --target claude-code
```

If you only use one detected agent tool on the machine, you can let `plugins` choose the target:

```bash
npx plugins add https://github.com/labring/sealos-skills
```

After installation in Claude Code, use `/sealos`:

```text
/sealos prepare a Sealos deployment YAML for this repo
/sealos prepare a Sealos deployment YAML for /path/to/project
/sealos prepare a Sealos deployment YAML for https://github.com/labring-sigs/kite
/sealos create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos create private S3 object storage for uploads and wire env vars
```

### Other supported AI tools

| Tool | Install | Usage |
| --- | --- | --- |
| Codex CLI / Codex App | `codex plugin marketplace add labring/sealos-skills` then `codex plugin add sealos@sealos` | `$sealos` in Codex CLI, or **+** → **Plugins** → **Sealos** in Codex App |
| Claude Code | `claude plugin marketplace add labring/sealos-skills` then `claude plugin install sealos@sealos` | `/sealos` |
| Claude Code compatibility path | `npx plugins add https://github.com/labring/sealos-skills --target claude-code` | `/sealos` |
| OpenClaw / ClawHub | `clawhub install labring/sealos-skills` | Host command exposure depends on the ClawHub runtime |
| CodeBuddy | `/plugin marketplace add labring/sealos-skills` | Host command exposure depends on the CodeBuddy runtime |
| Gemini CLI | `gemini extensions install https://github.com/labring/sealos-skills` | Context-only extension; ask Gemini to use Sealos Skills |
| Qwen Code | `qwen extensions install https://github.com/labring/sealos-skills` | Context-only extension; ask Qwen to use Sealos Skills |
| Amp / Kimi / generic repo importers | Import `https://github.com/labring/sealos-skills.git` | Host-dependent |

Gemini CLI and Qwen Code manifests provide repository context through `CLAUDE.md`; they do not claim slash-command support.

### Alternative: install as a `skills.sh` skill pack

If your agent uses `skills.sh` directly, install the same skills pack with:

```bash
npx skills add labring/sealos-skills
```

Then run the deployment-YAML preparation skill directly:

```text
/sealos-deploy
/sealos-deploy /path/to/project
/sealos-deploy https://github.com/labring-sigs/kite
/sealos-database create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos-s3 create private object storage for uploads and wire env vars
```

Use the `sealos-canvas` skill to inspect a deployment that already exists.

`/sealos-deploy`, `/sealos-database`, and `/sealos-s3` are direct `skills.sh` skill entries. Plugin usage should go through `$sealos` in Codex or `/sealos` in Claude Code.

## Why Use the Plugin

Prefer the plugin install for Codex and Claude Code because it:

- installs all Sealos skills as one managed package
- exposes the same skills across supported agent tools
- keeps the plugin metadata, logo, prompts, commands, and capabilities together
- avoids maintaining a separate packaged copy of the skills

## Plugin Distribution

The Codex integration follows [OpenAI's Codex plugin build guide](https://developers.openai.com/codex/plugins/build):

- `.codex-plugin/plugin.json` contains plugin identity, discovery metadata, interface copy, default prompts, brand metadata, and asset paths relative to the repository root.
- `.agents/plugins/marketplace.json` registers this repo-local plugin for local Codex marketplace testing.
- `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` define the Claude Code-compatible plugin surface.
- `distribution/platforms.json` records platform support claims and evidence.
- `marketplaces/README.md` owns marketplace rules and prevents command-support overclaims.
- `scripts/validate-codex-plugin.py` validates the Codex manifest, Claude Code metadata, repo marketplaces, platform registry, and asset paths.
- `skills/**/SKILL.md` remains the only skill source; do not add a second packaged copy of the skills.

Validate plugin metadata before publishing or pushing manifest changes:

```bash
python3 scripts/validate-codex-plugin.py
python3 -m json.tool .codex-plugin/plugin.json >/dev/null
python3 -m json.tool plugin.json >/dev/null
python3 -m json.tool .agents/plugins/marketplace.json >/dev/null
python3 -m json.tool marketplace.json >/dev/null
python3 -m json.tool .claude-plugin/plugin.json >/dev/null
python3 -m json.tool .claude-plugin/marketplace.json >/dev/null
python3 -m json.tool distribution/platforms.json >/dev/null
```

## How Setup Works

You only need a plugin-compatible or `skills.sh` compatible AI agent and a project for YAML preparation.

During YAML preparation, database, and object-storage flows, Sealos Skills will:

- validate tools such as Docker and `kubectl`
- guide the user through Sealos login when needed
- use `sealos-cli` for Sealos Cloud database creation, connection details, and database operations
- use `sealos-cli s3` for Sealos object storage buckets, credentials, quota checks, object operations, and presigned URLs
- push locally built `linux/amd64` images to the current GitHub account
  namespace on GHCR and use their digests in the YAML

For local YAML preparation, you need a Sealos Cloud account. An authenticated
GitHub CLI session with GHCR package access is required only when the selected
route builds and pushes a new image. Existing declared images, including images
hosted on Docker Hub, can still be reused by immutable digest. A later approved
deployment workflow applies the YAML.
For database and object-storage work, you need a Sealos Cloud account and a
workspace that can create the requested resources.

## What Sealos Deploy Handles

For a YAML-preparation request, the agent will:

- run Phase 0 through Phase 4 only
- materialize the source and prepare the phase contracts
- read the current `kb-0.9` directory in the official
  `labring-actions/templates` catalog for a unique exact project match
- save the matched official YAML, then materialize and gate it in Phase 4 when
  the source is aligned
- otherwise preserve the full service topology, pin images by digest, build
  required AMD64 images, and generate a Sealos template
- write `.sealos/template/index.yaml` and stop after the deployment gate

Sealos Deploy does not collect deployment inputs, run a cluster dry-run, deploy
resources, update workloads, or verify runtime behavior.

## What Sealos Database Handles

For a local project or Devbox that needs a cloud database, the agent will:

- detect database signals such as `DATABASE_URL`, Prisma, Drizzle, MongoDB, MySQL, or Redis
- use `sealos-cli database` to list, create, inspect, and connect Sealos Cloud databases
- write only the required local env key without exposing secrets in chat
- verify the app's real database path through migrations, introspection, or startup checks
- manage public access only after confirmation

## What Sealos S3 Handles

For a local project or Devbox that needs S3-compatible object storage, the agent will:

- detect object-storage signals such as S3 env keys, AWS SDK usage, MinIO, upload paths, or presigned URL code
- use `sealos-cli s3` from `zjy365/sealos-cli#28` to list, create, inspect, and update object storage buckets
- initialize S3 credentials only when needed and keep access keys out of chat
- wire the smallest required local env keys for bucket, endpoint, access key, secret key, region, and path-style settings
- verify upload, list, download, delete, or presigned URL behavior with the project's real storage path
- make buckets public or rotate credentials only after confirmation

## What Sealos Canvas Handles

For a repository already deployed to Sealos, the agent will:

1. Read `.sealos/state.json` to locate the deployed app.
2. Query the Sealos namespace with read-only `kubectl get` commands.
3. Start a temporary `127.0.0.1` canvas UI.
4. Output and open the local UI address for inspection.

If the project has no existing deployment, Sealos Canvas stops and directs the user to an approved deployment workflow.

## Included Skills

The plugin and `skills.sh` pack expose the same skill source:

- `sealos-deploy` — prepare a Sealos deployment YAML from a local or GitHub project
- `sealos-database` — create, connect, and operate Sealos Cloud databases for development
- `sealos-s3` — create buckets, connect credentials, check quota, and operate Sealos S3-compatible object storage
- `sealos-canvas` — view deployed Sealos resources in a local read-only canvas UI
- `sealos-app-builder` — build Sealos Desktop apps with SDK integration
- `cloud-native-readiness` — assess deployment readiness
- `dockerfile-skill` — generate production-ready Dockerfiles
- `docker-to-sealos` — convert Docker Compose, Helm-rendered, or native Kubernetes services into Sealos templates

## Repository

[`skills/`](./skills) is the single source of truth for Sealos YAML preparation, Sealos canvas, and supporting skills. The same root-level skills directory serves `skills.sh` installs and every plugin or extension manifest in this repository.

Important distribution files:

- [`.codex-plugin/plugin.json`](./.codex-plugin/plugin.json) — Codex plugin manifest
- [`.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json) — local Codex marketplace entry
- [`.claude-plugin/plugin.json`](./.claude-plugin/plugin.json) — Claude Code-compatible plugin manifest
- [`marketplace.json`](./marketplace.json) and [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json) — Claude-compatible marketplace entries
- [`.codebuddy-plugin/marketplace.json`](./.codebuddy-plugin/marketplace.json) — CodeBuddy marketplace entry
- [`gemini-extension.json`](./gemini-extension.json) — Gemini CLI context extension
- [`qwen-extension.json`](./qwen-extension.json) — Qwen Code context extension
- [`openclaw.plugin.json`](./openclaw.plugin.json) — OpenClaw / ClawHub bundle pointer
- [`commands/sealos.md`](./commands/sealos.md) — `/sealos` plugin command entry for compatible hosts
- [`distribution/platforms.json`](./distribution/platforms.json) — platform support registry
- [`marketplaces/README.md`](./marketplaces/README.md) — marketplace rules and support-claim ownership
- [`scripts/validate-codex-plugin.py`](./scripts/validate-codex-plugin.py) — Codex plugin validation

Do not add a second packaged copy of the skills. Root `skills/**` is the only skill source for all installation paths.

## License

MIT
