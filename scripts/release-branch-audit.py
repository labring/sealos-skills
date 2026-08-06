#!/usr/bin/env python3
"""Classify the immutable main-to-preview tree boundary without checkout or mutation."""

from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


def load_preservation_module(root: Path) -> Any:
    module_path = root / "scripts/release-preservation-audit.py"
    spec = importlib.util.spec_from_file_location("release_preservation_audit", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def git(root: Path, args: list[str]) -> tuple[int, str, str]:
    completed = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True, check=False)
    return completed.returncode, completed.stdout, completed.stderr


def blob(root: Path, ref: str, path: str) -> str | None:
    code, stdout, _ = git(root, ["rev-parse", f"{ref}:{path}"])
    return stdout.strip() if code == 0 else None


def read_tree(root: Path, ref: str, path: str) -> str:
    code, stdout, stderr = git(root, ["show", f"{ref}:{path}"])
    if code:
        raise RuntimeError(stderr.strip() or f"missing {ref}:{path}")
    return stdout


def exists(root: Path, ref: str, path: str) -> bool:
    code, _, _ = git(root, ["cat-file", "-e", f"{ref}:{path}"])
    return code == 0


def under(path: str, prefix: str) -> bool:
    return path == prefix.rstrip("/") or path.startswith(prefix)


def diff_paths(root: Path, source: str, target: str) -> list[dict[str, str]]:
    code, stdout, stderr = git(root, ["diff", "--name-status", "--find-renames", source, target])
    if code:
        raise RuntimeError(stderr.strip() or "git diff failed")
    entries: list[dict[str, str]] = []
    for line in stdout.splitlines():
        if not line.strip():
            continue
        parts = line.split("\t")
        status = parts[0]
        if status.startswith("R") and len(parts) >= 3:
            entries.append({"status": status, "sourcePath": parts[1], "targetPath": parts[2]})
        else:
            path = parts[-1]
            entries.append({"status": status, "sourcePath": path if status != "A" else "", "targetPath": path if status != "D" else ""})
    return entries


def policy_for_path(path: str, policy: dict[str, Any]) -> tuple[str, str, str | None]:
    for rule in policy.get("excluded", []):
        if any(path == item or under(path, item) for item in rule.get("paths", [])) or any(under(path, prefix) for prefix in rule.get("prefixes", [])) or (rule.get("prefix") and under(path, str(rule["prefix"]))):
            return "excluded", str(rule["id"]), str(rule.get("reason", "excluded by branch policy"))
    for rule in policy.get("manualReview", []):
        if under(path, str(rule.get("prefix", ""))):
            return "adapted", str(rule["id"]), str(rule.get("reason", "manual review required"))
    for rule in policy.get("dockerfile", {}).get("allowedFiles", {}):
        if path == rule:
            return "adapted", "dockerfile-railpack", "documented normalized Railpack evidence delta"
    for rule in policy.get("previewOwned", []):
        if any(path == item for item in rule.get("paths", [])) or (rule.get("prefix") and under(path, str(rule["prefix"]))):
            return "adapted", str(rule["id"]), "preview-owned prepare-only surface"
    for rule in policy.get("alignedDirectories", []):
        if under(path, str(rule["path"])):
            return "aligned", str(rule["id"]), "exact parity required"
    return "unclassified", "unclassified", None


