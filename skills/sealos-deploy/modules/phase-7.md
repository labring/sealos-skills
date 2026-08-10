# Phase 7: Post-deploy wrap-up

Judge success from **live** cloud state, then record `.sealos/state.json`. Do not
treat Template API return codes alone as deploy success (P7-01). Phase 7 is
mandatory after every Phase 6 create. Creating resources without this wrap-up is
not deploy success.

Write `.sealos/state.json` only after applicable runtime checks pass. Report
**COMPLETE** to the user only after validate-phase-7 passes (P7-03).

For app-specific smoke guidance, also load
`<SKILL_DIR>/references/live-smoke-playbooks.md`.

## Inputs

| Input | Source |
|-------|--------|
| Live resources | Phase 6 (`APP_NAME` from deploy-result / live Instance) |
| Deploy result | `.sealos/phase-6/deploy-result.json` |
| Access URLs | Ingress, App URL, internal endpoints |
| Workload status | Pods, events, logs |
| Analysis / build | `.sealos/analysis.json`, Phase 3/4 image refs when present |

## Outputs

| Output | Path / form |
|--------|-------------|
| Verified deploy | Report success only after checks + state validation |
| Deploy state | `.sealos/state.json` |

## Path dependency gate

| Need | Tools |
|------|-------|
| Always | `kubectl` and a usable Sealos kubeconfig |
| Public web checks | Node helpers below; `curl` when needed |

Ask once to install; refuse or recheck failure → **STOP**.

## Phase constraints

| ID | Constraint |
|----|------------|
| P7-01 | Do not judge success from API return codes alone — verify live runtime state |
| P7-02 | On architecture mismatch, do not guess other images or floating tags |
| P7-03 | Write `state.json` and pass validate-phase-7 before reporting success |

## Procedure

### 1. Runtime verification

Verify applicable items by workload type:

- [ ] App, workspace, resource scope, and access URLs confirmed
- [ ] Workloads, internal links, and public entry ready
- [ ] Web app reachable from the real entry; core flow works after login or init when required
- [ ] Init, migration, startup, and runtime logs reviewed
- [ ] No `no matching manifest`, `no match for platform in manifest`, or `exec format error`
- [ ] Stability window: alerts, restarts, OOM, readiness converged
- [ ] Databases, object storage, workers, and cron behave as expected

#### 1.1 Capture live identity

Prefer `APP_NAME` from `.sealos/phase-6/deploy-result.json`. Read the App URL from
the live App resource when possible:

```bash
APP_NAME="<app-name from deploy-result>"
APP_URL=$(KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  get apps.app.sealos.io/"$APP_NAME" -n "$NAMESPACE" \
  -o jsonpath='{.spec.data.url}' 2>/dev/null)
```

If the live App resource has no URL, use the URL returned by Template API. Never
reconstruct the public URL from `app_host` + control-plane `region` alone.

Collect the runtime footprint before any HTTP request:

```bash
node "<SKILL_DIR>/scripts/sealos-footprint.mjs" \
  --namespace "$NAMESPACE" --app "$APP_NAME"
```

Confirm the live root Ingress backend, application Service, and ready endpoints:

```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  get ingress,svc,endpoints -n "$NAMESPACE" \
  -l "cloud.sealos.io/app-deploy-manager=$APP_NAME" -o wide
```

For resources rewritten by Launchpad, inspect all manager-labeled Ingresses and
Services. Keep requested name, live Instance/App names, and returned host as
separate values.

#### 1.2 Verify Launchpad public networking

For every web application with a public root-path Ingress:

```bash
PUBLIC_PORT="<public-service-port>"
node "<SKILL_DIR>/scripts/sealos-launchpad-network.mjs" \
  --app "$APP_NAME" \
  --app-url "$APP_URL" \
  --expected-port "$PUBLIC_PORT"
```

Private applications with no public Ingress skip this command. Public acceptance
requires `ok: true`, API `code: 200`, at least one network with
`openPublicDomain: true`, a complete public or custom domain, a port matching
`$PUBLIC_PORT`, and an App URL host matching the Launchpad network host.

Treat `launchpad_api_error`, `public_network_missing`, `expected_port_missing`,
and `app_url_host_mismatch` as failures. When an HTTP Ingress has several paths,
place root Prefix `/` before more specific paths.

#### 1.3 Capture the runtime baseline

