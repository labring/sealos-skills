#!/usr/bin/env python3
"""Regression tests for the read-only Phase 12 release preservation audit."""

from __future__ import annotations

import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests/fixtures/release-preservation-policy.json"
MODULE_PATH = ROOT / "scripts/release-preservation-audit.py"
_spec = importlib.util.spec_from_file_location("release_preservation_audit", MODULE_PATH)
assert _spec and _spec.loader
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
audit = _module.audit
redact = _module.redact


def load_fixture() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def git_sha(ref: str) -> str:
    return subprocess.run(
        ["git", "rev-parse", "--verify", f"{ref}^{{commit}}"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


class ReleasePreservationAuditTests(unittest.TestCase):
    def test_live_fixture_passes_and_records_immutable_anchors(self) -> None:
        report = audit(ROOT, FIXTURE)
        self.assertTrue(report["ok"], report)
        self.assertTrue(report["readOnly"])
        self.assertEqual(report["summary"]["failed"], 0)
        self.assertEqual(
            {item["id"] for item in report["checks"] if item["id"].startswith("anchor-")},
            {"anchor-source", "anchor-target", "anchor-candidate"},
        )
        for branch, anchor in report["anchors"].items():
            self.assertEqual(anchor["status"], "passed", branch)
            self.assertEqual(anchor["expectedSha"], anchor["refSha"], branch)

    def test_missing_marker_is_actionable(self) -> None:
        mutated = copy.deepcopy(load_fixture())
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
        self.assertIn("owner", finding)

    def test_forbidden_surface_is_detected(self) -> None:
        mutated = copy.deepcopy(load_fixture())
        mutated["forbiddenPreview"][0]["path"] = "skills/sealos-deploy"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "policy.json"
            path.write_text(json.dumps(mutated), encoding="utf-8")
            report = audit(ROOT, path)
        finding = next(item for item in report["checks"] if item["id"] == "preview-no-canvas")
        self.assertFalse(report["ok"])
        self.assertEqual(finding["status"], "failed")
        self.assertTrue(finding["present"])

    def test_anchor_mismatch_withholds_branch_interpretation(self) -> None:
        mutated = copy.deepcopy(load_fixture())
        mutated["anchors"]["target"]["sha"] = mutated["anchors"]["source"]["sha"]
        before = {name: git_sha(anchor["ref"]) for name, anchor in mutated["anchors"].items()}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "policy.json"
            path.write_text(json.dumps(mutated), encoding="utf-8")
            report = audit(ROOT, path)
        after = {name: git_sha(anchor["ref"]) for name, anchor in mutated["anchors"].items()}
        self.assertFalse(report["ok"])
        self.assertIn("anchor-target", report["summary"]["requiredFailures"])
        self.assertEqual([item["id"] for item in report["checks"]], ["anchor-source", "anchor-target", "anchor-candidate", "anchor-gate"])
        self.assertEqual(before, after)

    def test_redaction_removes_credential_shaped_values_from_report(self) -> None:
        mutated = copy.deepcopy(load_fixture())
        mutated["checks"][0]["markers"].append("password=super-secret")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "policy.json"
            path.write_text(json.dumps(mutated), encoding="utf-8")
            report = audit(ROOT, path)
        rendered = json.dumps(report)
        self.assertNotIn("super-secret", rendered)
        self.assertIn("password=<redacted>", rendered)
        self.assertNotIn("Bearer abcdefghijklmnop", redact("Bearer abcdefghijklmnop"))

    def test_cli_emits_machine_readable_report(self) -> None:
        result = subprocess.run(
            [sys.executable, "scripts/release-preservation-audit.py", "--root", ".", "--fixture", str(FIXTURE), "--check"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        payload = json.loads(result.stdout)
        self.assertTrue(payload["ok"])
        self.assertGreaterEqual(payload["summary"]["passed"], 20)


if __name__ == "__main__":
    unittest.main()
