# Deployment Mode Detection

After preflight, determine whether this is a **first deploy** or an **update** of an existing deployment.

### Step 1: Check for previous deployment state

Read `.sealos/state.json` in `WORK_DIR`. If it exists and contains a `last_deploy` key with `app_name`, proceed to Step 2.

If no `last_deploy` key or file doesn't exist → proceed to **Step 1.5** (attempt discovery from cluster).

### Step 1.5: Discover existing deployment from cluster (migration)

Projects deployed by an older version of the skill may have no `last_deploy` section in state.json (or no state.json at all). If `kubectl` is available and `~/.sealos/kubeconfig` exists, attempt to discover an existing deployment by project name:

```bash
# Derive the namespace from the sealos kubeconfig
NAMESPACE=$(KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  config view --minify -o jsonpath='{.contexts[0].context.namespace}' 2>/dev/null)

# Search for a deployment whose name starts with the repo name
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  get deploy -n "$NAMESPACE" \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.template.spec.containers[0].image}{"\n"}{end}' 2>/dev/null \
  | grep -i "^$REPO_NAME"
```

**If a match is found** (e.g., `evershop-uvbp0n0n	zhujingyang/evershop:20260309`):

1. Query the full details to reconstruct the `deployed` state:
```bash
# Get the ingress host
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  get ingress/<app_name> -n "$NAMESPACE" \
  -o jsonpath='{.spec.rules[0].host}' 2>/dev/null
```

2. Present to user for confirmation:
```
Found an existing deployment that appears to match this project:

  App:       evershop-uvbp0n0n
  Image:     zhujingyang/evershop:20260309
  URL:       https://evershop-4ha6b4mh.gzg.sealos.run
  Namespace: ns-qiqovyrm

  Is this the deployment you want to update? (y/n)
```

3. If user confirms → write the reconstructed `last_deploy` section to `.sealos/state.json` (create file if needed), then proceed to Step 2.

4. If user says no, or no match found → **DEPLOY mode** (skip to Resume Detection below).

### Step 2: Verify deployment is still running (requires kubectl)

If `kubectl` is unavailable:
- Inform user: `"Found previous deployment record for {app_name}, but kubectl is not available. Will create a new instance instead."`
- → **DEPLOY mode**

If `kubectl` is available, query the cluster:
```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  get deployment/<app_name> -n <namespace> \
  -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null
```

- Command fails (deployment deleted or kubeconfig expired) → **DEPLOY mode** (remove `.sealos/state.json` or clear `last_deploy`)
- Command returns current image → proceed to Step 3

### Step 3: Ask user

Present the detected state and let the user choose:

```
Detected existing deployment:
  App:   <app_name>
  Image: <image>
  URL:   <url>

  1. Update this deployment (rebuild & push new image)
  2. Deploy as a new instance

Default: Update
```

- User picks **Update** → **UPDATE mode** (jump to Update Path below)
- User picks **New instance** → **DEPLOY mode** (rename state.json to state.json.bak)

---

## Resume Detection

**Only applies in DEPLOY mode.** Check for artifacts from a previous incomplete deploy using file existence:

| Condition | Meaning | Behavior |
|-----------|---------|----------|
| `.sealos/state.json` has `last_deploy` | Already deployed | Enter UPDATE mode (handled above) |
| `.sealos/analysis.json` has `official_template` (including `null`) | Phase 1 completed | Ask user: skip assessment? |
| `.sealos/template/index.yaml` exists and `official_template` is a non-null URL | Official fast path may resume at Phase 5 | Ask user: resume from Phase 5? |
| `.sealos/analysis.json` has `deployment_plan` and `.sealos/phase-2/deployment-plan.json` exists | Phase 2 completed | Ask user: skip discover / image prep? |
| `.sealos/phase-3/build-result.json` exists, or Phase 2 plan has no build targets and Phase 3 was skipped | Phase 3 completed or not required | Ask user: skip rebuild? |
| `.sealos/template/index.yaml` exists without a non-null `official_template` | Phase 4 completed | Ask user: skip template generation? |

Do **not** treat a Phase 0-only `analysis.json` (only `runtime_profile`, `work_dir`, `repo_name`, `github_url`) as Phase 1 complete. Do not trust an `official_template` URL alone without `.sealos/template/index.yaml`.

If any later-phase artifacts exist, report to user:
`"Found artifacts from a previous deploy attempt. [list found artifacts]."`
Ask: `"Resume from where it left off? Or restart from Phase 1?"`

If restart → remove Phase 1+ fields by resetting to a fresh Phase 0 `analysis.json` (or delete it and re-run Phase 0), and remove `.sealos/phase-2/`, `.sealos/phase-3/`, `.sealos/phase-4/`, and `.sealos/template/index.yaml`.

---
