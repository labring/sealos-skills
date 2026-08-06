#!/usr/bin/env python3
"""Inspect a disposable Qoder archive built from canonical repository inputs."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
PACKAGE_SCRIPT = ROOT / "scripts/package-qoder-plugin.py"


class QoderPackageTests(unittest.TestCase):
    def test_temporary_archive_contains_every_canonical_skill_once(self) -> None:
        manifest = json.loads((ROOT / ".qoder-plugin/plugin.json").read_text(encoding="utf-8"))
        version = manifest["version"]
        expected_skills = {f"skills/{path.parent.name}/SKILL.md" for path in (ROOT / "skills").glob("*/SKILL.md")}
        with tempfile.TemporaryDirectory() as output_dir:
            result = subprocess.run([sys.executable, str(PACKAGE_SCRIPT), "--output-dir", output_dir], cwd=ROOT, capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            archive_path = Path(result.stdout.strip())
            self.assertEqual(archive_path.name, f"sealos-{version}.zip")
            self.assertTrue(archive_path.is_file())
            with ZipFile(archive_path) as archive:
                members = set(archive.namelist())
                self.assertTrue(expected_skills <= members)
                self.assertEqual({member for member in members if member.endswith("/SKILL.md")}, expected_skills)
                for required in {
                    ".qoder-plugin/plugin.json",
                    "commands/sealos.md",
                    "qoder.md",
                    "README.md",
                    "assets/logo.svg",
                }:
                    self.assertIn(required, members)
                packaged_manifest = json.loads(archive.read(".qoder-plugin/plugin.json"))
                self.assertEqual(packaged_manifest["version"], version)
                self.assertEqual(packaged_manifest["commands"]["sealos"]["source"], "./commands/sealos.md")
            self.assertEqual([path.resolve() for path in Path(output_dir).glob("*.zip")], [archive_path.resolve()])

        self.assertFalse((ROOT / "dist" / f"sealos-{version}.zip").exists())


if __name__ == "__main__":
    unittest.main()
