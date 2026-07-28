# Deployment Pipeline

After preflight passes, detect deployment mode. UPDATE mode uses the update
path. DEPLOY mode runs Phase 1, then Phase 1.5 chooses one of two routes:

- a unique reusable official template goes directly to Phase 6
- every other result continues through Phase 2, 3/4, 5, 5.5, and 6

`SKILL_DIR` refers to the directory containing this skill's SKILL.md. Sibling skills are at `<SKILL_DIR>/../`.

Use `ENV` from preflight to choose between script mode (Node.js available)
and fallback mode (AI-native), except that Phase 4 has no AI-native or
direct-Docker fallback and requires Node.js 18+ when a local build is needed.

## Artifact Directory

All pipeline outputs are written under `.sealos/` in `WORK_DIR`:

```
<WORK_DIR>/.sealos/
├── config.json                   ← user configuration overrides (manual, committed to git)
├── template-references.json      ← Phase 1.5 catalog match and route decision
├── template-references/          ← bounded exact-match provenance copies
├── state.json                    ← deployment state (auto-maintained after Phase 6.5)
├── analysis.json                 ← project analysis snapshot (regenerated each deploy)
├── deployment-source/            ← Phase 2 rendered explicit source and Phase 5 mapping
│   ├── rendered.yaml
│   └── resource-map.json
├── topology-evidence/             ← validator-only Phase 5 topology contract
│   └── <app-name>.yaml
├── build/                        ← created only if Phase 4 actually runs
│   └── <service-key>/
│       └── build-result.json     ← one Phase 4 result per built service
└── template/
    └── index.yaml                ← official template reused by Phase 1.5, or Phase 5 output
```

When `WORK_DIR_IS_TEMP=true` for a GitHub URL, the validated deployment state
also has a durable bridge copy at
`~/.sealos/deployments/github.com/<owner>/<repo>/state.json`. The bridge is
restored into the fresh checkout before mode detection and updated only after
Phase 6.5 succeeds. It contains only `state.json`; build artifacts and
templates remain run-local.

**File responsibilities:**
- `config.json` — optional user overrides (port, `public_service`,
  `deployment_source`, base_image, build_command, etc.). Created manually by
  user, committed to git. All fields optional.
- `analysis.json` — project analysis snapshot written after Phase 1 and
  enriched in Phase 2 with the selected deployment source, image inventory,
  and service inventory. Regenerated each deploy.
- `deployment-source/rendered.yaml` — read-only rendered Helm/Kubernetes input
  for the current source hash. Compose and implicit sources do not create it.
- `deployment-source/resource-map.json` — Phase 5 accounting from every
  explicit Kubernetes source resource to its preserved, transformed, or
  filtered output.
- `topology-evidence/<app-name>.yaml` — validator-only topology evidence used
  with the generated template; it is not submitted as a runtime resource.
- `template-references.json` — Phase 1.5 exact catalog matches, official source commit, and the route decision. Regenerated each deploy.
- `template-references/` — bounded copies retained for exact-match provenance. The selected official YAML is also copied verbatim to `.sealos/template/index.yaml` only when the decision route is `deploy_official_template`.
- `state.json` — deployment state written after Phase 6.5 succeeds. Contains
  `last_deploy` and `history`. Enables UPDATE mode on subsequent runs.

**Dockerfile integration boundary:** Phase 3 reads
`modules/dockerfile-integration.md`. It does not execute dockerfile-skill's
standalone build/fix workflow and produces no dockerfile-skill report.
`.sealos/build/` belongs only to Phase 4. Template output goes to
`.sealos/template/`.

JSON artifacts under `.sealos/` are governed by explicit schemas in `<SKILL_DIR>/schemas/`:
- `config.schema.json`
- `template-references.schema.json`
- `analysis.schema.json`
- `build-result.schema.json`
- `state.schema.json`

Validate them with:

```bash
node "<SKILL_DIR>/scripts/validate-artifacts.mjs" --dir "$WORK_DIR"
```

Writers should validate on write; readers should validate before trusting resume/update state.

Do not create `.sealos/` merely to run deployment mode detection or the Phase 1
entry check. In DEPLOY mode, create the base artifact directory only after the
Phase 1 entry check continues. If mode detection must reconstruct deployment
state, create it immediately before writing that state.

For a DEPLOY run, capture the local checkout's branch, `HEAD`, upstream, and
complete Git status in transient run context immediately before creating the
first `.sealos/` artifact. Phase 1.5 uses this pre-artifact source snapshot, so
its own generated files cannot make a fresh clone look dirty. If no such
snapshot exists on a resumed run, disable automatic official-template reuse.

```bash
mkdir -p "$WORK_DIR/.sealos" "$WORK_DIR/.sealos/template"
```

Create `"$WORK_DIR/.sealos/build"` lazily when Phase 4 starts. If Phase 2
proves that every final container workload has a reusable image and skips
Phase 4, `build/` should remain absent rather than exist as an empty directory.

**Read user config (if exists):**
If `.sealos/config.json` exists, read it. User-provided values take priority over auto-detection and AI inference throughout the pipeline.

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
  "env_overrides": { "NODE_ENV": "production" },
  "skip_phases": ["assess"]
}
```
All fields are optional. If a field is present, it overrides the corresponding
auto-detected value. `skip_phases: ["assess"]` may reuse or skip readiness scoring,
but it never skips the Phase 1 entry judgment in DEPLOY mode.

## Deployment Mode Detection

After preflight, determine whether this is a **first deploy** or an **update** of an existing deployment.

For a temporary GitHub checkout, restore the previously validated state before
reading `.sealos/state.json`:

```bash
WORK_DIR_IS_TEMP="${WORK_DIR_IS_TEMP:-false}"
if [ "$WORK_DIR_IS_TEMP" = true ] && command -v node >/dev/null 2>&1; then
  node "<SKILL_DIR>/scripts/sealos-state-bridge.mjs" restore \
    --work-dir "$WORK_DIR" --github-url "$GITHUB_URL" || exit 1
fi
```

If Node.js is unavailable at this early point, continue read-only mode
detection and cluster discovery; the complete Phase 6/6.5 path will still
require Node.js 18+ before creating resources.

### Step 1: Check for previous deployment state

Read `.sealos/state.json` in `WORK_DIR`. If it exists and contains a
`last_deploy` key with `app_name`, proceed to Step 2.

Current state uses version `1.1` and records
`last_deploy.services[]`. A version `1.0` state remains readable for backward
compatibility, including its ignored legacy registry field, but must be
upgraded before an image-changing update: inspect the live workloads and
containers, bind each one to the matching analysis/template service, obtain
user confirmation for any ambiguous mapping, then write the version `1.1`
service map using the observed immutable image digests. If a live target cannot
be bound to a digest, stop the migration instead of copying a floating
workload selector. Preserve the existing `history` entries byte-for-byte and set
top-level `legacy_history_count` to their count before appending any new v1.1
entry. Entries before that explicit boundary retain the v1.0 contract; entries
at or after it require immutable digests and exact service/workload/container
targets. A state created natively as v1.1 omits the boundary. Never guess a
workload or container from `app_name`.

If no `last_deploy` key or file doesn't exist → proceed to **Step 1.5**
(attempt discovery from cluster).

### Step 1.5: Discover existing deployment from cluster (migration)

Projects deployed by an older version of the skill may have no `last_deploy` section in state.json (or no state.json at all). If `ENV.kubectl` is true and `~/.sealos/kubeconfig` exists, attempt to discover an existing deployment by project name:

```bash
# Derive the namespace from the sealos kubeconfig
NAMESPACE=$(KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  config view --minify -o jsonpath='{.contexts[0].context.namespace}' 2>/dev/null)

# Search the rollout-capable workloads whose names start with the repo name.
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  get deployment,statefulset,daemonset,cronjob -n "$NAMESPACE" -o json 2>/dev/null
```

Match candidate workload/container images to the repository evidence and
rendered template. Do not inspect only `containers[0]`, and do not select a
candidate solely because its name has the repository prefix.

**If a complete unambiguous match is found:**

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
  Workloads: deployment/evershop-uvbp0n0n (web)
  Image:     ghcr.io/zhujingyang/evershop@sha256:<digest>
  URL:       https://evershop-4ha6b4mh.gzg.sealos.run
  Namespace: ns-qiqovyrm

  Is this the deployment you want to update? (y/n)
```

3. If user confirms → write a version `1.1` `last_deploy` section with the
   complete per-service workload/container map to `.sealos/state.json` (create
   the file if needed), then proceed to Step 2.

4. If user says no, or no match is found → **DEPLOY mode** (skip to Resume
   Detection below).

### Step 2: Verify deployment is still running (requires kubectl)

If `ENV.kubectl` is false:
- Inform user: `"Found previous deployment record for {app_name}, but kubectl is not available. Will create a new instance instead."`
- → **DEPLOY mode**

If `ENV.kubectl` is true, query every exact
`last_deploy.services[]` workload kind/name. Verify that its named container
still exists and runs the recorded immutable image. For a legacy version `1.0`
state, reconstruct and confirm the version `1.1` service map first.

- A target workload/container is missing, kubeconfig is expired, or the live
  footprint contradicts the state → stop mode detection and reconcile the
  state with the user; do not silently create a duplicate deployment.
- Every target exists and the live images are accounted for → proceed to Step
  3.

### Step 3: Ask user

Present the detected state and let the user choose:

```
Detected existing deployment:
  App:       <app_name>
  Workloads: <service → kind/name:container, current digest>
  URL:       <url, only when a public endpoint exists>

  1. Update this deployment (rebuild or restart one or more exact services)
  2. Deploy as a new instance

Default: Update
```

- User picks **Update** → **UPDATE mode** (jump to Update Path below)
- User picks **New instance** → **DEPLOY mode** (rename state.json to
  state.json.bak)
- If `last_deploy.services` is empty because the prior deployment contained
  only completed one-shot Jobs, there is no in-place update target. Explain
  that fact and offer only a new deployment; never infer a mutable target from
  the completed Job.

---

## Resume Detection

**Only applies in DEPLOY mode.** Check for artifacts from a previous incomplete deploy using file existence:

| Condition | Meaning | Behavior |
|-----------|---------|----------|
| `.sealos/state.json` has `last_deploy` | Already deployed | Enter UPDATE mode (handled above) |
| `.sealos/analysis.json` exists | Phase 1 scoring completed | After the Phase 1 entry judgment, ask whether to reuse the assessment |
| `.sealos/template-references.json` selects `deploy_official_template` and `.sealos/template/index.yaml` is byte-for-byte identical to its selected exact reference | A prior Phase 1.5 run selected and materialized an official template | Never trust the local pair as proof; rerun Phase 1.5 against a freshly verified official checkout, then continue to Phase 6 only if it selects and rematerializes the same route |
| Every build-required service has a matching `.sealos/build/<service-key>/build-result.json` with `outcome: "success"` | A prior Phase 4 run produced diagnostic images | Rebuild. The current artifact does not contain a source/content fingerprint, so matching paths and build options never prove that an old digest represents the current checkout |
| `.sealos/template/index.yaml` exists on the standard route, is newer than the current Phase 1.5 decision and every current build result, passes the Phase 5 quality gate, and every rendered workload image/pull-Secret reference exactly matches the current service inventory and Phase 4 results | Phase 5 completed for the current images | Ask user whether to reuse it; otherwise regenerate Phase 5. A valid but stale template is never reusable |

When Phase 1.5 changes from `deploy_official_template` to
`continue_standard_pipeline`, the matcher removes the previous
`.sealos/template/index.yaml` only after confirming it is still byte-for-byte
identical to the previously selected official reference. A divergent file is
not Phase 5 output and must never be resumed as one; preserve it for user review
and regenerate the standard template.

Local reference artifacts are resume hints, not an official-source trust
boundary. Their repository URL, commit, and verification flags are self-reported
JSON and can be forged together with the local YAML. Every official-template
resume must perform a new official remote verification before Phase 6.

If any artifacts exist, report to user:
`"Found artifacts from a previous deploy attempt. [list found artifacts]."`
Ask: `"Resume from where it left off? Or restart from Phase 1?"`

Resuming or reusing `.sealos/analysis.json` skips only Phase 1 scoring and analysis.
Every DEPLOY path still begins with the Phase 1 entry judgment. UPDATE mode skips
Phase 1 entirely because mode detection has already verified a running deployment.
The mere existence of a root `Dockerfile` is never a Phase 3 checkpoint. Phase 3
is a cheap per-service preparation pass and must re-resolve every build-required
service's effective context and Dockerfile before Phase 4.

If restart → remove `.sealos/analysis.json`, `.sealos/template-references.json`,
`.sealos/template-references/`, `.sealos/build/`, and
`.sealos/template/index.yaml`, then start fresh.

---

## Phase 1: Assess

`WORK_DIR`, `GITHUB_URL`, `REPO_NAME`, and README context are already resolved in preflight (Step 2).
Use those directly — no need to re-derive.

**Opening judgment — this is not a separate phase or output.**

Ask one internal question: **Am I certain this selected project cannot run on
Sealos in any reasonable form?**

- If yes, give the user one short, concrete reason and STOP. A confirmed
  Windows-only native desktop application with no server, web, remote-desktop,
  container, or alternative runtime target is an example.
- Otherwise, say nothing about this judgment and continue immediately with
  Phase 1 scoring. Uncertainty always continues.

Do not run a dedicated classifier or create a status, score, report, candidate
list, evidence object, user prompt, or file for this judgment.

After this judgment continues, create the base artifact directory as described
above.

### 1.1 Deterministic Scoring

**If Node.js available:**
```bash
node "<SKILL_DIR>/scripts/score-model.mjs" "$WORK_DIR"
```
Output: `{ "score": N, "raw_score": N, "bonus": N, "verdict": "...", "dimensions": {...}, "signals": {...} }`

**If Node.js not available (fallback):**
Perform the scoring yourself by reading project files and applying these rules:

1. Detect stack facts from project evidence. Examples include `package.json` →
   Node.js, `go.mod` → Go, `requirements.txt` → Python, `pom.xml` → Java,
   `Cargo.toml` → Rust, and static HTML/CSS/JavaScript files → their actual
   languages. These examples are detector coverage, not a supported-language
   allowlist.
2. Detect framework: read dependency files for known frameworks (Next.js, Express, FastAPI, Gin, Spring Boot, etc.)
3. Check HTTP server: does the project listen on a port?
4. Check state: external DB (PostgreSQL/MySQL/MongoDB) vs local state (SQLite)?
5. Check config: `.env.example` exists?
6. Check Docker: `Dockerfile` or `docker-compose.yml` exists?

Score 6 dimensions (0-2 each, max 12). For detailed criteria, read:
`<SKILL_DIR>/../cloud-native-readiness/knowledge/criteria.md`

