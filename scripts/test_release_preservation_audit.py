#!/usr/bin/env python3
"""Regression tests for the read-only release preservation audit."""

from __future__ import annotations

import copy
import importlib.util
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts/release-preservation-audit.py"
SPEC = importlib.util.spec_from_file_location("release_preservation_audit", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
audit = MODULE.audit
redact = MODULE.redact


FIXTURE = ROOT / "tests/fixtures/release-preservation-policy.json"


class ReleasePreservationAuditTests(unittest.TestCase):
    def test_live_fixture_passes_and_records_anchors(self) -> None:
        report = audit(ROOT, FIXTURE)
        self.assertTrue(report["ok"], report)
        self.assertEqual(report["summary"]["failed"], 0)
        self.assertEqual({item["id"] for item in report["checks"] if item["id"].startswith("anchor-")}, {"anchor-source", "anchor-target", "anchor-candidate"})

    def test_missing_marker_is_actionable(self) -> None:
        fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
        mutated = copy.deepcopy(fixture)
        mutated["checks"][0]["markers"].append("marker-that-cannot-exist")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "policy.json"
            path.write_text(json.dumps(mutated), encoding="utf-8")
            report = audit(ROOT, path)
        finding = next(item for item in report["checks"] if item["id"] == "source-policy")
        self.assertFalse(report["ok"])
        self.assertIn("marker-that-cannot-exist", finding["missingMarkers"])
        self.assertEqual(finding["path"], "AGENTS.md")
        self.assertEqual(finding["branch"], "source")

    def test_forbidden_surface_is_detected(self) -> None:
        fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
        mutated = copy.deepcopy(fixture)
        mutated["forbidden"][0]["path"] = "skills/sealos-deploy"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "policy.json"
            path.write_text(json.dumps(mutated), encoding="utf-8")
            report = audit(ROOT, path)
        finding = next(item for item in report["checks"] if item["id"] == "preview-no-canvas")
        self.assertFalse(report["ok"])
        self.assertEqual(finding["status"], "failed")
        self.assertTrue(finding["present"])

    def test_redaction_removes_credential_shaped_values(self) -> None:
        diagnostic = "Bearer abcdefghijklmnop password=super-secret postgres://user:pass@example.invalid/db"
        safe = redact(diagnostic)
        self.assertNotIn("abcdefghijklmnop", safe)
        self.assertNotIn("super-secret", safe)
        self.assertNotIn("user:pass@example.invalid", safe)
        self.assertIn("<redacted>", safe)

    def test_audit_does_not_write_to_stdout_when_called_as_library(self) -> None:
        stream = io.StringIO()
        with redirect_stdout(stream):
            report = audit(ROOT, FIXTURE)
        self.assertTrue(report["ok"])
        self.assertEqual(stream.getvalue(), "")


if __name__ == "__main__":
    unittest.main()