```bash
RUNTIME_EVIDENCE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/sealos-runtime.XXXXXX")
INITIAL_BASELINE="$RUNTIME_EVIDENCE_DIR/initial-baseline.json"
FINAL_RUNTIME_REPORT="$RUNTIME_EVIDENCE_DIR/final-runtime.json"

node "<SKILL_DIR>/scripts/sealos-log-scan.mjs" \
  --namespace "$NAMESPACE" --app "$APP_NAME" --since 10m --tail 300 \
  > "$INITIAL_BASELINE"
```

#### 1.4 Authenticate and verify routes

Run the root request from a fresh session before setup or login. For a path-based
entrance, exercise both the configured App URL path and `/`; keep the path that
reaches the real first-run or login screen as the App URL.

Use the Phase 5 account mode. Deployer-supplied mandatory bootstrap → exact
validated admin values. Runtime-generated mandatory bootstrap → resolve from
Secret / documented live source into a private local value (do not print).
Functional first-user signup → register after readiness, then reuse that session.

```bash
node "<SKILL_DIR>/scripts/sealos-live-smoke.mjs" \
  --url "$APP_URL" \
  --login-method cookie-json \
  --login-path "/rest/noauth/auth/password" \
  --username "$ADMIN_USER" \
  --password "$ADMIN_PASSWORD" \
  --auth-path "/rest/system/status,/rest/system/connections"
```

Keep passwords, tokens, cookies, CSRF, captcha, and runtime-derived secrets out of
echoes and reports. Use `--token-path`, `--missing-api-path`, and
`--missing-page-path` as documented by the helper.

#### 1.5 Repair declarative ownership and credential residue

When startup fails on bootstrap credential validation, classify it as a
configuration-contract failure before resource tuning. Reconfirm account mode,
then repair every declarative layer that can recreate the invalid configuration:

1. Update the source Template first.
2. Follow `ownerReferences`, Instance identity, and manager labels to the highest
   writable live declarative owner; patch that owner or emitted workload.
3. Roll out a fresh Pod and wait through one complete reconciliation window.
4. Confirm removed administrator/root bootstrap keys remain absent.
5. Parse `kubectl.kubernetes.io/last-applied-configuration` and
   ControllerRevisions into key-name-only reports (values redacted).
6. Recommend rotation for every credential that reached Template API args,
   workload history, annotations, or revisions.

Deleting historical annotations or ControllerRevisions requires explicit user
confirmation.

#### 1.6 Verify Jobs, logs, and footprint

Acceptance requires `sealos-footprint.mjs` with `collectionOk: true`,
`runtimeReady: true`, and the expected inventory. Treat completed or TTL-expired
init Jobs as historical evidence; verify live database final state directly.

A Pod in `Succeeded` with every container exit code `0` is completed work, not a
`pod_not_ready` finding. Any active main-container failure, new init failure,
restart delta, readiness flap, advancing Warning Event, unresolved referenced
Secret, OOM/CrashLoop, or repeated traceback is blocking.

#### 1.7 Exercise the application

```bash
node "<SKILL_DIR>/scripts/sealos-live-smoke.mjs" --url "$APP_URL"
```

For login-gated apps, complete the selected account flow and one authenticated
page or API route. After smoke, scan logs again. For private object storage,
complete upload → application read/download with digest check → raw object
401/403 without app credentials → delete when supported. Optional local and
managed-S3 branches each need their branch workflow.

For web apps, probe a documented API 404 or unique missing static asset, then
scan logs once more. SPA shell 2xx fallbacks are classified by content.

#### 1.8 Verify Event convergence

Minimum window 60s; extend to cover one known reconciliation / probe /
scheduled-work period:

```bash
STABILITY_SECONDS=60
sleep "$STABILITY_SECONDS"
node "<SKILL_DIR>/scripts/sealos-log-scan.mjs" \
  --namespace "$NAMESPACE" --app "$APP_NAME" --since 10m --tail 300 \
  --baseline "$INITIAL_BASELINE" \
  --min-window-seconds "$STABILITY_SECONDS" \
  > "$FINAL_RUNTIME_REPORT"
```

Acceptance requires `ok: true`, zero `active-failure` Events, zero restart
deltas, stable Ready transitions, and resolved Secrets from historical
`secret not found` Events.

For intentional fault injection: keep pre-injection report → recover to Ready →
fresh recovery baseline → final comparison against recovery baseline.

Inspect live main-container `command`/`args`. Prefer short official entrypoints;
put repeated bootstrap/self-healing in initContainers, Jobs, or ConfigMap
scripts. Shell wrappers must end with `exec <final-process>`.

#### 1.9 Runtime acceptance checklist