**Decision:**
- `score < 4` → WARN and CONTINUE. Tell the user: "This project scored
  {N}/12 ({verdict}). Deployment is high risk because:
  {dimension_details for 0-score dimensions}. The pipeline will continue until a
  concrete build, validation, safety, or runtime check fails."
- `score >= 4` → CONTINUE and carry any concerns forward.

### 1.2 AI Quick Assessment

Use structured signals from Phase 1.1 score-model output directly:
- `signals.primary_language` — primary language (priority-sorted when multiple detected)
- `signals.framework` — detected frameworks
- `signals.package_manager` — detected package manager (npm/yarn/pnpm/bun/pip/go/etc.)
- `signals.port` — detected port (from framework defaults)
- `signals.databases` — detected database types (postgres/mysql/mongodb/redis/sqlite)
- `signals.runtime_version` — runtime version with source (e.g., `{ node: "22", source: "engines" }`)
- `signals.is_monorepo`, `signals.has_docker`, `signals.has_env_example`

The deterministic detector intentionally covers only common stacks. Its known
values are not a Sealos support list. Supplement its output with direct project
evidence, preserve unfamiliar non-empty names as written, and leave facts
unknown when the repository does not establish them.

Focus AI effort on what the script cannot detect: env_vars classification,
complexity_tier assessment, and port override from source code (if `port_source` is "unknown").

Based on the score result and your own analysis of the project, assess:

1. Read key files: `README.md`, `package.json`/`go.mod`/`requirements.txt`, `Dockerfile` (if exists)
2. Check: Is this a web service, API, or worker with network interface?
3. Determine: ports, required env vars, database dependencies, special concerns

If the score is borderline (4-6), also read:
- `<SKILL_DIR>/../cloud-native-readiness/knowledge/criteria.md` — detailed rubrics
- `<SKILL_DIR>/../cloud-native-readiness/knowledge/anti-patterns.md` — high-risk patterns and remediation

Record uncertain workload types, missing entry points, and other risks as analysis
facts. Do not turn those signals into another stop decision later in Phase 1.

Record only known facts for later phases: `language`, `framework`, `port`,
`env_vars`, `databases`, and `has_dockerfile`. Do not map static or unfamiliar
projects to a known stack merely to satisfy the analysis schema.

**Env var classification** (for Phase 5.5 interactive configuration):
When recording `env_vars`, also classify each one:
- `auto` — can be auto-generated (random secrets, internal URLs, DB connections)
- `required` — user must provide (external API keys, admin email, SMTP, OAuth)
- `optional` — has sensible default, user may customize (log level, feature flags)

Sources for env var detection:
- `.env.example` or `.env.sample` — most reliable source of required env vars
- `docker-compose.yml` `environment:` section
- README sections about configuration/environment
- Source code imports of `process.env.*` or `os.environ[]`

### Write analysis.json

After Phase 1 completes, write `.sealos/analysis.json` with the full analysis
snapshot. Copy `score-model.mjs`'s `score` to `score.total`, `raw_score` to
`score.raw_score`, and `bonus` to `score.bonus`; `score.total` is the effective
value `min(12, raw_score + bonus)`. Keep the six dimension values unchanged
under `score.dimensions`:

```json
{
  "generated_at": "<ISO timestamp>",
  "project": {
    "github_url": "<GITHUB_URL>",
    "work_dir": "<WORK_DIR>",
    "repo_name": "<REPO_NAME>",
    "branch": "<BRANCH or null>"
  },
  "score": {
    "total": "<effective score>",
    "raw_score": "<sum of the six dimensions>",
    "bonus": "<Dockerfile/Compose bonus>",
    "verdict": "<verdict>",
    "dimensions": {}
  },
  "language": "<detected language or null>",
  "all_languages": ["<all detected language names>"],
  "framework": "<detected framework or null>",
  "package_manager": "<detected package manager or null>",
  "port": "<detected primary port or null>",
  "databases": ["<detected database types>"],
  "runtime_version": { "<runtime>": "<version>", "source": "<evidence source>" },
  "env_vars": {},
  "has_dockerfile": false,
  "complexity_tier": "<L1|L2|L3>",
  "image_ref": null,
  "image_inventory": [],
  "service_inventory": []
}
```

These fields describe evidence; they do not authorize or reject deployment.
`language`, `framework`, `package_manager`, and `port` may be `null`;
`all_languages` may be empty; and `runtime_version` may be `{}` or `null`.
Language and package-manager strings are open values, not enums. For example, a
static Nginx project may validly record `language: "html"`,
`all_languages: ["html", "css", "javascript"]`, `framework: "nginx"`,
`package_manager: null`, and `runtime_version: {}`. Never invent
`node`/`npm`/`22` or another familiar stack to make an artifact validate.

If `.sealos/config.json` exists, apply user overrides: e.g., if `config.json` has
`"port": 8080`, use that instead of the auto-detected value; a
`"public_service"` value selects the public Compose service. Priority: user
config > script detection > AI inference.

The `image_ref` field is set to `null` initially. Phase 2 fills it only when
there is one unambiguous primary application image; Phase 4 fills it for a
single built application. `image_inventory` and `service_inventory` start
empty and are populated in Phase 2 so later phases retain the complete
multi-service topology.

### Present Analysis Summary

After writing `.sealos/analysis.json`, present a concise repository analysis summary to the user.
This summary should expose only the key conclusions, not the full artifact contents.

Recommended format:

```text
Repository Analysis:
  - Type: <web app | api | worker | cli | library>
  - Language: <language>
  - Framework: <framework or "none detected">
  - Port: <port or "not detected">
  - Database: <postgres/mysql/redis/... or "none detected">
  - Dockerfile: <yes/no>
  - Score: <N>/12 (<verdict>)
  - Decision: continue
```

Output rules:
- Keep the summary short and decision-oriented
- Do not dump the full `env_vars` object or dimension-by-dimension internals unless the user asks
- Do not add a default "full details" block after this summary
- State the next phase in one short line

---

## Phase 1.5: Official Template Fast Path

Run this phase only after Phase 1 has completed and
`.sealos/analysis.json` identifies the selected source repository. Its only
question is: **can this project reuse one official Sealos template exactly?**

The official catalog is `https://github.com/labring-actions/templates` at the
configured ref. Maintain an index-only sparse Git cache under
`~/.sealos/cache/template-catalog/`: fetch catalog metadata and
`template/*/index.yaml`, but do not clone logos, READMEs, or other catalog
assets. `--catalog-dir` remains limited to tests and explicit offline
inspection. It may record matches but never enables direct deployment.

An automatic fast path requires all of the following:

1. The catalog is fetched from the configured official repository/ref in this
   run, and its origin, commit, and clean template checkout are verified.
   Cached, stale, or explicit local directories may support matching but never
   direct deployment.
2. Exactly one Template `spec.gitRepo` matches the normalized source repository.
   Name, framework, or substring similarity is not a match.
3. The selected target is the repository root. A selected subtree does not use
   the fast path until branch/subtree identity can be proved end to end.
4. Reuse will not silently discard current source intent. For a local checkout,
   require that the pre-artifact source snapshot was clean on the tracked
   default branch with `HEAD` equal to its upstream. Do not recompute
   cleanliness from a status polluted by Phase 1 outputs. A custom branch,
   source changes, detached or unknown upstream, pre-existing deployment
   artifacts, `.sealos/config.json` overrides, or an explicit request to deploy
   current code sets `REUSE_OFFICIAL_TEMPLATE=false`.

For a clean fresh clone of an unqualified GitHub repository URL,
`REUSE_OFFICIAL_TEMPLATE` may be `true`. Otherwise prove the conditions above
or set it to `false`; uncertainty continues the standard pipeline.

With Node.js:

```bash
node "<SKILL_DIR>/scripts/find-template-references.mjs" \
  --work-dir "$WORK_DIR" \
  --skill-dir "<SKILL_DIR>" \
  --analysis "$WORK_DIR/.sealos/analysis.json" \
  --github-url "$GITHUB_URL" \
  --reuse-official-template "$REUSE_OFFICIAL_TEMPLATE"
```

The script writes `.sealos/template-references.json` with an explicit
`decision.route`:

- `deploy_official_template` — copy the unique official `index.yaml` verbatim
  and atomically to `.sealos/template/index.yaml`, then skip Phase 2, 3, 4, 5,
  and 5.5 and continue at Phase 6.
- `continue_standard_pipeline` — do not materialize a catalog template; continue
  at Phase 2.

Do not infer the route from file existence alone. Validate the artifact and read
the decision. If an exact template exists but reuse is disabled or ambiguous,
briefly state why the current source will be built instead of silently ignoring
it. Multiple exact matches never choose the first entry automatically.

Catalog fetch, parse, or verification failure is non-blocking. Record the
unavailable or cached result when possible and continue to Phase 2. If Node.js
is unavailable, Phase 1.5 may report an exact cached match, but it cannot prove
the remote-refresh trust boundary and therefore continues to Phase 2.

**TODO — not implemented:** when no exact official template exists, compare the
application topology (for example, Next.js frontend + Go backend + PostgreSQL),
find a structurally similar official template, and use its YAML as a reference
while generating the Phase 5 template. The current runtime does not perform
structural-similarity matching, selection, or referencing, and a similar
template must never be deployed directly.

---

## Phase 2: Discover Existing Images and Preserve Topology

Phase 2 answers two separate questions:

1. Which images does the project itself declare?
2. Which services must still exist in the final deployment?

It is an inventory pass, not a first-match search.

### 2.1 Evidence Order

Use only project-declared image evidence, in this order:

1. **README** — explicit `docker pull`, `docker run`, registry references, or
   documented image names.
2. **CI workflows** — image destinations used by publish or push jobs.
3. **Compose** — every service `image:` declaration, together with every
   service that has only `build:`.
4. **Helm** — the selected Chart's rendered workload containers and the
   source-to-render inputs used to produce them.
5. **Kubernetes** — every supported workload container in the selected raw or
   rendered manifest bundle.

The higher source wins only when selecting an unambiguous primary image.
Always retain all evidence and the complete selected deployment-source
topology. A Helm or Kubernetes resource is not optional merely because it does
not publish an image.

Do not automatically query or select Docker Hub/GHCR names guessed from the
GitHub owner or repository name. Registry search results and fuzzy name
matches are hints at most and must never become deployment input without a
project declaration.

A Dockerfile `FROM` line names a base image, not a published image of this
project. Never put it in the reusable project-image inventory. Any service that
will remain a container workload and has only `build:` stays in the service
inventory and continues to Phase 3/4, regardless of whether its role is
application, database, worker, proxy, gateway, queue, cache, search, storage,
or other infrastructure.

### 2.2 Run the Detector

**If Node.js is available:**

```bash
# With GitHub URL:
node "<SKILL_DIR>/scripts/detect-image.mjs" "$GITHUB_URL" "$WORK_DIR"
# Local project without GitHub URL:
node "<SKILL_DIR>/scripts/detect-image.mjs" "$WORK_DIR"
```

The detector invokes `inspect-deployment-source.mjs` before collecting
topology-bound images. For Helm, the inspector copies the Chart into a system
temporary directory, runs `helm dependency build` when dependencies or
`Chart.lock` require it, then runs `helm template --no-hooks`. It never runs
`helm install` and never mutates the source Chart. Helm and native Kubernetes
results are written atomically to
`.sealos/deployment-source/rendered.yaml`; Phase 5 consumes that exact file.

The output always contains:

- `deployment_source`: the selected `compose`, `helm`, `kubernetes`, or
  `implicit-single-service` source, its hash/evidence, and rendered resource
  inventory when applicable.
- `image_inventory`: every parseable README, CI, Compose, Helm, and Kubernetes image
  declaration, including application, database, and infrastructure images.
- `service_inventory`: every selected deployment workload, including database,
  cache, proxy, queue, object-storage, and build-only services. Helm and
  Kubernetes entries retain `resource_kind`, `workload_name`, `container_name`,
  and `container_role` where applicable.
- backward-compatible primary fields (`found`, `image`, `tag`, `source`,
  `digest`, `image_ref`) only when one digest-resolved primary image is
  unambiguous at the highest-priority evidence level.

**If Node.js is unavailable:** read the same three evidence sources in the same
order and construct the same inventories manually. Query only the exact
declared selector through the registry API. Do not add owner/repository guesses
or a Docker Hub search fallback.

### 2.3 Selector and Digest Rules

Treat the selector written by the project as valid input. `latest`, `stable`,
`v2`, `2.1`, an exact version, a digest, and an omitted tag are all allowed.
An omitted tag uses the registry's normal `latest` selector. Do not substitute
a different or “more precise” tag.

For every declared image:

1. Resolve that exact selector from its registry.
2. Verify the returned manifest body, registry digest header, and any
   caller-declared digest agree.
3. Record the immutable manifest digest as
   `<repository>@sha256:<64-hex-digest>`.
4. Preserve the original declaration, selector, source file, service, role,
   and resolution status as evidence.

Do not pre-screen a third-party image for CPU architecture. A project-provided
image is overwhelmingly likely to include `linux/amd64` or be multi-platform,
and rejecting it from manifest metadata creates more false negatives than it
prevents. If its exact selector resolves to a valid digest, reuse it
optimistically. Phase 6/6.5 diagnoses the rare architecture mismatch from
actual runtime evidence such as `no matching manifest` or `exec format error`.

An image that cannot be fetched is not reusable yet. Keep it in the inventory
with its failure status; do not silently replace it with another tag. The Node
detector uses anonymous registry access. An authenticated registry path or an
upstream-provided immutable digest may resolve a private declaration later.
Never print or persist registry credentials. Authentication failure is a
per-image reuse failure, not a reason to reject the project or remove its
service from the topology.

### 2.4 Complete-Topology Rule

Never remove a service merely because it is a database or infrastructure
component. The final Sealos template must preserve every required capability
and dependency:

- supported PostgreSQL, MySQL, MongoDB, Redis, and similar database services
  may be transformed into their Sealos/KubeBlocks equivalents in Phase 5;
- an edge proxy may be replaced by equivalent Service/Ingress routing;
- other cache, queue, search, storage, gateway, or worker components remain
  explicit services unless Phase 5 performs an evidence-backed equivalent
  transformation.

Transformation may change the resource kind, but it must not make the
dependency or its application wiring disappear.

### 2.5 Update `analysis.json`

Copy the detector's `deployment_source`, complete `image_inventory`, and
`service_inventory` into `.sealos/analysis.json`. Set `image_ref` to the
immutable digest reference only
when the detector returns one unambiguous primary image. Otherwise
leave `image_ref` as `null`; the inventories, not a guessed primary, drive the
remaining phases. Reconcile the `databases` list with database services found
in the inventory so a dependency discovered in Compose cannot be lost merely
because Phase 1 did not recognize it.

Only when `deployment_source.kind` is `implicit-single-service` and there are
no explicit services, create or retain one implicit application service named
from the selected project directory (normally `REPO_NAME`) so the ordinary
single-application path is not lost:

