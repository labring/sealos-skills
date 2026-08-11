# BillionMail Playbook

App-specific deep-verification playbook. Load only when deploying or debugging
BillionMail. See `../live-smoke-playbooks.md` for when these checks apply.

Final Sealos-compatible entry behavior:

- `SAFE_PATH` / `SafePath` is empty.
- `apps.app.sealos.io.spec.data.url` points to the root App URL.
- The app launches directly from the root path in Sealos.
- Main container uses `workingDir: /opt/billionmail/core` with only the short wrapper `mkdir -p template && exec ./billionmail`.
- Data preparation, certificate/log-file setup, PostgreSQL compatibility objects, and relay/search-path repair are handled by initContainers or Jobs, not by the main container startup command.

Runtime acceptance:

- Pod reaches `9/9 Running` with zero crash loops after cold start.
- `GET /api/get_validate_code` returns a success response from the root App URL.
- `POST /api/login` succeeds with the generated admin credentials and returns a token/session.
- At least one authenticated API succeeds after login, such as `/api/languages/get`, `/api/settings/get_system_config`, or `/api/domains/list`.
- One documented API negative route or unique missing static asset passes without traceback-style log noise.
- Recent logs are clear of repeated `pg_indexes`, relay compatibility, and `access denied` errors.
- Live pod spec confirms the main container command remains a short exec wrapper and does not contain file preparation, permission repair, or database bootstrap.

Database bootstrap acceptance:

- PostgreSQL contains the compatibility view `public.pg_indexes`.
- PostgreSQL contains relay compatibility objects such as `bm_relay_old` and `uk_relay_domain`.
- The application role search path resolves expected public schema objects.
- InitContainer bootstrap is idempotent and self-healing so a one-shot Job cleanup or TTL expiry does not hide drift.

Bootstrap quoting guidance:

- Avoid PL/pgSQL `DO $$ ... $$` blocks in inline shell commands when a shell-level idempotency check can express the same logic.
- Use `psql -tAc "SELECT ..."` plus guarded `psql -c` or single-quoted heredocs for idempotent object creation.
- Use `psql -v name=value` variable interpolation inside heredocs for sensitive SQL values such as passwords. Do not rely on `psql -c "ALTER ROLE ... :'var'"`; psql colon variables are not expanded in that form.
