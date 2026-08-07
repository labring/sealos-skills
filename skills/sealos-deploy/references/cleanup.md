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

## Instance CR requirement

Deployments that use `scripts/deploy-template.mjs` create `instances.app.sealos.io/<app-name>` plus App and workload resources.

A cleanup is not complete until you check all of these kinds:

- `instances.app.sealos.io`
- `apps.app.sealos.io`
- workloads (`statefulset`, `deployment`)
- `svc`
- `ingress`
- `pvc`
- `pod`

Anti-example: do not report cleanup complete after you only check `app,statefulset,svc,ingress,pvc,pod`. That miss leaves `instances.app.sealos.io/<app-name>` in place.

## Inventory before delete

Run the footprint script first when you can:

```bash
node "<SKILL_DIR>/scripts/sealos-footprint.mjs" --namespace "$NS" --app "$APP"
```

For Template API test deployments, you can also list:

```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify -n "$NS" \
  get instances.app.sealos.io,app,statefulset,deployment,svc,ingress,pvc,pod | grep "$APP"
```

## Delete order

After the user confirms, delete in this order:

```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify -n "$NS" delete instances.app.sealos.io "$APP" --ignore-not-found --wait=false
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify -n "$NS" delete app "$APP" --ignore-not-found --wait=false
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify -n "$NS" delete statefulset "$APP" --ignore-not-found --wait=false
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify -n "$NS" delete deployment "$APP" --ignore-not-found --wait=false
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify -n "$NS" delete ingress "$APP" --ignore-not-found --wait=false
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify -n "$NS" delete svc "$APP" --ignore-not-found --wait=false
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify -n "$NS" get pvc -o name | grep "$APP" | while read -r PVC; do
  KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify -n "$NS" delete "$PVC" --ignore-not-found --wait=false
done
```

Then make sure that the Instance, App, workloads, Services, Ingresses, PVCs, and Pods for `$APP` are gone.