```json
{
  "name": "<repo-name>",
  "role": "application",
  "source": "project",
  "source_file": ".",
  "declared_image": null,
  "build": {
    "context": ".",
    "dockerfile": "Dockerfile",
    "target": null,
    "args": [],
    "origin": "existing"
  },
  "image_status": "build_required"
}
```

Use `origin: null` when the root Dockerfile is absent. A unique README or CI
image that already resolves to a digest still belongs to the implicit
single-service route and may skip the build when it covers that service.
Never create this fallback service for an explicitly detected Helm or
Kubernetes topology.

### 2.6 Per-Service Routing

Make the build decision for every service that Phase 5 will emit as a container
workload:

- exact selector resolved to an immutable digest → reuse it; no Phase 3/4 work
  for that service;
- `build:` or Dockerfile with no resolved published image → Phase 3/4 for that
  service;
- declared image unavailable, but buildable source exists → build a
  `linux/amd64` replacement in Phase 3/4;
- database service with a supported KubeBlocks transformation → retain it for
  Phase 5 conversion; its original database image does not need to be built;
- any database or infrastructure service that remains a container workload →
  apply the same image reuse/build rules as an application service and retain
  it for Phase 5; its role must never be used as a reason to omit the workload.

Skip directly to Phase 5 only when every service that Phase 5 will emit as a
container workload already has a digest-pinned reusable image. A service's
application, database, or infrastructure role is not a build exclusion. Only a
service that will be converted into a non-container Sealos-managed resource is
outside the build route. Finding one image must never cause the rest of a
multi-service project to be skipped.

---

## Phase 3: Prepare Per-Service Build Inputs

Phase 3 is preparation-only. Run it for every service that Phase 5 will emit as
a container workload when Phase 2 left that service at
`image_status: "build_required"`. The service role does not matter: an
application, custom database, proxy, worker, queue, cache, search engine, or
storage service follows the same rule. Do not run it for a service that Phase 5
will replace with a non-container Sealos-managed resource.

Do not build, push, or test-run an image in this phase. Phase 4 is the build
authority.

### 3.1 Resolve the Effective Build Plan

For each build-required service, resolve and retain its own:

- build context, relative to `WORK_DIR`;
- Dockerfile path, relative to that context;
- optional build target;
- build-argument names required by the declared build contract.

Store this plan in the existing `service_inventory[].build` object in
`.sealos/analysis.json`:

```json
{
  "context": "services/api",
  "dockerfile": "docker/Dockerfile.prod",
  "target": "runtime",
  "args": ["NODE_ENV", "PUBLIC_BASE_URL"],
  "origin": "existing"
}
```

`origin` is `existing`, `generated`, `repaired`, or `null`. Preserve build
argument names only; never persist their secret values in `analysis.json`,
logs, or build-result artifacts. Resolve values only at Phase 4 execution time.
Honor Compose `build.context`, `build.dockerfile`, `build.target`, and argument
names instead of falling back to the repository root. A root Dockerfile says
nothing about whether another service's build plan is ready.

For a project without Compose, operate on the implicit application service
created in Phase 2. Its defaults are `context: "."`,
`dockerfile: "Dockerfile"`, `target: null`, and `args: []`.

### 3.2 Preserve Existing Dockerfiles by Default

When the effective Dockerfile exists, use it unchanged by default. Do not
rewrite it merely because it:

- is single-stage;
- runs as root or uses a project-specific UID;
- has cache-order or image-size opportunities;
- omits `EXPOSE`;
- uses a floating base-image selector such as `latest`, `stable`, or `v2`.

These are not proof that the service cannot build or run. Preserve the
project's custom build contract. Repair an existing Dockerfile only when there
is a certain blocking defect for the selected service, or when Phase 4 returns
a concrete build failure attributable to it. Make the smallest targeted
change, set `origin: "repaired"`, and leave unrelated stages, services, and
application configuration untouched.

A linter or quality recommendation is diagnostic evidence, not automatic
permission to rewrite a working Dockerfile.

### 3.3 Generate Only When Missing

Before preparing any service, read the deploy-specific restricted integration:

```text
<SKILL_DIR>/modules/dockerfile-integration.md
```

That module is the execution boundary and overrides standalone dockerfile-skill
workflow/output instructions. When the effective Dockerfile is absent, use the
detected service source and dockerfile-skill only as stack-analysis and template
knowledge. Pre-load the relevant Phase 1 analysis, then re-check language,
framework, package manager, workspace boundaries, port, build command, runtime
entrypoint, and system dependencies inside that service's own context. Do not
duplicate a fixed template allowlist here; select from dockerfile-skill's
maintained templates. Set `origin: "generated"` after producing the minimal
usable Dockerfile.

Missing or unfamiliar Phase 1 stack metadata is not an earlier blocker. Only
when this service actually needs a generated Dockerfile may Phase 3 stop after
its service-local re-check still cannot establish a concrete build and runtime
contract. Existing Dockerfiles remain usable without known language metadata.

The dockerfile-skill integration is deliberately constrained. It may create or
minimally repair the selected service's Dockerfile, a context-aware
`.dockerignore`, and an auxiliary entrypoint or build script only when that
Dockerfile requires it. It must not:

- build or run an image;
- create or replace Compose files;
- create `.env` files or test credentials;
- generate standalone deployment reports or deployment documentation;
- change service topology, application configuration, or unrelated source.

Phase 4 owns the real `linux/amd64` build. Phase 5 owns the Sealos topology and
template. Phase 6.5 owns runtime validation.

### 3.4 Treat `.dockerignore` as Part of the Build Context

Preserve an existing `.dockerignore` by default. If it is missing, generate the
smallest context-aware file from the service's real build inputs. Never apply a
blind global list such as `*.md`: documentation sites, MDX builds, workspaces,
migrations, scripts, patches, configuration, and static assets may require
those files.

Exclude known local noise and secret-bearing files only when they are not
required build inputs, while keeping non-secret example files available. If a
Phase 4 failure proves that a required input was excluded, minimally correct
the ignore rule for that service.

### 3.5 Completion

Phase 3 is complete when every build-required final container service has an
exact effective context, Dockerfile, optional target, and build-argument-name
list ready for Phase 4. It produces no separate assessment, score, report, or
artifact; the normalized per-service build plans in `analysis.json` are the
contract.

---

## Phase 4: Build & Push

### 4.0 Prepare GHCR

Skip this phase when every final container workload already has a reusable
immutable digest. In a mixed project, build only services still marked
`build_required`, use each exact Phase 3 plan, and preserve every previously
resolved service image regardless of which registry hosts it.

Every image built by this workflow is pushed to GHCR. There is no registry
choice, Docker Hub login probe, or registry fallback. The Phase 4 orchestrator
first validates every selected service's context, Dockerfile, and build plan,
plus the Docker daemon, Buildx capability, and Node.js 18+ runtime. The helper
rechecks the service handled by each invocation. A broken local build plan must
fail before an OAuth flow begins.

For the first build, prepare the `github.com` account used by `gh`:

```bash
gh auth status --active --hostname github.com
GH_USER=$(gh api --hostname github.com user -q .login)
```

Tell the user which GitHub account and lower-case GHCR namespace will be used,
but do not ask them to select a registry or enter a registry username,
password, or host. Before the first push, ensure the `gh` session has
`write:packages`; that scope is sufficient for both the push and this
workflow's later private-image pull Secret.

If the current session is missing the scope, run:

```bash
node "<SKILL_DIR>/scripts/gh-refresh-scopes.mjs" write:packages
```

When `build-push.mjs` or `ensure-image-pull-secret.mjs` runs in a TTY, it asks
once before refreshing missing scopes. If a refresh succeeds but the required
scope is still absent, it performs a full
`gh auth login --hostname github.com --web --scopes write:packages` and
re-checks the session. If `gh` is not authenticated, let the helper start that
same `github.com` login flow and retry automatically after it completes.

Do not ask the user to open another terminal when the current session can run a
PTY command. Never place the GitHub token in a shell command, log, generated
template, or project artifact; the helper passes it directly to
`docker login ghcr.io --password-stdin`.

### 4.1 Build & Push

When the service name differs from the repository name, the helper uses its
filesystem-safe unique service key in
`ghcr.io/<github-user>/<repo-name>-<service-key>:YYYYMMDD-HHMMSS-<random>`
(for example,
`ghcr.io/zhujingyang/kite-api:20260304-143022-a1b2c3`). The service suffix prevents
multi-service builds from overwriting one another. When `--service` is omitted,
or the implicit single-app service has the repository name, the helper retains
the legacy single-application
`ghcr.io/<github-user>/<repo-name>:YYYYMMDD-HHMMSS-<random>` form. The random
suffix prevents concurrent builds in the same second from reusing a tag.

Before invoking the build helper, create the build artifact directory:

```bash
mkdir -p "$WORK_DIR/.sealos/build"
```

Run the validated helper for each service:
```bash
node "<SKILL_DIR>/scripts/build-push.mjs" "$WORK_DIR" "<repo-name>" \
  --service "<service>" \
  --context "<context>" \
  --dockerfile "<dockerfile-relative-to-context>" \
  --target "<optional-target>" \
  --build-arg "<ARG_NAME>"
```

Run one invocation for every build-required service. Omit `--target` when the
plan has no target and repeat `--build-arg` for each required argument. Resolve
argument values from the original project declaration, the current environment,
or authorized user configuration at execution time; never persist or print
secret values.

Success output returns the immutable image plus the pushed tag:
`{ "success": true, "service": "<service>", "image": "<repository>@sha256:<digest>", "pushed_image": "<repository>:<tag>", "digest": "sha256:<digest>", "platforms": ["linux/amd64"], "registry": "ghcr", "pull_access": "<anonymous|ghcr_secret_required|indeterminate>", "requires_image_pull_secret": <boolean> }`.
Failure output remains `{ "success": false, "error": "..." }`.

After the push, the helper checks anonymous pull access using the final digest,
not the temporary tag, and writes the result to the per-service artifact:

- `anonymous`: Sealos can pull the digest without credentials.
- `ghcr_secret_required`: GHCR explicitly requires authentication.
- `indeterminate`: a transient or registry error prevented a trustworthy
  decision.

Continue with the pushed digest in all three cases. Phase 5 adds the app-scoped
pull Secret reference and Phase 6 creates the Secret only for
`ghcr_secret_required` or `indeterminate`. Existing public images and
`anonymous` GHCR results do not enter that path.

There is no direct-Docker fallback for Phase 4. Node.js 18+ is a conditional
dependency of the local build path because every attempted service must produce
the same validated per-service artifact.

### 4.2 Error Handling

Classify the failure before changing project files:

- A Dockerfile, build context, dependency, `.dockerignore`, target, or declared
  build-input failure is a **build-plan failure**. Route only that service back
  to Phase 3.
- GitHub authentication or scopes, GHCR availability, networking, Docker
  daemon, Buildx availability, or push transport is a **Phase 4 execution
  failure**. Repair or retry it in Phase 4; never modify source or a Dockerfile
  in response.

For a build-plan failure:
1. Read the error output.
2. Load error patterns from internal skill:
   ```
   <SKILL_DIR>/../dockerfile-skill/knowledge/error-patterns.md
   ```
3. Route only that service back to Phase 3.
4. Match the concrete error → minimally repair that service's Dockerfile,
   `.dockerignore`, or build plan → retry the exact service.
5. Also consult if needed:
   ```
   <SKILL_DIR>/../dockerfile-skill/knowledge/system-deps.md
   <SKILL_DIR>/../dockerfile-skill/knowledge/best-practices.md
   ```
6. Allow at most 3 build-plan repair attempts for the failing service.
7. If still failing → inform user with the specific service and error and
   suggest manual review.

Do not rerun or rewrite successful services, and do not invoke the standalone
dockerfile-skill build/runtime workflow. Phase 4's actual `linux/amd64` Buildx
result is the feedback loop. Authentication and infrastructure retries do not
consume the build-plan repair limit.

### 4.3 Record Result

Always write `.sealos/build/<service-key>/build-result.json` for every service
that Phase 4 attempts. `<service-key>` is the helper's filesystem-safe form of
the original service name:

- Success: `outcome: "success"` plus pushed image metadata
- Failure: `outcome: "failed"` plus the captured error message

This avoids leaving an empty service directory after a failed build and makes
resume/debug behavior inspectable without conflating multiple services.

Each result records the service identity, effective context, Dockerfile,
optional target, build-argument names, pushed tag, and requested platform,
without build-argument values. On success it also records the Buildx metadata
digest, immutable `image_ref`, and `pull_access`. The helper builds with
`--platform linux/amd64` and refuses a success artifact unless Buildx returns a
valid digest.

### Update analysis.json

For each successful build, update the matching `service_inventory` entry with
`image_status: "built"`, the requested build platforms, digest, and immutable
`image_ref`. Set top-level `image_ref` only when the completed topology has
exactly one application workload; otherwise keep it `null`. Never replace the
whole project's inventory with the last image that happened to build.

---

## Phase 5: Generate Sealos Template

### 5.1 Load Sealos Rules

Read the internal skill's specifications:
```
<SKILL_DIR>/../docker-to-sealos/SKILL.md                       — 7-step workflow + MUST rules
<SKILL_DIR>/../docker-to-sealos/references/sealos-specs.md     — Sealos ordering, labels, conventions
<SKILL_DIR>/../docker-to-sealos/references/conversion-mappings.md — field-level Docker→Sealos mappings
<SKILL_DIR>/../docker-to-sealos/references/example-guide.md    — representative template structure
<SKILL_DIR>/../docker-to-sealos/references/must-rules-map.yaml — executable rule coverage
```

If the project uses databases, also read:
```
<SKILL_DIR>/../docker-to-sealos/references/database-templates.md
```

If the project mentions Frappe, ERPNext, HRMS, or `bench`, also read:
```
<SKILL_DIR>/../docker-to-sealos/references/frappe-bench.md
```

Phase 5 runs only when Phase 1.5 chose `continue_standard_pipeline`. Generate
the template from the current project and the current `docker-to-sealos` rules.
Do not read catalog YAML in the current implementation; structurally similar
template references remain the explicit Phase 1.5 TODO.

### 5.2 Generate Template

Read `.sealos/analysis.json` and use `image_inventory`,
`service_inventory`, `image_ref`, `port`, `databases`, and `env_vars` as
inputs. `image_ref` is only a compatibility shortcut for a single
application; the inventories are authoritative for multi-service projects.

Generate the template at `.sealos/template/index.yaml` (overrides the default `template/` path from docker-to-sealos skill).
Do not create another template-generation artifact.

Before conversion or validation, require Python with PyYAML. Phase 0 installs
this dependency when it is missing; Phase 5 re-checks the capability before
running any converter:

```bash
PYTHON_BIN="$(command -v python3 || command -v python || true)"
if [ -z "$PYTHON_BIN" ] || ! "$PYTHON_BIN" -c 'import yaml' >/dev/null 2>&1; then
  echo "Phase 5 requires Python with PyYAML; return to Phase 0 for dependency installation and retry." >&2
  exit 1
fi
```

