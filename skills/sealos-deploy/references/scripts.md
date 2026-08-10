# Scripts

Scripts live in `<SKILL_DIR>/scripts/`. All scripts print JSON on stdout. Run each script with Bash, then parse the JSON.

## Script catalog

| Script | Usage | Purpose |
|--------|-------|---------|
| `validate-artifacts.mjs` | `node validate-artifacts.mjs --dir <work-dir>` | Validate `.sealos` JSON artifacts against enforced schemas |
| `build-push.mjs` | `node build-push.mjs <work-dir> <repo> [--mode build\|push\|all] [--registry ghcr\|dockerhub] [--user <user>] [--context <dir>] [--dockerfile <path>] [--image <ref>] [--local-tag <ref>]` | Local Buildx helper. Phase 3 local path: `--mode build` then `--mode push`. Default `--mode all` builds and pushes (UPDATE). Sandbox uses `k8s-kaniko-job` instead. Docker Hub path assumes a public image at deploy time. |
| `ensure-image-pull-secret.mjs` | `node ensure-image-pull-secret.mjs <namespace> <secret-name> <image-ref> [deployment-name]` | Create or update an app-scoped GHCR pull Secret. Can patch a Deployment to reference it. |
| `gh-refresh-scopes.mjs` | `node gh-refresh-scopes.mjs write:packages` | Refresh GHCR package access in the current TTY. `write:packages` covers push and private pull in this workflow. |
| `deploy-template.mjs` | `node deploy-template.mjs <template-path> [--dry-run] [--args-json '{"KEY":"value"}'\|--args-file <file>]` | Resolve the current region, enforce private sensitive-args files on POSIX, post a local template YAML, and emit an allowlisted result with credential values redacted |
| `sealos-launchpad-network.mjs` | `node sealos-launchpad-network.mjs --app <app> --app-url <url> [--expected-port <port>] [--region <url>] [--kubeconfig <path>]` | Read-only Launchpad public-network discovery check with App URL and Service port matching |
| `sealos-footprint.mjs` | `node sealos-footprint.mjs --namespace <ns> --app <app>` | Read-only inventory of Instance/App/workloads/Jobs/KubeBlocks/PVCs/ObjectStorageBuckets for debug and cleanup planning |
| `sealos-live-smoke.mjs` | `node sealos-live-smoke.mjs --url <url> [--captcha-path <path>] [--login-method json-token\|cookie-json] [--login-path <path>] [--username <user>] [--password <pass>] [--token-path <path>] [--auth-path <path>] [--missing-api-path <path>] [--missing-page-path <path>]` | Read-only or credentialed HTTP smoke test for the App URL, authenticated routes, and API/SPA negative probes |
| `sealos-log-scan.mjs` | `node sealos-log-scan.mjs --namespace <ns> --app <app> [--since 10m] [--tail 300] [--baseline <report.json\|json>] [--min-window-seconds 60]` | Read-only JSON scan of Pod/init/main logs plus Warning Event convergence after readiness, login, and documented API or missing-static-asset checks |
| `phase-0/check-running-environment.mjs` | `node phase-0/check-running-environment.mjs` | Phase 0 probe: `runtime_profile`, present/missing deps, GHCR-related warnings. Detect only. |
| `validate-phase-0.mjs` | `node validate-phase-0.mjs --dir <work-dir>` | Phase 0 acceptance for the four-field `analysis.json` |
| `validate-phase-1.mjs` | `node validate-phase-1.mjs --dir <work-dir>` | Phase 1 acceptance for `official_template` and preserved Phase 0 fields |
| `validate-phase-2.mjs` | `node validate-phase-2.mjs --dir <work-dir>` | Phase 2 acceptance for `deployment-plan` / `deployment_source` |
| `validate-phase-3.mjs` | `node validate-phase-3.mjs --dir <work-dir>` | Phase 3 acceptance for `build-result` / `pull_access` (skip OK when no build) |
| `validate-phase-4.mjs` | `node validate-phase-4.mjs --dir <work-dir>` | Phase 4 acceptance for digests, template overlay, and deploy-gate subset |
| `validate-phase-5.mjs` | `node validate-phase-5.mjs --dir <work-dir>` | Phase 5 acceptance for prepare-result / template_sha256 / confirmation |

Sealos Cloud login and workspace switching use `npx -y sealos-cli@latest`. See `modules/phase-0.md`.

Phase 0 probe fields: `missing_required` (entry hard-stop) and `missing_deferred` (path-gated later).

## Launchpad network check

For public web applications, run `sealos-launchpad-network.mjs` before HTTP smoke.

Acceptance needs all of these:

- `ok: true`
- an open public network
- the expected Service port
- an App URL host match

The script prints an allowlisted network summary. It does not print raw Launchpad application data, environment variables, Secrets, or kubeconfig content.

## Runtime Event acceptance

Runtime Event acceptance uses two scans.

1. After readiness, capture the first report with no baseline.
2. Wait at least 60 seconds.
3. Pass that report through `--baseline` for the final scan.

Extend `--min-window-seconds` so that the window covers one full known reconciliation, probe, or scheduled-work period.

An initial Warning Event is an observation. A Warning that advances after the baseline is an active failure. An unresolved referenced Secret, a Ready transition, a Pod replacement, or a restart delta after the baseline is also an active failure.

## Intentional fault injection

Keep a pre-injection report as evidence.

After recovery reaches Ready, capture a fresh recovery baseline. Then compare the final scan against that recovery baseline after the full stability window.

For step detail, read `modules/phase-7.md`.
