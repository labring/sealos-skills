# Testing Patterns

**Analysis Date:** 2026-06-15

## Test Framework

**Runner:**
- Python standard library `unittest`
- Config: Not detected
- Test files: `skills/docker-to-sealos/scripts/test_compose_to_template.py`, `skills/docker-to-sealos/scripts/test_check_consistency.py`, `skills/docker-to-sealos/scripts/test_check_must_coverage.py`, `skills/docker-to-sealos/scripts/test_quality_gate.py`

**Assertion Library:**
- `unittest.TestCase` assertions such as `assertEqual`, `assertTrue`, `assertFalse`, `assertIn`, `assertRegex`, and `assertNotIn`
- JSON/eval assertions are descriptive fixture entries in `skills/*/evals/evals.json`

**Run Commands:**
```bash
python3 -m unittest discover skills/docker-to-sealos/scripts -p 'test_*.py'  # Run all Python unit tests
python3 skills/docker-to-sealos/scripts/test_compose_to_template.py          # Run one test module
python3 scripts/validate-codex-plugin.py                                    # Validate Codex plugin metadata
python3 skills/docker-to-sealos/scripts/quality_gate.py                     # Run docker-to-sealos consistency gate
```

## Test File Organization

**Location:**
- Python unit tests are co-located with implementation under `skills/docker-to-sealos/scripts/`.
- Agent behavior eval fixtures live under each skill's `evals/` directory, for example `skills/sealos-deploy/evals/evals.json`, `skills/sealos-database/evals/evals.json`, `skills/sealos-s3/evals/evals.json`, and `skills/sealos-canvas/evals/evals.json`.
- Deployment benchmark fixtures live in `skills/sealos-deploy/evals/benchmark.json`.

**Naming:**
- Python tests use `test_*.py`.
- Test classes end with `Tests`, for example `ComposeToTemplateTests`, `CheckConsistencyTests`, and `QualityGateArtifactTests`.
- Test methods use `test_<behavior>`, for example `test_generates_template_and_passes_consistency_rules` and `test_resolve_artifact_targets_prefers_env_override`.

**Structure:**
```text
skills/docker-to-sealos/scripts/
├── compose_to_template.py
├── check_consistency.py
├── quality_gate.py
├── test_compose_to_template.py
├── test_check_consistency.py
├── test_check_must_coverage.py
└── test_quality_gate.py

skills/<skill-name>/evals/
└── evals.json
```

## Test Structure

**Suite Organization:**
```python
class ComposeToTemplateTests(unittest.TestCase):
    def setUp(self):
        self._svgl_json_patcher = mock.patch("compose_to_template._read_json_url", return_value=[])
        self._svgl_json_patcher.start()

    def tearDown(self):
        self._svgl_json_patcher.stop()

    def test_generates_template_and_passes_consistency_rules(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            compose = root / "docker-compose.yml"
            write_file(compose, "services:\n  app:\n    image: nginx:1.27.2\n")
            index_path, _ = convert_compose_to_template(compose_path=compose, output_root=root / "template", meta=self._meta("demo"))
            self.assertTrue(index_path.exists())
```

**Patterns:**
- Use `tempfile.TemporaryDirectory()` for generated Compose files, templates, rules registries, and artifact outputs.
- Use helper functions such as `write_file`, `parse_yaml_documents`, and `render_registry` in `skills/docker-to-sealos/scripts/test_compose_to_template.py`.
- Parse generated YAML with `yaml.safe_load_all` and assert Kubernetes kinds, metadata, labels, annotations, and generated paths.
- Validate generated manifests through `run_checks()` from `skills/docker-to-sealos/scripts/check_consistency_runner.py` when conversion output should satisfy rules.
- Test CLI parsers and environment-dependent behavior by calling functions directly rather than spawning subprocesses.

## Mocking

**Framework:** `unittest.mock`

**Patterns:**
```python
with mock.patch("compose_to_template._read_json_url") as read_json:
    with mock.patch("compose_to_template._read_text_url", return_value='<svg viewBox="0 0 24 24"></svg>'):
        read_json.return_value = [{"title": "Nginx", "route": "https://svgl.app/library/nginx.svg"}]
```

