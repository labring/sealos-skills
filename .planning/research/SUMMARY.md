# Research Summary: Sealos Codex Plugin Installation Upgrade

**Researched:** 2026-06-15  
**Scope:** Codex-native installation, README positioning, plugin metadata parity, and validation hardening.

## Key Findings

### Stack

- Codex CLI supports the native marketplace flow: `codex plugin marketplace add <source>` followed by `codex plugin add <plugin>@<marketplace>`.
- `phuryn/pm-skills` uses that native flow successfully: add the marketplace, then install individual plugins such as `pm-toolkit@pm-skills`.
- Sealos should adapt the pattern to a one-plugin model: `codex plugin marketplace add labring/sealos-skills` and `codex plugin add sealos@sealos`.
- Current Sealos native marketplace discoverability needs a first-phase spike: isolated Codex testing added the marketplace but did not list `sealos@sealos`.
- `npx plugins add https://github.com/labring/sealos-skills --target codex` remains valuable as a compatibility and local validation path.

### Table Stakes

- README must lead Codex users with the Codex-native marketplace install path once discoverability is verified.
- README must explain what one Sealos plugin installs: deploy, database, S3, canvas, app-builder, and supporting cloud-native skills.
- Codex invocation examples must use the Codex surface and keep Claude-compatible `/sealos` examples in Claude-specific sections.
- Codex App guidance should stay near the install block and keep the existing Sealos plugin selection screenshot.
- `distribution/platforms.json` must match the README install claim and record current evidence.
- `scripts/validate-codex-plugin.py` must catch README, registry, and manifest drift introduced by this milestone.

### Architecture

- `README.md` is the user-facing install contract.
- `.codex-plugin/plugin.json` is the Codex plugin contract and should continue pointing to root `skills/`.
- `.agents/plugins/marketplace.json` is the local Codex marketplace fixture.
- `marketplace.json` and `.claude-plugin/marketplace.json` define marketplace/plugin identity for native marketplace-style flows.
- `distribution/platforms.json` is the support-claim registry.
- `scripts/validate-codex-plugin.py` should become the guardrail that proves the README, registry, and manifests agree.

### Watch Out For

- The Sealos install identity has four layers: repo source `labring/sealos-skills`, marketplace id `sealos`, plugin id `sealos`, and display label `Sealos`.
- The reference repo has many plugins; Sealos has one plugin that bundles all skills.
- Codex wording should avoid Claude slash-command assumptions.
- README changes without platform registry and validator changes create false confidence.
- `.agents/plugins/marketplace.json` may require explicit staging checks if it changes.

## Recommended Phase Order

1. **Native marketplace discovery spike** — make `sealos@sealos` visible through `codex plugin list --available --json` in an isolated Codex home.
2. **README and metadata alignment** — promote the verified Codex-native install path, preserve the `npx plugins` fallback, and synchronize platform claims.
3. **Validator hardening** — extend `scripts/validate-codex-plugin.py` to enforce README, registry, and manifest parity.
4. **Smoke verification and handoff** — run Codex native install smoke, compatibility install smoke, JSON checks, and plugin validation.

## Decision Guidance

- Keep root `skills/**` as the only skill source.
- Move README primary install copy only after the native marketplace path works.
- Keep non-Codex distribution changes limited to direct consistency edits.
- Treat validator success plus isolated Codex command smoke as the release gate.
