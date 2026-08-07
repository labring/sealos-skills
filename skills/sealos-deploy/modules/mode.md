# Deployment Mode Detection

After preflight, determine whether this is a **first deploy** or an **update** of an existing deployment.

### Step 1: Check for previous deployment state

Read `.sealos/state.json` in `WORK_DIR`. If it exists and contains a `last_deploy` key with `app_name`, proceed to Step 2.

If no `last_deploy` key or file doesn't exist → proceed to **Step 1.5** (attempt discovery from cluster).

### Step 1.5: Discover existing deployment from cluster (migration)

Projects deployed by an older version of the skill may have no `last_deploy` section in state.json (or no state.json at all). If `ENV.kubectl` is true and `~/.sealos/kubeconfig` exists, attempt to discover an existing deployment by project name:

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

If `ENV.kubectl` is false:
- Inform user: `"Found previous deployment record for {app_name}, but kubectl is not available. Will create a new instance instead."`
- → **DEPLOY mode**

If `ENV.kubectl` is true, query the cluster:
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
| `.sealos/analysis.json` exists | Phase 1 completed | Ask user: skip assessment? |
| `Dockerfile` exists | Phase 3 completed | Skip Dockerfile generation |
| `.sealos/build/build-result.json` exists and `outcome: "success"` | Phase 4 completed | Ask user: skip rebuild? |
| `.sealos/template/index.yaml` exists | Phase 5 completed | Ask user: skip template generation? |

If any artifacts exist, report to user:
`"Found artifacts from a previous deploy attempt. [list found artifacts]."`
Ask: `"Resume from where it left off? Or restart from Phase 1?"`

If restart → remove `.sealos/analysis.json`, `.sealos/build/`, `.sealos/template/index.yaml` and start fresh.

---
