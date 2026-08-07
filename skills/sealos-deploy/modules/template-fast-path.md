# Phase 0.5: Template Fast Path

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
- `matched=true` and `materialized=true` → skip Phase 1 through Phase 5 because `.sealos/template/index.yaml` already exists. Continue with Phase 5.5 configuration and Phase 6 deployment.

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