Route generation from `analysis.json.deployment_source.kind`:

- `compose` uses the deterministic Compose converter as the generation baseline.
- `helm` uses the rendered Kubernetes YAML produced by the Phase 2 source
  inspector and the Kubernetes source adapter. Helm is rendered from a temporary
  Chart copy with `helm template --no-hooks`; never run `helm install`.
- `kubernetes` uses the rendered/raw Kubernetes YAML and the same Kubernetes
  source adapter.
- `implicit-single-service` is the only route allowed to synthesize a temporary
  one-service Compose input.

Every route uses a dry-run converter invocation and writes only the canonical
`.sealos/template/index.yaml`. The explicit Helm/Kubernetes routes additionally
write the declared source mapping and topology evidence artifacts. Missing
adapter capabilities, an unrenderable source, unresolved explicit topology, or
converter failure is a hard stop, not permission to hand-write around the
failure.

For a multi-service Compose project, `config.json.public_service` may name the
one service that should receive the public Ingress. If exactly one application
service declares `ports`, the converter selects it automatically. If multiple
application services declare `ports` and no `public_service` is supplied,
conversion stops instead of using declaration order.

```bash
APP_NAME="$(
  "$PYTHON_BIN" -c \
    'import json, sys; value = json.load(open(sys.argv[1], encoding="utf-8"))["project"]["repo_name"]; print(value.rsplit("/", 1)[-1])' \
    "$WORK_DIR/.sealos/analysis.json"
)" || {
  echo "Unable to read the app name from analysis.json; Phase 5 stopped." >&2
  exit 1
}
GITHUB_URL="$(
  "$PYTHON_BIN" -c \
    'import json, sys; value = json.load(open(sys.argv[1], encoding="utf-8"))["project"]["github_url"]; print(value or "")' \
    "$WORK_DIR/.sealos/analysis.json"
)" || {
  echo "Unable to read the GitHub URL from analysis.json; Phase 5 stopped." >&2
  exit 1
}
DEPLOYMENT_SOURCE_KIND="$(
  "$PYTHON_BIN" - "$WORK_DIR/.sealos/analysis.json" <<'PY'
import json
import sys
from pathlib import Path

analysis = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
source = analysis.get("deployment_source") or {}
kind = source.get("kind")
if kind:
    print(kind)
elif any((Path(sys.argv[1]).parent.parent / name).is_file() for name in (
    "compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"
)):
    print("compose")
else:
    print("implicit-single-service")
PY
)" || {
  echo "Unable to read deployment_source from analysis.json; Phase 5 stopped." >&2
  exit 1
}
case "$DEPLOYMENT_SOURCE_KIND" in
  compose|helm|kubernetes|implicit-single-service) ;;
  *)
    echo "Unsupported deployment_source.kind: $DEPLOYMENT_SOURCE_KIND" >&2
    exit 1
    ;;
esac

IMAGE_OVERRIDE_ARGS=()
if [ "$DEPLOYMENT_SOURCE_KIND" != "implicit-single-service" ]; then
  while IFS=$'\t' read -r SERVICE_NAME SERVICE_IMAGE; do
    if [ -n "$SERVICE_NAME" ] && [ -n "$SERVICE_IMAGE" ]; then
      IMAGE_OVERRIDE_ARGS+=(--image-override "$SERVICE_NAME=$SERVICE_IMAGE")
    fi
  done < <(
    "$PYTHON_BIN" - "$WORK_DIR/.sealos/analysis.json" <<'PY'
import json
import sys

analysis = json.load(open(sys.argv[1], encoding="utf-8"))
for service in analysis.get("service_inventory", []):
    name = service.get("name")
    image_ref = service.get("image_ref")
    if isinstance(name, str) and name and isinstance(image_ref, str) and image_ref:
        print(f"{name}\t{image_ref}")
PY
  )
fi

PUBLIC_SERVICE_ARGS=()
if [ "$DEPLOYMENT_SOURCE_KIND" != "implicit-single-service" ] && [ -f "$WORK_DIR/.sealos/config.json" ]; then
  PUBLIC_SERVICE="$(
    "$PYTHON_BIN" - "$WORK_DIR/.sealos/config.json" <<'PY'
import json
import sys
from pathlib import Path

config = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
value = config.get("public_service", "")
if value is None:
    value = ""
if not isinstance(value, str):
    raise SystemExit("config.json public_service must be a string")
print(value.strip())
PY
  )" || {
    echo "Unable to read public_service from .sealos/config.json; Phase 5 stopped." >&2
    exit 1
  }
  if [ -n "$PUBLIC_SERVICE" ]; then
    PUBLIC_SERVICE_ARGS=(--public-service "$PUBLIC_SERVICE")
  fi
fi

IMAGE_PULL_SECRET_ARGS=()
while IFS= read -r SERVICE_NAME; do
  if [ -n "$SERVICE_NAME" ]; then
    IMAGE_PULL_SECRET_ARGS+=(--image-pull-secret-service "$SERVICE_NAME")
  fi
done < <(
  "$PYTHON_BIN" - "$WORK_DIR" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
seen = set()
build_root = root / ".sealos" / "build"
if build_root.is_dir():
    for path in sorted(build_root.rglob("build-result.json")):
        try:
            result = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if result.get("outcome") != "success":
            continue
        if result.get("push", {}).get("pull_access") not in {"ghcr_secret_required", "indeterminate"}:
            continue
        service_name = result.get("service", {}).get("name")
        if isinstance(service_name, str) and service_name and service_name not in seen:
            seen.add(service_name)
            print(service_name)
PY
)

mkdir -p "$WORK_DIR/.sealos/template" "$WORK_DIR/.sealos/deployment-source"

if [ "$DEPLOYMENT_SOURCE_KIND" = "helm" ] || [ "$DEPLOYMENT_SOURCE_KIND" = "kubernetes" ]; then
  SOURCE_RENDERED_PATH="$(
    "$PYTHON_BIN" - "$WORK_DIR/.sealos/analysis.json" <<'PY'
import json
import sys
from pathlib import Path

analysis = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
source = analysis.get("deployment_source") or {}
rendered = source.get("rendered_path")
if not isinstance(rendered, str) or not rendered:
    raise SystemExit("explicit deployment_source has no rendered_path")
print(rendered)
PY
  )" || {
    echo "Unable to resolve the rendered deployment source; Phase 5 stopped." >&2
    exit 1
  }
  SOURCE_MANIFEST="$WORK_DIR/${SOURCE_RENDERED_PATH#./}"
  if [ ! -f "$SOURCE_MANIFEST" ]; then
    echo "Rendered deployment source does not exist: $SOURCE_RENDERED_PATH" >&2
    exit 1
  fi
  mkdir -p "$WORK_DIR/.sealos/topology-evidence"
  GENERATED_TEMPLATE="$(
    "$PYTHON_BIN" "<SKILL_DIR>/../docker-to-sealos/scripts/kubernetes_to_template.py" \
      --manifests "$SOURCE_MANIFEST" \
      --app-name "$APP_NAME" \
      --git-repo "$GITHUB_URL" \
      "${IMAGE_OVERRIDE_ARGS[@]}" \
      "${PUBLIC_SERVICE_ARGS[@]}" \
      "${IMAGE_PULL_SECRET_ARGS[@]}" \
      --mapping-output "$WORK_DIR/.sealos/deployment-source/resource-map.json" \
      --topology-evidence-output "$WORK_DIR/.sealos/topology-evidence/$APP_NAME.yaml" \
      --dry-run
  )" || {
    echo "Deterministic Kubernetes source conversion failed; Phase 5 stopped." >&2
    exit 1
  }
  printf '%s\n' "$GENERATED_TEMPLATE" > "$WORK_DIR/.sealos/template/index.yaml"
else
COMPOSE_FILE=""
if [ "$DEPLOYMENT_SOURCE_KIND" = "compose" ]; then
  COMPOSE_SOURCE_PATH="$(
    "$PYTHON_BIN" - "$WORK_DIR/.sealos/analysis.json" <<'PY'
import json
import sys
from pathlib import Path

analysis = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
source = analysis.get("deployment_source") or {}
path = source.get("path")
if isinstance(path, str) and path:
    print(path)
PY
  )"
  if [ -n "$COMPOSE_SOURCE_PATH" ]; then
    COMPOSE_FILE="$WORK_DIR/${COMPOSE_SOURCE_PATH#./}"
  else
    for candidate in compose.yaml compose.yml docker-compose.yaml docker-compose.yml; do
      if [ -f "$WORK_DIR/$candidate" ]; then
        COMPOSE_FILE="$WORK_DIR/$candidate"
        break
      fi
    done
  fi
  if [ ! -f "$COMPOSE_FILE" ]; then
    echo "Selected Compose source does not exist; Phase 5 stopped." >&2
    exit 1
  fi
fi

TEMP_COMPOSE_DIR=""
SYNTHETIC_COMPOSE=false
if [ -z "$COMPOSE_FILE" ]; then
  TEMP_COMPOSE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/sealos-deploy-compose.XXXXXX")" || {
    echo "Unable to create a temporary Compose directory; Phase 5 stopped." >&2
    exit 1
  }
  COMPOSE_FILE="$TEMP_COMPOSE_DIR/compose.yaml"
  SYNTHETIC_COMPOSE=true
  "$PYTHON_BIN" - "$WORK_DIR/.sealos/analysis.json" "$COMPOSE_FILE" <<'PY' || {
import json
import re
import sys
from pathlib import Path

import yaml

analysis = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
services = analysis.get("service_inventory") or []
if len(services) > 1:
    raise SystemExit(
        "no-Compose Phase 5 supports one implicit application service only; "
        "preserve multi-service topology in an explicit Compose input"
    )
if analysis.get("databases"):
    raise SystemExit(
        "no-Compose Phase 5 requires explicit dependency topology before converting "
        "a project with database dependencies"
    )
service = next(
    (item for item in services if item.get("role") == "application"),
    services[0] if services else {},
)
repo_name = analysis.get("project", {}).get("repo_name") or "app"
raw_name = service.get("name") or repo_name.rsplit("/", 1)[-1]
service_name = str(raw_name).strip()
if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", service_name):
    service_name = re.sub(r"[^a-z0-9-]+", "-", service_name.lower()).strip("-") or "app"
image_ref = service.get("image_ref") or analysis.get("image_ref")
if not isinstance(image_ref, str) or not re.fullmatch(r"[^@\s]+@sha256:[0-9a-fA-F]{64}", image_ref):
    raise SystemExit(
        "no-Compose Phase 5 requires one immutable service image_ref after Phase 4"
    )
port = analysis.get("port")
if isinstance(port, bool) or not isinstance(port, int) or not 1 <= port <= 65535:
    raise SystemExit(
        "no-Compose Phase 5 requires a detected application port in analysis.json"
    )

environment = {}
for key, spec in (analysis.get("env_vars") or {}).items():
    if not re.fullmatch(r"[A-Z][A-Z0-9_]*", str(key)) or not isinstance(spec, dict):
        continue
    default = spec.get("default")
    category = spec.get("category")
    if isinstance(default, str):
        environment[key] = default
    elif category in {"required", "optional"}:
        environment[key] = f"${{{{ inputs.{key} }}}}"
    elif category == "auto":
        raise SystemExit(
            f"no-Compose Phase 5 must resolve auto-managed environment variable {key} "
            "before template conversion"
        )

service_data = {
    "image": image_ref,
    "ports": [f"{port}:{port}"],
}
if environment:
    service_data["environment"] = environment

Path(sys.argv[2]).write_text(
    yaml.safe_dump({"services": {service_name: service_data}}, sort_keys=False),
    encoding="utf-8",
)
PY
    echo "Unable to synthesize a Compose input for the no-Compose project; Phase 5 stopped." >&2
    rm -f "$COMPOSE_FILE"
    rmdir "$TEMP_COMPOSE_DIR" 2>/dev/null || true
    exit 1
  }
fi

  KOMPOSE_MODE=always
  if [ "$SYNTHETIC_COMPOSE" = true ]; then
    KOMPOSE_MODE=auto
  fi
  GENERATED_TEMPLATE="$(
    "$PYTHON_BIN" "<SKILL_DIR>/../docker-to-sealos/scripts/compose_to_template.py" \
      --compose "$COMPOSE_FILE" \
      --app-name "$APP_NAME" \
      --git-repo "$GITHUB_URL" \
      --kompose-mode "$KOMPOSE_MODE" \
      --no-fetch-logo \
      "${IMAGE_OVERRIDE_ARGS[@]}" \
      "${PUBLIC_SERVICE_ARGS[@]}" \
      "${IMAGE_PULL_SECRET_ARGS[@]}" \
      --dry-run
  )" || {
    if [ -n "$TEMP_COMPOSE_DIR" ]; then
      rm -f "$COMPOSE_FILE"
      rmdir "$TEMP_COMPOSE_DIR" 2>/dev/null || true
    fi
    echo "Deterministic Compose conversion failed; Phase 5 stopped." >&2
    exit 1
  }

  if [ "$SYNTHETIC_COMPOSE" = true ]; then
    GENERATED_TEMPLATE_FILE="$(mktemp "${TMPDIR:-/tmp}/sealos-deploy-template.XXXXXX.yaml")" || {
      rm -f "$COMPOSE_FILE"
      rmdir "$TEMP_COMPOSE_DIR" 2>/dev/null || true
      echo "Unable to create a temporary generated template; Phase 5 stopped." >&2
      exit 1
    }
    printf '%s\n' "$GENERATED_TEMPLATE" > "$GENERATED_TEMPLATE_FILE"
    "$PYTHON_BIN" - "$GENERATED_TEMPLATE_FILE" "$WORK_DIR/.sealos/analysis.json" <<'PY' || {
from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

template_path = Path(sys.argv[1])
analysis_path = Path(sys.argv[2])
documents = list(yaml.safe_load_all(template_path.read_text(encoding="utf-8")))
analysis = json.loads(analysis_path.read_text(encoding="utf-8"))
input_specs = {}
for name, raw_spec in (analysis.get("env_vars") or {}).items():
    if not isinstance(name, str) or not isinstance(raw_spec, dict):
        continue
    category = raw_spec.get("category")
    if category not in {"required", "optional"}:
        continue
    spec = {
        "description": raw_spec.get("description") or f"Value for {name}",
        "type": "string",
        "required": category == "required",
    }
    default = raw_spec.get("default")
    if isinstance(default, str):
        spec["default"] = default
    elif category == "optional":
        spec["default"] = ""
    input_specs[name] = spec

for document in documents:
    if not isinstance(document, dict) or document.get("kind") != "Template":
        continue
    template_spec = document.setdefault("spec", {})
    existing = template_spec.get("inputs")
    if not isinstance(existing, dict):
        existing = {}
    existing.update(input_specs)
    if existing:
        template_spec["inputs"] = existing

template_path.write_text(
    "\n---\n".join(
        yaml.safe_dump(document, sort_keys=False, allow_unicode=True).rstrip()
        for document in documents
    )
    + "\n",
    encoding="utf-8",
)
PY
      rm -f "$GENERATED_TEMPLATE_FILE" "$COMPOSE_FILE"
      rmdir "$TEMP_COMPOSE_DIR" 2>/dev/null || true
      echo "Unable to add no-Compose environment inputs to the generated template; Phase 5 stopped." >&2
      exit 1
    }
    GENERATED_TEMPLATE="$(<"$GENERATED_TEMPLATE_FILE")"
    rm -f "$GENERATED_TEMPLATE_FILE"
  fi
  if [ -n "$TEMP_COMPOSE_DIR" ]; then
    rm -f "$COMPOSE_FILE"
    rmdir "$TEMP_COMPOSE_DIR" 2>/dev/null || true
  fi
  printf '%s\n' "$GENERATED_TEMPLATE" > "$WORK_DIR/.sealos/template/index.yaml"
fi
```

