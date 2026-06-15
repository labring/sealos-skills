# Codebase Concerns

**Analysis Date:** 2026-06-15

## Tech Debt

**Docker Compose to Sealos converter complexity:**
- Issue: `skills/docker-to-sealos/scripts/compose_to_template.py` is a 2,600+ line converter that owns parsing, image validation, DB inference, object-storage wiring, Sealos template generation, logo lookup, health probe defaults, and CLI behavior in one file.
- Files: `skills/docker-to-sealos/scripts/compose_to_template.py`, `skills/docker-to-sealos/scripts/test_compose_to_template.py`
- Impact: Changes to one conversion rule can affect unrelated output sections. Future fixes should expect broad regression risk across generated templates, DB resources, env mapping, and validation behavior.
- Fix approach: Split by responsibility into parser, model, resources, env/secrets, image policy, and renderer modules. Keep `skills/docker-to-sealos/scripts/test_compose_to_template.py` as the regression harness during extraction.

**Consistency checker rule surface is fragmented:**
- Issue: The checker spans many rule files and a registry, with rule scope controlled by YAML metadata and Python registration.
- Files: `skills/docker-to-sealos/scripts/check_consistency.py`, `skills/docker-to-sealos/scripts/check_consistency_engine.py`, `skills/docker-to-sealos/scripts/check_consistency_rule_registry.py`, `skills/docker-to-sealos/references/rules-registry.yaml`, `skills/docker-to-sealos/references/must-rules-map.yaml`
- Impact: Adding or renaming MUST rules requires updates in multiple places. A rule can exist in documentation but miss executable coverage, or executable checks can drift from the registry.
- Fix approach: Treat `skills/docker-to-sealos/references/must-rules-map.yaml` and `skills/docker-to-sealos/references/rules-registry.yaml` as source-of-truth inputs. Run `skills/docker-to-sealos/scripts/check_must_coverage.py` with every rule change.

**Distribution metadata duplication:**
- Issue: Platform support and marketplace metadata is duplicated across plugin manifests and marketplace files.
- Files: `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.codebuddy-plugin/marketplace.json`, `marketplace.json`, `distribution/platforms.json`, `gemini-extension.json`, `qwen-extension.json`, `openclaw.plugin.json`, `commands/sealos.md`
- Impact: A skill rename, command rename, category change, icon move, or support-claim update can leave one host stale while another works.
- Fix approach: Keep root `skills/**` as the only skill source and validate all distribution surfaces after metadata changes. Extend `scripts/validate-codex-plugin.py` or add sibling validators for Claude, CodeBuddy, Gemini, Qwen, OpenClaw, and marketplace files.

