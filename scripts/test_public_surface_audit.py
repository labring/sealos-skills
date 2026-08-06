#!/usr/bin/env python3
"""Regression tests for public inventory, host, version, and tag checks."""

from __future__ import annotations

import copy
import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts/public-surface-audit.py"
SPEC = importlib.util.spec_from_file_location("public_surface_audit", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
audit = MODULE.audit

FIXTURE = ROOT / "tests/fixtures/public-surface-policy.json"
CANDIDATE = "ef8f2aceb2e7f0b915713419cd129fbc0454d717"


def copy_repo() -> tuple[tempfile.TemporaryDirectory[str], Path]:
    holder = tempfile.TemporaryDirectory()
    target = Path(holder.name) / "repo"
    shutil.copytree(ROOT, target, symlinks=True)
    return holder, target


class PublicSurfaceAuditTests(unittest.TestCase):
    def test_live_public_surface_passes_with_conditional_tag(self) -> None:
        report = audit(ROOT, FIXTURE, CANDIDATE, ROOT)
        self.assertTrue(report["ok"], report)
        self.assertEqual(report["inventory"], sorted(json.loads(FIXTURE.read_text())["canonicalSkills"]))
        self.assertEqual(report["summary"]["failed"], 0)
        self.assertEqual(report["summary"]["conditional"], 1)

    def test_missing_localized_skill_token_fails(self) -> None:
        holder, target = copy_repo()
        try:
            path = target / "readmes/README.zh-CN.md"
            content = path.read_text(encoding="utf-8").replace("sealos-canvas", "canvas-removed")
            path.write_text(content, encoding="utf-8")
            report = audit(target, FIXTURE, CANDIDATE, ROOT)
        finally:
            holder.cleanup()
        finding = next(item for item in report["checks"] if item["id"] == "readme-readmes/README.zh-CN.md")
        self.assertFalse(report["ok"])
        self.assertIn("sealos-canvas", finding["missingSkills"])

    def test_manifest_version_drift_fails(self) -> None:
        holder, target = copy_repo()
        try:
            path = target / ".codex-plugin/plugin.json"
            payload = json.loads(path.read_text(encoding="utf-8"))
            payload["version"] = "9.9.9"
            path.write_text(json.dumps(payload), encoding="utf-8")
            report = audit(target, FIXTURE, CANDIDATE, ROOT)
        finally:
            holder.cleanup()
        self.assertFalse(report["ok"])
        self.assertIn("version-source", report["summary"]["requiredFailures"])

    def test_host_invocation_drift_fails(self) -> None:
        holder, target = copy_repo()
        try:
            path = target / "README.md"
            content = path.read_text(encoding="utf-8").replace("$sealos", "sealos")
            path.write_text(content, encoding="utf-8")
            policy = json.loads(FIXTURE.read_text(encoding="utf-8"))
            policy["hostSemanticFiles"].append("README.md")
            fixture = target / "policy.json"
            fixture.write_text(json.dumps(policy), encoding="utf-8")
            report = audit(target, fixture, CANDIDATE, ROOT)
        finally:
            holder.cleanup()
        self.assertFalse(report["ok"])
        self.assertIn("host-README.md", report["summary"]["requiredFailures"])

    def test_required_tag_policy_fails_without_history_mutation(self) -> None:
        policy = json.loads(FIXTURE.read_text(encoding="utf-8"))
        policy = copy.deepcopy(policy)
        policy["tag"]["required"] = True
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory) / "policy.json"
            fixture.write_text(json.dumps(policy), encoding="utf-8")
            report = audit(ROOT, fixture, CANDIDATE, ROOT)
        self.assertFalse(report["ok"])
        tag = next(item for item in report["checks"] if item["id"] == "release-tag")
        self.assertEqual(tag["status"], "failed")


if __name__ == "__main__":
    unittest.main()
