# Coding Conventions

**Analysis Date:** 2026-06-15

## Naming Patterns

**Files:**
- Skill entry files are named `SKILL.md` and live directly under `skills/<skill-name>/`, for example `skills/sealos-deploy/SKILL.md`.
- Skill implementation scripts use kebab-case for executable CLIs, for example `skills/sealos-deploy/scripts/build-push.mjs`, `skills/sealos-deploy/scripts/detect-image.mjs`, and `skills/dockerfile-skill/scripts/validate-dockerfile.mjs`.
- Python modules use snake_case under `skills/docker-to-sealos/scripts/`, for example `skills/docker-to-sealos/scripts/compose_to_template.py` and `skills/docker-to-sealos/scripts/check_consistency_runner.py`.
- Python tests use `test_*.py` beside the implementation, for example `skills/docker-to-sealos/scripts/test_compose_to_template.py`.
- JSON schema artifacts use `<artifact>.schema.json` in `skills/sealos-deploy/schemas/`, for example `skills/sealos-deploy/schemas/state.schema.json`.
- Eval fixtures use `evals.json` under each skill with eval coverage, for example `skills/sealos-deploy/evals/evals.json` and `skills/sealos-canvas/evals/evals.json`.

**Functions:**
- JavaScript functions use camelCase, for example `validateAgainstSchema`, `validateObjectSchema`, and `loadSchema` in `skills/sealos-deploy/scripts/artifact-validator.mjs`.
- Python functions use snake_case, for example `convert_compose_to_template`, `infer_metadata`, and `resolve_image_reference` in `skills/docker-to-sealos/scripts/compose_to_template.py`.
- Python CLI modules expose `parse_args(argv: Optional[Sequence[str]] = None)` and `main(argv: Optional[Sequence[str]] = None) -> int`, as shown in `skills/docker-to-sealos/scripts/check_consistency.py`.

**Variables:**
- JavaScript constants use UPPER_SNAKE_CASE for configuration and thresholds, for example `SCHEMA_DIR`, `SCHEMA_FILES`, and `MAX_FILE_BYTES`.
- JavaScript local variables use camelCase, for example `childPointer`, `branchErrors`, and `validCount` in `skills/sealos-deploy/scripts/artifact-validator.mjs`.
- Python constants use UPPER_SNAKE_CASE with type annotations where useful, for example `DB_TYPE_PATTERNS`, `SPECIAL_DB_RESOURCE_TYPES`, and `DEFAULT_RESOURCE_LIMITS` in `skills/docker-to-sealos/scripts/compose_to_template.py`.
- Python locals use snake_case, for example `skill_path`, `references_dir`, and `additional_include_paths` in `skills/docker-to-sealos/scripts/check_consistency.py`.

**Types:**
- Python data containers use dataclasses for structured conversion state in `skills/docker-to-sealos/scripts/compose_to_template.py`.
- Python type aliases and annotations use `typing` generics such as `Dict[str, Tuple[str, ...]]`, `Optional[Sequence[str]]`, and `Mapping[str, Any]`.
- JavaScript scripts rely on plain objects and JSON schema validation rather than TypeScript types, for example `skills/sealos-deploy/scripts/artifact-validator.mjs`.

## Code Style

**Formatting:**
- Python uses 4-space indentation, module docstrings for CLI purpose, and explicit imports from the standard library before local imports.
- JavaScript `.mjs` scripts use ESM imports, 2-space indentation, semicolon-light style in newer scripts such as `skills/sealos-deploy/scripts/artifact-validator.mjs`, and semicolon style in older scripts such as `skills/dockerfile-skill/scripts/validate-dockerfile.mjs`.
- Markdown skill files use short sections and operational checklists, with implementation logic split into `modules/*.md`, `knowledge/*.md`, and `references/*.md`.
- JSON files are committed as readable two-space JSON, for example `.codex-plugin/plugin.json`, `distribution/platforms.json`, and `skills/sealos-deploy/evals/evals.json`.