**Codex plugin validator has narrow coverage:**
- Issue: `scripts/validate-codex-plugin.py` checks only Codex plugin and local Codex marketplace metadata plus one platform registry entry.
- Files: `scripts/validate-codex-plugin.py`, `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `distribution/platforms.json`
- Impact: Non-Codex package drift can pass validation. Examples include stale `.claude-plugin/plugin.json`, `commands/sealos.md`, and context-only host manifests.
- Fix approach: Add a distribution-wide validator that asserts every advertised skill path exists, every command route is current, and every marketplace entry points to root `skills/**`.

**Benchmark results are static artifacts:**
- Issue: `skills/sealos-deploy/evals/benchmark.json` stores dated run results and notes, including an observed scoring issue for Rust CLI tools.
- Files: `skills/sealos-deploy/evals/benchmark.json`, `skills/sealos-deploy/evals/evals.json`, `skills/sealos-deploy/scripts/score-model.mjs`
- Impact: Readers can confuse historical benchmark output with current verification. Known scoring concerns can remain as notes without forcing a failing test.
- Fix approach: Convert benchmark notes that describe expected behavior into executable tests around `skills/sealos-deploy/scripts/score-model.mjs` and keep benchmark output clearly separated from pass/fail eval definitions.

## Known Bugs

**CLI/tool repositories can receive inflated readiness scores:**
- Symptoms: The deploy benchmark records a CLI tool receiving `4/12` because compiled binaries receive scalability and startup points by default, while the expected score is below the deployable threshold.
- Files: `skills/sealos-deploy/evals/benchmark.json`, `skills/sealos-deploy/scripts/score-model.mjs`, `skills/sealos-deploy/evals/evals.json`
- Trigger: Assess a non-web compiled CLI repository such as `/sealos-deploy https://github.com/sharkdp/bat`.
- Workaround: The skill instructions still require STOP decisions for CLI tools. Add model-level score tests so the numerical score matches the STOP decision.

**Shell URL opener can mis-handle unusual authorization URLs:**
- Symptoms: Browser auto-open in OAuth login builds a shell command string from the platform opener and URL.
- Files: `skills/sealos-deploy/scripts/sealos-auth.mjs`
- Trigger: Run `node skills/sealos-deploy/scripts/sealos-auth.mjs login` with a region returning an authorization URL containing shell-sensitive characters.
- Workaround: Manual URL opening still works because the script prints the verification URL. Replace shell-string `execSync` usage with `execFileSync` and argument arrays.

**Build command can fail on valid image references that require shell escaping:**
- Symptoms: Docker build uses a shell-string command with interpolated `remoteImage`.
- Files: `skills/sealos-deploy/scripts/build-push.mjs`
- Trigger: Build with a registry username or repository name that creates an image reference needing shell-safe handling.
- Workaround: Current repo-name sanitization reduces the common risk. Replace shell-string `execSync` with `execFileSync('docker', ['buildx', 'build', ...])`.

## Security Considerations

**Local auth files contain sensitive tokens and kubeconfig:**
- Risk: The authentication helper writes OAuth access tokens, regional tokens, and kubeconfig into the user's home directory.
- Files: `skills/sealos-deploy/scripts/sealos-auth.mjs`
- Current mitigation: Files are written with mode `0o600`, and user-facing info commands omit token values.
- Recommendations: Keep `~/.sealos/auth.json` and `~/.sealos/kubeconfig` out of repo artifacts, logs, screenshots, and generated docs. Add explicit redaction helpers before any future diagnostic output includes auth state.

**TLS verification is bypassed in Kubernetes helper scripts:**
- Risk: Several scripts use `--insecure-skip-tls-verify` when calling `kubectl`, which weakens cluster identity verification.
- Files: `skills/sealos-deploy/scripts/ensure-image-pull-secret.mjs`, `skills/sealos-canvas/scripts/generate-canvas.mjs`
- Current mitigation: Calls target the user's active Sealos kubeconfig and perform narrowly scoped operations.
- Recommendations: Prefer kubeconfig CA data when available. Keep insecure mode explicit, localized, and documented as a Sealos compatibility constraint.

**GHCR pull-secret automation handles raw GitHub tokens:**
- Risk: The pull-secret script reads `gh auth token` and passes it into `kubectl create secret docker-registry`.
- Files: `skills/sealos-deploy/scripts/ensure-image-pull-secret.mjs`, `skills/sealos-deploy/scripts/gh-auth-utils.mjs`, `skills/sealos-deploy/scripts/build-push.mjs`
- Current mitigation: JSON output includes username and secret metadata, while token values are not printed.
- Recommendations: Continue excluding token values from stdout/stderr. Use argument arrays or stdin for secret material and avoid shell strings that contain credentials.

**Live smoke testing accepts credentials as command-line flags:**
- Risk: Username and password passed to the smoke script can appear in process listings or shell history.
- Files: `skills/sealos-deploy/scripts/sealos-live-smoke.mjs`, `skills/sealos-deploy/references/live-smoke-playbooks.md`
- Current mitigation: Output redacts credentials and response bodies with sensitive-looking keys.
- Recommendations: Prefer env vars or a temporary file for sensitive smoke credentials, and delete temporary files after use.

**Generated examples include placeholder secrets:**
- Risk: Documentation examples show secret-shaped values and generated local env files, which can normalize committing local test secrets.
- Files: `skills/dockerfile-skill/SKILL.md`, `skills/dockerfile-skill/modules/generate.md`, `skills/docker-to-sealos/references/conversion-mappings.md`, `skills/docker-to-sealos/references/example-guide.md`
- Current mitigation: Skill instructions explicitly prohibit committing `.env`, connection strings, access keys, kubeconfig, and auth files.
- Recommendations: Keep example values clearly fake, keep `.env.docker.local` local-only, and validate generated docs for accidental real credential values before publishing.

## Performance Bottlenecks

**Compose conversion does network logo lookup during generation:**
- Problem: The converter includes SVGL API constants and URL fetch helpers in the main conversion path.
- Files: `skills/docker-to-sealos/scripts/compose_to_template.py`
- Cause: Template metadata/logo enrichment is coupled to deterministic conversion.
- Improvement path: Make network enrichment optional and cacheable. Keep core conversion deterministic and offline by default.

**Deployment build always targets linux/amd64 and pushes remotely:**
- Problem: Build validation uses `docker buildx build --platform linux/amd64 --push`, which is slower than local syntax/build checks and depends on registry availability.
- Files: `skills/sealos-deploy/scripts/build-push.mjs`
- Cause: Build and publish are a single operation.
- Improvement path: Keep a fast local validation path for Dockerfile and build context checks before remote push. Reserve push for confirmed deployment runs.

**Canvas resource collection performs sequential kubectl calls:**
- Problem: Canvas generation fetches each Kubernetes resource kind one by one.
- Files: `skills/sealos-canvas/scripts/generate-canvas.mjs`
- Cause: `readLiveResources()` loops over `SAFE_RESOURCE_KINDS`, then separately fetches configmap and secret summaries.
- Improvement path: Fetch safe resource groups in parallel with bounded timeouts, or use one multi-resource kubectl request when output shape remains stable.

## Fragile Areas

**Root `skills/**` is the only skill source:**
- Files: `skills/**`, `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `commands/sealos.md`
- Why fragile: Plugin hosts consume the same root skill files through different manifests. Adding a second packaged copy creates drift.
- Safe modification: Edit root `skills/**` only. Update manifests to reference root paths and run package validators after any skill rename or move.
- Test coverage: Codex metadata has `scripts/validate-codex-plugin.py`; other host manifests need equivalent validation.

**Deploy state controls DEPLOY versus UPDATE behavior:**
- Files: `skills/sealos-deploy/modules/pipeline.md`, `skills/sealos-deploy/schemas/state.schema.json`, `skills/sealos-deploy/scripts/validate-artifacts.mjs`
- Why fragile: `.sealos/state.json` `last_deploy` fields determine whether the skill creates a new deployment or updates an existing one.
- Safe modification: Validate state schema and runtime cluster truth together. Preserve `last_deploy.app_name`, `last_deploy.namespace`, `last_deploy.image`, and URL fields when changing update behavior.
- Test coverage: Eval prompts cover deploy scenarios, but state-transition scripts need direct tests for malformed, stale, and cross-workspace state.

**Secret and DB env rules have many exceptions:**
- Files: `skills/docker-to-sealos/SKILL.md`, `skills/docker-to-sealos/references/database-templates.md`, `skills/docker-to-sealos/scripts/check_consistency_rules_security.py`, `skills/docker-to-sealos/scripts/check_consistency_rules_storage.py`
- Why fragile: PostgreSQL, MySQL, MongoDB, Redis, Kafka, and object storage use different secret names and allowed env composition rules.
- Safe modification: Update documentation, registry rules, converter behavior, and tests in the same change. Add fixture coverage for each database type affected.
- Test coverage: `skills/docker-to-sealos/scripts/test_compose_to_template.py` and `skills/docker-to-sealos/scripts/test_check_consistency.py` provide broad coverage, but new exceptions require focused fixtures.

**GHCR private image deployment depends on local host state:**
- Files: `skills/sealos-deploy/scripts/build-push.mjs`, `skills/sealos-deploy/scripts/ensure-image-pull-secret.mjs`, `skills/sealos-deploy/scripts/gh-auth-utils.mjs`
- Why fragile: Success depends on `gh`, Docker, GHCR package permissions, kubeconfig, and active namespace all matching the intended workspace.
- Safe modification: Preserve structured JSON outputs and explicit failure reasons. Verify `gh auth status`, required scopes, image pullability, and namespace before mutating Kubernetes resources.
- Test coverage: Current coverage is mostly workflow/eval based; add unit tests for registry detection, image reference parsing, and failure payloads.

## Scaling Limits

**Template conversion rule growth:**
- Current capacity: The converter and checker currently support common web apps, five managed database categories, object storage, ingress, PVCs, probes, and Sealos-specific metadata.
- Limit: Adding more resource classes or application-specific profiles increases the central rule matrix in `skills/docker-to-sealos/scripts/compose_to_template.py`.
- Scaling path: Move profile-specific rules into data files or small strategy modules, then keep the renderer generic.

**Eval suite is prompt/assertion metadata heavy:**
- Current capacity: `skills/*/evals/evals.json` describes expected behavior for deploy, database, S3, and canvas workflows.
- Limit: JSON eval descriptions alone do not enforce behavior in CI without a runner or script-level tests.
- Scaling path: Pair every critical eval assertion with an executable script test or validator where behavior is deterministic.

## Dependencies at Risk

**External CLIs are assumed by workflow scripts:**
- Risk: `docker`, `gh`, `kubectl`, and `sealos-cli` availability determine whether skills can complete.
- Impact: Missing or mismatched CLIs produce runtime failures during auth, build, deployment, database, S3, and canvas workflows.
- Migration plan: Keep preflight checks close to each workflow entry point. Prefer structured JSON failure payloads that name the missing binary and the exact install or login action.

**Sealos API and template endpoint contracts are embedded in scripts:**
- Risk: OAuth, region token, namespace, kubeconfig, and raw template deploy endpoints are hardcoded.
- Impact: API path or response-shape changes break auth and deploy without compile-time signals.
- Migration plan: Centralize endpoint definitions in `skills/sealos-deploy/config.json` or a shared client module, and add contract tests around response parsing.

**PyYAML is required for converter and checker scripts:**
- Risk: Python scripts import `yaml` directly without a top-level dependency manifest.
- Impact: Fresh environments can fail even though the repository has no package installation step.
- Migration plan: Add a minimal requirements file or document `PyYAML` setup in the relevant skill README/command path.

## Missing Critical Features

**Distribution-wide validation command:**
- Problem: There is no single command that validates every plugin, marketplace, command, and extension manifest.
- Blocks: Safe renames of skills, commands, icons, descriptions, and platform support claims across all hosts.

**Executable eval runner documentation:**
- Problem: Evals are present as JSON prompts/assertions, but a standard local command for running them is not visible at repo root.
- Blocks: Contributors cannot reliably prove skill behavior changes against the documented eval set.

**Automated secret-leak scan for generated artifacts:**
- Problem: Skills intentionally create local env files, auth files, build artifacts, template args, and smoke outputs during real use.
- Blocks: Safe publication of generated artifacts without manual inspection.

## Test Coverage Gaps

**Sealos deploy script unit tests:**
- What's not tested: Registry detection, GH scope handling, GHCR pullability verification, shell argument escaping, build-result artifact failures, deploy-template response parsing, and image-pull-secret patch behavior.
- Files: `skills/sealos-deploy/scripts/build-push.mjs`, `skills/sealos-deploy/scripts/deploy-template.mjs`, `skills/sealos-deploy/scripts/ensure-image-pull-secret.mjs`, `skills/sealos-deploy/scripts/gh-auth-utils.mjs`
- Risk: Host-specific CLI failures and auth edge cases can break deployment late in the workflow.
- Priority: High

**Auth workflow tests:**
- What's not tested: Device grant error branches, slow-down polling, expired token handling, workspace switching, malformed auth file handling, and insecure mode behavior.
- Files: `skills/sealos-deploy/scripts/sealos-auth.mjs`
- Risk: Login and workspace selection can fail after the user has already started an interactive auth flow.
- Priority: High

**Canvas HTML sanitization and resource parsing tests:**
- What's not tested: HTML escaping for resource names/labels, partial kubectl failures, large namespaces, and secret/configmap summary behavior.
- Files: `skills/sealos-canvas/scripts/generate-canvas.mjs`, `skills/sealos-canvas/assets/canvas-template.html`, `skills/sealos-canvas/evals/evals.json`
- Risk: Canvas output can become misleading or unsafe if Kubernetes metadata contains unexpected characters.
- Priority: Medium

**Distribution manifest parity tests:**
- What's not tested: Claude, CodeBuddy, Gemini, Qwen, OpenClaw, marketplace, and command-route parity with root `skills/**`.
- Files: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.codebuddy-plugin/marketplace.json`, `gemini-extension.json`, `qwen-extension.json`, `openclaw.plugin.json`, `marketplace.json`, `commands/sealos.md`
- Risk: One host can install stale or incomplete plugin metadata.
- Priority: Medium

**Database and S3 analyzer tests:**
- What's not tested: Project detection edge cases for env key mapping, existing service reuse, public access safety gates, and credential rotation flows.
- Files: `skills/sealos-database/scripts/analyze-project-database.mjs`, `skills/sealos-s3/scripts/analyze-project-s3.mjs`, `skills/sealos-database/evals/evals.json`, `skills/sealos-s3/evals/evals.json`
- Risk: Skills can wire unused env names or choose unsafe cloud-resource actions when project signals are ambiguous.
- Priority: Medium

---

*Concerns audit: 2026-06-15*