- Pods and initContainers are complete or ready; Service endpoints populated
- Public web apps: Launchpad `ok: true`, expected port, App URL host match
- Root Prefix `/` before more specific paths; numeric Service port on root backend
- Actual App URL loads from a fresh session
- Login-gated apps complete selected account flow + one authenticated action
- Account-flow repairs converge; removed bootstrap keys stay absent
- Negative API / missing-static probes behave as expected; no SSR/browser failure text
- Final runtime report `ok: true` with a complete stability window
- Object-storage and database final states verified when applicable
- Full footprint accounts for Instance, App, Jobs, KubeBlocks, PVCs, buckets

### 2. Failure handling

**Architecture mismatch on a reused third-party image (P7-02):** when buildable
source exists, fix images and template in Phases 2–4, then redeploy from Phase 5
and re-run Phase 7. Without buildable source, report the incompatible service,
image, and error. Do **not** guess other images or floating tags.

**Resource exhaustion:** OOMKilled, restart loops, migration timeout, or readiness
flap means current resources fail runtime verification. Raise CPU or memory to the
next Sealos step, regenerate the template, redeploy from Phase 5, and re-run
Phase 7. Official-template path cannot edit verified official YAML — disable reuse
and return to the standard path when resources cannot pass.

### 3. Write `state.json`

Only after applicable runtime checks pass. Normative completion rules:
docs `pipeline/state-and-completion` (ZH) / `en/pipeline/state-and-completion` (EN).

```json
{
  "version": "1.0",
  "last_deploy": {
    "app_name": "<instance name from deploy-result / live App>",
    "app_host": "<ingress host prefix>",
    "namespace": "<K8s namespace from kubeconfig>",
    "region": "<Sealos control-plane region domain, e.g. usw-1.sealos.io>",
    "image": "<IMAGE_REF used in this deploy>",
    "docker_hub_user": "<DOCKER_HUB_USER, or null>",
    "repo_name": "<analysis.json repo_name>",
    "url": "<exact APP_URL verified above>",
    "deployed_at": "<current ISO timestamp>",
    "last_updated_at": "<current ISO timestamp>"
  },
  "history": [
    {
      "at": "<current ISO timestamp>",
      "action": "deploy",
      "image": "<IMAGE_REF>",
      "method": "template-api",
      "status": "success",
      "note": "Initial deployment"
    }
  ]
}
```

Field sources:

| Field | Source |
|-------|--------|
| `app_name` | Must match `.sealos/phase-6/deploy-result.json` → `app_name` |
| `app_host` | Live Ingress host prefix / rendered `defaults.app_host` |
| `namespace` | Active kubeconfig context |
| `region` | `~/.sealos/auth.json` `region` (strip `https://`); may differ from App runtime domain |
| `image` | Phase 3 `build_result.pushed` primary key, or Phase 4 digest-pinned image |
| `docker_hub_user` | Docker Hub user when that path was used; otherwise `null` |
| `repo_name` | `.sealos/analysis.json` → `repo_name` |
| `url` | Exact verified `APP_URL` (never invent from host + region) |

`history` is append-only afterward (UPDATE path). Without `last_deploy`, every later
`/sealos-deploy` creates a new instance.

After write:

1. Run artifact schema validation (`validate-artifacts.mjs` and/or validate-phase-7).
2. For GitHub URL sources, update bridge persistence per mode-detection / docs
   before deleting a temp checkout.
3. Validation or persistence failure → do **not** report success.
4. Do not delete a temp `WORK_DIR` until Phase 7, validation, and bridge update
   succeed. Never delete the user's local project directory.

### 4. Validate

```bash
node "<SKILL_DIR>/scripts/validate-phase-7.mjs" --dir "$WORK_DIR"
```

| ID | Check |
|----|-------|
| P7-V01 | `.sealos/state.json` exists and passes schema |
| P7-V02 | `last_deploy.app_name` matches Phase 6 `deploy-result.json` → `app_name` |

On failure, do not report **COMPLETE**.

### 5. Final summary (only after validate passes)

```
✓ Assessed: {language} + {framework}
✓ Image: {IMAGE_REF} ({source: existing/built})
✓ Template: .sealos/template/index.yaml
✓ Configured: {N} inputs set ({M} required, {K} optional)
✓ Deployed to Sealos Cloud ({region})

App URL: https://<app-access-url>

To update this deployment later, run: /sealos-deploy
```

Mask secrets (API keys, passwords): show only first 3 and last 3 characters.
Official-template path also shows template name and catalog version when known.

## Stop conditions

| Result | Condition |
|--------|-----------|
| **STOP** | Required runtime checks still fail after bounded remediation; state write/validation fails |
| **COMPLETE** | Applicable checks pass, `state.json` written, validate-phase-7 passes |