The synthetic no-Compose input is temporary and is never written under
`WORK_DIR`. This adapter is intentionally limited to one implicit application
service without an unrepresented database or additional service topology.
Required and optional classified environment variables are carried as Template
inputs. Auto-managed variables with known defaults are included directly; an
auto-managed variable without a resolved value stops conversion until Phase 5
applies the existing database, public-URL, object-storage, or secret-generation
rule that owns it.

The Helm/Kubernetes adapter writes `.sealos/deployment-source/resource-map.json`
and `.sealos/topology-evidence/<app-name>.yaml` beside the canonical template.
Every source resource must appear in the mapping exactly once; filtered resources
must have an explicit `filtered` action, and transformed resources must identify
their equivalent output. The topology evidence file is passed to the same
quality gate as the template. An explicit multi-service source is never allowed
to fall back to the synthetic single-service route.

For converted templates, map each inventory digest to the service it
represents. Never apply one top-level `analysis.json.image_ref` to every
workload. Pass each available per-service digest with
`--image-override SERVICE=IMAGE`; this is required for build-only Compose
services and leaves the project's Compose file unchanged.

Build-result pull access is handed off by the same service key. Scan every
`.sealos/build/**/build-result.json`, keep only `outcome: "success"` results
whose `push.pull_access` is `ghcr_secret_required` or `indeterminate`, and
pass one repeatable `--image-pull-secret-service SERVICE` argument for each
distinct `service.name`. Do not pass this argument for `anonymous` results,
reused images, failed results, or KubeBlocks database services. The converter
validates every service key and injects the app-scoped
`${{ defaults.app_name }}` Secret only into that service's emitted workload;
it never adds a pull Secret based solely on a `ghcr.io` hostname.

The converter requires each effective image to resolve to an immutable digest
but does not pre-screen third-party image architecture. Treat the converter's database
classification as immutable:
application-specific edits must not replace a KubeBlocks database `Cluster`
with a Deployment, StatefulSet, Service, or other generic workload. Likewise,
do not drop cache, queue, search, storage, proxy, gateway, or worker services;
retain them or document and implement an equivalent Sealos-native
transformation.

**Public URL detection:**
After generating the base template, check if the app needs its public URL configured:

1. Search source code for common URL config patterns:
   - Env vars: `BASE_URL`, `SITE_URL`, `APP_URL`, `NEXTAUTH_URL`, `PUBLIC_URL`, `EXTERNAL_URL`
   - Config files: `getConfig(.*[Uu]rl`, `homeUrl`, `baseUrl`, `siteUrl` in config patterns
   - Docker Compose env vars referencing `localhost` or placeholder URLs

2. If public URL is needed via env var:
   - Add the appropriate env var to the Deployment with value `https://${{ defaults.app_host }}.${{ SEALOS_CLOUD_DOMAIN }}`

3. If public URL is needed via config file (e.g., node-config):
   - Create a ConfigMap with the minimal config file
   - Add volumeMount and volume to the Deployment
   - Follow ConfigMap MUST rules (labels, naming, ordering before Deployment)

**Critical MUST rules (always apply):**
- `metadata.name`: hardcoded lowercase, no variables
- Every emitted container image reference: immutable
  `<repository>@sha256:<digest>`. Source tags such as `latest`, `stable`, `v2`,
  exact versions, and omitted tags are all valid resolution inputs.
- PVC requests: `<= 1Gi`
- Container defaults: `cpu: 200m/20m`, `memory: 256Mi/25Mi`
- Init containers must define explicit resources; do not rely on namespace defaults. For expensive init work such as framework install, database migration, asset compilation, or `bench new-site`, allocate enough memory for the task.
- `imagePullPolicy: IfNotPresent`
- `revisionHistoryLimit: 1`
- `automountServiceAccountToken: false`
- Add `template.spec.imagePullSecrets: [{ name: ${{ defaults.app_name }} }]` to
  every workload whose Phase 4 result has `push.pull_access` equal to
  `ghcr_secret_required` or `indeterminate`; omit it for `anonymous` results
  and reused public images
- Every `spec.defaults.<name>.value` and every present `spec.inputs.<name>.default` must deserialize as a YAML string; quote numeric-, boolean-, and null-like values, while infrastructure fields such as replicas and ports remain numeric
- **App CRD** (last resource): only `spec.data.url`, `spec.displayType`, `spec.icon`, `spec.name`, `spec.type` — no other fields (no `menuData`, `nameColor`, `template`, etc.)
- **App CRD fixed enums**: `spec.displayType` must be `normal`; `spec.type` must be `link`

### 5.3 Validate

Run the complete sibling quality gate:
```bash
QUALITY_ARTIFACTS="$WORK_DIR/.sealos/template/index.yaml"
TOPOLOGY_EVIDENCE="$WORK_DIR/.sealos/topology-evidence/$APP_NAME.yaml"
if [ -f "$TOPOLOGY_EVIDENCE" ]; then
  QUALITY_ARTIFACTS="$QUALITY_ARTIFACTS,$TOPOLOGY_EVIDENCE"
fi
"$PYTHON_BIN" "<SKILL_DIR>/../docker-to-sealos/scripts/quality_gate.py" \
  --artifacts "$QUALITY_ARTIFACTS"
```

Any non-zero exit stops Phase 5. Fix the existing `index.yaml` and rerun the complete gate before interactive configuration. In particular, `R052` means a Template default was parsed as a YAML number, boolean, or null instead of the string required by the Template CRD.

Template is written to `.sealos/template/index.yaml`. No separate checkpoint file — the template file's existence is sufficient for resume detection.

---

## Phase 5.5: Interactive Configuration

This phase belongs only to the standard template-generation route. After
generating the template, guide the user through application configuration before deployment.
This is a **critical** step — most applications need user-specific configuration to function properly.

### 5.5.1 Extract Configuration from Template

Parse the generated template YAML and categorize all environment variables and inputs:

**Category A — Auto-managed (no user action needed):**
- `defaults.*` values: `app_name`, `app_host`, random passwords/keys (`${{ random(N) }}`)
- Database connections via `secretKeyRef`: host, port, username, password from Kubeblocks secrets
- Object storage credentials via `secretKeyRef`
- Composed URLs that reference auto-managed vars (e.g., `DATABASE_URL` built from `$(DB_HOST):$(DB_PORT)`)
- Internal service FQDNs (`*.${{ SEALOS_NAMESPACE }}.svc.cluster.local`)

**Category B — User-required inputs:**
- Template `inputs` with `required: true` and no sensible default
- Template `inputs` with `required: true` and `default: ''` for non-administrator fields; the empty default means the deployer must provide the value before deploy
- Administrator username/password inputs are user-required when the app supports bootstrap admin customization; both fields must be required and omit `default`
- Env vars with empty or placeholder values that the app cannot function without
- Common examples: admin username, admin password, admin email, external API keys (OpenAI, SMTP credentials, OAuth client ID/secret)

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
4. For administrator username/password inputs, collect both values from the user and pass them to the Template API args; keep the template input definitions required with no defaults.

**For optional inputs:**
1. Show the default values
2. Ask: "Do you want to change any of these? (press Enter to keep defaults)"
3. Only update values the user explicitly wants to change

**For unfamiliar env vars:**
If the AI is unsure what a variable does, read the project README, `.env.example`, or source code to explain it to the user before asking for a value.

### 5.5.4 Apply Configuration to Template

Keep user-required `inputs` definitions in the template and pass user-provided values through Template API args:

```yaml
inputs:
  ADMIN_USERNAME:
    description: 'Administrator login username'
    type: string
    required: true
  ADMIN_PASSWORD:
    description: 'Administrator login password'
    type: string
    required: true
```

Record all user choices as `CONFIG` for use in Phase 6:
```
CONFIG.args = { ADMIN_USERNAME: "admin", ADMIN_PASSWORD: "<secret>", OPENAI_API_KEY: "sk-..." }
```
These `args` will be passed to the Template API's `args` field (Phase 6.2), which overrides or supplies `spec.inputs` in the template.

### 5.5.5 Deployment Confirmation

Immediately before presenting the deployment confirmation, run the complete quality gate again against the exact final template:

```bash
QUALITY_ARTIFACTS="$WORK_DIR/.sealos/template/index.yaml"
TOPOLOGY_EVIDENCE="$WORK_DIR/.sealos/topology-evidence/$APP_NAME.yaml"
if [ -f "$TOPOLOGY_EVIDENCE" ]; then
  QUALITY_ARTIFACTS="$QUALITY_ARTIFACTS,$TOPOLOGY_EVIDENCE"
fi
"$PYTHON_BIN" "<SKILL_DIR>/../docker-to-sealos/scripts/quality_gate.py" \
  --artifacts "$QUALITY_ARTIFACTS"
```

This final run is required even if Phase 5.3 already passed. Any non-zero exit stops the workflow before Phase 6; fix the existing template and rerun the gate. Do not deploy while the gate is failing.

After the final gate passes, present a summary and ask for confirmation:

```
Ready to deploy <app-name> to Sealos Cloud:

  Image:    zhujingyang/app@sha256:<digest>
  Region:   https://usw-1.sealos.io
  Database: PostgreSQL 16 (auto-provisioned)
  Config:   3 required inputs configured, 2 optional defaults kept

  Proceed with deployment? (y/n)
```

Wait for user confirmation before continuing to Phase 6.

Configuration is applied directly to `.sealos/template/index.yaml`. No separate checkpoint — the template contains the final configured state.

---

## Phase 6: Deploy to Sealos Cloud

### 6.0 Select Template and Resolve Inputs

Both DEPLOY routes use the same path:

```bash
TEMPLATE_PATH="$WORK_DIR/.sealos/template/index.yaml"
```

Before any Template API request or `kubectl apply`, establish the namespace
from the kubeconfig that preflight selected. Keep this exact value in
`NAMESPACE` for pull-Secret creation, readiness checks, runtime truth, and
state recording. An empty or malformed namespace is a hard stop; never let
`kubectl` silently fall back to `default`.

```bash
NAMESPACE=$(KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  config view --minify -o jsonpath='{.contexts[0].context.namespace}')
case "$NAMESPACE" in
  ''|*[!a-z0-9-]*)
    echo "The selected kubeconfig has no valid namespace; Phase 6 stopped." >&2
    exit 1
    ;;
esac
if [ "${#NAMESPACE}" -gt 63 ] || [ "${NAMESPACE#-}" != "$NAMESPACE" ] || [ "${NAMESPACE%-}" != "$NAMESPACE" ]; then
  echo "The selected kubeconfig namespace is not a valid Kubernetes namespace; Phase 6 stopped." >&2
  exit 1
fi
export NAMESPACE
```

The complete Phase 6 → 6.5 path requires Node.js 18+. If only the curl/jq
transport fallback is available, stop before creating resources; it cannot run
the mandatory live-footprint, log, networking, and smoke helpers in Phase 6.5.

For `continue_standard_pipeline`, this is the Phase 5 template and
`CONFIG.args` comes from Phase 5.5.

For `deploy_official_template`, first rerun Phase 1.5 with a fresh official
catalog checkout and rerun the current-source alignment guard. Do not trust a
locally cached `verified_for_reuse` flag or matching local reference/template
pair. Continue only when this new run again selects `deploy_official_template`
and rematerializes the official YAML; otherwise return to Phase 2. Then read the
Template document's `spec.inputs`:

- collect every required value that has no usable default
- show optional defaults and let the user override them
- do not rewrite or “improve” the official YAML
- explain that this deploy uses the official template's images and resources,
  not a new image built from the current checkout
- present the template name, catalog commit, region, dependencies, and input
  count, then obtain the same deployment confirmation required by Phase 5.5

Keep collected values in `CONFIG.args`. Never print sensitive values or put them
on a command line. If arguments are needed, write only the JSON argument object
to a mode-`0600` temporary file outside the project, pass it with `--args-file`
to both dry-run and deployment, and remove it immediately afterward. If the
template needs no values, omit the argument option entirely.

### 6.1 Construct Deploy URL

The template deploy API uses a fixed `template.` subdomain prefix on the region domain:

```
Region example:     https://usw-1.sealos.io
Deploy URL example: https://template.usw-1.sealos.io/api/v2alpha/templates/raw
```

Do not send requests to the literal placeholder form `https://template.<region-domain>/...`.
Always derive `REGION_DOMAIN` first, then build `DEPLOY_URL` from the real value.

The Node.js helper reads and normalizes `auth.json` itself. When using the
preferred Node path, do not run a separate `jq` extraction or create a second
URL value. Only the curl transport fallback needs the following shell
derivation:

```bash
REGION=$(jq -r '.region' ~/.sealos/auth.json)
REGION_DOMAIN=$(printf '%s' "$REGION" | sed -E 's#^https?://##; s#/$##')
DEPLOY_URL="https://template.${REGION_DOMAIN}/api/v2alpha/templates/raw"
```

If the curl fallback is selected, `jq` must be present and the derived
`DEPLOY_URL` must be passed to both requests. The fallback remains transport
only; the Node.js requirement above still applies before the deployment can be
accepted.

### 6.1.5 Determine Pull-Secret Requirement

Before the Template API dry-run or any `kubectl apply`, inspect every Phase 4
success artifact used by the rendered template. For every artifact whose
`push.pull_access` is `ghcr_secret_required` or `indeterminate`, parse and
lowercase the first path component after `ghcr.io/`. This is its credential
namespace.

All such images in one application must have the same credential namespace,
because the app-scoped Docker config Secret intentionally contains one
credential for `ghcr.io`. If more than one namespace remains, stop before the
real create request and ask the user to rebuild the affected services under
one GitHub account. Never let a later service silently overwrite credentials
needed by an earlier service.

When exactly one credential namespace remains, set
`PULL_SECRET_REQUIRED=true` and retain one immutable image from that namespace
as `PULL_SECRET_IMAGE_REF`. Otherwise set it to `false`.