```python
with mock.patch.dict(os.environ, {"DOCKER_TO_SEALOS_ARTIFACTS": "template/demo/index.yaml"}, clear=False):
    self.assertEqual("template/demo/index.yaml", quality_gate._resolve_artifact_targets(root))
```

**What to Mock:**
- Network fetches such as `_read_json_url` and `_read_text_url` in `skills/docker-to-sealos/scripts/compose_to_template.py`.
- External binaries such as `crane` through `shutil.which` and `subprocess.run` in `skills/docker-to-sealos/scripts/test_compose_to_template.py`.
- Environment variables such as `DOCKER_TO_SEALOS_ARTIFACTS` in `skills/docker-to-sealos/scripts/test_quality_gate.py`.

**What NOT to Mock:**
- Generated YAML structure from `convert_compose_to_template`; assert actual files written to a temp directory.
- Rule registry execution through `run_checks()` when validating docker-to-sealos output.
- Path resolution and artifact target discovery in `quality_gate.py`; use real temp directories and files.

## Fixtures and Factories

**Test Data:**
```python
def write_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(textwrap.dedent(content).lstrip("\n"), encoding="utf-8")
```

```json
{
  "id": 0,
  "prompt": "I want to deploy uptime-kuma to Sealos, GitHub: https://github.com/louislam/uptime-kuma",
  "expected_output": "High readiness score (7+), identifies Node.js project with external services, recommends proceeding with deployment",
  "assertions": [
    {"name": "identifies-nodejs", "description": "Correctly identifies the project as Node.js"}
  ]
}
```

**Location:**
- Inline YAML and Compose fixtures are embedded in Python tests under `skills/docker-to-sealos/scripts/`.
- Eval fixtures are stored as JSON in `skills/sealos-deploy/evals/evals.json`, `skills/sealos-canvas/evals/evals.json`, `skills/sealos-database/evals/evals.json`, and `skills/sealos-s3/evals/evals.json`.
- Static sample output for readiness lives in `skills/cloud-native-readiness/examples/sample-report.md`.

## Coverage

**Requirements:** No enforced coverage threshold is detected.

**View Coverage:**
```bash
# No coverage command is configured.
python3 -m unittest discover skills/docker-to-sealos/scripts -p 'test_*.py'
```

## Test Types

**Unit Tests:**
- Python unit tests cover docker-to-sealos conversion, consistency rules, MUST coverage mapping, and quality gate command assembly under `skills/docker-to-sealos/scripts/`.
- Tests assert both successful generation and failure cases for malformed rules, missing artifacts, environment overrides, and generated resource structure.

**Integration Tests:**
- `scripts/validate-codex-plugin.py` validates repository-level Codex plugin integration across `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, and `distribution/platforms.json`.
- `skills/docker-to-sealos/scripts/quality_gate.py` chains `check_consistency.py` and `check_must_coverage.py`, and includes generated artifact paths when present.
- Eval JSON fixtures under `skills/*/evals/` define agent-level behavioral checks for deploy readiness, database analysis, S3 analysis, and read-only canvas generation.

**E2E Tests:**
- No automated browser or deployment E2E framework is detected.
- Runtime smoke helpers exist as executable scripts, including `skills/sealos-deploy/scripts/sealos-live-smoke.mjs`, `skills/sealos-deploy/scripts/sealos-footprint.mjs`, and `skills/sealos-canvas/scripts/generate-canvas.mjs`.

## Common Patterns

**Async Testing:**
```python
with mock.patch("compose_to_template.shutil.which", return_value="/usr/local/bin/crane"):
    with mock.patch("compose_to_template.subprocess.run", side_effect=fake_run):
        result = resolve_image_reference("nginx:latest")
        self.assertEqual("nginx:1.27.2", result)
```

**Error Testing:**
```python
ok, message = quality_gate.validate_artifact_targets("", allow_empty=False)
self.assertFalse(ok)
self.assertIn("no template artifacts found", message)
```

**Eval Testing:**
- Add or update `assertions` entries in the relevant `skills/<skill-name>/evals/evals.json` when skill behavior changes.
- Keep eval prompts concrete and tied to observable outputs such as score thresholds, generated files, safe secret rendering, and view-only behavior.

---

*Testing analysis: 2026-06-15*
