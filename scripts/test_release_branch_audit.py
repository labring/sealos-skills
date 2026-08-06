#!/usr/bin/env python3
"""Regression tests for the immutable main-to-preview branch audit."""

from __future__ import annotations

import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts/release-branch-audit.py"
SPEC = importlib.util.spec_from_file_location("release_branch_audit", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
classify = MODULE.classify

FIXTURE = ROOT / "tests/fixtures/release-branch-policy.json"


class ReleaseBranchAuditTests(unittest.TestCase):
    def test_live_boundary_is_classified(self) -> None:
        report = classify(ROOT, FIXTURE)
        self.assertTrue(report["ok"], report)
        self.assertEqual(report["summary"]["changedPaths"], report["summary"]["classifiedPaths"])
        self.assertEqual(report["summary"]["alignedParity"], 5)
        self.assertGreater(report["summary"]["manualReview"], 0)
        self.assertEqual(report["preservation"]["summary"]["failed"], 0)

    def test_every_diff_row_has_policy_fields(self) -> None:
        report = classify(ROOT, FIXTURE)
        changed = [row for row in report["classifications"] if "changeType" in row]
        self.assertTrue(changed)
        self.assertTrue(all(row["path"] and row["policyId"] and row["classification"] in {"aligned", "adapted", "excluded"} for row in changed))

    def test_forbidden_preview_surface_fails_closed(self) -> None:
        fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
        mutated = copy.deepcopy(fixture)
        mutated["forbiddenPreviewPaths"] = ["skills/sealos-deploy"]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "policy.json"
            path.write_text(json.dumps(mutated), encoding="utf-8")
            report = classify(ROOT, path)
        self.assertFalse(report["ok"])
        finding = next(item for item in report["forbiddenPreview"] if item["path"] == "skills/sealos-deploy")
        self.assertEqual(finding["status"], "failed")

    def test_undocumented_dockerfile_marker_fails_closed(self) -> None:
        fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
        mutated = copy.deepcopy(fixture)
        mutated["dockerfile"]["allowedFiles"]["skills/dockerfile-skill/modules/analyze.md"].append("invented policy marker")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "policy.json"
            path.write_text(json.dumps(mutated), encoding="utf-8")
            report = classify(ROOT, path)
        self.assertFalse(report["ok"])
        finding = next(item for item in report["classifications"] if item.get("policyId") == "dockerfile-railpack" and item["path"].endswith("analyze.md") and "missingMarkers" in item)
        self.assertIn("invented policy marker", finding["missingMarkers"])


if __name__ == "__main__":
    unittest.main()
