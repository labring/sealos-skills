# Phase 5.5: Interactive Configuration

After generating the template, guide the user through application configuration before deployment.
This is a **critical** step — most applications need user-specific configuration to function properly.

Before categorizing inputs, load `<SKILL_DIR>/../docker-to-sealos/references/bootstrap-account-modes.md` and classify the exact selected release as functional first-user signup, mandatory bootstrap credentials, or optional root reconciliation. For mandatory bootstrap, record whether credentials are deployer-supplied or runtime-generated. Record the selected mode in the deployment analysis.

### 5.5.1 Extract Configuration from Template

Parse the generated template YAML and categorize all environment variables and inputs:

**Category A — Auto-managed (no user action needed):**
- `defaults.*` values: `app_name`, `app_host`, random passwords/keys (`${{ random(N) }}`)
- Database connections via `secretKeyRef`: host, port, username, password from Kubeblocks secrets
- Object storage credentials via `secretKeyRef`
- Composed URLs that reference auto-managed vars (e.g., `DATABASE_URL` built from `$(DB_HOST):$(DB_PORT)`)
- Internal service FQDNs (`*.${{ SEALOS_NAMESPACE }}.svc.cluster.local`)
- Functional first-user signup: the registration flow owns the initial account, so optional administrator/root inputs and bootstrap env/config are absent
- Runtime-generated mandatory bootstrap: the selected runtime deterministically constructs the exact documented credential format, retains the resolved credential in a Secret or documented live runtime source, and exposes no administrator input unless deployer selection is documented

**Category B — User-required inputs:**
- Template `inputs` with `required: true` and no sensible default
- Template `inputs` with `required: true` and `default: ''` for non-administrator fields; the empty default means the deployer must provide the value before deploy
- Deployer-supplied mandatory bootstrap identity/password inputs: every documented field is required, omits `default`, and carries the exact upstream constraints in its English description
- Env vars with empty or placeholder values that the app cannot function without
- Common examples: mandatory bootstrap username/email/password, external API keys (OpenAI, SMTP credentials, OAuth client ID/secret)

**Category C — Optional with defaults:**
- Template `inputs` with `required: false` and reasonable defaults
- Env vars user might want to customize but app works without changes
- Common examples: log level, feature toggles, upload size limits, signup enabled/disabled

**Category D — Fixed values (informational):**
- Hardcoded env vars like `NODE_ENV=production`
- Port numbers, internal paths

### 5.5.2 Present Configuration Summary

Display a structured summary to the user. Example:

```
Configuration for <app-name>:

  Auto-configured (no action needed):
    - APP_NAME: unique generated name
    - DB credentials: from PostgreSQL service (auto-provisioned)
    - SECRET_KEY: auto-generated 32-char random string
    - REDIS_URL: auto-composed from service credentials

  Requires your input:
    1. ADMIN_USERNAME — Administrator login username (required)
    2. ADMIN_PASSWORD — Administrator login password (required)
    3. OPENAI_API_KEY — OpenAI API key for AI features (required)

  Optional (defaults shown, customize if needed):
    - LOG_LEVEL: "info"
    - MAX_UPLOAD_SIZE: "10M"
    - ENABLE_SIGNUP: "true"
```

### 5.5.3 Collect User Input

**For required inputs:**
1. Ask the user for each value
2. If user doesn't have a value, explain what it's used for and how to obtain it
   - Example: "OPENAI_API_KEY is needed for AI features. Get one at https://platform.openai.com/api-keys"
3. If user wants to skip a feature-gating input (e.g., SMTP), explain which features will be unavailable and set an empty value
4. For deployer-supplied mandatory bootstrap credentials, collect every documented identity/password field, validate each value against the exact selected-release rules, and preserve the value byte-for-byte through Template API args and live login.

**For optional inputs:**
1. Show the default values
2. Ask: "Do you want to change any of these? (press Enter to keep defaults)"
3. Only update values the user explicitly wants to change

**For unfamiliar env vars:**
If the AI is unsure what a variable does, read the project README, `.env.example`, or source code to explain it to the user before asking for a value.

### 5.5.4 Apply Configuration to Template

Keep user-required `inputs` definitions in the template and pass user-provided values through Template API args. The following example represents a deployer-supplied mandatory bootstrap flow; replace its description constraints with the exact selected-release rules:

```yaml
inputs:
  ADMIN_USERNAME:
    description: 'Administrator login username'
    type: string
    required: true
  ADMIN_PASSWORD:
    description: 'Administrator password. Use 12-128 characters including uppercase, lowercase, number, and symbol.'
    type: string
    required: true
```

Record all user choices as `CONFIG` for use in Phase 6:
```
CONFIG.args = { ADMIN_USERNAME: "admin", ADMIN_PASSWORD: "<secret>", OPENAI_API_KEY: "sk-..." }
```
These `args` will be passed to the Template API's `args` field (Phase 6.2), which overrides or supplies `spec.inputs` in the template.

For runtime-generated mandatory bootstrap, keep administrator inputs absent unless the selected release documents deployer selection. Construct and validate the exact documented credential format before the server starts, retain the resolved credential in a Kubernetes Secret or documented live runtime source, and reserve retrieval for the redacted live login smoke.

### 5.5.5 Deployment Confirmation

Immediately before presenting the deployment confirmation, run the complete quality gate again against the exact final template:

For deployer-supplied mandatory bootstrap credentials, complete the release-specific value validation first. A validation failure returns to Phase 5.5.3 while preserving the user's original value for correction and keeping credentials out of logs. For runtime-generated mandatory bootstrap, verify deterministic format construction, startup validation, and resolved-credential retention before deployment.

```bash
"$PYTHON_BIN" "<SKILL_DIR>/../docker-to-sealos/scripts/quality_gate.py" \
  --artifacts "$WORK_DIR/.sealos/template/index.yaml"
```

This final run is required even if Phase 5.3 already passed. Any non-zero exit stops the workflow before Phase 6; fix the existing template and rerun the gate. Do not deploy while the gate is failing.

After the final gate passes, present a summary and ask for confirmation:

```
Ready to deploy <app-name> to Sealos Cloud:

  Image:    zhujingyang/app:20260309
  Region:   https://usw-1.sealos.io
  Database: PostgreSQL 16 (auto-provisioned)
  Config:   3 required inputs configured, 2 optional defaults kept

  Proceed with deployment? (y/n)
```

Wait for user confirmation before continuing to Phase 6.

Configuration is applied directly to `.sealos/template/index.yaml`. No separate checkpoint — the template contains the final configured state.

---

