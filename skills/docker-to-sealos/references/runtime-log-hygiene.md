# Runtime Log Hygiene

Use this reference when a live Sealos deployment reaches readiness but app logs still show recurring warnings, errors, tracebacks, or benign-looking route failures.

## Acceptance Pattern

Run log checks at three points for web applications:

1. After the first Ready state.
2. After setup, registration, or login.
3. After one random missing-path request such as `/__sealos_missing_<timestamp>`.

The random missing path should return HTTP 404 and leave recent application logs clear of traceback-style noise.

Treat these recurring signals as template failures until classified and fixed:

- `Traceback`
- `ERROR`
- `WARNING`
- `HTTPException`
- `werkzeug.exceptions.NotFound`
- `OOMKilled`
- `BackOff`
- migration, bootstrap, auth, permission, or database compatibility failures

## Flask, Superset, And AppBuilder

Flask-based applications may log framework-level exceptions for ordinary 404 requests. Superset and Flask-AppBuilder can emit `superset.views.error_handling:HTTPException` with `werkzeug.exceptions.NotFound` even when the browser behavior is correct.

Use exception-type filtering for benign 404 handling:

- Filter `werkzeug.exceptions.NotFound` from the noisy handler or logger.
- Keep other `HTTPException` classes visible.
- Apply the filter before handlers format the traceback.
- Re-run the random missing-path request after the patch.

For Superset templates, prefer a small `superset_config.py` logging filter that suppresses `NotFound` from the Superset error-handling logger and root handlers while keeping other HTTP errors and real exceptions visible.

## Runtime Dependency Installation

Runtime package installation is acceptable only when the upstream image requires a tiny compatibility package and rebuilding the image is outside the template scope.

Use quiet success behavior:

- Redirect installer stdout/stderr to a temporary log.
- Print the install log only when the command exits non-zero.
- Keep successful boot logs focused on app readiness and actionable warnings.

## Restricted-Compatible Security Context

When the image default UID is verified as non-root through image metadata, upstream docs, or `id` inside a live container, set restricted-compatible security context on managed app workloads and init Jobs:

- Pod level: `runAsNonRoot: true`, `runAsUser`, `runAsGroup`, `fsGroup`, `seccompProfile.type: RuntimeDefault`
- Container level: `allowPrivilegeEscalation: false`, `capabilities.drop: ["ALL"]`

When the image requires root or extra capabilities, document the runtime reason in template comments or review notes and keep the security context aligned with the verified image contract.

## Fix Loop

1. Capture pod status, init logs, main logs, and current App URL behavior.
2. Patch the template or mounted config.
3. Deploy fresh or roll the workload.
4. Complete setup/login and one authenticated action.
5. Request a random missing path.
6. Re-scan logs and footprint.
7. Report success only when the live flow and logs are both clean.