Do not create the Secret yet on the Template API route. The template normally
derives `${{ defaults.app_name }}` from server-side `random(...)`, so the real
Secret name is not known until the create response or a matching live Instance
reveals it. Creating a guessed Secret before that point can never satisfy the
workload's `imagePullSecrets` reference.

Skip the Secret path when Phase 4 did not run or every used Phase 4 artifact
records `push.pull_access: anonymous`. Do not infer private access merely from
a `ghcr.io/...` hostname, and do not run this helper for a public image reused
by Phase 2.

### 6.2 Deploy Template

Read kubeconfig, **encode it with `encodeURIComponent`**, and send as `Authorization` header.

Request body fields:
- `yaml` (required) — the full template YAML string
- `args` (optional) — template variable key-value pairs that override or supply `spec.inputs` fields. Values from Phase 5.5 or Phase 6.0 `CONFIG.args`.
- `dryRun` (optional, boolean) — if true, validates resources against K8s API without creating anything. Returns 200 with preview.

**With Node.js (preferred):**

Choose exactly one of the following alternatives from whether `CONFIG.args` is
empty. Never execute both alternatives or send a second real create request.

```bash
# When CONFIG.args is empty:
if ! node "<SKILL_DIR>/scripts/deploy-template.mjs" "$TEMPLATE_PATH" --dry-run; then
  echo "Template dry-run failed; deployment was not submitted." >&2
  exit 1
fi
if ! DEPLOY_RESULT=$(node "<SKILL_DIR>/scripts/deploy-template.mjs" "$TEMPLATE_PATH"); then
  echo "Template deployment did not return success; follow the Phase 6.3 response or uncertainty path and do not retry automatically." >&2
  exit 1
fi
if ! APP_NAME=$(printf '%s\n' "$DEPLOY_RESULT" | node "<SKILL_DIR>/scripts/extract-deploy-app-name.mjs"); then
  echo "Template deployment succeeded but did not return a valid application name; perform read-only Instance/App/workload discovery before continuing." >&2
  APP_NAME=""
fi

# When CONFIG.args is non-empty, create a new private file outside the project.
PRIVATE_ARGS_FILE=$(mktemp)
chmod 600 "$PRIVATE_ARGS_FILE"
cleanup_node_args_file() {
  rm -f "$PRIVATE_ARGS_FILE"
}
trap cleanup_node_args_file EXIT HUP INT TERM
# AI writes CONFIG.args as one JSON object to PRIVATE_ARGS_FILE without logging it.

if ! node "<SKILL_DIR>/scripts/deploy-template.mjs" "$TEMPLATE_PATH" --dry-run --args-file "$PRIVATE_ARGS_FILE"; then
  echo "Template dry-run failed; deployment was not submitted." >&2
  exit 1
fi
if ! DEPLOY_RESULT=$(node "<SKILL_DIR>/scripts/deploy-template.mjs" "$TEMPLATE_PATH" --args-file "$PRIVATE_ARGS_FILE"); then
  echo "Template deployment did not return success; follow the Phase 6.3 response or uncertainty path and do not retry automatically." >&2
  exit 1
fi
if ! APP_NAME=$(printf '%s\n' "$DEPLOY_RESULT" | node "<SKILL_DIR>/scripts/extract-deploy-app-name.mjs"); then
  echo "Template deployment succeeded but did not return a valid application name; perform read-only Instance/App/workload discovery before continuing." >&2
  APP_NAME=""
fi
cleanup_node_args_file
trap - EXIT HUP INT TERM
```

The dry-run is mandatory for both routes. Use the exact same template and args
for dry-run and the real request. Continue only after dry-run succeeds.
The private args file belongs to this workflow and is removed on success,
failure, or interruption. Never repurpose or delete a caller-owned file.

This script is the preferred execution path because it:
- reads `~/.sealos/auth.json` directly instead of fragile shell parsing
- derives `REGION_DOMAIN` from the real `region` value
- always posts to the concrete `DEPLOY_URL`
- emits structured JSON on success or failure

**Curl transport fallback (jq required):**

Use this only when the Node helper cannot make the API request while Node.js
18+ remains available for Phase 6.5. A jq-only run must stop before creating
resources; do not create an unverified deployment.

```bash
# Copy CONFIG.args into a private temporary file; never modify or remove a
# caller-owned args file.
INPUT_ARGS_FILE=${ARGS_FILE:-}
ARGS_FILE=$(mktemp)
AUTH_CONFIG=$(mktemp)
DRY_RUN_REQUEST=$(mktemp)
DEPLOY_REQUEST=$(mktemp)
DRY_RUN_RESPONSE=$(mktemp)
DEPLOY_RESPONSE=$(mktemp)
chmod 600 "$ARGS_FILE" "$AUTH_CONFIG" "$DRY_RUN_REQUEST" "$DEPLOY_REQUEST" \
  "$DRY_RUN_RESPONSE" "$DEPLOY_RESPONSE"

cleanup_template_request_files() {
  rm -f "$ARGS_FILE" "$AUTH_CONFIG" "$DRY_RUN_REQUEST" "$DEPLOY_REQUEST" \
    "$DRY_RUN_RESPONSE" "$DEPLOY_RESPONSE"
}
trap cleanup_template_request_files EXIT HUP INT TERM

# Keep the encoded kubeconfig out of curl's argv and process listings. `jq @uri`
# provides the same encodeURIComponent-compatible encoding used by the Node path.
if ! KUBECONFIG_ENCODED=$(jq -sRr @uri < ~/.sealos/kubeconfig); then
  echo "Could not encode kubeconfig for the template request." >&2
  exit 1
fi
if ! printf 'header = "Authorization: %s"\n' "$KUBECONFIG_ENCODED" > "$AUTH_CONFIG"; then
  echo "Could not prepare private template authorization." >&2
  exit 1
fi
unset KUBECONFIG_ENCODED

if [ -n "$INPUT_ARGS_FILE" ]; then
  if ! jq -e 'if type == "object" then . else error("args must be an object") end' \
    "$INPUT_ARGS_FILE" > "$ARGS_FILE" 2>/dev/null; then
    echo "Template arguments must be a JSON object; deployment was not submitted." >&2
    exit 1
  fi
else
  printf '%s\n' '{}' > "$ARGS_FILE"
fi

if ! jq -n --rawfile yaml "$TEMPLATE_PATH" \
  --slurpfile args "$ARGS_FILE" \
  '{yaml: $yaml, args: ($args[0] // {}), dryRun: true}' > "$DRY_RUN_REQUEST"; then
  echo "Could not prepare the template dry-run request." >&2
  exit 1
fi

if ! DRY_RUN_STATUS=$(curl --config "$AUTH_CONFIG" -sS -X POST "$DEPLOY_URL" \
    -H "Content-Type: application/json" \
    --data-binary @"$DRY_RUN_REQUEST" \
    -o "$DRY_RUN_RESPONSE" -w '%{http_code}'); then
  echo "Template dry-run request failed; deployment was not submitted." >&2
  exit 1
fi
case "$DRY_RUN_STATUS" in
  2??) ;;
  *)
    echo "Template dry-run was rejected (HTTP $DRY_RUN_STATUS); deployment was not submitted." >&2
    exit 1
    ;;
esac

if ! jq -n --rawfile yaml "$TEMPLATE_PATH" \
  --slurpfile args "$ARGS_FILE" \
  '{yaml: $yaml, args: ($args[0] // {})}' > "$DEPLOY_REQUEST"; then
  echo "Could not prepare the deployment request." >&2
  exit 1
fi

if ! DEPLOY_STATUS=$(curl --config "$AUTH_CONFIG" -sS -X POST "$DEPLOY_URL" \
    -H "Content-Type: application/json" \
    --data-binary @"$DEPLOY_REQUEST" \
    -o "$DEPLOY_RESPONSE" -w '%{http_code}'); then
  echo "Template deployment request failed." >&2
  exit 1
fi
case "$DEPLOY_STATUS" in
  2??) ;;
  *)
    echo "Template deployment was rejected (HTTP $DEPLOY_STATUS)." >&2
    exit 1
    ;;
esac

# Extract only the validated application name needed for an app-scoped pull
# Secret and runtime discovery. Never print or retain the raw response body.
if ! APP_NAME=$(node "<SKILL_DIR>/scripts/extract-deploy-app-name.mjs" < "$DEPLOY_RESPONSE"); then
  echo "Template deployment succeeded but did not return a valid application name; perform read-only Instance/App/workload discovery before continuing." >&2
  APP_NAME=""
fi

# Raw API bodies may contain resolved defaults or credentials. Report only
# transport status here; discover the instance and resources in Phase 6.5.
printf 'Dry-run HTTP %s; deploy HTTP %s\n' "$DRY_RUN_STATUS" "$DEPLOY_STATUS"
cleanup_template_request_files
trap - EXIT HUP INT TERM
```

Never print the curl fallback response files. They may contain submitted inputs
or server-resolved defaults. Phase 6.5 discovers the instance name and resource
summary from the live workspace after the trap removes all temporary files.

The curl fallback requires `jq`. If it is unavailable, use the preferred Node
helper; do not hand-construct credential-bearing JSON or headers.

### 6.2.1 Materialize a Required Pull Secret

After a successful real Template API create and before readiness checks, obtain
the exact application name:

- On the Node path, read only `.response.name` from the allowlisted
  `DEPLOY_RESULT` with `extract-deploy-app-name.mjs`; accept only a valid
  Kubernetes name and keep the raw response out of diagnostics.
- On the curl path, pass the private response through
  `extract-deploy-app-name.mjs` before that response is deleted; the helper
  accepts only a valid Kubernetes name and emits no response fields.
- If a successful or ambiguous response does not contain a name, perform the
  read-only Instance/App/workload discovery in Phase 6.3. Continue only when
  one matching created instance is identified; never guess a random name or
  submit a second create request.

When `PULL_SECRET_REQUIRED=true`, validate that the matching live workloads
reference that exact app-scoped Secret name, then create or refresh it
immediately:

```bash
if [ -z "${APP_NAME:-}" ]; then
  echo "Cannot create the GHCR pull Secret until the exact application name is discovered." >&2
  exit 1
fi
node "<SKILL_DIR>/scripts/ensure-image-pull-secret.mjs" \
  "$NAMESPACE" "$APP_NAME" "$PULL_SECRET_IMAGE_REF" || exit 1
```

The helper requires the active `github.com` account to match the image
namespace, keeps credentials out of template inputs and project artifacts, and
creates a `docker-registry` Secret named exactly like the application. Pods may
briefly report `ImagePullBackOff` between resource creation and Secret
materialization; readiness must converge after the Secret is present.

When `PULL_SECRET_REQUIRED=false`, do not create or refresh a Secret merely
because an image is hosted on GHCR.

### 6.3 Handle Response

All error responses use a unified format:
```json
{ "error": { "type": "...", "code": "...", "message": "...", "details": ... } }
```

| Status | Meaning | Action |
|--------|---------|--------|
| 201 | Resources created | Use only the allowlisted instance/resource summary, then run Phase 6.5 |
| 200 | Dry-run accepted (`dryRun: true`) | Show only allowlisted resource names and quota; never show resolved args/defaults |
| 400 | Validation error — `INVALID_PARAMETER` or `INVALID_VALUE` | Use the allowlisted type/code, compare `spec.inputs` with the supplied keys, and rerun local validation; never print the raw response |
| 401 | `AUTHENTICATION_REQUIRED` — missing or invalid kubeconfig | Re-run auth: `node sealos-auth.mjs login`, or switch workspace: `node sealos-auth.mjs switch <ns>` |
| 403 | `FORBIDDEN` — insufficient permissions | Inform user, check kubeconfig namespace permissions |
| 409 | `ALREADY_EXISTS` — instance already exists | Inform user, suggest different app name |
| 422 | `RESOURCE_ERROR` — K8s rejected resource spec | Use the allowlisted type/code and the same rendered file's server-side dry-run diagnostics; do not expose raw API details |
| 500/503 during dry-run | Template service unavailable before a create request | The real request was not sent; Phase 6.4 may be used |
| Network error, timeout, invalid response, or 5xx during the real request | Deployment outcome is unknown | Do not automatically retry or fall back; follow the uncertainty gate below |

After the real deployment request is sent, a transport failure or 5xx does not
prove that nothing was created:

1. Perform a read-only inventory of recently created Sealos Instances/Apps and
   the namespace footprint for the template's resource kinds.
2. If matching resources exist, treat the request as submitted and continue
   with readiness and Phase 6.5 instead of creating another copy.
3. If no matching footprint is yet visible, stop with outcome `unknown`.
   Server-side `random(...)` values may make the created names unknowable, so
   absence cannot be proved safely and this run must not retry or fall back.

Never retry or generate a second random app name or host after an ambiguous
real request. A later user-requested new deployment must be described as
potentially duplicating the unknown first request.

The preferred helper emits only an allowlisted response shape:
```json
{
  "name": "myapp-abcdefgh",
  "uid": "...",
  "resourceType": "instance",
  "displayName": "...",
  "createdAt": "...",
  "resources": [
    { "name": "myapp-abcdefgh", "uid": "...", "resourceType": "deployment", "quota": { "cpu": 0.1, "memory": 0.25, "storage": 0, "replicas": 1 } }
  ]
}
```
Response `args`, messages, arbitrary nested fields, and resolved defaults are
always omitted. Extract the instance name without exposing those fields.

### 6.3.1 Post-Deploy Readiness Verification

After a 201 response, do not assume the app is usable. The Template API path
and the kubectl fallback must both run the same bounded readiness gate before
Phase 6.5:

1. Build an exact target list from the API response's allowlisted
   `response.resources` and live owner references, or from the exact rendered
   fallback file. Never derive a workload from `APP_NAME` or declaration order.
2. For every `Deployment`, `StatefulSet`, and `DaemonSet`, run `rollout status`
   with a finite timeout.
3. For every one-shot `Job`, wait for `condition=complete` with a finite
   timeout. For every `CronJob`, confirm that the named resource exists and
   has its intended schedule.
4. For every operator-managed resource such as a KubeBlocks `Cluster`, poll
   its Ready/Running condition and its owned `Component`/`InstanceSet`
   resources with the same finite deadline.
5. For every public Service, poll until its Endpoints object is non-empty.
   An Ingress or App URL is not ready while its backend has no endpoints.

For the Template API route, the response target list can be normalized without
exposing any template arguments:

