# Phase 1: Assess

## Purpose

Decide whether the repository is certainly impossible to run as a cloud service. Then record one current official-template YAML path or `null`.

Do not score the project. Do not select images. Do not write a deployment plan. Do not write the final YAML.

## Input

Read `.sealos/analysis.json` from Phase 0.

Read the current `kb-0.9` directory in `labring-actions/templates`. Use a fresh shallow clone for this phase.

Run this command to read the current directory:

```bash
git clone --depth 1 --branch kb-0.9 \
  https://github.com/labring-actions/templates.git "<CATALOG_DIR>"
```

Do not resolve `kb-0.9` to a fixed commit. Do not use a cached catalog directory.

## Procedure

1. Read `runtime_profile`, `work_dir`, `repo_name`, and `github_url`. Do not modify these fields.
2. If both facts below are certain, stop:
   - The project cannot run as a cloud service.
   - No repository part can run as a cloud service.
3. Do not stop for missing evidence, uncertainty, a low-quality project, or an unfamiliar framework.
4. If the catalog is reachable, create a fresh shallow clone of its `kb-0.9` directory.
5. If the catalog is reachable, run `scripts/find-official-template.mjs` with that directory.
6. If the catalog is unavailable, run `scripts/find-official-template.mjs --unavailable`.
7. If one catalog template declares the same repository URL, accept that match.
8. Do not match by repository name, language, framework, image, or similarity.
9. Copy the matching `index.yaml` to `.sealos/phase-1/official-template.yaml`.
10. Record that path in `official_template` for one unique exact match.
11. If zero or multiple exact matches exist, record `null`.
12. Run the Phase 1 artifact validation.

Use this command after the fresh catalog clone completes:

```bash
node <SKILL_DIR>/scripts/find-official-template.mjs \
  --analysis "<WORK_DIR>/.sealos/analysis.json" \
  --catalog-dir "<CATALOG_DIR>"
```

If the catalog is unavailable, run:

```bash
node <SKILL_DIR>/scripts/find-official-template.mjs \
  --analysis "<WORK_DIR>/.sealos/analysis.json" \
  --unavailable "catalog unavailable"
```

Run this validation after the script writes the field:

```bash
node <SKILL_DIR>/scripts/validate-artifacts.mjs --stage phase-1 --dir "<WORK_DIR>"
```

## Route Selection

If all conditions below are true, use the official-template route:

- `official_template` is not `null`.
- The runtime profile is `sandbox`, or the local source has no changes outside `.sealos/`.

For that route, continue directly to Phase 4. Phase 4 materializes and validates the official YAML.

For every other result, continue to Phase 2.

If local source changes require the standard route, keep `official_template` unchanged.

## Stop Conditions

Stop only for the two certain impossibility facts in this module.

If the official catalog is unavailable, set `official_template` to `null`. Then continue to Phase 2.

## Exit Contract

The `analysis.json` file contains the Phase 0 fields and this field:

```json
{
  "official_template": ".sealos/phase-1/official-template.yaml"
}
```

No unique exact match gives a `null` value.
