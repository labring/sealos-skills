# Feature Landscape

**Domain:** Codex plugin README and installation experience
**Project:** Sealos Codex Plugin Installation Upgrade
**Researched:** 2026-06-15
**Overall confidence:** MEDIUM

## Scope

This research covers user-facing README/install features Sealos should adopt from `phuryn/pm-skills` for Codex users. It focuses on `README.md`, `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `marketplace.json`, `.claude-plugin/marketplace.json`, and `distribution/platforms.json`.

## Table Stakes

Features Codex users now expect. Missing = the install flow feels legacy or unclear.

| Feature | Why Expected | Complexity | Requirement |
|---------|--------------|------------|-------------|
| Codex-native marketplace install first | `pm-skills` leads Codex users with `codex plugin marketplace add` plus `codex plugin add`; local Codex CLI confirms these subcommands exist. | Low | Make this the first Codex install path in `README.md`. |
| Exact marketplace install commands | Users need commands that match actual repo and plugin names. | Low | Use `codex plugin marketplace add labring/sealos-skills` then `codex plugin add sealos@sealos`. |
| Explain what the commands install | `pm-skills` tells users what they get after install. Sealos should say one plugin installs deploy, database, S3, canvas, app-builder, and helper skills from root `skills/**`. | Low | Add a short "What you get" paragraph under Codex install. |
| Codex invocation examples | Codex users need the post-install action as clearly as the install action. | Low | Keep `$sealos` examples, with deployment and service examples. |
| Codex App selection path | App users need UI selection steps. Current README already has the right shape. | Low | Keep: click the **+** button in the lower-left chat input, choose **Plugins**, choose **Sealos**, then describe the task. |
| Fallback install path | Existing project requirement keeps `npx plugins add` as compatible/local path. | Low | Position `npx plugins add https://github.com/labring/sealos-skills --target codex` as fallback or compatibility install. |
| Platform difference note | `pm-skills` explains command differences between Claude and Codex. Sealos needs a shorter equivalent. | Low | State Codex uses `$sealos`; Claude-compatible hosts use `/sealos`; direct `skills.sh` entries use `/sealos-deploy`, `/sealos-database`, and `/sealos-s3`. |
| Manifest alignment check | Install docs are fragile because names repeat across manifests. | Medium | README examples must agree with `.codex-plugin/plugin.json` name `sealos`, `.agents/plugins/marketplace.json` name `sealos`, `marketplace.json` name `sealos`, and `distribution/platforms.json`. |

## Exact Examples to Adopt

### Codex CLI marketplace install

Use this as the primary Codex install block in `README.md`:

```bash
# Step 1: Add the Sealos marketplace
codex plugin marketplace add labring/sealos-skills

# Step 2: Install the Sealos plugin
codex plugin add sealos@sealos
```

### Codex CLI invocation

Use these examples immediately after install:

```text
$sealos deploy this repo to Sealos Cloud
$sealos deploy /path/to/project
$sealos deploy https://github.com/labring-sigs/kite
$sealos create a cloud Postgres database for this repo and wire DATABASE_URL
$sealos create private S3 object storage for uploads and wire env vars
```

### Codex App selection

Keep the current README UI guidance, with this exact sequence:

```text
Click the + button in the lower-left corner of the chat input, choose Plugins, choose Sealos, then describe what you want to deploy.
```

Keep the screenshot reference:

```markdown
![Select the Sealos plugin in Codex App](./assets/codex-sealos.png)
```

### Fallback install path

Keep this as fallback/local compatibility install:

```bash
npx plugins add https://github.com/labring/sealos-skills --target codex
```

Recommended placement: after the Codex-native block, under `Fallback: npx plugins`.

## Differentiators

Features that make Sealos clearer than a plain marketplace README.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| One-plugin positioning | Sealos has one Codex plugin, unlike `pm-skills` with many plugins. | Low | Say "Install one plugin: `sealos@sealos`." |
| Capability map after install | Sealos spans deploy, databases, S3, canvas, app builder, Dockerfile, Compose conversion, and readiness. | Low | Add a concise "What you get" list near install. |
| Current App screenshot | The existing `./assets/codex-sealos.png` gives UI confidence for Codex App users. | Low | Keep it close to Codex App instructions. |
| Cross-host distinction | Sealos supports Codex, Claude-compatible hosts, `skills.sh`, Gemini, Qwen, CodeBuddy, and OpenClaw. | Medium | Keep other hosts in a later table; keep Codex first. |
| Validation footer | Sealos already owns a validator for distribution metadata. | Low | Keep validation commands near "Plugin Distribution." |

## Out of Scope

Features to explicitly leave out of this milestone.

| Out-of-Scope Item | Why Avoid | What to Do Instead |
|-------------------|-----------|--------------------|
| New runtime skill behavior | Milestone targets install and README only. | Keep deploy, database, S3, canvas, and app-builder workflows unchanged. |
| Second packaged copy of `skills/**` | Project requires root `skills/**` as the single skill source. | Keep manifests pointing to root skill paths. |
| Converting Claude slash commands for Codex | Sealos already has `$sealos` as the Codex invocation surface. | Document `$sealos` clearly. |
| Long per-skill tutorial in Quick Start | Codex install users need fast install and first invocation. | Link or leave detailed skill descriptions later in README. |
| Rewriting all non-Codex install flows | Downstream request is Codex install and README. | Keep non-Codex rows aligned but secondary. |

## Feature Dependencies

```text
Manifest name audit -> Exact Codex commands
Exact Codex commands -> README Quick Start rewrite
README Quick Start rewrite -> distribution/platforms.json install field alignment
README + platform registry alignment -> scripts/validate-codex-plugin.py
```

## MVP Recommendation

Prioritize:

1. Put Codex-native install first in `README.md`:
   `codex plugin marketplace add labring/sealos-skills` and `codex plugin add sealos@sealos`.
2. Add a short "What you get" paragraph: one Sealos plugin installs deploy, database, S3, canvas, app-builder, and supporting cloud-native skills.
3. Keep Codex App selection instructions and screenshot close to the install block.
4. Move `npx plugins add https://github.com/labring/sealos-skills --target codex` into a fallback/local compatibility subsection.
5. Update `distribution/platforms.json` Codex install text if README changes the primary install path.

Defer:

- Deep rewrite of non-Codex install docs: keep them accurate, but this milestone should optimize Codex first.
- New screenshots or GIFs: current screenshot is sufficient unless UI has changed.

## Confidence Assessment

| Finding | Confidence | Reason |
|---------|------------|--------|
| Use `codex plugin marketplace add` and `codex plugin add` | HIGH | Verified by local `codex plugin --help`, `codex plugin marketplace add --help`, and `codex plugin add --help`. |
| Use `sealos@sealos` as the install selector | MEDIUM | Local manifests all use marketplace/plugin name `sealos`; full install was not run to avoid changing user Codex config. |
| Keep `$sealos` invocation | HIGH | Current README and `.codex-plugin/plugin.json` both state `$sealos`; project instructions require Codex examples use `$sealos`. |
| Keep `npx plugins add ... --target codex` as fallback | HIGH | `.planning/PROJECT.md` explicitly requires this positioning. |
| Keep Codex App `+ -> Plugins -> Sealos` flow | MEDIUM | Current README has this flow and screenshot; live Codex App UI was not inspected. |

## Sources

- `.planning/PROJECT.md` - milestone scope, active requirements, and constraints.
- `.planning/codebase/INTEGRATIONS.md` - current integration inventory and distribution surfaces.
- `README.md` - current Codex install, invocation, and Codex App guidance.
- `.codex-plugin/plugin.json` - Codex plugin name, display name, skills path, and `$sealos` copy.
- `.agents/plugins/marketplace.json` - repo-local Codex marketplace name and plugin name.
- `marketplace.json` - Claude-compatible marketplace name and plugin name used as a Codex-native reference shape.
- `.claude-plugin/marketplace.json` - mirrored marketplace name and plugin name.
- `distribution/platforms.json` - current Codex support claim and install command.
- `/tmp/pm-skills-ref/README.md` - reference Codex marketplace install section and command-difference explanation.
- `/tmp/pm-skills-ref/.claude-plugin/marketplace.json` - reference marketplace/plugin naming shape.
- Local CLI help: `codex plugin --help`, `codex plugin marketplace add --help`, `codex plugin add --help`.
