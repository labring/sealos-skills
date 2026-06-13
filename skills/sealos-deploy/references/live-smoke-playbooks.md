# Live Smoke Playbooks

Use these playbooks after a Sealos Template API deployment reaches rollout success. A running Pod is a scheduling signal; the acceptance signal is the real Sealos App entry URL, app logs, and the first meaningful user workflow.

## Runtime Truth Pass

Run this pass after Phase 6 for every deployment unless the user explicitly asks for deploy-only output.

1. Capture the namespace, app name, Instance name, and actual App URL from the Template API response or the `apps.app.sealos.io` resource.
2. Inspect runtime state with the Sealos kubeconfig:
   - `get pod,app,instances.app.sealos.io,svc,ingress,pvc`
   - `describe pod/<pod>`
   - initContainer logs and main container logs
   - KubeBlocks Cluster status for database-backed apps
3. Visit the actual App URL exactly as Sealos launches it. Test the root path and the configured App URL path when the app uses an entrance or safe-path mechanism.
4. For login-gated web apps, complete registration or login, confirm a token/session, and open at least one authenticated page or API route.
5. Scan recent logs after login. Treat recurring application errors as deployment failures even when all Pods are Running.
6. Inventory the full footprint before cleanup or handoff:
   - `instances.app.sealos.io`
   - `apps.app.sealos.io`
   - Deployments/StatefulSets/CronJobs/Jobs
   - Services/Ingresses
   - PVCs
   - KubeBlocks Clusters

## Stuck Pod Debug Checklist

Use this checklist when a Pod stays Pending, Init, CrashLoopBackOff, or Ready=false.

- `describe pod` events, initContainer statuses, probes, and mounted volumes.
- Init logs for shell quoting issues, missing files, failed migrations, and database bootstrap errors.
- Main container logs after each template patch, including errors emitted after readiness succeeds.
- KubeBlocks Cluster readiness and database secret names.
- Database objects required by the application. A completed or TTL-expired Job is historical evidence; the target DB state is the acceptance signal.
- PVC binding, permissions, and init copy behavior.
- Instance and App resources, because Template API deployments include a Sealos Instance layer.

## BillionMail

Final Sealos-compatible entry behavior:

- `SAFE_PATH` / `SafePath` is empty.
- `apps.app.sealos.io.spec.data.url` points to the root App URL.
- The app launches directly from the root path in Sealos.

Runtime acceptance:

- Pod reaches `9/9 Running` with zero crash loops after cold start.
- `GET /api/get_validate_code` returns a success response from the root App URL.
- `POST /api/login` succeeds with the generated admin credentials and returns a token/session.
- Recent logs are clear of repeated `pg_indexes`, relay compatibility, and `access denied` errors.

Database bootstrap acceptance:

- PostgreSQL contains the compatibility view `public.pg_indexes`.
- PostgreSQL contains relay compatibility objects such as `bm_relay_old` and `uk_relay_domain`.
- The application role search path resolves expected public schema objects.
- InitContainer bootstrap is idempotent and self-healing so a one-shot Job cleanup or TTL expiry does not hide drift.

## Generic Login-Gated Web App

Minimum smoke:

1. Load the real App URL.
2. Find the login, registration, setup, or bootstrap admin route from upstream docs, source, first-run page, or API traffic.
3. Complete the first-run setup or login with generated credentials.
4. Confirm success with one of:
   - HTTP 2xx JSON success flag
   - token/cookie/session persistence
   - authenticated page loads
   - authenticated API returns app data
5. Scan logs after the authenticated action.

For apps with path-based entrances, visit the exact path configured in the App resource and the root URL. Pick the App URL that succeeds from a fresh browser session.
