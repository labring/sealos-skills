#!/usr/bin/env python3
"""Regression tests for the aggregate Phase 6 design validator."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.validate_skill_design import validate_design_system


ROOT = Path(__file__).resolve().parents[1]


class DesignValidatorTests(unittest.TestCase):
    def _copy_repo(self) -> tuple[tempfile.TemporaryDirectory[str], Path]:
        temp = tempfile.TemporaryDirectory()
        root = Path(temp.name)
        for directory in ("skills", "commands", "docs", "tests", ".codex-plugin", ".claude-plugin", ".codebuddy-plugin", ".qoder-plugin", "distribution"):
            source = ROOT / directory
            if source.exists():
                shutil.copytree(source, root / directory)
        for file_name in ("plugin.json", "marketplace.json", "gemini-extension.json", "qwen-extension.json", "openclaw.plugin.json"):
            shutil.copy(ROOT / file_name, root / file_name)
        return temp, root

    @staticmethod
    def _add_canvas(root: Path) -> None:
        for relative, field_path in (
            (".claude-plugin/plugin.json", ("skills",)),
            ("marketplace.json", ("plugins", 0, "skills")),
            (".claude-plugin/marketplace.json", ("plugins", 0, "skills")),
            (".codebuddy-plugin/marketplace.json", ("plugins", 0, "skills")),
        ):
            path = root / relative
            payload = json.loads(path.read_text(encoding="utf-8"))
            current = payload
            for key in field_path[:-1]:
                current = current[key]
            values = current[field_path[-1]]
            if "./skills/sealos-canvas" not in values:
                values.append("./skills/sealos-canvas")
            path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    def test_live_reports_only_known_canvas_projection_drift(self) -> None:
        diagnostics = validate_design_system(ROOT)
        codes = {item.code for item in diagnostics}
        self.assertIn("inventory.missing_projection", codes)
        self.assertNotIn("canary.missing", codes)
        self.assertNotIn("eval.malformed", codes)

    def test_projection_repair_fixture_is_green(self) -> None:
        temp, root = self._copy_repo()
        try:
            self._add_canvas(root)
            diagnostics = validate_design_system(root)
            self.assertEqual(diagnostics, [], diagnostics)
        finally:
            temp.cleanup()

    def test_stale_version_is_targeted(self) -> None:
        temp, root = self._copy_repo()
        try:
            path = root / "gemini-extension.json"
            payload = json.loads(path.read_text(encoding="utf-8"))
            payload["version"] = "9.9.9"
            path.write_text(json.dumps(payload), encoding="utf-8")
            diagnostics = validate_design_system(root)
            self.assertTrue(any(item.code == "version.mismatch" and item.path == "gemini-extension.json" for item in diagnostics))
        finally:
            temp.cleanup()

    def test_broken_progressive_link_is_targeted(self) -> None:
        temp, root = self._copy_repo()
        try:
            path = root / "skills/cloud-native-readiness/SKILL.md"
            path.write_text(path.read_text(encoding="utf-8") + "\n[broken](modules/missing.md)\n", encoding="utf-8")
            diagnostics = validate_design_system(root)
            self.assertTrue(any(item.code == "link.broken" and item.target == "modules/missing.md" for item in diagnostics))
        finally:
            temp.cleanup()

    def test_outside_root_link_is_targeted(self) -> None:
        temp, root = self._copy_repo()
        try:
            path = root / "skills/cloud-native-readiness/SKILL.md"
            path.write_text(path.read_text(encoding="utf-8") + "\n[outside](/tmp/outside.md)\n", encoding="utf-8")
            diagnostics = validate_design_system(root)
            self.assertTrue(any(item.code == "path.outside_root" and item.target == "/tmp/outside.md" for item in diagnostics))
        finally:
            temp.cleanup()

    def test_missing_route_is_targeted(self) -> None:
        temp, root = self._copy_repo()
        try:
            path = root / "commands/sealos.md"
            lines = [line for line in path.read_text(encoding="utf-8").splitlines() if "sealos-canvas" not in line]
            path.write_text("\n".join(lines) + "\n", encoding="utf-8")
            diagnostics = validate_design_system(root)
            self.assertTrue(any(item.code == "route.missing_skill" and item.path == "commands/sealos.md" and item.skill == "sealos-canvas" for item in diagnostics))
        finally:
            temp.cleanup()

    def test_malformed_eval_is_targeted(self) -> None:
        temp, root = self._copy_repo()
        try:
            path = root / "skills/sealos-canvas/evals/evals.json"
            payload = json.loads(path.read_text(encoding="utf-8"))
            payload["evals"][0]["prompt"] = ""
            path.write_text(json.dumps(payload), encoding="utf-8")
            diagnostics = validate_design_system(root)
            self.assertTrue(any(item.code == "eval.malformed" and item.path.endswith("skills/sealos-canvas/evals/evals.json") for item in diagnostics))
        finally:
            temp.cleanup()

    def test_duplicate_eval_id_and_assertion_are_targeted(self) -> None:
        temp, root = self._copy_repo()
        try:
            path = root / "skills/sealos-canvas/evals/evals.json"
            payload = json.loads(path.read_text(encoding="utf-8"))
            payload["evals"][1]["id"] = payload["evals"][0]["id"]
            payload["evals"][0]["assertions"].append(dict(payload["evals"][0]["assertions"][0]))
            path.write_text(json.dumps(payload), encoding="utf-8")
            diagnostics = validate_design_system(root)
            matches = [item for item in diagnostics if item.code == "eval.malformed" and item.path.endswith("skills/sealos-canvas/evals/evals.json")]
            self.assertGreaterEqual(len(matches), 2)
        finally:
            temp.cleanup()

    def test_malformed_canary_fixture_is_targeted(self) -> None:
        temp, root = self._copy_repo()
        try:
            path = root / "tests/fixtures/skill-design-safety.json"
            payload = json.loads(path.read_text(encoding="utf-8"))
            del payload["cases"][0]["category"]
            path.write_text(json.dumps(payload), encoding="utf-8")
            diagnostics = validate_design_system(root)
            self.assertTrue(any(item.code == "canary.fixture_malformed" and item.path.endswith("tests/fixtures/skill-design-safety.json") for item in diagnostics))
        finally:
            temp.cleanup()

    def test_frontmatter_name_mismatch_is_targeted(self) -> None:
        temp, root = self._copy_repo()
        try:
            path = root / "skills/sealos-s3/SKILL.md"
            text = path.read_text(encoding="utf-8").replace("name: sealos-s3", "name: wrong-name", 1)
            path.write_text(text, encoding="utf-8")
            diagnostics = validate_design_system(root)
            self.assertTrue(any(item.code == "frontmatter.name_mismatch" and item.skill == "wrong-name" for item in diagnostics))
        finally:
            temp.cleanup()

    def test_existing_codex_validator_remains_callable(self) -> None:
        result = subprocess.run([sys.executable, "scripts/validate-codex-plugin.py"], cwd=ROOT, text=True, capture_output=True, check=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
