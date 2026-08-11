# Generic Login-Gated Web App Playbook

App-family playbook for login-gated web apps, including cookie + dynamic CSRF
login and the Syncthing GUI. Load on demand. See `../live-smoke-playbooks.md`
for when these checks apply.

## Minimum smoke

1. Load the real App URL.
2. Find the login, registration, setup, or bootstrap admin route from upstream docs, source, first-run page, or API traffic.
3. Complete the selected first-user signup or mandatory bootstrap login with the exact credentials for that flow.
4. Confirm success with one of:
   - HTTP 2xx JSON success flag
   - token/cookie/session persistence
   - authenticated page loads
   - authenticated API returns app data
5. Request a documented API negative route or unique missing static asset and confirm the expected 404 response.
6. Scan logs after the authenticated action and missing-path request.

For apps with path-based entrances, visit the exact path configured in the App resource and the root URL. Pick the App URL that succeeds from a fresh browser session.

For SPA/browser shells, arbitrary client routes can intentionally fall back to the shell with HTTP 200. Use a unique missing static asset or a documented API path for the negative-route check, then inspect content and logs together.

## Cookie + Dynamic CSRF Login

Use `scripts/sealos-live-smoke.mjs --login-method cookie-json` for apps whose root page sets a CSRF cookie and whose login API expects a matching dynamic header.

Pass credentials through a mode-0600 JSON file — never on the command line
(argv is visible to every local process):

```bash
CRED_FILE=$(mktemp "${TMPDIR:-/tmp}/sealos-smoke-cred.XXXXXX")
chmod 600 "$CRED_FILE"
printf '{"username":"%s","password":"%s"}\n' "$GUI_USERNAME" "$GUI_PASSWORD" > "$CRED_FILE"

node scripts/sealos-live-smoke.mjs \
  --url "https://<app>.<domain>" \
  --login-method cookie-json \
  --csrf-cookie-prefix "CSRF-Token-" \
  --csrf-header-prefix "X-CSRF-Token-" \
  --login-path "/rest/noauth/auth/password" \
  --credentials-file "$CRED_FILE" \
  --auth-path "/rest/system/status,/rest/system/connections"

rm -f "$CRED_FILE"
```

The helper loads the root page, stores cookies, maps `CSRF-Token-<id>` to `X-CSRF-Token-<id>`, posts JSON credentials, keeps the session cookie, and reuses the dynamic CSRF header on authenticated paths.

## Syncthing GUI

Runtime acceptance:

- `/rest/noauth/health` returns HTTP 200.
- Root HTML exposes the login form.
- `POST /rest/noauth/auth/password` returns HTTP 204 with the deploy-time GUI username/password.
- Authenticated `/rest/system/status` and `/rest/system/connections` return HTTP 200.
- One authenticated documented API negative route returns HTTP 404.
- Logs stay clear after login and the missing-path request.
- A 20-second settle window keeps the Pod `1/1 Running` with zero restarts.
