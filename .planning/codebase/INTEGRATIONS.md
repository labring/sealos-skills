# External Integrations

**Analysis Date:** 2026-06-15

## APIs & External Services

**Sealos Cloud:**
- Sealos Cloud web/API regions - Used for OAuth login, workspace selection, kubeconfig retrieval, template deployment, database provisioning, and S3-compatible object storage.
  - SDK/Client: Native `fetch` in `skills/sealos-deploy/scripts/sealos-auth.mjs` and `skills/sealos-deploy/scripts/deploy-template.mjs`; `sealos-cli` in `skills/sealos-database/SKILL.md` and `skills/sealos-s3/SKILL.md`.
  - Auth: OAuth device grant via `skills/sealos-deploy/config.json` `client_id`, user-approved token storage in `~/.sealos/auth.json`, and kubeconfig storage in `~/.sealos/kubeconfig`.
- Sealos Template API - `skills/sealos-deploy/scripts/deploy-template.mjs` posts rendered templates to region-specific `/api/v2alpha/templates/raw` endpoints.
  - SDK/Client: Native `fetch`.
  - Auth: Kubeconfig read from `~/.sealos/kubeconfig` and auth state from `~/.sealos/auth.json`.

**Kubernetes / Sealos Namespace:**
- Kubernetes API - Used for rollout verification, image pull secret creation, update mode, footprint checks, cleanup, and read-only canvas generation.
  - SDK/Client: `kubectl` invoked by `skills/sealos-deploy/scripts/ensure-image-pull-secret.mjs`, `skills/sealos-deploy/scripts/sealos-footprint.mjs`, and `skills/sealos-canvas/scripts/generate-canvas.mjs`.
  - Auth: `KUBECONFIG=~/.sealos/kubeconfig`.

**Container Registries:**
- GHCR - Build/push and image pullability checks are implemented in `skills/sealos-deploy/scripts/build-push.mjs`, `skills/sealos-deploy/scripts/detect-image.mjs`, and `skills/sealos-deploy/scripts/ensure-image-pull-secret.mjs`.
  - SDK/Client: `gh` CLI, Docker CLI, native `fetch` to `https://ghcr.io/token` and registry manifest endpoints.
  - Auth: GitHub CLI token/scopes from `gh auth` via `skills/sealos-deploy/scripts/gh-auth-utils.mjs`.
- Docker Hub and other registries - Image detection and reuse logic scans registry references in `skills/sealos-deploy/scripts/detect-image.mjs` and Dockerfile/deploy guidance under `skills/dockerfile-skill`.
  - SDK/Client: Native `fetch`, Docker CLI, image reference parsing.
  - Auth: Registry-specific local Docker/GitHub credentials when required.

**Plugin Distribution Hosts:**
- Codex plugin ecosystem - `.codex-plugin/plugin.json` and `.agents/plugins/marketplace.json` expose the plugin to Codex CLI/App.
  - SDK/Client: `npx plugins add ... --target codex`.
  - Auth: Marketplace policy in `.agents/plugins/marketplace.json` sets `authentication` to `ON_INSTALL`.
- Claude Code-compatible hosts - `.claude-plugin/plugin.json`, `marketplace.json`, `.claude-plugin/marketplace.json`, and `commands/sealos.md` expose `/sealos`.
  - SDK/Client: `npx plugins add ... --target claude-code` and host plugin marketplace commands.
  - Auth: Host-managed plugin installation state.
- OpenClaw / ClawHub and CodeBuddy - `openclaw.plugin.json` and `.codebuddy-plugin/marketplace.json` provide host-specific bundle metadata.
  - SDK/Client: Host-specific plugin import/install flows.
  - Auth: Host-managed.
- Gemini CLI and Qwen Code - `gemini-extension.json` and `qwen-extension.json` provide context-only extension metadata using `CLAUDE.md`.
  - SDK/Client: Host extension installation commands.
  - Auth: Host-managed.

## Data Storage

**Databases:**
- Sealos Cloud managed databases - `skills/sealos-database/SKILL.md` supports `postgresql`, `mongodb`, `mysql`, `apecloud-mysql`, `redis`, `kafka`, `qdrant`, `nebula`, `weaviate`, `milvus`, `pulsar`, and `clickhouse`.
  - Connection: Project-local env keys such as `DATABASE_URL`, `MONGODB_URI`, `REDIS_URL`, or existing app-specific keys are wired by the skill while keeping secret values out of chat.
  - Client: `sealos-cli database` with JSON output; analyzer script `skills/sealos-database/scripts/analyze-project-database.mjs` detects project database signals.
- KubeBlocks database resources - `skills/docker-to-sealos/SKILL.md` requires Docker Compose database services to become KubeBlocks `Cluster` resources in Sealos templates.
  - Connection: Kubernetes Secret references and env var expansion in generated `template/<app-name>/index.yaml`.
  - Client: Generated Sealos/Kubernetes template YAML.

**File Storage:**
- Sealos S3-compatible object storage - `skills/sealos-s3/SKILL.md` provisions and wires buckets for uploads, assets, backups, presigned URLs, bucket policy management, and object operations.
  - Connection: Env keys such as `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION`.
  - Client: `sealos-cli s3`; analyzer script `skills/sealos-s3/scripts/analyze-project-s3.mjs`.
