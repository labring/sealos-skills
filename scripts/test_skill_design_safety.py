#!/usr/bin/env python3
"""Regression tests for Phase 5 safety canaries and red/green mutations."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.skill_design_safety import check_safety, load_canaries, normalize


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests/fixtures/skill-design-safety.json"


class SafetyCanaryTests(unittest.TestCase):
    def _copy_safety_sources(self) -> tuple[tempfile.TemporaryDirectory[str], Path]:
        temp = tempfile.TemporaryDirectory()
        root = Path(temp.name)
        shutil.copytree(ROOT / "skills", root / "skills")
        (root / "docs").mkdir()
        shutil.copy(ROOT / "docs/skill-safety-canaries.md", root / "docs/skill-safety-canaries.md")
        shutil.copy(FIXTURE, root / "fixture.json")
        return temp, root

    def test_live_registry_and_fixture_are_green(self) -> None:
        canaries = load_canaries(ROOT / "docs/skill-safety-canaries.md")
        self.assertEqual(len(canaries), 26)
        self.assertEqual(check_safety(ROOT, FIXTURE), [])

    def test_confirmation_mutation_fails_with_canary_identity(self) -> None:
        temp, root = self._copy_safety_sources()
        try:
            path = root / "skills/sealos-database/SKILL.md"
            text = path.read_text(encoding="utf-8")
            mutated = re.sub(r"confirmation|confirm", "review", text, flags=re.IGNORECASE)
            path.write_text(mutated, encoding="utf-8")
            diagnostics = check_safety(root, root / "fixture.json")
            matched = [item for item in diagnostics if item.canary_id == "DB-CONFIRM-PUBLIC"]
            self.assertTrue(matched)
            self.assertEqual(matched[0].code, "canary.missing")
            self.assertEqual(matched[0].skill, "sealos-database")
        finally:
            temp.cleanup()

    def test_redaction_mutation_fails_with_redaction_category(self) -> None:
        temp, root = self._copy_safety_sources()
        try:
            path = root / "skills/sealos-s3/SKILL.md"
            text = path.read_text(encoding="utf-8")
            mutated = re.sub(r"redact(?:ed|ion)?|sanitized", "visible", text, flags=re.IGNORECASE)
            path.write_text(mutated, encoding="utf-8")
            diagnostics = check_safety(root)
            matched = [item for item in diagnostics if item.canary_id == "S3-REDACT-OBJECT"]
            self.assertTrue(matched)
            self.assertEqual(matched[0].category, "redaction")
        finally:
            temp.cleanup()

    def test_read_only_mutation_fails(self) -> None:
        temp, root = self._copy_safety_sources()
        try:
            path = root / "skills/sealos-canvas/SKILL.md"
            text = path.read_text(encoding="utf-8")
            mutated = re.sub(r"read[- ]only", "observe", text, flags=re.IGNORECASE)
            path.write_text(mutated, encoding="utf-8")
            diagnostics = check_safety(root)
            self.assertTrue(any(item.canary_id == "CANVAS-READONLY" and item.code == "canary.missing" for item in diagnostics))
        finally:
            temp.cleanup()

    def test_eligibility_mutation_fails_before_downstream_work(self) -> None:
        temp, root = self._copy_safety_sources()
        try:
            path = root / "skills/cloud-native-readiness/SKILL.md"
            text = path.read_text(encoding="utf-8")
            mutated = re.sub(r"eligibility|stopped before scoring/build", "reviewed target", text, flags=re.IGNORECASE)
            path.write_text(mutated, encoding="utf-8")
            diagnostics = check_safety(root)
            self.assertTrue(any(item.canary_id == "CNR-ELIGIBILITY-STOP" and item.code == "canary.missing" for item in diagnostics))
        finally:
            temp.cleanup()

    def test_fail_closed_quality_gate_mutation_fails(self) -> None:
        temp, root = self._copy_safety_sources()
        try:
            path = root / "skills/docker-to-sealos/SKILL.md"
            text = path.read_text(encoding="utf-8")
            mutated = re.sub(r"quality[_ -]?gate|gate", "unchecked conversion", text, flags=re.IGNORECASE)
            path.write_text(mutated, encoding="utf-8")
            diagnostics = check_safety(root)
            self.assertTrue(any(item.canary_id == "DTS-QUALITY-GATE" and item.code in {"canary.missing", "canary.evidence_missing"} for item in diagnostics))
        finally:
            temp.cleanup()

    def test_fixture_duplicate_and_unknown_records_fail(self) -> None:
        temp, root = self._copy_safety_sources()
        try:
            payload = json.loads((root / "fixture.json").read_text(encoding="utf-8"))
            payload["cases"].append(dict(payload["cases"][0]))
            payload["cases"][-1]["caseId"] = "unknown"
            payload["cases"][-1]["canaryId"] = "UNKNOWN"
            malformed = root / "bad-fixture.json"
            malformed.write_text(json.dumps(payload), encoding="utf-8")
            diagnostics = check_safety(root, malformed)
            self.assertTrue(any(item.code == "canary.fixture_malformed" for item in diagnostics))
        finally:
            temp.cleanup()

    def test_normalization_preserves_equivalent_text(self) -> None:
        self.assertEqual(normalize("KUBECONFIG=~/.sealos/kubeconfig"), "kubeconfig sealos kubeconfig")
        self.assertIn("confirmation", normalize("Confirmation, confirmation"))

    def test_cli_is_offline_and_structured(self) -> None:
        result = subprocess.run(
            [sys.executable, "scripts/skill_design_safety.py", "--root", ".", "--fixture", str(FIXTURE), "--check"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue(json.loads(result.stdout)["ok"])


if __name__ == "__main__":
    unittest.main()
