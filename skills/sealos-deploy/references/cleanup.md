# Cleanup

Use this file for the **cleanup** intent, or when a deploy test must delete Sealos resources.

## Safety

WARNING: Before you delete any resource, ask the user to reply `y` or `n`.

```
WARNING: About to delete <resource kind>/<resource name>. This data cannot be recovered. Confirm? (y/n)
```

If the user does not reply `y`, stop.

This rule applies even when a module says that a delete is useful.

All `kubectl` commands must use the Sealos kubeconfig:

```
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify
```

## Complete footprint

Deployments that use `scripts/deploy-template.mjs` create
`instances.app.sealos.io/<app-name>` plus App and workload resources. Phase 6
may also create a **pull Secret named exactly `$APP`** — the skill created it,
so cleanup must delete it.

A cleanup is not complete until you check all of these kinds:

- `instances.app.sealos.io`
- `apps.app.sealos.io`
- workloads (`statefulset`, `deployment`)
- `cronjob`, `job`
- `svc`
- `ingress`
- `pvc`
- `configmap`
- `secret` (at minimum the pull Secret named `$APP`)
- KubeBlocks `clusters.apps.kubeblocks.io` (database-backed apps)
- `objectstoragebuckets.objectstorage.sealos.io` (S3-backed apps)
- `pod` (verify only — pods disappear with their owners)

Anti-example: do not report cleanup complete after you only check
`app,statefulset,svc,ingress,pvc,pod`. That misses the Instance CR, Jobs,
KubeBlocks Clusters, buckets, and the pull Secret.

## Inventory before delete

Run the footprint script first when you can:

```bash
node "<SKILL_DIR>/scripts/sealos-footprint.mjs" --namespace "$NS" --app "$APP"
```

For Template API deployments, template resources carry the label
`cloud.sealos.io/deploy-on-sealos: <app-name>`. Prefer the label selector over
name matching:

```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify -n "$NS" \
  get instances.app.sealos.io,app,statefulset,deployment,cronjob,job,svc,ingress,pvc,configmap,secret \
  -l "cloud.sealos.io/deploy-on-sealos=$APP" 2>/dev/null
```

When resources are unlabeled, fall back to anchored name matching. Match
`$APP` exactly or as a `$APP-` prefix — a bare `grep "$APP"` also deletes
other apps that share the prefix:

```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify -n "$NS" \
  get instances.app.sealos.io,app,statefulset,deployment,cronjob,job,svc,ingress,pvc,pod \
  | grep -E "(^|/)${APP}(-|$|[[:space:]])"
```

Also list KubeBlocks Clusters and buckets when the app used them:

```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify -n "$NS" \
  get clusters.apps.kubeblocks.io,objectstoragebuckets.objectstorage.sealos.io 2>/dev/null
```

## Delete order

Template API deployments are owned by the Instance CR, and every template
resource — including StatefulSet `volumeClaimTemplates` PVCs — carries the
label `cloud.sealos.io/deploy-on-sealos: <app-name>`. Cleanup is therefore:
**delete the Instance (cascade), wait, sweep leftovers by label.**

After the user confirms:

```bash
K="KUBECONFIG=$HOME/.sealos/kubeconfig kubectl --insecure-skip-tls-verify -n $NS"

# 1. Instance CR — cascades to App, workloads, Services, Ingresses, Jobs,
#    ConfigMaps, and KubeBlocks Clusters via ownerReferences.
eval "$K delete instances.app.sealos.io/$APP --ignore-not-found --wait=false"

# 2. KubeBlocks Clusters finish Deleting in ~90s (terminationPolicy: Delete
#    also removes their data PVCs). Wait, then sweep what cascade cannot own:
#    StatefulSet volumeClaimTemplates PVCs are NOT owner-referenced, but they
#    are labeled — delete by label, never by name pattern.
sleep 90
eval "$K delete pvc,secret,configmap,job,cronjob \
  -l cloud.sealos.io/deploy-on-sealos=$APP --ignore-not-found --wait=false"

# 3. Pull secret created by Phase 6 (named exactly $APP, unlabeled)
eval "$K delete secret $APP --ignore-not-found --wait=false"
```

Anchored name matching (`grep -E "/${APP}(-|$)"`) misses
`volumeClaimTemplates` PVCs (`vn-<path>-<app>-0` puts the app name in the
middle) — that is why the label selector is mandatory for the sweep.

### Verify

A cleanup is complete only when both probes return nothing:

```bash
eval "$K get instances.app.sealos.io,app,statefulset,deployment,cronjob,job,svc,ingress,pvc,configmap,secret,clusters.apps.kubeblocks.io,objectstoragebuckets.objectstorage.sealos.io \
  -l cloud.sealos.io/deploy-on-sealos=$APP -o name" 2>/dev/null
eval "$K get instances.app.sealos.io,app,statefulset,deployment,job,svc,ingress,pvc,pods,clusters.apps.kubeblocks.io" 2>/dev/null \
  | grep -E "(^|/)${APP}(-|$|[[:space:]])"
```

KubeBlocks Clusters may show `Deleting` for a while — re-check until gone
instead of treating it as leftover.

Remove `.sealos/state.json` (and the bridge copy under
`~/.sealos/deployments/github.com/<owner>/<repo>/` for GitHub URL sources)
only when the user confirms they no longer need UPDATE mode for this app.
