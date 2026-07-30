# Prepare Pipeline

Run after Phase 0 has produced a complete source worktree. This branch has one
mode and one terminal state: prepare a validated Sealos Template and delivery
artifacts, then stop.

There is no deployment-state detection, UPDATE path, cloud login, final
`kubectl apply`, Template API call, rollout, rollback, or runtime verification.
Kubernetes is used only as the Kaniko build executor when source images are
missing.

`<SKILL_DIR>` is the directory containing this skill.

## Artifact Contract

Create `.sealos/` only after the Phase 1 opening judgment continues:

```text
<WORK_DIR>/.sealos/
├── analysis.json
├── template-references.json
├── template-references/
├── deployment-source/
│   ├── rendered.yaml
│   └── resource-map.json
├── topology-evidence/
│   └── <app-name>.yaml
├── build-request.json
├── build-result.json
├── kaniko/
│   └── <artifact-key>/...
├── template/
│   └── index.yaml
└── delivery-manifest.json
```

`deployment-source`, topology evidence, and service-private Kaniko files exist
only when required by the selected route. The six invariant final paths are:

```text
.sealos/analysis.json
.sealos/template-references.json
.sealos/build-request.json
.sealos/build-result.json
.sealos/template/index.yaml
.sealos/delivery-manifest.json
```

Validate governed JSON with:

```bash
node "<SKILL_DIR>/scripts/validate-artifacts.mjs" --dir "$WORK_DIR"
```

The schemas cover:

- `config.json`
- `analysis.json`
- `template-references.json`
- `build-request.json`
- `build-result.json`
- `delivery-manifest.json`

Writers validate on write. Readers validate before trusting an existing
artifact.

## Project Configuration

Read optional `.sealos/config.json` before analysis. User-provided values take
priority over script detection and AI inference:

```json
{
  "port": 8080,
  "public_service": "frontend",
  "deployment_source": {
    "kind": "helm",
    "path": "charts/platform"
  },
  "node_version": "20",
  "start_command": "node dist/main.js",
  "build_command": "pnpm build:prod",
  "system_deps": ["ffmpeg"],
  "base_image": "node:20-slim",
  "env_overrides": {
    "NODE_ENV": "production"
  },
  "skip_phases": ["assess"]
}
```

`skip_phases: ["assess"]` may reuse or skip scoring, but it never skips the
opening impossibility judgment. A deliberately skipped required phase cannot
produce a completed delivery.

## Resume Rules

Existing files are hints, not proof:

- Always repeat the Phase 1 opening judgment.
- Reuse analysis only when the exact source ref, worktree content, source
  route, and project config are unchanged and the user accepts reuse.
- Always refresh and verify the official catalog before trusting an existing
  official-template decision. Local JSON plus local YAML cannot prove
  official provenance.
- Rebuild every `build-required` service unless an independently verified
  content fingerprint proves the old result represents the current worktree.
  The current aggregate contract does not carry such a fingerprint, so an old
  matching path or Git ref alone is insufficient.
- A standard-route Template is reusable only when it is newer than all current
  build results, references exactly those immutable images and pull-Secret
  requirements, matches the current deployment-source hash, and passes the
  complete quality gate.

Regenerate owned files atomically. Do not reset or clean the project. Ask
before deleting previous artifacts or Kubernetes resources.

---

## Phase 1: Assess

### Opening Judgment

Ask one internal question:

> Am I certain this selected repository has no reasonable online form that can
> run on Sealos?

Treat the repository as a source boundary. Inspect child applications,
documentation, static output, Storybook, examples, APIs, workers, and declared
multi-service runtimes.

- If certainty is yes, give one short concrete reason and stop.
- Otherwise say nothing about this judgment and continue.

Do not create a classifier, candidate-list artifact, extra score, prompt, or
file for this judgment. Uncertainty always continues.

### Readiness Scoring

Run:

```bash
node "<SKILL_DIR>/scripts/score-model.mjs" "$WORK_DIR"
```

The six dimensions total 0–12; the result is advisory evidence.

