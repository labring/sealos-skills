# Sealos Skills

<!-- README-I18N:START -->

**English** | [简体中文](./readmes/README.zh-CN.md) | [繁體中文](./readmes/README.zh-TW.md) | [日本語](./readmes/README.ja.md) | [한국어](./readmes/README.ko.md) | [Español](./readmes/README.es.md) | [Français](./readmes/README.fr.md) | [Deutsch](./readmes/README.de.md) | [Português (Brasil)](./readmes/README.pt-BR.md) | [Русский](./readmes/README.ru.md) | [العربية](./readmes/README.ar.md) | [हिन्दी](./readmes/README.hi.md) | [Bahasa Indonesia](./readmes/README.id.md)

<!-- README-I18N:END -->

Deploy projects to [Sealos Cloud](https://sealos.io) from your AI agent.

Sealos Skills is a plugin-first skill pack centered on Sealos Cloud development and deployment. It helps an AI agent inspect a project and prepare missing deployment artifacts. It connects Sealos Cloud databases and object storage for development. It builds or reuses a container image, deploys the app to Sealos Cloud, and shows deployed resources in a local read-only canvas.

One `npx plugins add` command installs the plugin into every detected agent tool. Native marketplace installs for Codex and Claude Code use the same root `skills/**` source. `skills.sh` and context-only extension hosts such as Gemini CLI and Qwen Code use it too.

## Quick Start

### TLDR

```bash
npx plugins add https://github.com/labring/sealos-skills
```

One command installs the Sealos plugin into every detected agent tool: Claude Code, Cursor, Codex, Grok Build, Kimi Code, GitHub Copilot CLI, and VS Code. Run `npx plugins targets` to list the detected tools, or pass `--target <tool>` to install to one tool only.

### Install natively in Codex

Add this repository as a Codex marketplace, then install the Sealos plugin:

```bash
codex plugin marketplace add labring/sealos-skills
codex plugin add sealos@sealos
```

The plugin installs all eight skills from the root `skills/**` directory. See **Included Skills** below for what each skill does.

After installation in Codex, use the plugin from Codex:

- **Codex CLI:** type `$sealos`
- **Codex App:** click the **+** button in the lower-left corner of the chat input. Then choose **Plugins** → **Sealos**

![Select the Sealos plugin in Codex App](./assets/codex-sealos.png)

Codex examples:

```text
$sealos deploy this repo to Sealos Cloud
$sealos deploy /path/to/project
$sealos deploy https://github.com/labring-sigs/kite
$sealos create a cloud Postgres database for this repo and wire DATABASE_URL
$sealos create private S3 object storage for uploads and wire env vars
```

### Install natively in Claude Code

Add this repository as a Claude Code marketplace, then install the Sealos plugin:

```bash
claude plugin marketplace add labring/sealos-skills
claude plugin install sealos@sealos
```

After installation in Claude Code, use `/sealos`:

```text
/sealos deploy this repo to Sealos Cloud
/sealos deploy /path/to/project
/sealos deploy https://github.com/labring-sigs/kite
/sealos create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos create private S3 object storage for uploads and wire env vars
```

### Supported AI tools

| Tool | Install | Usage |
| --- | --- | --- |
| Codex CLI / Codex App | `npx plugins add https://github.com/labring/sealos-skills --target codex`, or see **Install natively in Codex** above | `$sealos` in Codex CLI, or **+** → **Plugins** → **Sealos** in Codex App |
| Claude Code | `npx plugins add https://github.com/labring/sealos-skills --target claude-code`, or see **Install natively in Claude Code** above | `/sealos` |
| Cursor / Grok Build / Kimi Code / Copilot CLI / VS Code | `npx plugins add https://github.com/labring/sealos-skills` | Host command entry after install |
| OpenClaw / ClawHub | `clawhub install labring/sealos-skills` | Host command exposure depends on the ClawHub runtime |
| CodeBuddy | `/plugin marketplace add labring/sealos-skills` | Host command exposure depends on the CodeBuddy runtime |
| Gemini CLI | `gemini extensions install https://github.com/labring/sealos-skills` | Context-only extension. Ask Gemini to use Sealos Skills |
| Qwen Code | `qwen extensions install https://github.com/labring/sealos-skills` | Context-only extension. Ask Qwen to use Sealos Skills |
| Amp / generic repo importers | Import `https://github.com/labring/sealos-skills.git` | Host-dependent |

Gemini CLI and Qwen Code manifests provide repository context through `CLAUDE.md`. They do not claim slash-command support.

### Alternative: install as a `skills.sh` skill pack

If your agent uses `skills.sh` directly, install the same skills pack with:

```bash
npx skills add labring/sealos-skills
```

Then run the deploy skill directly:

```text
/sealos-deploy
/sealos-deploy /path/to/project
/sealos-deploy https://github.com/labring-sigs/kite
/sealos-database create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos-s3 create private object storage for uploads and wire env vars
```

If the project is deployed, use the `sealos-canvas` skill through your installed plugin entry point.

`/sealos-deploy`, `/sealos-database`, and `/sealos-s3` are direct `skills.sh` skill entries. For plugin usage, you must use `$sealos` in Codex or `/sealos` in Claude Code.

## What Sealos Deploy Handles

On a typical deploy, the agent will:

- assess the project structure and runtime needs
- reuse an existing image or build one when needed
- generate a Sealos template
- deploy and verify rollout
- verify the actual Sealos App URL, logs, login/setup flow for web apps, and resource footprint before reporting the app as usable

When a deployment exists, later runs switch to an in-place update flow.

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

For a repository already deployed by Sealos Deploy, the agent will:

1. Read `.sealos/state.json` to locate the deployed app.
2. Query the Sealos namespace with read-only `kubectl get` commands.
3. Start a temporary `127.0.0.1` canvas UI.
4. Output and open the local UI address for inspection.

If the project is not deployed, Sealos Canvas stops and tells the user to deploy the project first.

## How Setup Works

You only need a plugin-compatible or `skills.sh` compatible AI agent and a project to deploy.

During the deploy, database, and object-storage flows, Sealos Skills will:

- verify that tools such as Docker and `kubectl` are available
- guide the user through Sealos login when needed
- use `sealos-cli` for Sealos Cloud database creation, connection details, and database operations
- use `sealos-cli s3` for Sealos object storage buckets, credentials, quota checks, object operations, and presigned URLs
- use or help prepare a container registry path such as Docker Hub or GHCR

For an actual deployment, you need a Sealos Cloud account and access to a container registry. The skill can guide you through this setup after it starts. For database and object-storage work, you need a Sealos Cloud account and a workspace that can create the requested resources.

## Included Skills

The plugin and `skills.sh` pack expose the same skill source:

- `sealos-deploy` — deploy a local or GitHub project to Sealos Cloud
- `sealos-database` — create, connect, and operate Sealos Cloud databases for development
- `sealos-s3` — create buckets, connect credentials, verify quota, and operate Sealos S3-compatible object storage
- `sealos-canvas` — view deployed Sealos resources in a local read-only canvas UI
- `sealos-app-builder` — build Sealos Desktop apps with SDK integration
- `cloud-native-readiness` — assess deployment readiness
- `dockerfile-skill` — generate production-ready Dockerfiles
- `docker-to-sealos` — convert Docker Compose services into Sealos templates

## Why Use the Plugin

Prefer the plugin install for Codex, Claude Code, and the other supported agent tools because it:

- installs all Sealos skills as one managed package
- exposes the same skills across supported agent tools
- keeps the plugin metadata, logo, prompts, commands, and capabilities together
- avoids maintaining a separate packaged copy of the skills

## Maintaining This Repository

The sections below are for repository maintainers and plugin publishers. Users do not need them.

### Plugin Distribution

The Codex integration follows [OpenAI's Codex plugin build guide](https://developers.openai.com/codex/plugins/build):

- `.codex-plugin/plugin.json` contains plugin identity, discovery metadata, interface copy, default prompts, brand metadata, and asset paths relative to the repository root.
- `.agents/plugins/marketplace.json` registers this repo-local plugin for local Codex marketplace testing.
- `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` define the Claude Code-compatible plugin surface.
- `.qoder-plugin/plugin.json` defines the Qoder plugin surface and explicitly exposes all eight Codex skills.
- `qoder.md` provides Qoder-level routing and safety instructions without copying skill implementations.
- `distribution/platforms.json` records platform support claims and evidence.
- `marketplaces/README.md` owns marketplace rules and prevents command-support overclaims.
- `scripts/validate-codex-plugin.py` validates the Codex manifest, Claude Code metadata, repo marketplaces, platform registry, and asset paths.
- `scripts/package-qoder-plugin.py` builds a Qoder-compatible ZIP with the plugin manifest at the archive root.
- `skills/**/SKILL.md` remains the only skill source. Do not add a second packaged copy of the skills.

Validate plugin metadata before publishing or pushing manifest changes:

```bash
python3 scripts/validate-codex-plugin.py
python3 -m json.tool .codex-plugin/plugin.json >/dev/null
python3 -m json.tool plugin.json >/dev/null
python3 -m json.tool .agents/plugins/marketplace.json >/dev/null
python3 -m json.tool marketplace.json >/dev/null
python3 -m json.tool .claude-plugin/plugin.json >/dev/null
python3 -m json.tool .claude-plugin/marketplace.json >/dev/null
python3 -m json.tool .qoder-plugin/plugin.json >/dev/null
python3 -m json.tool distribution/platforms.json >/dev/null
```

### Repository Layout

[`skills/`](./skills) is the single source of truth for Sealos deploy, Sealos canvas, and the supporting skills used during the deploy flow. The same root-level skills directory serves `skills.sh` installs and every plugin or extension manifest in this repository.

Important distribution files:

- [`.codex-plugin/plugin.json`](./.codex-plugin/plugin.json) — Codex plugin manifest
- [`.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json) — local Codex marketplace entry
- [`.claude-plugin/plugin.json`](./.claude-plugin/plugin.json) — Claude Code-compatible plugin manifest
- [`.qoder-plugin/plugin.json`](./.qoder-plugin/plugin.json) — Qoder plugin manifest
- [`qoder.md`](./qoder.md) — Qoder plugin routing and safety instructions
- [`marketplace.json`](./marketplace.json) and [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json) — Claude-compatible marketplace entries
- [`.codebuddy-plugin/marketplace.json`](./.codebuddy-plugin/marketplace.json) — CodeBuddy marketplace entry
- [`gemini-extension.json`](./gemini-extension.json) — Gemini CLI context extension
- [`qwen-extension.json`](./qwen-extension.json) — Qwen Code context extension
- [`openclaw.plugin.json`](./openclaw.plugin.json) — OpenClaw / ClawHub bundle pointer
- [`commands/sealos.md`](./commands/sealos.md) — `/sealos` plugin command entry for compatible hosts
- [`distribution/platforms.json`](./distribution/platforms.json) — platform support registry
- [`marketplaces/README.md`](./marketplaces/README.md) — marketplace rules and support-claim ownership
- [`scripts/validate-codex-plugin.py`](./scripts/validate-codex-plugin.py) — Codex plugin validation
- [`scripts/package-qoder-plugin.py`](./scripts/package-qoder-plugin.py) — Qoder ZIP packager

Do not add a second packaged copy of the skills. Root `skills/**` is the only skill source for all installation paths.

## License

MIT
