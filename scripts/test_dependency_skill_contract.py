#!/usr/bin/env python3
"""Offline contract and mutation checks for the Phase 8 dependency entries."""

from __future__ import annotations

import json
import re
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests" / "fixtures" / "skill-design-dependencies.json"
OWNERS = {
    "cloud-native-readiness": ROOT / "skills" / "cloud-native-readiness" / "SKILL.md",
    "dockerfile-skill": ROOT / "skills" / "dockerfile-skill" / "SKILL.md",
    "docker-to-sealos": ROOT / "skills" / "docker-to-sealos" / "SKILL.md",
}

HANDOFF_FIELDS = {"target", "inputArtifact", "allowedAction", "failureReturn", "responseOwner"}
CORE_HEADINGS = [
    "Identity and Discovery",
    "Scope and Boundaries",
    "Risk and Confirmation",
    "Lifecycle Workflow",
    "Progressive Disclosure",
    "Output, Stop, and Error States",
    "Handoffs",
    "Verification",
]


def load_fixture() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def missing_tokens(text: str, tokens: list[str]) -> list[str]:
    return [token for token in tokens if token.lower() not in text.lower()]


def validate_entry(text: str, owner: str) -> list[str]:
    required = list(CORE_HEADINGS)
    if owner == "cloud-native-readiness":
        required += ["eligibility", "redacted", "readiness report", "target: dockerfile-skill"]
    elif owner == "dockerfile-skill":
        required += ["owned_files", "pre-existing", "migration", "HTTP", "health", "target: sealos-deploy"]
    else:
        required += ["Source Precedence", "must-rules-map.yaml", "rules-registry.yaml", "quality_gate.py", "target: sealos-deploy"]
    return missing_tokens(text, required)


def relative_link_targets(text: str) -> list[str]:
    return [target for target in re.findall(r"\]\(([^)]+)\)", text) if not target.startswith(("http://", "https://", "#"))]


class DependencyFixtureTests(unittest.TestCase):
    def test_fixture_schema_and_typed_handoffs(self) -> None:
        fixture = load_fixture()
        self.assertEqual(1, fixture["schemaVersion"])
        self.assertEqual(set(OWNERS), set(fixture["owners"]))
        self.assertEqual(9, len(fixture["cases"]))
        case_ids = [case["caseId"] for case in fixture["cases"]]
        self.assertEqual(len(case_ids), len(set(case_ids)))
        for case in fixture["cases"]:
            self.assertIn(case["owner"], OWNERS)
            self.assertIn(case["terminalState"], {"success", "stopped", "error"})
            self.assertEqual(HANDOFF_FIELDS, set(case["handoff"]))
            self.assertTrue(case["source"])
            self.assertTrue(case["verification"])
            self.assertTrue(case["redaction"]["ok"])
            if case["kind"] == "violating":
                self.assertIn(case["terminalState"], {"stopped", "error"})

    def test_live_entries_keep_shared_core_and_domain_contract(self) -> None:
        for owner, path in OWNERS.items():
            self.assertEqual([], validate_entry(path.read_text(encoding="utf-8"), owner), owner)

    def test_entry_links_stay_one_level_and_repository_relative(self) -> None:
        for owner, path in OWNERS.items():
            for target in relative_link_targets(path.read_text(encoding="utf-8")):
                self.assertFalse(target.startswith("/"), f"{owner}: {target}")
                self.assertNotIn("..", Path(target).parts, f"{owner}: {target}")
                self.assertLessEqual(len([part for part in Path(target).parts if part not in {".", ""}]), 3, f"{owner}: {target}")

    def test_readiness_eligibility_gate_precedes_artifact_and_route(self) -> None:
        assess = (ROOT / "skills/cloud-native-readiness/modules/assess.md").read_text(encoding="utf-8")
        route = (ROOT / "skills/cloud-native-readiness/modules/route.md").read_text(encoding="utf-8")
        self.assertLess(assess.index("eligibility"), assess.index("Do not inspect Docker artifacts"))
        self.assertLess(route.index("eligibility"), route.index("artifact"))
        self.assertIn("artifact-detection", route)
        self.assertIn("downstream action", route)

    def test_dockerfile_owned_files_and_runtime_acceptance_are_visible(self) -> None:
        analyze = (ROOT / "skills/dockerfile-skill/modules/analyze.md").read_text(encoding="utf-8")
        build_fix = (ROOT / "skills/dockerfile-skill/modules/build-fix.md").read_text(encoding="utf-8")
        self.assertEqual([], missing_tokens(analyze, ["owned_files", "preserve", "update_with_authorization", "stop before mutation"]))
        self.assertEqual([], missing_tokens(build_fix, ["build-only", "migration/database proof", "HTTP/health", "runtime-log", "Never pass an unaccepted build"]))

    def test_compose_precedence_and_gate_boundary_are_visible(self) -> None:
        text = OWNERS["docker-to-sealos"].read_text(encoding="utf-8")
        for token in ["Source Precedence", "raw Railpack JSON", "analysis.json.build_environment", "Dockerfile plus sandbox Kaniko", "quality_gate.py", "KubeBlocks"]:
            self.assertIn(token.lower(), text.lower())
        self.assertLess(text.index("Entry MUST rules"), text.index("Official Kubernetes"))
        self.assertLess(text.index("Official Kubernetes"), text.index("Compose or install documentation"))

    def test_mutations_remove_targeted_guards(self) -> None:
        mutations = {
            "readiness": (OWNERS["cloud-native-readiness"], "CNR-ELIGIBILITY-STOP", ["CNR-ELIGIBILITY-STOP"]),
            "dockerfile": (OWNERS["dockerfile-skill"], "DFS-RUNTIME-ACCEPT", ["DFS-RUNTIME-ACCEPT"]),
            "compose": (OWNERS["docker-to-sealos"], "DTS-QUALITY-GATE", ["DTS-QUALITY-GATE"]),
        }
        with tempfile.TemporaryDirectory(prefix="phase8-contract-") as tmp:
            tmp_root = Path(tmp)
            for name, (source, removed, tokens) in mutations.items():
                copy = tmp_root / f"{name}.md"
                text = source.read_text(encoding="utf-8").replace(removed, "")
                copy.write_text(text, encoding="utf-8")
                self.assertTrue(missing_tokens(text, tokens), name)


if __name__ == "__main__":
    unittest.main()