- Score below 4: warn with the concrete weak dimensions and continue.
- Score 4 or above: continue and carry risks forward.

Use
`<SKILL_DIR>/../cloud-native-readiness/knowledge/criteria.md` and
`anti-patterns.md` for uncertain assessments.

### AI Assessment

Combine deterministic signals with direct repository evidence to establish:

- meaningful deployable shape and services
- language, frameworks, package manager, and runtime version
- build contexts, commands, outputs, and entrypoints
- ports and public entry
- database and infrastructure dependencies
- environment variables classified as `auto`, `required`, or `optional`
- complexity tier

Do not invent a familiar stack when facts are unknown. A static project may
validly record HTML/CSS/JavaScript with no package manager. A missing root
runtime is not a blocker when project evidence supports a child or generated
static runtime.

Use `.env.example`/`.env.sample`, selected source environment declarations,
README configuration sections, and source-level environment access as
evidence. `auto` means the Template can derive or generate the value;
`required` means downstream must collect it; `optional` means a documented
sensible default exists.

### Write `analysis.json`

Write the current analysis schema shape:

```json
{
  "generated_at": "<ISO timestamp>",
  "project": {
    "github_url": "<normalized URL>",
    "work_dir": "<absolute path>",
    "repo_name": "<repository name>",
    "branch": "<branch or null>"
  },
  "score": {
    "total": 0,
    "raw_score": 0,
    "bonus": 0,
    "verdict": "<verdict>",
    "dimensions": {
      "statelessness": 0,
      "config": 0,
      "scalability": 0,
      "startup": 0,
      "observability": 0,
      "boundaries": 0
    }
  },
  "language": null,
  "all_languages": [],
  "framework": null,
  "package_manager": null,
  "port": null,
  "databases": [],
  "runtime_version": {},
  "env_vars": {},
  "has_dockerfile": false,
  "complexity_tier": "L1",
  "image_ref": null,
  "image_inventory": [],
  "service_inventory": []
}
```

Copy the score helper's `score`, `raw_score`, and `bonus` exactly. The semantic
validator requires `raw_score` to equal the six dimensions and `total` to equal
`min(12, raw_score + bonus)`.

Present only a concise analysis summary and continue.

---

## Phase 1.5: Exact Official Template

Ask whether one official Template can be reused exactly. The configured
catalog is `labring-actions/templates` at its configured ref.

An automatic fast path requires all of:

1. the official remote is refreshed in this run and its origin, commit, and
   clean sparse checkout are verified;
2. exactly one Template `spec.gitRepo` matches the normalized repository;
3. the selected deployable target is the repository root;
4. reuse does not discard current source intent.

For a local checkout, the pre-artifact snapshot must be clean on its tracked
default branch with `HEAD` equal to upstream. Custom branches, local changes,
detached or unknown upstream, pre-existing prepare artifacts, project config
overrides, a selected subtree, or an explicit request for current source
disable reuse. A fresh unqualified GitHub clone may enable it.

Set `REUSE_OFFICIAL_TEMPLATE=true` only when all of those conditions are
proven; otherwise set it to `false`. Uncertainty always selects the standard
pipeline.

Run:

```bash
node "<SKILL_DIR>/scripts/find-template-references.mjs" \
  --work-dir "$WORK_DIR" \
  --skill-dir "<SKILL_DIR>" \
  --analysis "$WORK_DIR/.sealos/analysis.json" \
  --github-url "$GITHUB_URL" \
  --reuse-official-template "$REUSE_OFFICIAL_TEMPLATE"
```

Read the validated `decision.route`; never infer it from file existence.

### `deploy_official_template`

The helper copies the unique official YAML verbatim and atomically to
`.sealos/template/index.yaml`. Skip Phases 2–5.

Write aggregate build-request version `2.0` with:

- `route: "official-template"`
- the resolved sandbox source identity
- `primary_service: null`
- `services: []`

Initialize the result without running Kubernetes:

