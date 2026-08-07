#!/usr/bin/env python3
"""Tests for the aggregate maintainer quality gate."""

from __future__ import annotations

import json
import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests/fixtures/maintainer-quality-gate.json"
GATE_MODULE_PATH = ROOT / "scripts/maintainer-quality-gate.py"
_spec = importlib.util.spec_from_file_location("maintainer_quality_gate", GATE_MODULE_PATH)
assert _spec and _spec.loader
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
run_gate = _module.run_gate


class MaintainerQualityGateTests(unittest.TestCase):
    def test_live_gate_fixture_has_required_components(self) -> None:
        payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
        ids = {component["id"] for component in payload["components"]}
        self.assertTrue({"design-validator", "behavior-check", "dependency-skill-gates", "codex-plugin-validator"}.issubset(ids))
        self.assertTrue(any(component["required"] is False for component in payload["components"]))

    def test_required_failure_propagates_and_redacts_output(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            fixture = Path(temp) / "gate.json"
            fixture.write_text(json.dumps({
                "schemaVersion": 1,
                "components": [{
                    "id": "intentional-failure",
                    "runner": "python",
                    "args": ["-c", "print('password=super-secret'); raise SystemExit(7)"],
                    "required": True,
                }],
            }), encoding="utf-8")
            report = run_gate(ROOT, fixture)
            self.assertFalse(report["ok"])
            self.assertEqual(report["summary"]["requiredFailures"], ["intentional-failure"])
            self.assertNotIn("super-secret", json.dumps(report))
            self.assertIn("<redacted>", json.dumps(report))

    def test_optional_missing_command_is_conditional(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            fixture = Path(temp) / "gate.json"
            fixture.write_text(json.dumps({
                "schemaVersion": 1,
                "components": [{
                    "id": "optional-runtime",
                    "runner": "shell",
                    "args": ["command-that-does-not-exist-sealos"],
                    "required": False,
                    "conditionalWhenMissing": "Install the optional runtime to run this advisory check.",
                }],
            }), encoding="utf-8")
            report = run_gate(ROOT, fixture)
            self.assertTrue(report["ok"])
            self.assertEqual(report["checks"][0]["status"], "conditional")

    def test_cli_emits_machine_readable_report(self) -> None:
        result = subprocess.run(
            [sys.executable, "scripts/maintainer-quality-gate.py", "--root", ".", "--fixture", str(FIXTURE), "--check"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["schemaVersion"], 1)
        self.assertTrue(payload["ok"])
        self.assertGreaterEqual(payload["summary"]["total"], 20)


if __name__ == "__main__":
    unittest.main()