**Linting:**
- No top-level ESLint, Prettier, Biome, pyproject, or package manifest is detected.
- Use script-specific validation commands instead of a global lint command.
- Validate Codex plugin metadata with `python3 scripts/validate-codex-plugin.py` when editing `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, or `distribution/platforms.json`.
- Validate docker-to-sealos rules with `python3 skills/docker-to-sealos/scripts/check_consistency.py` and `python3 skills/docker-to-sealos/scripts/check_must_coverage.py` when editing `skills/docker-to-sealos/**`.

## Import Organization

**Order:**
1. Python future import when present, then standard library imports, then third-party imports, then local imports, as in `skills/docker-to-sealos/scripts/compose_to_template.py`.
2. JavaScript built-in Node imports first, then local imports, as in `skills/sealos-deploy/scripts/build-push.mjs` and `skills/sealos-deploy/scripts/artifact-validator.mjs`.
3. Tests import standard library helpers first, then third-party packages such as `yaml`, then local modules, as in `skills/docker-to-sealos/scripts/test_compose_to_template.py`.

**Path Aliases:**
- No project-wide path aliases are detected.
- Python scripts import sibling modules by filename from `skills/docker-to-sealos/scripts/`, for example `from check_consistency_runner import run_checks`.
- JavaScript scripts use relative imports for local helpers, for example `skills/sealos-deploy/scripts/build-push.mjs` importing `artifact-validator.mjs`.

## Error Handling

**Patterns:**
- Python CLIs print explicit `ERROR:` or failure text and return exit codes from `main()`, as in `skills/docker-to-sealos/scripts/check_consistency.py`.
- Python validator helpers raise domain exceptions such as `ValueError` for invalid inputs, then CLI wrappers convert them to exit code `2`.
- JavaScript CLIs throw `Error` inside reusable functions and convert top-level failures to JSON or stderr with non-zero exit codes, as in `skills/sealos-deploy/scripts/sealos-auth.mjs`.
- JSON-producing automation should return structured failure payloads such as `{ ok: false, error: ... }` or `{ success: false, error: ... }`, following `skills/sealos-s3/scripts/analyze-project-s3.mjs` and `skills/sealos-deploy/scripts/build-push.mjs`.
- Artifact validation returns path-addressed error objects `{ path, message }`, following `skills/sealos-deploy/scripts/artifact-validator.mjs`.

## Logging

**Framework:** console / print

**Patterns:**
- Machine-consumed Node scripts print JSON to stdout, for example `skills/sealos-database/scripts/analyze-project-database.mjs` and `skills/sealos-deploy/scripts/validate-artifacts.mjs`.
- Human-facing status or remediation text goes to stderr for interactive scripts, for example `skills/sealos-deploy/scripts/build-push.mjs` and `skills/sealos-deploy/scripts/gh-refresh-scopes.mjs`.
- Python validation scripts print `PASS`, `FAIL`, `ERROR`, `[RUN]`, and `[PASS]` messages directly, following `scripts/validate-codex-plugin.py` and `skills/docker-to-sealos/scripts/quality_gate.py`.

## Comments

**When to Comment:**
- Use short comments to mark major algorithm sections in dense detection scripts, as in `skills/sealos-deploy/scripts/score-model.mjs`.
- Use comments for generated-template rules, production lessons, and operational constraints in Markdown knowledge files such as `skills/sealos-deploy/knowledge/lessons-learned.md`.
- Keep inline comments limited to decisions that affect rule behavior, fixture expectations, or platform compatibility.

**JSDoc/TSDoc:**
- JSDoc is minimal and used for script-level orientation in `skills/sealos-deploy/scripts/score-model.mjs`.
- Python modules use concise module docstrings, for example `scripts/validate-codex-plugin.py` and `skills/docker-to-sealos/scripts/check_consistency.py`.

## Function Design

**Size:** Keep CLI orchestration small and push reusable checks into named helpers. `skills/docker-to-sealos/scripts/check_consistency.py` keeps CLI parsing and exit handling separate from `skills/docker-to-sealos/scripts/check_consistency_runner.py`.

**Parameters:** Pass explicit `Path` objects and structured options into Python conversion and validation functions. Use `argv` parameters for testable CLI parsing in Python.

**Return Values:** Return process exit codes from Python `main()` functions. Return structured JSON-compatible objects from Node scripts that feed agents or automation.

## Module Design

**Exports:** Python modules expose importable helper functions and keep `if __name__ == "__main__": sys.exit(main())` at the bottom. Node scripts export reusable functions where downstream scripts need them, for example `skills/sealos-deploy/scripts/artifact-validator.mjs`.

**Barrel Files:** Not detected. Add new helpers beside the skill that owns them instead of adding shared barrel files.

**Skill Source Rule:** Root `skills/**` is the only skill source for skills.sh, Codex plugin installs, Claude-compatible plugin installs, and context-only host manifests. Add or modify skills under `skills/<skill-name>/`; keep `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, marketplace files, and extension manifests pointing at the root `skills/` source.

---

*Convention analysis: 2026-06-15*
