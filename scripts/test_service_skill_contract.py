#!/usr/bin/env python3
"""Offline shared contract checks for Phase 9 service skill entries."""

from __future__ import annotations

import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests" / "fixtures" / "skill-design-services.json"
OWNERS = {
    "sealos-database": ROOT / "skills" / "sealos-database" / "SKILL.md",
    "sealos-s3": ROOT / "skills" / "sealos-s3" / "SKILL.md",
    "sealos-canvas": ROOT / "skills" / "sealos-canvas" / "SKILL.md",
    "sealos-app-builder": ROOT / "skills" / "sealos-app-builder" / "SKILL.md",
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
DOMAIN_TOKENS = {
    "sealos-database": ["list before create/reuse", "connectivity", "target: sealos-deploy"],
    "sealos-s3": ["private", "object-flow", "target: sealos-deploy"],
    "sealos-canvas": ["read-only", "server_lifetime", "Secret.data", "target: none"],
    "sealos-app-builder": ["create", "adapt", "identity", "tutorial", "createSealosApp", "client-only", "target: sealos-deploy"],
}


def load_fixture() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def relative_link_targets(text: str) -> list[str]:
    return [
        target.strip("<>").split("#", 1)[0]
        for target in re.findall(r"\]\(([^)]+)\)", text)
        if not target.startswith(("http://", "https://", "#"))
    ]


class ServiceFixtureTests(unittest.TestCase):
    def test_fixture_schema_and_positive_typed_handoffs(self) -> None:
        fixture = load_fixture()
        self.assertEqual(1, fixture["schemaVersion"])
        self.assertEqual(set(OWNERS), set(fixture["owners"]))
        self.assertEqual(12, len(fixture["cases"]))

        case_ids = [case["caseId"] for case in fixture["cases"]]
        self.assertEqual(len(case_ids), len(set(case_ids)))
        self.assertEqual(set(OWNERS), {case["owner"] for case in fixture["cases"]})

        for case in fixture["cases"]:
            self.assertIn(case["owner"], OWNERS)
            self.assertIn(case["terminalState"], {"success", "stopped", "error"})
            self.assertTrue(case["source"])
            self.assertIn("redaction", case)
            if case["kind"] == "positive":
                self.assertTrue(case["evidence"])
                self.assertTrue(case["verification"])
                self.assertTrue(case["redaction"]["ok"])
                self.assertEqual(HANDOFF_FIELDS, set(case["handoff"]))
                for value in case["handoff"].values():
                    self.assertTrue(value)
            else:
                self.assertIn(case["terminalState"], {"stopped", "error"})
                self.assertIn("violations", case)
                self.assertTrue(case["violations"])

    def test_live_entries_keep_shared_and_domain_contract(self) -> None:
        for owner, path in OWNERS.items():
            text = path.read_text(encoding="utf-8")
            for heading in CORE_HEADINGS:
                self.assertIn(heading, text, owner)
            for token in DOMAIN_TOKENS[owner]:
                self.assertIn(token.lower(), text.lower(), f"{owner}: {token}")
            for state in ("success", "stopped", "error"):
                self.assertIn(f"`{state}`", text, f"{owner}: {state}")
            for field in HANDOFF_FIELDS:
                self.assertIn(field, text, f"{owner}: {field}")
            self.assertRegex(text.lower(), r"redact|redaction|sanit")

    def test_entry_links_resolve_and_stay_local(self) -> None:
        paths = list(OWNERS.values())
        paths.extend(
            [
                ROOT / "skills" / "sealos-app-builder" / "references" / "minimal-app-template.md",
                ROOT / "skills" / "sealos-app-builder" / "references" / "nextjs-app-router.md",
            ]
        )
        for path in paths:
            for target in relative_link_targets(path.read_text(encoding="utf-8")):
                self.assertFalse(target.startswith("/"), f"{path}: {target}")
                resolved = (path.parent / target).resolve()
                self.assertTrue(resolved.is_file(), f"{path}: missing link target {target}")

    def test_app_builder_starters_keep_client_only_single_init_and_fallback(self) -> None:
        react = (ROOT / "skills" / "sealos-app-builder" / "assets" / "templates" / "react" / "sealos-provider.tsx").read_text(encoding="utf-8")
        vue = (ROOT / "skills" / "sealos-app-builder" / "assets" / "templates" / "vue" / "use-sealos.ts").read_text(encoding="utf-8")
        for text in (react, vue):
            self.assertIn("createSealosApp", text)
            self.assertIn("sealosApp.getSession", text)
            self.assertIn("sealosApp.getLanguage", text)
            self.assertIn("EVENT_NAME.CHANGE_I18N", text)
            self.assertIn("isInSealosDesktop", text)
            self.assertIn("This page is not running inside Sealos Desktop.", text)
        self.assertIn("'use client'", react)
        self.assertIn("useEffect", react)
        self.assertIn("onMounted", vue)
        self.assertIn("onUnmounted", vue)


if __name__ == "__main__":
    unittest.main()