```bash
node "<SKILL_DIR>/../k8s-kaniko-job/scripts/write-result.mjs" \
  --request "$WORK_DIR/.sealos/build-request.json" \
  --out "$WORK_DIR/.sealos/build-result.json" \
  --initialize true
```

Validate the copied YAML. If it cannot pass the final non-mutating Template
checks, disable reuse and continue the standard route; do not silently edit the
official copy while claiming verbatim provenance.

Then continue to Phase 6.

### `continue_standard_pipeline`

Do not materialize catalog YAML. Continue to Phase 2. A catalog fetch or parse
failure is non-blocking. Multiple exact matches never select the first.
Cached/local matches may be recorded for diagnostics but cannot enable direct
reuse.

Similar-template matching is not implemented. Do not search for or consume
structurally similar catalog YAML.

---

## Phase 2: Discover Images And Preserve Topology

Answer separately:

1. Which images does the repository declare?
2. Which capabilities and services must remain in the final deployment?

Run:

```bash
node "<SKILL_DIR>/scripts/detect-image.mjs" "$GITHUB_URL" "$WORK_DIR"
```

For a local project without a URL:

```bash
node "<SKILL_DIR>/scripts/detect-image.mjs" "$WORK_DIR"
```

The detector first selects the deployment source with
`inspect-deployment-source.mjs`:

- canonical root Compose
- selected Helm chart
- selected Kubernetes source
- `implicit-single-service`

Helm is copied to a system temporary directory, dependencies are materialized
there, and `helm template --no-hooks` renders it. Helm and native Kubernetes
routes atomically write `.sealos/deployment-source/rendered.yaml`. Never run
`helm install` or mutate the source chart.

### Image Evidence

Use project declarations only, in this order:

1. README remote pull/run instructions
2. CI publish destinations
3. every Compose image and build-only service
4. every rendered Helm workload container
5. every selected Kubernetes workload container

Keep all evidence and topology even when one primary image is unambiguous. Do
not guess registry names from the GitHub owner/repository. Dockerfile `FROM`
images are bases, not published project images.

Resolve the exact declared selector. Tags such as `latest`, `stable`, `v2`,
exact versions, digests, and omitted tags are all valid inputs. Verify manifest
body and registry digest agreement, then record
`repository@sha256:<digest>`. Do not substitute a different tag and do not
pre-screen third-party images by architecture.

Anonymous resolution failure makes only that image unavailable. Preserve its
service and build it when source exists. Never print or persist registry
credentials.

### Complete Topology

Preserve all required application, database, worker, proxy, gateway, queue,
cache, search, storage, and infrastructure capabilities.

- Supported database services prefer their KubeBlocks equivalents in Phase 5
  unless source semantics require a raw workload.
- An edge proxy may become equivalent Service/Ingress routing only when the
  replacement preserves its behavior.
- Every other retained container service follows the same image reuse/build
  decision regardless of role.

An implicit source does not authorize a guessed root service. Use repository
evidence to populate the real services in `analysis.json`.

### Update Analysis

Copy the selected `deployment_source`, complete `image_inventory`, and
completed `service_inventory` into `analysis.json`. Reconcile database facts.
Set top-level `image_ref` only when one application image is unambiguous.

For every final container service:

- verified immutable image → `image_status: "verified"`
- missing/unavailable image with buildable source → `image_status:
  "build_required"`
- supported database converted to a managed resource → retain it in topology,
  set its container-image fields and build plan to `null`, and exclude its
  original container from the build route

Finding one image never skips the rest of a multi-service project.

---

## Phase 3: Prepare Per-Service Build Inputs

Run for every final container service at `image_status: "build_required"`.
Read:

```text
<SKILL_DIR>/modules/dockerfile-integration.md
```

Normalize each plan in `analysis.json`:

```json
{
  "context": "services/api",
  "dockerfile": "docker/Dockerfile.prod",
  "target": "runtime",
  "args": ["NODE_ENV", "PUBLIC_BASE_URL"],
  "origin": "existing"
}
```

`context` is relative to `WORK_DIR`; `dockerfile` is relative to that context.
Keep build-argument names only.

