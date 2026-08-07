# Phase 1: Assess

Eligibility, optional template fast path, then project signal analysis.

## Phase 0.4: Deployment Eligibility Gate

Run this gate before creating `.sealos/`, detecting deployment mode, matching a
template, Phase 1 analysis, Dockerfile generation, image detection, or build.

Read and apply the canonical policy:
`<SKILL_DIR>/../cloud-native-readiness/knowledge/deployment-eligibility.md`.

When Node.js is available, run:

```bash
node "<SKILL_DIR>/scripts/workload-eligibility.mjs" "$WORK_DIR"
```

The script is read-only and prints the decision to stdout. Keep the parsed object as
`ELIGIBILITY_DECISION` in the current execution context; never write it to `.sealos/`
or another project file.

| Exit | Status | Action |
|------|--------|--------|
| `0` | `eligible` | Continue with the requested repository root |
| `2` | `ineligible` | Report workload type/evidence and STOP |
| `3` | `needs_review` | Inspect evidence; keep deployment blocked until explicitly resolved |
| other | execution error | Report the classifier error and STOP |

Parse stdout even for exits `2` and `3`; those are classification results, not script
failures. A mixed repository remains `needs_review` in this workflow: list the
detected units and STOP rather than selecting and deploying a nested directory.

For other `needs_review` results, inspect entry points and runtime evidence. Continue
only when the requested root itself can be explicitly resolved as `eligible`; record
that in-memory decision with `source: "ai-review"` and specific repository-relative
evidence. An ordinary desktop/mobile client cannot be overridden by a Dockerfile,
registry image, or user willingness to proceed.

If Node.js is unavailable, perform the same review manually and keep the result in
memory. Missing or ambiguous evidence fails closed. No `.sealos/config.json` field or
resume state may skip or override this gate.


---

## Phase 0.5: Template Fast Path

Run this phase after preflight has resolved `WORK_DIR`, `GITHUB_URL`, and `REPO_NAME`, and before Phase 1 assessment.

The goal is to avoid source analysis, Dockerfile generation, image builds, and template generation for repositories that are already represented by a known Sealos template.

With Node.js:

```bash
node "<SKILL_DIR>/scripts/detect-template.mjs" \
  --github-url "$GITHUB_URL" \
  --work-dir "$WORK_DIR" \
  --skill-dir "<SKILL_DIR>"
```

The script writes `.sealos/template-match.json` every time it runs.

Decision:

- `matched=false` → continue to Phase 1 normally.
- `matched=true` and `materialized=false` → report the matched template name and continue to Phase 1 normally; this is only a recommendation because no deployable template YAML was available.
- `matched=true` and `materialized=true` → skip Phase 2 through Phase 4 because `.sealos/template/index.yaml` already exists. Continue with Phase 5 configuration and Phase 6 deployment.

The fast path is configured in `<SKILL_DIR>/config.json` under `template_fast_path.templates`. A template entry must include `name` and `source_repos`; it materializes only when it also provides valid Sealos Template YAML through one of:

- `template_yaml`
- `template_path`
- `template_url`

Template YAML must include:

```yaml
apiVersion: app.sealos.io/v1
kind: Template
```

If a matched entry cannot materialize YAML, do not treat it as a deployable result and do not skip build or template generation.

---


---

## Phase 1: Assess

`WORK_DIR`, `GITHUB_URL`, `REPO_NAME`, and README context are already resolved in preflight (Step 2).
Use those values directly.

Eligibility (Phase 0.4) already passed. Do not compute or report a cloud-native readiness score.

## 1.1 Collect project signals

**If Node.js is available:**

```bash
node "<SKILL_DIR>/scripts/project-signals.mjs" "$WORK_DIR"
```

Output shape: `{ "signals": { ... } }`.

Useful signal fields:

- `signals.primary_language`
- `signals.language`
- `signals.framework`
- `signals.package_manager`
- `signals.port`, `signals.port_source`
- `signals.databases`
- `signals.runtime_version`
- `signals.is_monorepo`, `signals.has_docker`, `signals.has_env_example`
- `signals.has_http_server`, `signals.dockerfile_paths`

**If Node.js is not available:**

Read the project files and record the same fields yourself:

1. Detect language from `package.json`, `go.mod`, `requirements.txt`, `pom.xml`, `Cargo.toml`, and similar manifests.
2. Detect framework from dependency files.
3. Detect whether the project listens on a port.
4. Detect databases and `.env.example`.
5. Detect `Dockerfile` or `docker-compose.yml`.

## 1.2 Enrich the analysis

Focus on what the script cannot decide:

- `env_vars` classification
- `complexity_tier` (`L1` | `L2` | `L3`)
- port override from source when `port_source` is `unknown`

Read key files: `README.md`, language manifests, and `Dockerfile` when present.

Record for later phases: `language`, `framework`, `port`, `env_vars`, `databases`, `has_dockerfile`.

**Env var classification** (for Phase 5.5):

- `auto` — can be generated (secrets, internal URLs, DB connections)
- `required` — user must provide (API keys, admin email, SMTP, OAuth)
- `optional` — has a sensible default

Sources:

- `.env.example` or `.env.sample`
- `docker-compose.yml` `environment:`
- README configuration sections
- `process.env.*` / `os.environ[]` in source

If the workload type still looks unsupported after eligibility (desktop, mobile client, CLI, library, no entry point), STOP and state the blocker. Prefer Phase 0.4 for that gate.

For edge review only, you can read:

- `<SKILL_DIR>/../cloud-native-readiness/knowledge/anti-patterns.md`

## Write analysis.json

After Phase 1 completes, replace the Phase 0 four-field file with the full analysis snapshot. Keep `runtime_profile` from Phase 0.

```json
{
  "runtime_profile": "<local|sandbox from Phase 0>",
  "generated_at": "<ISO timestamp>",
  "project": {
    "github_url": "<GITHUB_URL>",
    "work_dir": "<WORK_DIR>",
    "repo_name": "<REPO_NAME>",
    "branch": "<BRANCH or null>"
  },
  "language": "<signals.primary_language>",
  "all_languages": ["<all detected languages from signals.language>"],
  "framework": "<detected framework>",
  "package_manager": "<npm|yarn|pnpm|bun|pip|go|cargo|maven|gradle>",
  "port": "<primary port>",
  "databases": ["<detected database types>"],
  "runtime_version": { "<language>": "<major version>", "source": "<detection source>" },
  "env_vars": {},
  "has_dockerfile": false,
  "complexity_tier": "<L1|L2|L3>",
  "image_ref": null
}
```

Do not write a `score` field.

If `.sealos/config.json` exists, apply user overrides. Priority: user config > script detection > AI inference.

Set `image_ref` to `null` here. Phase 2 or Phase 4 fills it later.

## Present analysis summary

```text
Repository Analysis:
  - Type: <web app | api | worker | static | other>
  - Language: <language>
  - Framework: <framework or "none detected">
  - Port: <port or "not detected">
  - Database: <postgres/mysql/redis/... or "none detected">
  - Dockerfile: <yes/no>
  - Decision: <continue | stop>
```

Rules:

- Keep the summary short.
- Do not dump full `env_vars` unless the user asks.
- If you STOP, state the top blocker.
- If you CONTINUE, name the next phase in one line.
