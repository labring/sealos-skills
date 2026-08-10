# Phase 5: Pre-deploy preparation

Fixed order: **server-side dry-run → collect configuration → confirm and write**.

Do not create cloud resources. Do not rewrite delivery bytes in
`.sealos/template/index.yaml` except authorized schema repairs. Do not use Template
API `dryRun` as this gate. Do not ask for group-B values before dry-run passes.

`server_dry_run.py` is **not landed yet**. Until it is, the main agent executes the
steps in this module (and the full contract in the docs repo
`specs/server-dry-run`). When the script exists, call it instead of hand-rolling
the kubectl loop.

## Inputs

| Input | Source |
|-------|--------|
| Template | `.sealos/template/index.yaml` (Phase 1 official fetch or Phase 4) |
| User overrides | `.sealos/config.json` when present (only **after** dry-run) |
| Kube identity | Phase 0 (`local`: `KUBECONFIG=~/.sealos/kubeconfig`) |
| Cloud domain / cert Secret | Workspace injection or Phase 0 resolution |

## Outputs

| Output | Path / form |
|--------|-------------|
| `CONFIG.args` | In-memory / private args file for Phase 6 (not committed) |
| User confirmation | Explicit deploy approval |
| Prepare result | `.sealos/phase-5/prepare-result.json` |
| Schema repair auth (optional) | `.sealos/schema-repair-authorization.json` |

## Path dependency gate

| Need | Tools |
|------|-------|
| Always | `kubectl` against the target Sealos context |
| Template parse | Python 3.8+ with PyYAML (or equivalent) |

Ask once to install; refuse or recheck failure → **STOP**.

## Phase constraints

| ID | Constraint |
|----|------------|
| P5-01 | Do not create cloud resources |
| P5-02 | Do not rewrite delivery template bytes (authorized schema repair only) |
| P5-03 | Template must already exist from Phase 1 or Phase 4 |
| P5-04 | Explicit user deploy confirmation required before Phase 6 |
| P5-05 | Precheck = target-cluster server-side dry-run (not Template API dryRun) |
| P5-06 | Dry-run before config collection |

## Procedure

### 1. Preconditions

If `.sealos/template/index.yaml` is missing → return to Phase 1 or Phase 4.
Do not start this phase.

Record delivery `template_sha256` (lowercase hex) before any work:

```bash
TEMPLATE="$WORK_DIR/.sealos/template/index.yaml"
TEMPLATE_SHA256="$(shasum -a 256 "$TEMPLATE" | awk '{print $1}')"
```

### 2. Target-cluster server-side dry-run (agent steps)

Full normative contract: docs `specs/server-dry-run` (ZH) /
`en/specs/server-dry-run` (EN). Summary the agent must perform:

1. Resolve target context, namespace, service account, `SEALOS_CLOUD_DOMAIN`,
   `SEALOS_CERT_SECRET_NAME`. Missing any → **STOP** (do not guess).
2. Create a private temp dir (`0700`). Copy/render **privately** with defaults,
   synthetic non-secret inputs, built-ins, and reachable conditional scenarios.
   Do **not** use real user secrets. Do **not** mutate the delivery template.
3. Skip every `kind: Template` document.
4. For each unique runtime document:

   ```bash
   KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
     --context "$TARGET_CONTEXT" apply \
     --dry-run=server \
     --validate=strict \
     -o name \
     -n "$TARGET_NAMESPACE" \
     -f "$ONE_PRIVATE_DOCUMENT"
   ```

5. Classify warnings vs blocking failures per the server-dry-run spec.
   Only repairable `schema` failures may change the unresolved delivery template,
   and only with authorization recorded under
   `.sealos/schema-repair-authorization.json`. After an authorized repair, rerun
   the Phase 4 deploy-gate subset on the delivery template, then rerun dry-run for
   every scenario.
6. Delete the private temp dir. Confirm delivery `sha256` matches the pre-gate
   value unless an authorized repair intentionally changed it (then re-record).
7. Gate failure → **STOP**. Do **not** collect configuration. Do **not** write
   `dry_run: "passed"`.