Preserve an existing effective Dockerfile and `.dockerignore` by default.
Repair only a certain blocker or a concrete failure from that service's
Kaniko build. Generate a Dockerfile only when missing, using current
dockerfile-skill templates as knowledge and adapting them to the proven
workspace, command, output, runtime, port, and dependency boundary.

Phase 3 does not build, run, deploy, create Compose, create `.env`, or write a
standalone Dockerfile report.

---

## Phase 4: Resolve Every Container Image

### 4.0 Write The Aggregate Request

Create one version `2.0` `.sealos/build-request.json` covering every final
container service on the standard route.

Set top-level `primary_service` to the requested service that represents the
application in Brain's build summary. Prefer the proven public entry; otherwise
use the principal application workload. It must match exactly one
`services[].name`. This does not remove or deprioritize any other service.

Resolve the injected token's GitHub login through the GitHub API without
printing the token. Lowercase the GHCR namespace. Each service gets a unique
tagged build target:

```text
ghcr.io/<login>/<repo>-<artifact-key>:prepare-<timestamp>-<random>
```

The implicit single application may omit the service suffix when it equals the
repository name. `artifact_key` must be stable, lowercase, filesystem-safe, and
unique.

For a reused service:

```json
{
  "name": "database",
  "artifact_key": "database",
  "role": "database",
  "mode": "reuse-image",
  "image": {
    "image_ref": "postgres@sha256:<digest>",
    "target_image": null,
    "platforms": [],
    "pull_access": "anonymous"
  },
  "build": null,
  "runtime": { "port": 5432 }
}
```

For a build:

```json
{
  "name": "web",
  "artifact_key": "web",
  "role": "application",
  "mode": "build-required",
  "image": {
    "image_ref": null,
    "target_image": "ghcr.io/example/repo-web:prepare-...",
    "platforms": [],
    "pull_access": null
  },
  "build": {
    "context_path": ".",
    "dockerfile_path": "apps/web/Dockerfile",
    "target": null,
    "build_arg_names": []
  },
  "runtime": { "port": 3000 }
}
```

Unlike `analysis.json`, `dockerfile_path` in the request is relative to
`WORK_DIR`; join the analysis context and context-relative Dockerfile path,
normalize it, and verify it stays inside `context_path`.

Initialize `.sealos/build-result.json` with the Kaniko result writer.
The writer keeps `services[]` as the complete image authority and also projects
the selected primary service to top-level `mode`, `image`, and `kubernetes`
fields for Brain ingestion.

### 4.1 Record Reused Services

For every `reuse-image` service, call the result writer with `status=skipped`.
This performs no Kubernetes, S3, or registry-write work.

### 4.2 Build Missing Services

Only now require:

- active sandbox kubectl context and namespace
- current service account
- VersityGW S3 settings
- injected `GITHUB_TOKEN` with GHCR `write:packages`

Execute the sibling `k8s-kaniko-job` skill for each `build-required` service.
It packages the exact context, creates one temporary Kaniko Job, pushes the
tagged GHCR image for `linux/amd64`, reads Kaniko's digest, checks anonymous
pull behavior, and upserts the aggregate result.

When a build plan declares argument names, resolve their values into a private
mode-`0600` env file outside `WORK_DIR`, create a service-scoped Kubernetes
Secret, and let the Job reference its keys. Never put values in the aggregate
request, Job YAML, logs, or delivery artifacts.

Do not rerun successful services because another service fails. Do not build a
managed database service whose source container is intentionally transformed
to KubeBlocks.

### 4.3 Repair Loop

Classify by failed operation:

- Dockerfile, context, dependency, ignore rule, target, build input, or
  inaccessible `FROM`/`COPY --from` image → build-plan failure; return only
  that service to Phase 3
- token scope, GHCR destination, S3, network, Kubernetes, or Kaniko executor
  availability → execution failure; repair/retry within Phase 4