- Local generated artifacts - Target projects receive `.sealos/state.json`, `.sealos/analysis.json`, `.sealos/config.json`, `.sealos/template/index.yaml`, and optional `.sealos/canvas/index.html` as described in `AGENTS.md`, `skills/sealos-deploy/SKILL.md`, and `skills/sealos-canvas/SKILL.md`.

**Caching:**
- No repository-owned cache service detected.
- Redis is supported as a managed database/cache target by `skills/sealos-database/SKILL.md` and cloud-native scoring references in `skills/cloud-native-readiness/knowledge/scoring-model.md`.

## Authentication & Identity

**Auth Provider:**
- Sealos OAuth2 Device Grant - `skills/sealos-deploy/scripts/sealos-auth.mjs` implements RFC 8628 device authorization through `/api/auth/oauth2/device`, `/api/auth/oauth2/token`, `/api/auth/regionToken`, `/api/auth/namespace/list`, `/api/auth/namespace/switch`, and `/api/auth/getKubeconfig`.
  - Implementation: Native `fetch`, `client_id` from `skills/sealos-deploy/config.json`, tokens stored with mode `0600` under `~/.sealos/auth.json`, kubeconfig stored with mode `0600` under `~/.sealos/kubeconfig`.
- GitHub CLI auth - `skills/sealos-deploy/scripts/gh-auth-utils.mjs`, `skills/sealos-deploy/scripts/gh-refresh-scopes.mjs`, and `skills/sealos-deploy/scripts/ensure-image-pull-secret.mjs` use `gh auth` for GHCR package push/pull scopes and Kubernetes image pull secrets.
  - Implementation: `gh` CLI scope checks and prompts.
- Kubernetes identity - `kubectl` commands run against the Sealos workspace selected by Sealos auth.
  - Implementation: `KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify` as mandated in `skills/sealos-deploy/SKILL.md`.

## Monitoring & Observability

**Error Tracking:**
- None detected as an external SaaS integration.

**Logs:**
- Deployment logs are written to `~/.sealos/logs/deploy-<YYYYMMDD-HHmmss>.log` by the workflow contract in `skills/sealos-deploy/SKILL.md`.
- Live app diagnostics use `kubectl logs`, rollout status, events, and resource footprint checks through `skills/sealos-deploy` modules and scripts.
- Live smoke checks use HTTP requests in `skills/sealos-deploy/scripts/sealos-live-smoke.mjs`.
- Canvas generation reads Kubernetes events and resource status in `skills/sealos-canvas/scripts/generate-canvas.mjs`.

## CI/CD & Deployment

**Hosting:**
- Repository distribution is GitHub-based, as referenced by `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `marketplace.json`, `distribution/platforms.json`, and `README.md`.
- Generated applications deploy to Sealos Cloud through the deployment workflow in `skills/sealos-deploy/SKILL.md`.

**CI Pipeline:**
- No repository-owned CI workflow detected in the scanned root files.
- Validation is script-driven through `python3 scripts/validate-codex-plugin.py` and Python test files under `skills/docker-to-sealos/scripts/test_*.py`.

## Environment Configuration

**Required env vars:**
- `SEALOS_REGION` - Optional override for Sealos login region in `skills/sealos-deploy/scripts/sealos-auth.mjs`.
- `KUBECONFIG` - Optional override for kubectl helpers; defaults to `~/.sealos/kubeconfig` in Sealos scripts.
- `SEALOS_CANVAS_KUBE_FIXTURE` - Optional fixture path for `skills/sealos-canvas/scripts/generate-canvas.mjs`.
- Project-specific env keys - Database and S3 skills wire keys such as `DATABASE_URL`, `MONGODB_URI`, `REDIS_URL`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION` in target projects.

**Secrets location:**
- Sealos auth tokens: `~/.sealos/auth.json`.
- Sealos kubeconfig: `~/.sealos/kubeconfig`.
- GitHub/GHCR auth: local `gh` CLI credential store.
- Target project secrets: local `.env` or `.env.local` files selected by `skills/sealos-database/SKILL.md` and `skills/sealos-s3/SKILL.md`; these files must stay uncommitted.
- No `.env*`, credential, secret, private key, or package-auth files detected in this repository scan.

## Webhooks & Callbacks

**Incoming:**
- No repository-hosted webhook endpoint detected.
- OAuth device login depends on user browser authorization via Sealos `verification_uri_complete`, then token polling in `skills/sealos-deploy/scripts/sealos-auth.mjs`.

**Outgoing:**
- Sealos OAuth and namespace APIs called from `skills/sealos-deploy/scripts/sealos-auth.mjs`.
- Sealos Template API called from `skills/sealos-deploy/scripts/deploy-template.mjs`.
- GHCR token and manifest endpoints called from `skills/sealos-deploy/scripts/build-push.mjs` and `skills/sealos-deploy/scripts/detect-image.mjs`.
- Docker Hub and GitHub repository metadata/image references are probed by `skills/sealos-deploy/scripts/detect-image.mjs`.
- `sealos-cli database` and `sealos-cli s3` perform Sealos Cloud API operations through the CLI contracts documented in `skills/sealos-database/references/sealos-cli-database.md` and `skills/sealos-s3/references/sealos-cli-s3.md`.

---

*Integration audit: 2026-06-15*
