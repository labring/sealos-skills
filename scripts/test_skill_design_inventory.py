#!/usr/bin/env python3
"""Regression tests for the canonical inventory and router readers."""

from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.skill_design_inventory import (
    InventoryError,
    discover_inventory,
    parse_router,
    parse_skill_frontmatter,
    validate_inventory_and_router,
    validate_repo_path,
)


ROOT = Path(__file__).resolve().parents[1]


class InventoryReaderTests(unittest.TestCase):
    def test_live_inventory_and_router_are_eight_entries(self) -> None:
        entries = discover_inventory(ROOT)
        routes = parse_router(ROOT / "commands/sealos.md")
        self.assertEqual(len(entries), 8)
        self.assertEqual({entry.name for entry in entries}, {route.skill for route in routes})
        self.assertTrue(all(route.intent and route.plugin_entry and route.direct_entry for route in routes))

    def test_frontmatter_is_normalized_from_crlf(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "SKILL.md"
            path.write_bytes(b"---\r\nname: sample\r\ndescription: Sample skill\r\n---\r\n")
            self.assertEqual(parse_skill_frontmatter(path)["name"], "sample")

    def test_frontmatter_name_mismatch_is_reported(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "skills/sample").mkdir(parents=True)
            (root / "skills/sample/SKILL.md").write_text("---\nname: other\ndescription: Sample\n---\n", encoding="utf-8")
            with self.assertRaises(InventoryError) as caught:
                discover_inventory(root)
            self.assertEqual(caught.exception.diagnostics[0].code, "frontmatter.name_mismatch")

    def test_router_missing_and_duplicate_records_are_reported(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            shutil.copytree(ROOT / "skills", root / "skills")
            command = root / "commands/sealos.md"
            command.parent.mkdir()
            text = (ROOT / "commands/sealos.md").read_text(encoding="utf-8")
            dockerfile_row = "| Generate or fix Docker packaging | `dockerfile-skill` | `$sealos` / `/sealos` | host selection through the installed pack |"
            canvas_row = "| View resources created by a previous deployment in a local read-only canvas | `sealos-canvas` | `$sealos` / `/sealos` | host selection through the installed pack |"
            duplicate_row = "| Duplicate S3 route | `sealos-s3` | `$sealos` / `/sealos` | host selection through the installed pack |"
            text = text.replace(dockerfile_row + "\n", "", 1).replace(canvas_row, canvas_row + "\n" + duplicate_row, 1)
            command.write_text(text, encoding="utf-8")
            diagnostics = validate_inventory_and_router(root, command)
            codes = {item.code for item in diagnostics}
            self.assertIn("route.duplicate_skill", codes)
            self.assertIn("route.missing_skill", codes)

    def test_constrained_path_rejects_traversal_absolute_and_missing(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "ok.txt").write_text("ok", encoding="utf-8")
            self.assertEqual(validate_repo_path(root, "ok.txt"), (root / "ok.txt").resolve())
            for value in ("../outside", "/tmp/outside", "missing.txt"):
                with self.assertRaises(InventoryError) as caught:
                    validate_repo_path(root, value)
                self.assertIn(caught.exception.diagnostics[0].code, {"path.outside_root", "path.missing"})

    def test_router_table_has_four_required_columns(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "sealos.md"
            path.write_text("## Route\n\n| Intent | Skill | Plugin entry | Direct skills.sh entry |\n| --- | --- | --- | --- |\n| x | y | z | q |\n", encoding="utf-8")
            with self.assertRaises(InventoryError) as caught:
                parse_router(path)
            self.assertEqual(caught.exception.diagnostics[0].code, "route.malformed")


if __name__ == "__main__":
    unittest.main()