For build-plan failures, load dockerfile-skill error patterns, make the smallest
evidence-backed repair, update `origin: "repaired"`, update the aggregate
request, and retry that service. Allow at most three build-plan repair attempts
per service. Infrastructure retries do not consume that repair count.

Failed entries expose no deployable digest.

### 4.4 Complete Analysis

Require aggregate `status: "succeeded"` and one result per request service
before Phase 5.

Require the top-level Brain projection to match the completed
`primary_service` result exactly.

For each built service, update the matching `analysis.json` entry:

- `image_status: "built"`
- immutable `image_ref`
- matching digest
- `platforms` including `linux/amd64`
- unchanged effective build plan and origin

Set top-level `image_ref` only when exactly one application workload remains.

---

## Phase 5: Generate The Sealos Template

Load the current owning rules:

```text
<SKILL_DIR>/../docker-to-sealos/SKILL.md
<SKILL_DIR>/../docker-to-sealos/references/sealos-specs.md
<SKILL_DIR>/../docker-to-sealos/references/conversion-mappings.md
<SKILL_DIR>/../docker-to-sealos/references/database-templates.md
```

When the source mentions Frappe, ERPNext, HRMS, or `bench`, also load
`<SKILL_DIR>/../docker-to-sealos/references/frappe-bench.md`.

This is a prepare-only integration. Execute conversion and the static quality
gate from the sibling skill; its standalone post-deployment/live acceptance
steps belong to the downstream deployment system.

Use `.sealos/build-result.json` as the final image authority. Every emitted
container image must be an immutable digest and must map to one resolved
service result.

### Source Adapter

- Read `deployment_source`, `service_inventory`, `env_vars`, `databases`,
  `port`, and the project identity from the validated `analysis.json`.
- Compose: consume the exact selected source path and run
  `compose_to_template.py --kompose-mode always --no-fetch-logo --dry-run`,
  passing repeatable `--image-override SERVICE=IMAGE` for built or otherwise
  replaced services.
- Rendered Helm or Kubernetes: run `kubernetes_to_template.py` directly on
  `.sealos/deployment-source/rendered.yaml`, with per-container image
  overrides, `--dry-run`, `--mapping-output
  .sealos/deployment-source/resource-map.json`, and
  `--topology-evidence-output
  .sealos/topology-evidence/<app-name>.yaml`.
- Implicit: synthesize only the confirmed project-backed topology as a private
  system-temporary adapter input and use `--kompose-mode auto`, or generate
  equivalent canonical Template YAML directly. Never persist the synthetic
  adapter input under `WORK_DIR`.

Pass `--public-service` only when project evidence or
`.sealos/config.json.public_service` establishes the public entry. If several
application services publish ports, resolve the entry from an existing
Ingress, README, frontend role, or run/deploy documentation; ask only when the
choice remains genuinely ambiguous and materially changes the result.

Adapters are tools, not eligibility gates. If one cannot express the proven
shape, repair the temporary input or generate equivalent canonical YAML. Never
silently drop a source resource or capability.

### Pull-Secret Handoff

For each service result with `pull_access` equal to
`ghcr_secret_required` or `indeterminate`, pass the adapter's repeatable
`--image-pull-secret-service SERVICE` option or add:

```yaml
template:
  spec:
    imagePullSecrets:
      - name: ${{ defaults.app_name }}
```

Only the affected workloads receive the reference. Anonymous images omit it.
Do not emit a registry Secret resource, credential input, token, username,
password, or Docker config. The downstream deployment system owns creation of
the app-scoped Secret, matching the user-facing workflow.

### Topology And Resource Rules

Preserve:

- all selected services and explicit resource identities
- replicas and feature conditions
- volumes, ConfigMaps, RBAC, Jobs, init containers, probes, and ordering
- browser/public versus internal URL semantics
- database initialization, users, grants, scripts, and consuming-service gates

Prefer KubeBlocks for supported databases only when the source semantics are
represented losslessly. Otherwise retain an annotated raw workload; never
erase a dependency.