def check_aligned_parity(root: Path, policy: dict[str, Any], source: str, target: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for rule in policy.get("alignedDirectories", []):
        prefix = str(rule["path"])
        code, stdout, stderr = git(root, ["diff", "--quiet", source, target, "--", prefix])
        if code not in (0, 1):
            rows.append({"id": rule["id"], "status": "failed", "classification": "aligned", "policyId": rule["id"], "path": prefix, "diagnostic": stderr.strip() or "parity check failed"})
        else:
            rows.append({"id": rule["id"], "status": "passed" if code == 0 else "failed", "classification": "aligned", "policyId": rule["id"], "path": prefix, "diagnostic": "exact source parity" if code == 0 else "aligned directory differs from source"})
    return rows


def check_dockerfile(root: Path, policy: dict[str, Any], source: str, target: str, changed: list[dict[str, str]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    allowed_files = policy.get("dockerfile", {}).get("allowedFiles", {})
    for entry in changed:
        path = entry["targetPath"] or entry["sourcePath"]
        if not under(path, str(policy.get("dockerfile", {}).get("prefix", ""))):
            continue
        markers = list(allowed_files.get(path, []))
        content = read_tree(root, target, path) if entry["targetPath"] else ""
        missing = [marker for marker in markers if marker not in content]
        rows.append({"id": f"dockerfile-{path}", "status": "passed" if markers and not missing else "failed", "classification": "adapted", "policyId": "dockerfile-railpack", "path": path, "diagnostic": "allowed Railpack delta" if not missing else "undocumented Dockerfile delta", "missingMarkers": missing})
    return rows


def classify(root: Path, fixture_path: Path, source_override: str | None = None, target_override: str | None = None, candidate_override: str | None = None) -> dict[str, Any]:
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    source = source_override or str(fixture["source"])
    target = target_override or str(fixture["target"])
    candidate = candidate_override or str(fixture.get("candidate", "HEAD"))
    source_sha = git(root, ["rev-parse", "--verify", source])[1].strip()
    target_sha = git(root, ["rev-parse", "--verify", target])[1].strip()
    entries = diff_paths(root, source, target)
    rows: list[dict[str, Any]] = []
    for entry in entries:
        path = entry["targetPath"] or entry["sourcePath"]
        classification, policy_id, reason = policy_for_path(path, fixture)
        status = "passed" if classification != "unclassified" else "failed"
        rows.append({"status": status, "classification": classification, "policyId": policy_id, "path": path, "changeType": entry["status"], "sourcePath": entry["sourcePath"] or None, "targetPath": entry["targetPath"] or None, "diagnostic": reason or "no branch policy matched"})
    parity = check_aligned_parity(root, fixture, source, target)
    rows.extend(parity)
    rows.extend(check_dockerfile(root, fixture, source, target, entries))
    required_markers: list[dict[str, Any]] = []
    for rule in fixture.get("requiredPreviewMarkers", []):
        try:
            content = read_tree(root, target, str(rule["path"]))
            missing = [marker for marker in rule.get("markers", []) if marker not in content]
            required_markers.append({"id": rule["id"], "status": "passed" if not missing else "failed", "path": rule["path"], "missingMarkers": missing, "diagnostic": "prepare-only marker set present" if not missing else "prepare-only marker missing"})
        except RuntimeError as exc:
            required_markers.append({"id": rule["id"], "status": "failed", "path": rule["path"], "missingMarkers": rule.get("markers", []), "diagnostic": str(exc)})
    forbidden: list[dict[str, Any]] = []
    for path in fixture.get("forbiddenPreviewPaths", []):
        present = exists(root, target, path)
        forbidden.append({"id": f"forbidden-{path}", "status": "failed" if present else "passed", "path": path, "present": present, "diagnostic": "forbidden preview path is absent" if not present else "forbidden preview path is present"})
    preservation_path = fixture_path.parent / "release-preservation-policy.json"
    preservation = load_preservation_module(root).audit(root, preservation_path, candidate)
    failures = [row for row in rows + required_markers + forbidden if row["status"] == "failed"]
    return {"schemaVersion": 1, "ok": not failures, "source": {"ref": source, "sha": source_sha}, "target": {"ref": target, "sha": target_sha}, "candidate": candidate, "preservation": {"ok": preservation["ok"], "summary": preservation["summary"]}, "classifications": rows, "previewMarkers": required_markers, "forbiddenPreview": forbidden, "summary": {"changedPaths": len(entries), "classifiedPaths": sum(row["classification"] != "unclassified" for row in rows if "classification" in row and "path" in row and "changeType" in row), "alignedParity": sum(row["status"] == "passed" for row in parity), "manualReview": sum(row["policyId"] == "manual-deploy" for row in rows), "failed": len(failures), "conditional": sum(row.get("status") == "conditional" for row in rows)}}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--fixture", type=Path, default=Path("tests/fixtures/release-branch-policy.json"))
    parser.add_argument("--source")
    parser.add_argument("--target")
    parser.add_argument("--candidate")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    root = args.root.resolve()
    fixture = args.fixture if args.fixture.is_absolute() else root / args.fixture
    try:
        report = classify(root, fixture, args.source, args.target, args.candidate)
    except (OSError, ValueError, json.JSONDecodeError, RuntimeError) as exc:
        report = {"schemaVersion": 1, "ok": False, "classifications": [], "summary": {"changedPaths": 0, "classifiedPaths": 0, "alignedParity": 0, "manualReview": 0, "failed": 1, "conditional": 0}, "diagnostics": [str(exc)]}
    print(json.dumps(report, indent=2, sort_keys=True))
    return 1 if args.check and not report["ok"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
