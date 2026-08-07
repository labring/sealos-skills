# Phase 1: Assess

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

After Phase 1 completes, write `.sealos/analysis.json`:

```json
{
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