Before removing a source database container, account for its database names,
application accounts, password sources, grants, initialization environment,
init scripts and mounts, command/entrypoint, data paths, engine variant,
replicas, and consumers. A database port or Cluster readiness check alone does
not represent this initialization contract.

Assess each application container, worker, sidecar, init container, Job
container, and KubeBlocks component from source requirements and runtime
evidence. Floors are minimums, not universal recommendations; never reduce a
source limit or a documented minimum.

At minimum enforce:

- hardcoded lowercase Template `metadata.name`
- immutable digest image refs
- primary application and dedicated worker floor of
  `limits 500m/2048Mi`, `requests 50m/512Mi`
- sidecar, init-container, Job, and CronJob floor of `limits 200m/256Mi`
  with derived requests
- KubeBlocks floor of `limits 500m/512Mi` and derived requests
- PVC requests no greater than `1Gi`
- explicit init-container resources
- `imagePullPolicy: IfNotPresent`
- `revisionHistoryLimit: 1`
- `automountServiceAccountToken: false`
- quoted string Template default/input default values
- App CR last, with only the allowed fields and fixed `normal`/`link` enums

### Inputs

Keep required and optional configuration as Template defaults/inputs exactly as
the current generator rules require. Do not collect values from the user and
do not resolve inputs in this skill. The downstream deployment workflow owns
that interaction.

### Validate

Write `.sealos/template/index.yaml`, then run the complete quality gate:

```bash
QUALITY_ARTIFACTS="$WORK_DIR/.sealos/template/index.yaml"
TOPOLOGY_EVIDENCE="$WORK_DIR/.sealos/topology-evidence/$APP_NAME.yaml"
if [ -f "$TOPOLOGY_EVIDENCE" ]; then
  QUALITY_ARTIFACTS="$QUALITY_ARTIFACTS,$TOPOLOGY_EVIDENCE"
fi

"$PYTHON_BIN" \
  "<SKILL_DIR>/../docker-to-sealos/scripts/quality_gate.py" \
  --artifacts "$QUALITY_ARTIFACTS"
```

Fix the existing YAML and rerun the complete gate until it passes. Do not
continue with partial validation.

---

## Phase 6: Finish And Hand Off

This phase writes delivery metadata; it does not deploy.

Verify:

- official route: copied official YAML is intact, build request has no
  services, `primary_service` and its result projection are null, and build
  result is skipped
- standard route: build request/result cover every final container service,
  aggregate result succeeded, the top-level Brain projection matches the
  requested primary service, Template images and pull-Secret references match
  those results, explicit topology is fully accounted for, and the quality
  gate passed

Write `.sealos/delivery-manifest.json` version `2.0`:

```json
{
  "version": "2.0",
  "generated_at": "<ISO timestamp>",
  "route": "standard",
  "artifacts": [
    ".sealos/analysis.json",
    ".sealos/template-references.json",
    ".sealos/build-request.json",
    ".sealos/build-result.json",
    ".sealos/template/index.yaml",
    ".sealos/delivery-manifest.json"
  ],
  "analysis_path": ".sealos/analysis.json",
  "template_path": ".sealos/template/index.yaml",
  "build_request_path": ".sealos/build-request.json",
  "build_result_path": ".sealos/build-result.json",
  "template_references_path": ".sealos/template-references.json"
}
```

All six invariant paths must exist and appear in `artifacts`. Include
deployment-source mapping and topology evidence only when generated. Never
include private logs, credential files, Kaniko Secret manifests, or transient
context tarballs.

Run the complete JSON artifact and cross-artifact validator after writing the
manifest:

```bash
node "<SKILL_DIR>/scripts/validate-artifacts.mjs" \
  --dir "$WORK_DIR" \
  --require-complete
```

Rerun the YAML quality gate if any upstream file changed.

The final response reports:

- route
- selected service names
- immutable image refs
- whether downstream private-image Secret materialization is required
- absolute paths to the Template, build request/result, analysis, delivery
  manifest, and private log

State clearly that preparation is complete and deployment is delegated to the
downstream system. Do not claim that the application is running.
