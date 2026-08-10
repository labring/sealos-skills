# Phase 1: Assess

Judge whether the project can run as a cloud service. Choose the fast path or the
standard path. Write `official_template` into `.sealos/analysis.json`. On an exact
catalog match, fetch the official template verbatim to `.sealos/template/index.yaml`.

UPDATE mode skips this phase.

Do not score the project. Do not select images. Do not run Phase 4-style template
generation (conversion, digest pinning, deploy gate). Do not create cloud resources.
Do not fetch or rewrite YAML except the official template verbatim fetch below.

## Inputs

| Input | Source | Required |
|-------|--------|----------|
| `.sealos/analysis.json` | Phase 0 | Yes — `runtime_profile`, `work_dir`, `repo_name`; `github_url` may be `null` |
| Official template catalog | [`kb-0.9/template`](https://github.com/labring-actions/templates/tree/kb-0.9/template) | Yes |

## Outputs

| Output | Path |
|--------|------|
| `official_template` | `.sealos/analysis.json` (field on the same object) |
| Official template (on exact match) | `.sealos/template/index.yaml` |

```json
{
  "official_template": "https://raw.githubusercontent.com/labring-actions/templates/{commit}/template/{name}/index.yaml"
}
```

One exact match → URL string. Otherwise → `null`. Writing the URL is independent of
whether the run later takes the fast path.

Preserve Phase 0 fields: `runtime_profile`, `work_dir`, `repo_name`, `github_url`.
Do not rewrite them.

## Phase constraints

| ID | Constraint |
|----|------------|
| P1-01 | Do not score or choose images |
| P1-02 | Do not run Phase 4-style template generation |
| P1-03 | Do not create cloud resources; except the official template fetch, do not fetch or rewrite other YAML |
| P1-04 | Official templates: exact match only — no fuzzy match by name, language, or framework |
| P1-05 | Blacklist STOP only at 100% certainty; insufficient evidence → CONTINUE |
| P1-06 | When `official_template` is non-null, fetch verbatim |

## Procedure

### 1. Blacklist check

**STOP** only when **both** rows are **100% confirmed**. Otherwise **CONTINUE**.
Do not STOP on uncertainty or weak evidence. Write no artifact for this check.
Do not prompt the user.

| # | Condition |
|---|-----------|
| 1 | The project cannot run as a cloud service |
| 2 | No part of the repository can deploy as a cloud service |

The repository is the source boundary.

### 2. Read `analysis.json`

Keep `runtime_profile`, `work_dir`, `repo_name`, and `github_url`. Do not modify them.

### 3. Official template exact match

Match against [labring-actions/templates `kb-0.9/template`](https://github.com/labring-actions/templates/tree/kb-0.9/template).

An exact match means the template declares the same source project. Do not fuzzy-match
by name, language, or framework. Do not similarity-match.

| Match result | `official_template` |
|--------------|---------------------|
| No match or multiple matches | `null` |
| Catalog unreachable | `null` (do not STOP) |
| One exact match | Raw URL of that template `index.yaml` |

When there is one exact match, write the URL whether or not the run later takes the
fast path.

**Fast path** (skip Phases 2–4 → Phase 5) requires all of:

| Condition | Requirement |
|-----------|-------------|
| `official_template` | Non-null |
| `runtime_profile` | `sandbox`, or `local` with no uncommitted changes (exclude `.sealos/`) |

`sandbox` does not check uncommitted changes.

On `local` with uncommitted changes, `official_template` may still be non-null. The
run takes the standard path (→ Phase 2).

### 4. Write `analysis.json`

Write `official_template` onto the existing Phase 0 object. Keep the four Phase 0
fields. Full `analysis.schema.json` validation is not required in this phase.

### 5. Fetch official template

Run only when `official_template` is non-null:

1. Fetch `index.yaml` from the `official_template` URL.
2. Write it **verbatim** to `.sealos/template/index.yaml`. Do not rewrite, merge, or
   regenerate from the current repo.
3. Fetch failure (URL unreachable, empty body) → **STOP**.

On the standard path, a later Phase 4 run may overwrite this file. The fast path uses
this file in Phase 5.

### 6. Validate

After outputs are written:

```bash
node "<SKILL_DIR>/scripts/validate-phase-1.mjs" --dir "$WORK_DIR"
```

| ID | Check |
|----|-------|
| P1-V01 | `official_template` is `null` or a labring-actions raw URL |
| P1-V02 | Phase 0 four fields preserved |
| P1-V03 | When `official_template` is non-null, `.sealos/template/index.yaml` exists |

On failure, do not CONTINUE to Phase 2 or Phase 5.

## Stop conditions

| Result | Condition |
|--------|-----------|
| **STOP** | Both blacklist rows are 100% confirmed |
| **STOP** | `official_template` is non-null but the official template fetch failed |
| **CONTINUE → Phase 5** | `official_template` is non-null and fast-path conditions are met |
| **CONTINUE → Phase 2** | All other cases |
