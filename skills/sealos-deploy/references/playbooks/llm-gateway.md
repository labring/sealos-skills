# LLM Gateway / Multi-Service SSR Web App Playbook

App-family playbook for split-service apps with a dashboard, REST API,
protocol gateway, docs service, and workers. Load on demand. See
`../live-smoke-playbooks.md` for when these checks apply.

Component checks:

- Dashboard/browser entry: visit both root and the App resource URL path from a fresh session.
- API service: check readiness and recent logs before and after login or signup.
- Gateway/API protocol service: check readiness and recent logs; do not require provider credentials for basic startup unless upstream requires them.
- Worker: inspect logs after API migrations complete and after one authenticated dashboard action.
- Docs/static service: verify it serves a page if exposed publicly.

Runtime acceptance:

- The App URL reaches login, signup, or setup without `Application error: a server-side exception has occurred`.
- For login-gated apps, complete signup or login, then open at least one authenticated dashboard page.
- One documented API negative route or unique missing static asset passes without traceback-style dashboard/API log noise.
- Recent dashboard, API, gateway, and worker logs are clear of recurring SSR, migration, auth/session, and service-to-service URL errors.
- Gateway or worker pods that depend on database migrations wait for required tables or migration markers, not only PostgreSQL readiness.
- Public browser URLs and internal service URLs are not mixed: browser-facing config uses public HTTPS hosts, while backend-to-backend config uses Kubernetes Service DNS.

Debug loop:

If the App URL shows `Application error: a server-side exception has occurred`, read dashboard/API logs first, then verify App URL path, public URL env vars, API backend URL, migration completion gates, and Redis/PostgreSQL readiness behavior before reporting success.
