#!/usr/bin/env python3
"""Offline contract tests for the Phase 7 risk-aware route schema."""

from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.skill_design_inventory import (
    InventoryError,
    parse_router,
    validate_inventory_and_router,
)


ROOT = Path(__file__).resolve().parents[1]


class RouterContractTests(unittest.TestCase):
    def _copy_router(self) -> tuple[tempfile.TemporaryDirectory[str], Path, Path]:
        temp = tempfile.TemporaryDirectory()
        root = Path(temp.name)
        shutil.copytree(ROOT / "skills", root / "skills")
        (root / "commands").mkdir()
        path = root / "commands/sealos.md"
        shutil.copy(ROOT / "commands/sealos.md", path)
        return temp, root, path

    def test_live_route_maps_every_owner_and_preserves_typed_handoff(self) -> None:
        routes = parse_router(ROOT / "commands/sealos.md")
        expected_classes = {
            "sealos-deploy": "composite-orchestration",
            "sealos-database": "cloud-local-mutation",
            "sealos-s3": "cloud-local-mutation",
            "sealos-canvas": "read-only-observation",
            "sealos-app-builder": "local-artifact-mutation",
            "cloud-native-readiness": "read-only-observation",
            "dockerfile-skill": "local-artifact-mutation",
            "docker-to-sealos": "local-artifact-mutation",
        }
        self.assertEqual({route.skill for route in routes}, set(expected_classes))
        self.assertEqual({route.skill: route.interaction_class for route in routes}, expected_classes)
        deploy = next(route for route in routes if route.skill == "sealos-deploy")
        self.assertEqual(
            [step.target for step in deploy.handoff],
            ["cloud-native-readiness", "dockerfile-skill", "docker-to-sealos", "sealos-deploy", "sealos-canvas"],
        )
        self.assertTrue(deploy.handoff[1].conditional)
        self.assertTrue(all(step.input_artifact and step.allowed_action and step.failure_return and step.response_owner for step in deploy.handoff))

    def test_unknown_interaction_class_is_rejected(self) -> None:
        temp, root, path = self._copy_router()
        try:
            text = path.read_text(encoding="utf-8").replace("`read-only-observation`", "`unclassified`", 1)
            path.write_text(text, encoding="utf-8")
            with self.assertRaises(InventoryError) as caught:
                parse_router(path)
            self.assertEqual(caught.exception.diagnostics[0].code, "route.interaction_class_invalid")
            self.assertEqual(caught.exception.diagnostics[0].field, "interaction_class")
        finally:
            temp.cleanup()

    def test_owner_mapping_mutation_is_rejected_by_class_fixture(self) -> None:
        temp, root, path = self._copy_router()
        try:
            text = path.read_text(encoding="utf-8").replace("`cloud-local-mutation`", "`read-only-observation`", 1)
            path.write_text(text, encoding="utf-8")
            with self.assertRaises(InventoryError) as caught:
                parse_router(path)
            self.assertEqual(caught.exception.diagnostics[0].code, "route.interaction_class_mismatch")
            self.assertEqual(caught.exception.diagnostics[0].skill, "sealos-database")
        finally:
            temp.cleanup()

    def test_handoff_requires_all_typed_fields(self) -> None:
        temp, root, path = self._copy_router()
        try:
            text = path.read_text(encoding="utf-8").replace("; responseOwner=sealos-deploy", "", 1)
            path.write_text(text, encoding="utf-8")
            with self.assertRaises(InventoryError) as caught:
                parse_router(path)
            self.assertEqual(caught.exception.diagnostics[0].code, "route.handoff_malformed")
        finally:
            temp.cleanup()

    def test_handoff_sequence_and_owner_are_validated(self) -> None:
        temp, root, path = self._copy_router()
        try:
            text = path.read_text(encoding="utf-8").replace("target=sealos-canvas?", "target=unknown-skill?", 1)
            path.write_text(text, encoding="utf-8")
            with self.assertRaises(InventoryError) as caught:
                parse_router(path)
            self.assertEqual(caught.exception.diagnostics[0].code, "route.handoff_unknown_skill")
        finally:
            temp.cleanup()

    def test_ambiguous_mutation_policy_is_side_effect_free(self) -> None:
        text = (ROOT / "commands/sealos.md").read_text(encoding="utf-8")
        self.assertIn("Ambiguous mutation requests return a `stopped` clarification", text)
        self.assertIn("provider, filesystem, or Kubernetes side effects", text)
        self.assertIn("stopped", text.lower())
        self.assertNotIn("kubectl delete", text)
        self.assertNotIn("sealos-cli database delete", text)

    def test_inventory_mismatch_remains_targeted(self) -> None:
        temp, root, path = self._copy_router()
        try:
            text = "\n".join(line for line in path.read_text(encoding="utf-8").splitlines() if "`sealos-canvas`" not in line) + "\n"
            path.write_text(text, encoding="utf-8")
            diagnostics = validate_inventory_and_router(root, path)
            self.assertTrue(any(item.code == "route.missing_skill" and item.skill == "sealos-canvas" for item in diagnostics))
        finally:
            temp.cleanup()


if __name__ == "__main__":
    unittest.main()
