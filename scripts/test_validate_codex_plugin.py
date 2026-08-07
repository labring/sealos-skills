#!/usr/bin/env python3
"""Temporary-root regression tests for the Codex distribution validator."""

from __future__ import annotations

import contextlib
import importlib.util
import io
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
VALIDATOR_PATH = ROOT / "scripts/validate-codex-plugin.py"
SPEC = importlib.util.spec_from_file_location("validate_codex_plugin", VALIDATOR_PATH)
assert SPEC and SPEC.loader
codex_validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(codex_validator)


class CodexValidatorTests(unittest.TestCase):
    def _copy_repo(self) -> tuple[tempfile.TemporaryDirectory[str], Path]:
        temp = tempfile.TemporaryDirectory()
        root = Path(temp.name)
        for directory in (
            "skills",
            "commands",
            "docs",
            "tests",
            ".codex-plugin",
            ".claude-plugin",
            ".codebuddy-plugin",
            ".qoder-plugin",
            ".agents",
            "distribution",
            "assets",
        ):
            source = ROOT / directory
            if source.exists():
                shutil.copytree(source, root / directory, symlinks=True)
        for file_name in (
            "plugin.json",
            "marketplace.json",
            "gemini-extension.json",
            "qwen-extension.json",
            "openclaw.plugin.json",
            "README.md",
            "qoder.md",
        ):
            shutil.copy(ROOT / file_name, root / file_name)
        (root / "plugins").mkdir()
        (root / "plugins/sealos").symlink_to("..")
        return temp, root

    @staticmethod
    def _json(path: Path) -> dict:
        return json.loads(path.read_text(encoding="utf-8"))

    @staticmethod
    def _write_json(path: Path, payload: dict) -> None:
        path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    @staticmethod
    def _run(root: Path) -> tuple[int, str]:
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            try:
                code = codex_validator.validate(root)
            except SystemExit as exc:
                code = int(exc.code or 1)
        return code, output.getvalue()

    def test_validator_accepts_a_temporary_root(self) -> None:
        temp, root = self._copy_repo()
        try:
            code, output = self._run(root)
            self.assertEqual(code, 0, output)
        finally:
            temp.cleanup()

    def test_stale_canonical_version_fails_secondary_parity(self) -> None:
        temp, root = self._copy_repo()
        try:
            path = root / ".codex-plugin/plugin.json"
            payload = self._json(path)
            payload["version"] = "9.9.9"
            self._write_json(path, payload)
            code, output = self._run(root)
            self.assertNotEqual(code, 0)
            self.assertIn("version", output.lower())
        finally:
            temp.cleanup()

    def test_stale_secondary_version_fails(self) -> None:
        temp, root = self._copy_repo()
        try:
            path = root / "distribution/platforms.json"
            payload = self._json(path)
            payload["version"] = "9.9.9"
            self._write_json(path, payload)
            code, output = self._run(root)
            self.assertNotEqual(code, 0)
            self.assertIn("version", output.lower())
        finally:
            temp.cleanup()

    def test_broken_codex_pointer_fails(self) -> None:
        temp, root = self._copy_repo()
        try:
            link = root / "plugins/sealos"
            link.unlink()
            link.symlink_to("missing")
            code, output = self._run(root)
            self.assertNotEqual(code, 0)
            self.assertIn("symlink", output.lower())
        finally:
            temp.cleanup()

    def test_incomplete_qoder_inventory_fails(self) -> None:
        temp, root = self._copy_repo()
        try:
            path = root / ".qoder-plugin/plugin.json"
            payload = self._json(path)
            payload["skills"] = payload["skills"][:-1]
            self._write_json(path, payload)
            code, output = self._run(root)
            self.assertNotEqual(code, 0)
            self.assertIn("inventory", output.lower())
        finally:
            temp.cleanup()

    def test_missing_openai_prompt_is_reported_by_aggregate_gate(self) -> None:
        temp, root = self._copy_repo()
        try:
            path = root / "skills/sealos-canvas/agents/openai.yaml"
            path.write_text(path.read_text(encoding="utf-8").replace("$sealos-canvas", "$other-skill"), encoding="utf-8")
            diagnostics = validate_design_system(root)
            self.assertTrue(any(item.code == "metadata.prompt_missing_skill" and item.skill == "sealos-canvas" for item in diagnostics))
        finally:
            temp.cleanup()

    def test_cli_accepts_root_parameter_and_returns_failure_for_mutation(self) -> None:
        temp, root = self._copy_repo()
        try:
            path = root / "openclaw.plugin.json"
            payload = self._json(path)
            payload["source"] = "skills/sealos-deploy/SKILL.md"
            self._write_json(path, payload)
            result = subprocess.run([sys.executable, str(VALIDATOR_PATH), "--root", str(root)], capture_output=True, text=True, check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("openclaw", result.stdout.lower())
        finally:
            temp.cleanup()


if __name__ == "__main__":
    unittest.main()