When `scripts/server_dry_run.py` lands, replace steps 2–6 with that helper and keep
the same stop conditions.

### 3. Collect configuration (only after dry-run passes)

Before classifying inputs, read:

```
<SKILL_DIR>/../docker-to-sealos/references/bootstrap-account-modes.md
```

Classify the selected release as: functional first-user signup, deployer-supplied
mandatory bootstrap, runtime-generated mandatory bootstrap, or optional root
reconciliation. Record the mode in the deploy log / analysis notes.

Parse `defaults`, `inputs`, and env from the **unresolved** delivery template.

| Group | Rules |
|-------|-------|
| A — Auto-managed | `defaults.*` (`app_name`, `app_host`, `${{ random(N) }}`); DB / object-storage via `secretKeyRef`; URLs composed from auto-managed vars; internal Service FQDNs (`*.${{ SEALOS_NAMESPACE }}.svc.cluster.local`). First-user signup: omit optional admin/root inputs. Runtime-generated mandatory bootstrap: runtime builds/retains credential; no admin input unless deployer selection is documented. |
| B — User-required | `inputs` with `required: true` and no sensible default; or `required: true` with `default: ''` on non-admin fields. Deployer-supplied mandatory bootstrap: every documented identity/password field required, no `default`, English `description` carries upstream constraints. Empty/placeholder env the app cannot run without. |
| C — Optional | `required: false` with reasonable defaults. |
| D — Fixed | Hardcoded env (e.g. `NODE_ENV=production`), ports, internal paths. |

Collection order:

1. Show A–D summary and any dry-run warnings. State which B fields are required.
2. Collect each B value. Explain purpose / how to obtain if missing. Feature-gating
   skips (e.g. SMTP) → explain unavailable features and allow empty. Deployer
   mandatory bootstrap → validate each field against selected-release rules;
   preserve values byte-for-byte for Template API `args` and later login.
3. Show C defaults; change only on explicit user request.
4. For unfamiliar env vars, read README / `.env.example` / source before asking.
5. Mask secrets in logs and summaries.
6. Record choices as `CONFIG.args` for Phase 6. Prefer a private args file
   (`0600`) over printing values. **Do not** rewrite delivery template bytes to
   collect inputs.

If `.sealos/config.json` exists, apply its overrides only in this step (after
dry-run), never by mutating the template for collection.

### 4. Confirm and write `prepare-result.json`

1. Show region, images, dependencies, and final configuration summary (secrets masked).
2. Wait for explicit deploy approval. Refusal → **STOP**.
3. Recompute delivery `template_sha256` (must match the post-dry-run delivery file).
4. Write:

```bash
mkdir -p "$WORK_DIR/.sealos/phase-5"
```

```json
{
  "template_sha256": "<lowercase hex sha256 of .sealos/template/index.yaml>",
  "dry_run": "passed",
  "user_confirmed": true
}
```

Write `dry_run: "passed"` **only** after step 2 succeeded. Never invent it.

### 5. Validate

```bash
node "<SKILL_DIR>/scripts/validate-phase-5.mjs" --dir "$WORK_DIR"
```

| ID | Check |
|----|-------|
| P5-V01 | `.sealos/template/index.yaml` exists |
| P5-V02 | `.sealos/phase-5/prepare-result.json` passes schema |
| P5-V03 | `template_sha256` matches the current template file |
| P5-V04 | `dry_run` is `passed` and `user_confirmed` is `true` |
| P5-V05 | Attestation: `dry_run: "passed"` implies step 2 completed (do not write otherwise) |

On failure, do not **CONTINUE → Phase 6**.

## Stop conditions

| Result | Condition |
|--------|-----------|
| **CONTINUE → Phase 6** | Dry-run passed, config collected, user confirmed, validate-phase-5 passed |
| **STOP** | Missing target identity, render/dry-run failure, user refuses inputs or deploy |

## Notes for Phase 6

- Deploy the **same unresolved** `.sealos/template/index.yaml` bytes hashed in
  `prepare-result.json`.
- Pass `CONFIG.args` via `deploy-template.mjs --args-file` (private file).
- Do not re-run `quality_gate.py` as a Phase 5 substitute.
