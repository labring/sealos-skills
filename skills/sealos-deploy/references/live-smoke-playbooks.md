# Live Smoke Playbooks

Optional diagnostics for a Sealos Template API deployment. Phase 7 hard
acceptance is only: the public App URL opens without browser failure text (or
Ready when there is no public entry), within the bounded retry window. Run the
sections below **when the hard accept fails, when the user asks for a deep
verification, or before handing off a test deployment** — they never block
`state.json` or COMPLETE on their own.

## Contents

- [Deep Runtime Pass](#deep-runtime-pass) (this file)
- [First-User Signup and Mandatory Bootstrap](#first-user-signup-and-mandatory-bootstrap) (this file)
- [Event Convergence Gate](#event-convergence-gate) (this file)
- [Private Object Storage Acceptance](#private-object-storage-acceptance) (this file)
- [Stuck Pod Debug Checklist](#stuck-pod-debug-checklist) (this file)
- App-specific playbooks (load on demand, one file per app family):
  - `playbooks/login-gated.md` — generic login-gated web apps, cookie + dynamic CSRF login, Syncthing GUI
  - `playbooks/llm-gateway.md` — LLM gateway / multi-service SSR web apps
  - `playbooks/billionmail.md` — BillionMail

## Deep Runtime Pass

Use this pass for deep verification on request or after a hard-accept failure.

1. Capture the namespace, requested app name, live Instance/App names, and actual App URL from the Template API response or the `apps.app.sealos.io` resource. Continue with the returned host because Template API may mint a different Instance name or ingress host.
2. Inspect runtime state with the Sealos kubeconfig:
   - run `scripts/sealos-launchpad-network.mjs` for public web apps and require an open public network whose port and host match the live Service and App URL
   - `get pod,app,instances.app.sealos.io,svc,ingress,pvc`
   - `describe pod/<pod>`
   - initContainer logs and main container logs
   - live main container `command`/`args`
   - KubeBlocks Cluster status for database-backed apps
3. Visit the actual App URL exactly as Sealos launches it. Test the root path and the configured App URL path when the app uses an entrance or safe-path mechanism. When an Ingress has several HTTP paths, keep the root Prefix path `/` first so Launchpad discovers the intended public entry.
4. For login-gated web apps, complete the selected first-user signup or mandatory bootstrap login flow, confirm a token/session, and open at least one authenticated page or API route. Use `cookie-json` when the app emits a dynamic CSRF cookie/header pair, and keep credentials, cookies, tokens, and derived secrets masked in every report.
5. Scan recent logs after login with `scripts/sealos-log-scan.mjs`. Treat recurring application errors as deployment failures even when all Pods are Running.
6. Request a documented API negative route or unique missing static asset against the real App URL. API probes must return 404. SPA/browser apps may return the shell with HTTP 200 for client routes, so inspect the response content and accept the result only when the follow-up log scan stays clear of traceback-style `HTTPException` / `NotFound` noise.
7. Treat visible SSR/browser failure text such as `Application error`, `server-side exception`, `Internal Server Error`, and `Unhandled Runtime Error` as failed smoke even when HTTP returns 2xx/3xx.
8. Inventory the full footprint before cleanup or handoff:
   - `instances.app.sealos.io`
   - `apps.app.sealos.io`
   - Deployments/StatefulSets/CronJobs/Jobs
   - Services/Ingresses
   - PVCs
   - KubeBlocks Clusters
   - managed `ObjectStorageBucket` resources
9. For test deployments, clean the named footprint only after this pass, following `references/cleanup.md` (which includes the pull Secret and ConfigMaps).

When this pass is part of a user-requested deep verification, the footprint
helper must report `collectionOk: true` and `runtimeReady: true` before you
report the deep pass as complete. These fields never gate the Phase 7 hard
accept.

## First-User Signup and Mandatory Bootstrap

Classify the exact selected release before deployment:

| Account mode | Template behavior | Live smoke |
|---|---|---|
| Functional first-user signup | Keep optional administrator/root inputs and bootstrap injection absent | Register after readiness and verify one authenticated action |
| Mandatory bootstrap, deployer-supplied | Require every documented identity/password input with no default and validate exact upstream rules before deploy | Log in with the exact Phase 5 values |
| Mandatory bootstrap, runtime-generated | Omit administrator inputs, deterministically construct and validate the documented credential format, and retain the resolved value in a Secret or documented live runtime source | Retrieve the resolved value without printing it, then complete login and one authenticated action |
| Optional root reconciliation | Use the functional first-user signup contract | Register and verify the optional overlay remains absent |

When first boot exits on password policy, invalid root configuration, or reconciliation validation, inspect configuration before resources. Patch the source Template and highest writable live declarative owner, roll out a fresh Pod, wait through one reconciliation window, and confirm removed bootstrap key names remain absent. Inspect last-applied annotations and ControllerRevisions through redacted key-name-only reports, then recommend credential rotation.

## Event Convergence Gate

Optional diagnostic only — not a Phase 7 hard acceptance gate.

Capture an initial `sealos-log-scan.mjs` report after the workload reaches Ready. This no-baseline report records Warning Events as `observed` while log findings, Pod readiness failures, and kubectl errors retain failure status. A Pod in `Succeeded` phase with zero exit codes is a completed workload; failed or non-zero completion remains blocking. Init output from a container that completed before the baseline may be retained as `historicalCompletedInit: true` when completion time, exit code, Pod UID, restarts, and completion markers remain unchanged; the comparison uses the baseline timestamp as the log increment boundary. OOM, CrashLoop, traceback, active init/main failures, and changed completion signals remain blocking.

After deeper debugging, wait at least 20 seconds and compare against the initial report:

```bash
node scripts/sealos-log-scan.mjs \
  --namespace "$NAMESPACE" --app "$APP_NAME" \
  > /tmp/sealos-initial-baseline.json

STABILITY_SECONDS=20
sleep "$STABILITY_SECONDS"
node scripts/sealos-log-scan.mjs \
  --namespace "$NAMESPACE" --app "$APP_NAME" \
  --baseline /tmp/sealos-initial-baseline.json \
  --min-window-seconds "$STABILITY_SECONDS"
```

Extend `STABILITY_SECONDS` only when debugging a longer documented reconciliation, probe, queue, or scheduled-work period. Stable startup-probe and asynchronous Secret warnings become `historical-transient` after the referenced Secret exists, the Pod remains Ready, the Warning count and last-seen time stay fixed, and restart count stays fixed. A Warning advance, unresolved Secret, Pod replacement, Ready transition, or restart delta becomes `active-failure`.

For intentional fault injection, save a pre-injection report, perform the injection, recover to Ready, and capture a new recovery baseline. Run the final comparison against the recovery baseline after the full stability window. Keep the pre-injection report and injected symptoms as evidence of the controlled fault window.

## Private Object Storage Acceptance

Use this gate whenever object storage is enabled and the user asks for a deep verification:

1. Authenticate through the real application flow.
2. Upload a uniquely named file containing known bytes through the application UI or documented API.
3. Read or download the object through the application and compare the resulting bytes or SHA-256 digest with the original.
4. Confirm delivery uses the application's authenticated proxy or a time-bounded presigned URL.
5. Request the raw bucket/object endpoint anonymously and confirm access remains restricted with HTTP 401, 403, or an equivalent provider response.
6. Delete the smoke object through the application when deletion is supported.

For optional S3, validate both branches independently. The local branch exercises the same authenticated upload/read/content/deletion workflow against local persistence. The managed branch exercises the workflow against Sealos object storage, verifies managed Secret wiring, and proves private raw-object access. For S3-backed database apps, verify the KubeBlocks Secret keys and required database objects in the same run; bucket credentials and database readiness are separate contracts.

## Stuck Pod Debug Checklist

Use this checklist when a Pod stays Pending, Init, CrashLoopBackOff, or Ready=false.

- `describe pod` events, initContainer statuses, probes, and mounted volumes.
- Init logs for shell quoting issues, missing files, failed migrations, and database bootstrap errors.
- Main container logs after each template patch, including errors emitted after readiness succeeds.
- KubeBlocks Cluster readiness and database secret names.
- Warning Event count/last-seen deltas, Pod Ready transitions, restart deltas, and current existence of Secrets named in `secret not found` Events.
- Database objects required by the application. A completed or TTL-expired Job is historical evidence; the target DB state is the acceptance signal. PostgreSQL init Jobs wait for readiness and are idempotent; migration-dependent workers gate on required tables or markers.
- PVC binding, permissions, and init copy behavior.
- Instance and App resources, because Template API deployments include a Sealos Instance layer.
- ObjectStorageBucket resources and managed object-storage Secrets when the app uses S3.