```bash
API_READINESS_TARGETS=$(mktemp)
cleanup_readiness_targets() {
  rm -f "$API_READINESS_TARGETS"
}
trap cleanup_readiness_targets EXIT HUP INT TERM
printf '%s\n' "$DEPLOY_RESULT" | node -e '
let input = "";
process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", () => {
  const data = JSON.parse(input);
  const resources = data.response?.resources || [];
  const kinds = {
    deployment: "Deployment",
    statefulset: "StatefulSet",
    daemonset: "DaemonSet",
    job: "Job",
    cronjob: "CronJob",
  };
  for (const resource of resources) {
    const kind = kinds[String(resource.resourceType || resource.kind || "").toLowerCase()];
    if (kind && resource.name) process.stdout.write(`${kind}\t${resource.name}\n`);
  }
});
' > "$API_READINESS_TARGETS"

KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  get deployment,statefulset,daemonset,job,cronjob,pod,svc,endpoints,ingress \
  -n "$NAMESPACE"
```

If the API response has no usable target list, perform the documented
read-only Instance/App/workload discovery and continue only after one
unambiguous created footprint is identified. Scope subsequent checks to those
actual names and owner references; do not assume an `app=<name>` label.

Run the target-specific waits for every line in `API_READINESS_TARGETS` (or the
equivalent list extracted from `RENDERED_FILE` on the fallback route):

```bash
while IFS=$'\t' read -r KIND NAME; do
  [ -z "$NAME" ] && continue
  case "$KIND" in
    Deployment|StatefulSet|DaemonSet)
      KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
        rollout status "$KIND/$NAME" -n "$NAMESPACE" --timeout=120s || exit 1
      ;;
    Job)
      KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
        wait --for=condition=complete "job/$NAME" -n "$NAMESPACE" --timeout=120s || exit 1
      ;;
    CronJob)
      KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
        get "cronjob/$NAME" -n "$NAMESPACE" >/dev/null || exit 1
      ;;
  esac
done < "$API_READINESS_TARGETS"
cleanup_readiness_targets
trap - EXIT HUP INT TERM
```

For every public app Service, poll its Endpoints object for up to the same
120-second deadline before testing the URL. If the URL returns
`no healthy upstream` or HTTP 503:

```bash
wait_for_service_endpoints() {
  local service_name="$1"
  local deadline=$((SECONDS + 120))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if [ -n "$(
      KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
        get "endpoints/$service_name" -n "$NAMESPACE" \
        -o jsonpath='{range .subsets[*].addresses[*]}{.ip}{"\n"}{end}' \
        2>/dev/null
    )" ]; then
      return 0
    fi
    sleep 2
  done
  echo "Service endpoints did not become ready: $service_name" >&2
  return 1
}

# Run once for every public Service selected by Phase 5.
wait_for_service_endpoints "<public-service-name>" || exit 1
```

1. Check the endpoint object named by that Service; empty endpoints means the backend Pod is not Ready.
2. Check Pod init container status and previous logs:
   ```bash
   KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
     logs pod/<pod> -n "$NAMESPACE" -c <init-container> --previous --tail=200
   ```
3. Look for common signatures:
   - `no matching manifest`, `no match for platform in manifest`, an image OS
     that cannot run on this platform, or `exec format error`: the reused
     third-party image is incompatible with the live `linux/amd64` runtime.
     Record the exact service and digest. If that service has buildable source,
     route only it back through Phase 3/4, build with
     `--platform linux/amd64`, update the template image digest, and redeploy.
     If no buildable source exists, report the incompatibility and stop; never
     accept the deployment.
   - `ErrImagePull` or `ImagePullBackOff` without an architecture signature:
     diagnose registry authentication, visibility, name, and digest instead of
     assuming an architecture problem.
   - `OOMKilled` or exit `137`: increase init container memory and recreate the Pod.
   - `Permission denied` on mounted paths: add `fsGroup` or a one-shot permission repair for existing PVCs.
   - App-specific migration/bootstrap errors: repair the failed bootstrap state, then rerun the init path.
4. Only report the app as usable after the endpoint exists and an HTTP request to the public URL returns a non-5xx response.
5. Continue to Phase 6.5 before finalizing deployment state or reporting success.

For templates with KubeBlocks-supported databases, runtime truth must include the database control plane and generated connection surface:

```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  get cluster,component,instanceset,secret,svc -n "$NAMESPACE" \
  | grep -E '<app-name>|redis|postgres|mysql|mongo|broker'
```

Acceptance requires the KubeBlocks `Cluster` to be Ready/Running, each expected `Component` and `InstanceSet` to converge, the account Secret to exist, and the application environment to point at the expected Service FQDN. For Redis, verify both `redis` and `redis-sentinel` components, `${APP_NAME}-redis-redis-account-default`, and `${APP_NAME}-redis-redis-redis.${NAMESPACE}.svc.cluster.local`. For MongoDB, verify `${APP_NAME}-mongo-mongodb-account-root` or the matching `mongodb` suffix variant before judging app initialization.

### 6.3.2 Runtime Truth Pass for Authenticated Apps

For web apps with login or registration, verify the authenticated runtime state after the readiness checks pass:

1. Complete login or registration through the real browser form or the documented login API.
2. Capture the final browser URL, document title, and key visible text from the authenticated page.
3. Record browser network requests with HTTP 4xx/5xx status, including method, URL path, status, and response summary.
4. Check backend logs for the same failing route paths and status codes.
5. Mark the runtime pass successful only when the authenticated page loads, expected post-login content is visible, and app API requests complete without new 4xx/5xx failures.

For login success followed by 404, route mismatch, or SDK endpoint errors:

1. Record the exact failing URL and API path from browser network logs.
2. Compare the failing path with backend logs to confirm the service that answered it.
3. Compare the template against the official runtime bundle source: component image versions, console/frontend service, API service, gateway/Ingress path, and public URL env/config.
4. Repair the template by aligning the bundle versions, restoring the missing route/service, or correcting reverse-proxy path handling.
5. Redeploy and rerun the browser login pass.

### 6.4 Fallback: kubectl apply (standard route, before API creation)

Use this path only for `continue_standard_pipeline` when the Template API is
known to be unavailable before the real deployment request is sent. The
official-template route may use Template expressions that this local workflow
cannot render equivalently; if its API dry-run cannot run, stop and retry the
official API later. Never fall back after a timeout, connection interruption,
invalid response, or 5xx from a real deployment request.

**Step 1 — Gather cluster context:**
```bash
# User namespace
NAMESPACE=$(KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify config view --minify -o jsonpath='{.contexts[0].context.namespace}')

# Cluster domain (from region URL)
CLOUD_DOMAIN=$(jq -r '.region' ~/.sealos/auth.json | sed -E 's#^https?://##; s#/$##')

# TLS secret name (from existing ingress, or default)
CERT_SECRET=$(KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify get ingress -n "$NAMESPACE" -o jsonpath='{.items[0].spec.tls[0].secretName}' 2>/dev/null || echo "wildcard-cert")
```

**Step 2 — Render template variables:**

The selected template YAML contains `${{ }}` variables. The AI must replace them with actual values:

| Variable | Value |
|----------|-------|
| `${{ defaults.app_name }}` | Generate: `<app>-<random8>` (e.g., `edict-xn22k4ie`) |
| `${{ defaults.app_host }}` | Generate: `<app>-<random8>` (e.g., `edict-2v4jryz1`) |
| `${{ defaults.<key> }}` | Other defaults: generate per their `value` pattern |
| `${{ inputs.<key> }}` | User-provided values from `CONFIG.args` collected in Phase 5.5 or Phase 6.0 |
| `${{ random(N) }}` | Random alphanumeric string of length N |
| `${{ SEALOS_CLOUD_DOMAIN }}` | `CLOUD_DOMAIN` from Step 1 |
| `${{ SEALOS_CERT_SECRET_NAME }}` | `CERT_SECRET` from Step 1 |
| `${{ SEALOS_NAMESPACE }}` | `NAMESPACE` from Step 1 |

**Important:** `${{ inputs.xxx }}` values come from `CONFIG.args`. If any required input was not provided, ask the user now before proceeding.

The AI reads the template YAML, performs all variable substitutions, and produces rendered K8s resource documents.

**Step 3 — Split, dry-run, and apply:**

The rendered YAML is a multi-document file (separated by `---`). Split it into individual resources:

1. **Skip** the first document (`kind: Template`) — this is the Sealos template metadata, not a K8s resource
2. Put the remaining rendered resources in a mode-`0600` temporary file because
   they may contain user inputs.
3. Run a server-side dry-run against that exact file.
4. Only after the dry-run succeeds, apply that same file:

```bash
RENDERED_FILE=$(mktemp)
DRY_RUN_LOG=$(mktemp)
APPLY_LOG=$(mktemp)
chmod 600 "$RENDERED_FILE" "$DRY_RUN_LOG" "$APPLY_LOG"
cleanup_rendered_file() {
  rm -f "$RENDERED_FILE" "$DRY_RUN_LOG" "$APPLY_LOG"
}
trap cleanup_rendered_file EXIT HUP INT TERM
# AI writes the rendered resources (without the Template CR) to RENDERED_FILE.

if KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  apply --dry-run=server -o name -f "$RENDERED_FILE" -n "$NAMESPACE" \
  > "$DRY_RUN_LOG" 2>&1; then
  # Unlike the Template API path, local rendering has already frozen APP_NAME.
  # Materialize a required app-scoped Secret after dry-run and before apply.
  if [ "$PULL_SECRET_REQUIRED" = "true" ]; then
    node "<SKILL_DIR>/scripts/ensure-image-pull-secret.mjs" \
      "$NAMESPACE" "$APP_NAME" "$PULL_SECRET_IMAGE_REF" || exit 1
  fi
  if ! KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
    apply -o name -f "$RENDERED_FILE" -n "$NAMESPACE" \
    > "$APPLY_LOG" 2>&1; then
    echo "Resource apply failed; private diagnostics were removed." >&2
    exit 1
  fi
else
  echo "Server-side dry-run failed; resources were not applied and private diagnostics were removed." >&2
  exit 1
fi

# `-o name` should emit only kind/name lines. Apply an allowlist before showing
# even that summary; never print the raw dry-run or apply logs.
sed -nE '/^[a-z0-9.]+\/[A-Za-z0-9._-]+$/p' "$APPLY_LOG"
cleanup_rendered_file
trap - EXIT HUP INT TERM
```

**Step 4 — Handle apply errors:**

The AI may inspect the private log files only long enough to classify an error.
It must not echo, attach, or persist the raw diagnostics because admission
errors can contain submitted Secret or environment values. Report only an
allowlisted error category, resource kind/name, and safe field path; redact all
values before explaining a fix.

| Error | Fix |
|-------|-----|
| `unknown field "spec.xxx"` in App CR | Remove the unknown field and retry |
| PodSecurity warnings | Deployment may proceed; fix compatible securityContext warnings before runtime acceptance when the image runs as non-root |
| `Forbidden` | Kubeconfig may be expired — re-run auth |
| `already exists` | Resource exists from a previous deploy — use `kubectl apply` (idempotent) |

**Step 5 — Run the common readiness gate:**

Read the kinds and names from the exact rendered file used above. Do not assume
one Deployment, derive an application name, or rely on an `app=<name>` label.
Run the common readiness gate from Phase 6.3.1 with the exact targets from
`RENDERED_FILE` (the API route uses `API_READINESS_TARGETS` instead).

```bash
# Run once for every Deployment, StatefulSet, or DaemonSet in RENDERED_FILE.
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  rollout status <kind>/<name> -n "$NAMESPACE" --timeout=120s || exit 1

# Run once for every one-shot Job in RENDERED_FILE.
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  wait --for=condition=complete job/<name> -n "$NAMESPACE" --timeout=120s || exit 1
```

For CronJobs, confirm that each named resource exists and has the intended
schedule. For operator-managed resources such as KubeBlocks clusters, inspect
their status and owned workloads. If rollout or Job waiting times out, do not
stop with an opaque timeout: inspect Pod waiting/terminated state, Warning
Events, and current/previous logs with `sealos-log-scan.mjs`. Apply the
architecture-mismatch recovery rule from Phase 6.3.1 when its exact signatures
appear. Phase 6.5 then verifies the complete live footprint, dependencies,
logs, network path, and user flow before success.

App URL: `https://<app_host>.<CLOUD_DOMAIN>`

### 6.5 Runtime Truth Pass

Execute `<SKILL_DIR>/modules/runtime-truth.md` after every Template API or
kubectl fallback deploy. Complete its applicable network, runtime, log, user
flow, dependency, and footprint gates before writing deployment state or
reporting success.

### Write state.json

After Phase 6.5 verifies the deployment, write `.sealos/state.json`:

```json
{
  "version": "1.1",
  "last_deploy": {
    "app_name": "<instance name, e.g. evershop-uvbp0n0n>",
    "app_host": "<ingress host prefix, e.g. evershop-4ha6b4mh>",
    "namespace": "<K8s namespace from kubeconfig>",
    "region": "<Sealos region domain, e.g. gzg.sealos.run>",
    "image": "<primary service immutable IMAGE_REF, or null>",
    "services": [
      {
        "name": "<service name>",
        "primary": true,
        "workload_kind": "Deployment",
        "workload_name": "<rendered/live workload name>",
        "container_name": "<container name>",
        "image": "<repository>@sha256:<digest>",
        "pull_access": "<anonymous|ghcr_secret_required|indeterminate>",
        "build": {
          "context": "<context>",
          "dockerfile": "<Dockerfile relative to context>",
          "target": null,
          "build_arg_names": []
        }
      }
    ],
    "repo_name": "<REPO_NAME>",
    "url": "<public app URL, or null>",
    "deployed_at": "<current ISO timestamp>",
    "last_updated_at": "<current ISO timestamp>"
  },
  "history": [
    {
      "at": "<current ISO timestamp>",
      "action": "deploy",
      "image": "<IMAGE_REF>",
      "method": "<template-api or kubectl-apply>",
      "status": "success",
      "note": "Initial deployment"
    }
  ]
}
```

The `last_deploy` section is what **Deployment Mode Detection** reads on
subsequent runs to decide between DEPLOY and UPDATE mode. Without it, every
`/sealos-deploy` creates a new instance.

The `history` array is append-only — every subsequent update adds an entry. See
the **Update History** section at the end of this file for the full schema and
rules.

When this state was migrated from version `1.0`, it also has a top-level
`legacy_history_count` equal to the number of history entries preserved during
migration. Do not add that field to a state created natively as version `1.1`.

Sources for each field:
- `app_name`: from Template API response `name` or the rendered `defaults.app_name` (kubectl apply)
- `app_host`: from the rendered `defaults.app_host` value, or parsed from the
  Ingress host; `null` when no public endpoint exists
- `namespace`: from kubeconfig context
- `region`: from `~/.sealos/auth.json` `region` field (strip `https://`)
- `services`: enumerate every rendered and verified **in-place update target**:
  application containers in Deployments, StatefulSets, DaemonSets, and
  CronJobs. Record each exact workload kind/name, container name, immutable
  image, pull access, and effective Phase 3 build plan; use `build: null` for a
  reused image with no local build plan. One-shot Jobs remain part of the
  verified live footprint but are not added to this update map because their
  pod templates cannot be changed in place. A Job-only deployment therefore
  records `services: []` and does not enter UPDATE mode.
