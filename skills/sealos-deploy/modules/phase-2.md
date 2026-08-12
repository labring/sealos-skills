# Phase 2: Discover and image preparation

Produce `deployment-plan.json` with a single `deployment_source` pointer, and prepare
Dockerfiles for components that must build from this repository.

One Sealos deploy maps to one full-repo template. Topology must cover all relevant
components (databases, queues, workers), not only the main app.

Do not build or push images. Do not generate a Sealos template. Do not create cloud
resources. Do not modify `official_template`.

UPDATE mode skips this phase.

## Inputs

| Input | Source |
|-------|--------|
| `.sealos/analysis.json` | Phase 0, Phase 1 |
| Project source | `analysis.json` → `work_dir` |
| `railpack` | Required when this phase must prepare a Dockerfile (`sandbox` preinstalled; `local` path-gated) |
| `.sealos/config.json` | Optional user overrides (read when present) |

## Outputs

| Output | Path |
|--------|------|
| Deploy file tree | `.sealos/phase-2/agentlens-digest.txt` |
| Deployment plan | `.sealos/phase-2/deployment-plan.json` |
| Canonical Compose | `.sealos/phase-2/docker-compose.yml` (non-Helm/K8s only) |
| `deployment_plan` pointer | `.sealos/analysis.json` |

## Path dependency gate

Before discovery that needs them, ensure deferred tools are available. Ask once to
install; refuse or recheck failure → **STOP**.

| Need | Tools |
|------|-------|
| agentlens scout | Node.js (entry-required, already present after Phase 0) |
| Dockerfile preparation via railpack | `railpack` |

Docker / `gh` are not required in this phase (build/push is Phase 3).

## Phase constraints

| ID | Constraint |
|----|------------|
| P2-01 | Do not build or push images |
| P2-02 | Do not generate Sealos templates |
| P2-03 | Do not create cloud resources |
| P2-04 | Do not change `official_template` |
| P2-05 | One deploy must cover full repo topology |
| P2-06 | On Compose path, `deployment_source` must be `.sealos/phase-2/docker-compose.yml` |

## Procedure

### 1. Read `analysis.json`

Read `work_dir`, `runtime_profile`, and related fields. Preserve Phase 0 and Phase 1
fields. Do not modify `official_template`.

### 2. Main agent scout (agentlens)

**agentlens purpose:** generate a deploy-focused path tree under `work_dir` so the
agent can quickly understand project architecture and likely deploy files. It does
not emit file bodies, does not replace reading README / Compose / Dockerfile / charts,
and is not itself a deployment source.

```bash
mkdir -p "$WORK_DIR/.sealos/phase-2"
npx -y @norberia/agentlens "$WORK_DIR" --preset deploy \
  -o "$WORK_DIR/.sealos/phase-2/agentlens-digest.txt"
```

Also read root `README*`, `CONTRIBUTING*`, and paths listed in the tree. Evidence
types include compose/Dockerfile/Helm/K8s/CI/workspace manifests.

Record a short scout note in the deploy log.

### 3. Subagent — pick deployment source and image prep

Start one subagent with:

- `analysis.json`
- path to `.sealos/phase-2/agentlens-digest.txt`
- verbal handoff (findings and judgment)

If the host cannot start subagents, the main agent performs the same steps
under the same contract — the contract, not the delegation, is normative.

If `.sealos/config.json` exists, apply its overrides before inference:
`deployment_source` (skip source selection when set), `port`, `start_command`,
`build_command`, `base_image`, `node_version`, `system_deps` (feed into
Dockerfile preparation), `public_service` (feeds Phase 4 network selection).
User values beat auto-detection.

Write `.sealos/phase-2/deployment-plan.json` per
`<SKILL_DIR>/schemas/deployment-plan.schema.json` and the deployment-plan contract:

1. **Set `deployment_source`** (default priority Helm → Kubernetes → Compose;
   prefer a lower-priority source when the evidence says it is the maintained
   deploy path — for example a stale half-finished chart next to a complete,
   README-documented compose file — and record the reason in the plan):
   - **Helm**: chart root; check chart/values; prepare Dockerfiles for images that need build.
   - **Kubernetes**: a **single** manifest file; prepare Dockerfiles for images that need build.
   - **Other** (including existing compose, single app, implicit topology, source-ready static sites): generate or normalize compose to `.sealos/phase-2/docker-compose.yml` (copy and patch when the repo has compose — do not edit the original). `deployment_source` is **fixed** to `.sealos/phase-2/docker-compose.yml`.
2. **Image prep**: every container built from this repo must have a buildable `build` config (context, dockerfile) in the deployment source.
   - Reuse a usable repo Dockerfile when present.
   - Otherwise run `railpack` (`info`, `plan`), read the output, review/refine (ports, start command, stages), then write the Dockerfile.
   - Prefer writing Dockerfiles under `.sealos/phase-2/`. Do not modify user source.
   - Source-ready static sites may use `<SKILL_DIR>/../dockerfile-skill/templates/static-nginx.dockerfile` (and matching `.dockerignore`) via the Compose path.
3. **Record decisions in the plan**, not only in the compose file. Besides the
   required `deployment_source`, write:
   - `build_targets`: one entry per component built from this repo —
     `{ "key": "<service>", "context": "<dir>", "dockerfile": "<path>" }`
     (paths relative to `work_dir`). Phase 3 and UPDATE consume this directly.
   - `public_service`: the service key intended as the public entry, when known.
   - `db_services`: service keys classified as databases, when any.
   - `resource_hints`: per-service `{ "cpu", "memory" }` (Sealos ladder values)
     when the repo documents system requirements (README minimums, upstream
     compose limits) or the stack builds assets at boot. Phase 4 passes each
     entry to the converter — the flat 200m/256Mi default crash-loops
     boot-time-build apps.
   - `bootstrap_mode`: the account bootstrap classification when the evidence
     is already clear (first-user signup / deployer-supplied / runtime-generated).
4. Do not guess published images from org or repo name. Upstream `image:` refs that do not need local build stay as-is. When choosing between multiple published image sources (Docker Hub vs GHCR vs stale mirrors), verify freshness: prefer the registry the repo's release docs reference and check that the tag list carries the latest release.

### 4. Write `analysis.json`

Merge with Phase 0 / Phase 1 fields. Add only:

```json
{
  "deployment_plan": ".sealos/phase-2/deployment-plan.json"
}
```

Do not modify `official_template` or other Phase 0 / Phase 1 fields.

### 5. Validate

```bash
node "<SKILL_DIR>/scripts/validate-phase-2.mjs" --dir "$WORK_DIR"
```

| ID | Check |
|----|-------|
| P2-V01 | `deployment-plan.json` has valid `deployment_source` |
| P2-V02 | `deployment_source` exists under `work_dir` |
| P2-V03 | `official_template` still present (Phase 1 field preserved) |
| P2-V04 | Compose path uses `.sealos/phase-2/docker-compose.yml` |

On failure, do not CONTINUE to Phase 3.

## Stop conditions

| Result | Condition |
|--------|-----------|
| **STOP** | Cannot determine `deployment_source` or source is incomplete |
| **STOP** | A build-required component cannot get a Dockerfile |
| **STOP** | Validation / schema write failure |
| **CONTINUE → Phase 3** | Plan, `deployment_source` file(s), and `analysis.json` are persisted |

On Phase 3 build-recipe failure, return here to revise the deployment source or Dockerfiles.