- Zero or one service has `primary: true`, selected from the verified public
  Service/Ingress path or explicit primary application intent. Workers,
  CronJobs, and applications without a public endpoint may have no primary.
  This flag is only the summary/update default and never removes other
  services.
- `image`: the immutable image of the primary service, or `null` when there is
  no primary. On the official-template route, read it from the verified live
  primary workload. Never substitute the last image built for this summary.
- `repo_name`: from `analysis.json` `project.repo_name`
- `url`: constructed from `app_host` and `region`, or `null` when no public
  endpoint was verified

For an official-template deployment, set the history note to
`Initial deployment from official template <name>@<catalog-commit>`.

Before cleanup, validate the complete JSON artifact set and persist the state
bridge for a temporary GitHub checkout. Do not report success or remove the
temporary checkout if either operation fails:

```bash
if ! node "<SKILL_DIR>/scripts/validate-artifacts.mjs" --dir "$WORK_DIR"; then
  echo "Deployment state validation failed; Phase 6 stopped before cleanup." >&2
  exit 1
fi

if [ "$WORK_DIR_IS_TEMP" = true ]; then
  node "<SKILL_DIR>/scripts/sealos-state-bridge.mjs" persist \
    --work-dir "$WORK_DIR" --github-url "$GITHUB_URL" || {
      echo "Could not persist deployment state for the GitHub checkout; Phase 6 stopped before cleanup." >&2
      exit 1
    }
fi
```

---

## Cleanup

If `WORK_DIR` was created via `mktemp` (remote GitHub URL clone), remove it
only after the state bridge step above has succeeded:
```bash
rm -rf "$WORK_DIR"
```

Do NOT clean up if `WORK_DIR` is the user's local project directory.

For test deployments, delete the Sealos `Instance` and application resources before database RBAC. Keep KubeBlocks ServiceAccount, Role, and RoleBinding resources until the database `Cluster` finalizer has converged. When a `Cluster` or `Component` remains in `Deleting` after dependent pods and InstanceSets are gone, inspect the finalizers and use finalizer removal only as the last recovery step after recording the stuck resource and owner references.

---

## Output

On success, present the route that actually ran.

For the standard route:
```
✓ Assessed: {language} + {framework}, score {N}/12 — {verdict}
✓ Image: {IMAGE_REF} ({source: existing/built})
✓ Template: generated at .sealos/template/index.yaml
✓ Configured: {N} inputs set ({M} required, {K} optional)
✓ Deployed to Sealos Cloud ({region})

App URL: https://<app-access-url>

To update this deployment later, run: /sealos-deploy
```

For the official-template route:
```
✓ Official template: {template-name} ({catalog-commit})
✓ Local image build and template generation: skipped
✓ Configured: {N} template inputs
✓ Deployed to Sealos Cloud ({region})
```

Show `Primary deployed image` only when the live footprint identifies one
unambiguous primary application image. Show `App URL` only when Phase 6.5
verified a public endpoint. Otherwise show the verified workload/resource
summary; workers and scheduled workloads may have neither field.

If any `inputs` were configured, also show:
```
Configuration applied:
  ADMIN_EMAIL: admin@example.com
  OPENAI_API_KEY: <configured>
  ADMIN_PASSWORD: <configured>
```
For API keys, passwords, tokens, private keys, and other sensitive fields, show
only the fixed `<configured>` placeholder. Never reveal prefixes, suffixes, or
length-derived masks; short secrets must not be reconstructable.

---

# Update Path

**This section is only executed in UPDATE mode** (entered via Deployment Mode
Detection above).

The update path reuses the confirmed per-service workload map. It does not
rerun Assess, global image discovery, or Template generation. It can rebuild
and push one or more selected services, prepare a missing per-service build
plan through the restricted Phase 3 boundary, or restart one or more exact
existing workloads.

All kubectl commands use the Sealos kubeconfig:
```
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify
```

**Reminder:** `kubectl delete` requires user confirmation — see SKILL.md "kubectl Safety Rules".

## Context from Mode Detection

These values are already known from `.sealos/state.json` `last_deploy` section:

```
APP_NAME      = last_deploy.app_name       (e.g., "evershop-uvbp0n0n")
NAMESPACE     = last_deploy.namespace      (e.g., "ns-qiqovyrm")
REGION        = last_deploy.region         (e.g., "gzg.sealos.run")
REPO_NAME     = last_deploy.repo_name
APP_URL       = last_deploy.url
SERVICES      = last_deploy.services
```

Each `SERVICES` entry identifies one exact update target:

```text
service name → workload kind/name → container name → current digest
             → pull access → optional build plan
```

Do not derive a Deployment or container from `APP_NAME`. A version `1.0` state
must first be migrated to the confirmed version `1.1` service map described in
Mode Detection.

---

## Phase U1: Build & Push

Show the recorded services and ask what changed:

```
What would you like to update?

  1. Code changed — select one or more services to rebuild (default)
  2. Restart one or more current workloads without rebuilding
```

### Option 1: Rebuild

For every selected service, read its exact build plan from
`last_deploy.services[].build`. If it is `null` but the current checkout
contains buildable source, prepare that service through the restricted Phase 3
boundary before continuing. Never apply one service's Dockerfile or context to
another service.

Reuse the **exact same GHCR-only build logic as Phase 4**. Every new update
image is pushed to GHCR even when the old image was originally reused from
another registry. There is no registry prompt, inheritance, or fallback.

```bash
node "<SKILL_DIR>/scripts/build-push.mjs" "$WORK_DIR" "$REPO_NAME" \
  --service "$SERVICE" \
  --context "$BUILD_CONTEXT" \
  --dockerfile "$DOCKERFILE"
```

Add the recorded optional `--target` and repeated `--build-arg` flags. Resolve
argument values at execution time and do not persist or print them. Build all
selected services before mutating the cluster. For each service, retain
`PREVIOUS_IMAGE`, the Buildx `NEW_IMAGE` digest, and `push.pull_access`. Never
pass a temporary tag to Phase U2.

If build fails, apply Phase 4.2's classification. Only a build-plan failure may
return that service to the restricted Phase 3 preparation boundary. Keep
authentication, GHCR, network, Docker daemon, Buildx, and push failures inside
Phase U1. Do not mutate any workload until every selected build succeeds.

After all builds succeed, form the **prospective service inventory** by
replacing each selected service's old image and pull-access value with its new
Phase U1 result. Across that complete inventory — including unselected
services — all `pull_access != anonymous` images must use one lowercased GHCR
namespace. If they do not, stop before Phase U2 and require the user to select
and rebuild every conflicting private/indeterminate service under one GitHub
account. This check permits an account change only when no unchanged service
still needs the previous account's credential.

### Option 2: Restart only

No build is needed. Retain the selected services' current digest images and
restart only their exact recorded workloads in Phase U2.

---

## Phase U2: Apply Update

### Image update

Before the first cluster mutation, snapshot in private temporary storage:

- whether the app-scoped pull Secret exists and, if so, its exact current
  object
- the existing `imagePullSecrets` arrays of every workload that this operation
  may patch

Keep these snapshots outside the project with mode `0600`, never print them,
and remove them after success or rollback. They are rollback material, not
deployment artifacts.

If any selected Phase U1 result has `push.pull_access` equal to
`ghcr_secret_required` or `indeterminate`, the prospective-inventory check
above has already proved that exactly one credential namespace is needed.
Create or refresh the app-scoped Secret once with one image from that
namespace:

```bash
node "<SKILL_DIR>/scripts/ensure-image-pull-secret.mjs" \
  "$NAMESPACE" "$APP_NAME" "<one-selected-private-or-indeterminate-image>"
```

Before changing an authenticated target, merge the Secret name into that exact
workload's existing `imagePullSecrets` without deleting other entries. Use
`spec.template.spec.imagePullSecrets` for Deployment, StatefulSet, and
DaemonSet, and `spec.jobTemplate.spec.template.spec.imagePullSecrets` for
CronJob. Do not patch a workload merely because an unrelated selected image
needs authentication.

Then update every selected target by its recorded kind, workload name, and
container name:

```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  set image "$WORKLOAD_KIND/$WORKLOAD_NAME" \
  "$CONTAINER_NAME=$NEW_IMAGE" \
  -n "$NAMESPACE"
```

An `anonymous` result does not trigger Secret creation merely because it is
hosted on GHCR.

### Restart only

```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  rollout restart "$WORKLOAD_KIND/$WORKLOAD_NAME" \
  -n "$NAMESPACE"
```

Run this only for selected Deployment, StatefulSet, or DaemonSet targets.
CronJobs have no active rollout to restart; verify their recorded image and
schedule instead.

---

## Phase U3: Verify Rollout

For every changed Deployment, StatefulSet, or DaemonSet:

```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  rollout status "$WORKLOAD_KIND/$WORKLOAD_NAME" \
  -n "$NAMESPACE" --timeout=120s
```

For a changed CronJob, verify the exact container digest and schedule; do not
create an ad-hoc Job unless the user asks.

### On complete success

Update `.sealos/state.json`:
- Update each successful target's `services[].image` and `pull_access`
- Update its stored build plan when Phase 3 prepared or repaired it
- If the primary service changed, set `last_deploy.image` to that service's new
  digest; otherwise leave the primary summary unchanged
- Set `last_deploy.last_updated_at` to current ISO timestamp
- Append one target-qualified `set-image` entry per rebuilt service or
  `restart` entry per restarted workload (see Update History below)

Present to user:
```
✓ Updated: <service> → <workload kind>/<workload name>:<container>
✓ Image: <previous digest> → <new digest>
✓ All selected rollouts: complete

App URL: <APP_URL>

To update again later, run: /sealos-deploy
```

### On any failure

Roll back every target changed by this update operation, including targets that
became ready before another selected target failed, so the multi-service
deployment returns to its prior known image set:

```bash
KUBECONFIG=~/.sealos/kubeconfig kubectl --insecure-skip-tls-verify \
  set image "$WORKLOAD_KIND/$WORKLOAD_NAME" \
  "$CONTAINER_NAME=$PREVIOUS_IMAGE" \
  -n "$NAMESPACE"
```

Verify each rollback with the kind-appropriate rollout check. Append a
target-qualified **failed** entry for every attempted service. Restore each
patched workload's exact prior `imagePullSecrets` array. If the pull Secret
existed before the operation, restore its snapshotted object through stdin. If
it did not exist, the newly created but now-unreferenced Secret may be deleted
only after obtaining the deletion confirmation required by the kubectl safety
rules; otherwise leave it unused and report it explicitly. Do not change
`last_deploy.services[].image`, `pull_access`, or the primary
`last_deploy.image` unless all selected targets succeeded.

Report to user:
```
✗ Multi-service update failed — images and pull references were restored.

Debug:
  <exact failed workload/container and safe log command>
```

---

## Update History

Every update (successful or failed) appends an entry to `history` in `.sealos/state.json`. This provides a traceable log of all changes to the deployment.

```json
{
  "version": "1.1",
  "last_deploy": {
    "app_name": "morphic-dc21ad72",
    "app_host": "morphic-4ha6b4mh",
    "namespace": "ns-qiqovyrm",
    "region": "gzg.sealos.run",
    "image": "ghcr.io/zhujingyang/morphic@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "services": [
      {
        "name": "web",
        "primary": true,
        "workload_kind": "Deployment",
        "workload_name": "morphic-dc21ad72",
        "container_name": "web",
        "image": "ghcr.io/zhujingyang/morphic@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "pull_access": "anonymous",
        "build": {
          "context": ".",
          "dockerfile": "Dockerfile",
          "target": null,
          "build_arg_names": []
        }
      }
    ],
    "repo_name": "morphic",
    "url": "https://morphic-4ha6b4mh.gzg.sealos.run",
    "deployed_at": "2026-03-09T18:37:30Z",
    "last_updated_at": "2026-03-10T14:30:22Z"
  },
  "history": [
    {
      "at": "2026-03-09T18:37:30Z",
      "action": "deploy",
      "image": "ghcr.io/miurla/morphic@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "method": "kubectl-apply",
      "status": "success",
      "note": "Initial deployment"
    },
    {
      "at": "2026-03-09T20:15:00Z",
      "action": "set-env",
      "changes": ["OPENAI_API_KEY=<configured>", "OPENAI_BASE_URL=https://..."],
      "method": "kubectl-set-env",
      "status": "success",
      "note": "Fix: default openai provider not enabled"
    },
    {
      "at": "2026-03-10T14:30:22Z",
      "action": "set-image",
      "service": "web",
      "workload_kind": "Deployment",
      "workload_name": "morphic-dc21ad72",
      "container_name": "web",
      "previous_image": "ghcr.io/miurla/morphic@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "image": "ghcr.io/zhujingyang/morphic@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "method": "kubectl-set-image",
      "status": "success"
    },
    {
      "at": "2026-03-11T09:00:00Z",
      "action": "set-image",
      "service": "web",
      "workload_kind": "Deployment",
      "workload_name": "morphic-dc21ad72",
      "container_name": "web",
      "previous_image": "ghcr.io/zhujingyang/morphic@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "image": "ghcr.io/zhujingyang/morphic@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      "method": "kubectl-set-image",
      "status": "failed",
      "note": "CrashLoopBackOff — rolled back"
    }
  ]
}
```

### History entry fields

| Field | Required | Description |
|-------|----------|-------------|
| `at` | yes | ISO 8601 timestamp of the operation |
| `action` | yes | What changed: `deploy`, `set-image`, `set-env`, `patch`, `restart` |
| `status` | yes | `success` or `failed` |
| `method` | yes | kubectl command used: `kubectl-apply`, `kubectl-set-image`, `kubectl-set-env`, `kubectl-patch`, `kubectl-rollout-restart` |
| `image` | if image changed | New image reference |
| `previous_image` | if image changed | Image before the update |
| `service` | for version 1.1 image changes and restarts | Original service identity |
| `workload_kind` / `workload_name` / `container_name` | for version 1.1 image changes and restarts | Exact live container target; never inferred from app name |
| `changes` | if env/config changed | Array of changes (mask sensitive values: `sk-***`) |
| `note` | no | Free-text reason or context for the change |

### Rules

- **Always append, never rewrite** — history is append-only. Never delete or modify previous entries.
- **Preserve migrated history** — when upgrading a v1.0 state, copy its
  history unchanged, set `legacy_history_count` to that preserved length, and
  apply v1.1 digest/target requirements only to later entries.
- **Mask secrets** — API keys, passwords, and tokens use only the fixed
  `<configured>` placeholder. Never retain prefixes, suffixes, or lengths.
- **Initial deploy counts** — the first entry should be `action: "deploy"` written by Phase 6 checkpoint.
- **Failed updates count** — record failures so the user can see what was attempted and why it didn't work.
- **Do not trim automatically** — retention must not rewrite the append-only
  log or invalidate a migration boundary.
