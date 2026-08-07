#!/usr/bin/env python3
"""Check public inventory, host semantics, manifests, versions, and tag evidence."""

from __future__ import annotations

import argparse
import json
import subprocess
from glob import glob
from pathlib import Path
from typing import Any


def read_json(root: Path, relative: str) -> tuple[Any | None, str | None]:
    path = root / relative
    try:
        return json.loads(path.read_text(encoding="utf-8")), None
    except FileNotFoundError:
        return None, f"missing file {relative}"
    except json.JSONDecodeError as exc:
        return None, f"invalid JSON in {relative}: {exc.msg}"


def get_field(payload: Any, field: list[Any]) -> Any:
    current = payload
    for key in field:
        current = current[key]
    return current


def check_result(check_id: str, status: str, category: str, path: str, diagnostic: str, **extra: Any) -> dict[str, Any]:
    result: dict[str, Any] = {"id": check_id, "status": status, "category": category, "path": path, "diagnostic": diagnostic}
    result.update({key: value for key, value in extra.items() if value is not None})
    return result


def inventory(root: Path) -> list[str]:
    return sorted(path.parent.name for path in (root / "skills").glob("*/SKILL.md"))


def readme_checks(root: Path, policy: dict[str, Any], expected: list[str]) -> list[dict[str, Any]]:
    readme_policy = policy["readmes"]
    paths = [readme_policy["root"]] + sorted(Path(path).as_posix() for path in glob(str(root / readme_policy["localizedGlob"])))
    rows: list[dict[str, Any]] = []
    for path in paths:
        relative = Path(path).relative_to(root).as_posix() if Path(path).is_absolute() else path
        try:
            content = (root / relative).read_text(encoding="utf-8")
        except OSError as exc:
            rows.append(check_result(f"readme-{relative}", "failed", "readme", relative, str(exc)))
            continue
        missing_skills = [name for name in expected if name not in content]
        missing_tokens = [token for token in readme_policy["requiredTokens"] + policy["directSkillsShEntries"] if token not in content]
        status = "passed" if not missing_skills and not missing_tokens else "failed"
        rows.append(check_result(f"readme-{relative}", status, "readme", relative, "inventory and host tokens match policy" if status == "passed" else "README claims are incomplete", missingSkills=missing_skills, missingTokens=missing_tokens, required=True))
    return rows


def manifest_checks(root: Path, policy: dict[str, Any], expected: list[str]) -> tuple[list[dict[str, Any]], str | None]:
    rows: list[dict[str, Any]] = []
    canonical_version: str | None = None
    version_policy = policy["version"]
    source_payload, source_error = read_json(root, version_policy["source"])
    if source_error:
        rows.append(check_result("version-source", "failed", "version", version_policy["source"], source_error, required=True))
    else:
        try:
            canonical_version = str(get_field(source_payload, version_policy["field"]))
        except (KeyError, IndexError, TypeError):
            rows.append(check_result("version-source", "failed", "version", version_policy["source"], "canonical version field is missing", required=True))
        else:
            expected_version = version_policy.get("expected")
            rows.append(check_result("version-source", "passed" if expected_version in (None, canonical_version) else "failed", "version", version_policy["source"], "canonical version is readable" if expected_version in (None, canonical_version) else "canonical version differs from policy", observed=canonical_version, expected=expected_version, required=True))
    for version_item in policy["manifestVersionPaths"]:
        relative = str(version_item["path"])
        field = list(version_item["field"])
        payload, error = read_json(root, relative)
        if error:
            rows.append(check_result(f"version-{relative}", "failed", "version", relative, error, required=True))
            continue
        try:
            observed = str(get_field(payload, field))
        except (KeyError, IndexError, TypeError):
            rows.append(check_result(f"version-{relative}", "failed", "version", relative, "version field is missing", required=True))
            continue
        status = "passed" if observed == canonical_version else "failed"
        rows.append(check_result(f"version-{relative}", status, "version", relative, "version agrees with canonical source" if status == "passed" else "version drift detected", observed=observed, expected=canonical_version, required=True))
    expected_paths = {f"./skills/{name}" for name in expected}
    for item in policy["inventoryManifests"]:
        relative = item["path"]
        payload, error = read_json(root, relative)
        if error:
            rows.append(check_result(f"inventory-{relative}", "failed", "manifest-inventory", relative, error, required=True))
            continue
        try:
            observed = get_field(payload, item["field"])
        except (KeyError, IndexError, TypeError):
            rows.append(check_result(f"inventory-{relative}", "failed", "manifest-inventory", relative, "skill inventory field is missing", required=True))
            continue
        actual = set(observed) if isinstance(observed, list) else set()
        status = "passed" if isinstance(observed, list) and len(observed) == len(expected_paths) and actual == expected_paths else "failed"
        rows.append(check_result(f"inventory-{relative}", status, "manifest-inventory", relative, "manifest exposes the canonical eight-skill inventory" if status == "passed" else "manifest inventory drift detected", missing=sorted(expected_paths - actual), unexpected=sorted(actual - expected_paths), required=True))
    for item in policy["rootSkillPointers"]:
        relative = item["path"]
        payload, error = read_json(root, relative)
        if error:
            rows.append(check_result(f"pointer-{relative}", "failed", "source-pointer", relative, error, required=True))
            continue
        try:
            observed = get_field(payload, item["field"])
        except (KeyError, IndexError, TypeError):
            rows.append(check_result(f"pointer-{relative}", "failed", "source-pointer", relative, "canonical skills pointer is missing", required=True))
            continue
        status = "passed" if observed == item["value"] else "failed"
        rows.append(check_result(f"pointer-{relative}", status, "source-pointer", relative, "points to root skills source" if status == "passed" else "copied or alternate skill source detected", observed=observed, expected=item["value"], required=True))
    return rows, canonical_version


def host_checks(root: Path, policy: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for relative in policy["hostSemanticFiles"]:
        path = root / relative
        try:
            content = path.read_text(encoding="utf-8")
        except OSError as exc:
            rows.append(check_result(f"host-{relative}", "failed", "host-semantics", relative, str(exc), required=True))
            continue
        required = ["$sealos", "/sealos", "skills.sh"]
        missing = [token for token in required if token not in content]
        rows.append(check_result(f"host-{relative}", "passed" if not missing else "failed", "host-semantics", relative, "host invocation semantics are present" if not missing else "host invocation semantics are incomplete", missing=missing, required=True))
    return rows


def tag_check(root: Path, policy: dict[str, Any], candidate: str) -> dict[str, Any]:
    tag_policy = policy["tag"]
    candidate_ref = str(tag_policy.get("candidate") or candidate)
    completed = subprocess.run(["git", "tag", "--points-at", candidate_ref], cwd=root, capture_output=True, text=True, check=False)
    if completed.returncode:
        return check_result("release-tag", "conditional" if not tag_policy.get("required") else "failed", "tag", candidate_ref, "tag evidence could not be read", required=bool(tag_policy.get("required")))
    tags = sorted(tag for tag in completed.stdout.splitlines() if tag.strip())
    if tags:
        return check_result("release-tag", "passed", "tag", candidate_ref, "observed candidate tag(s)", tags=tags, required=bool(tag_policy.get("required")))
    return check_result("release-tag", "conditional" if not tag_policy.get("required") else "failed", "tag", candidate_ref, "no tag points at candidate; tag creation remains outside this audit", tags=[], required=bool(tag_policy.get("required")))


def audit(root: Path, fixture_path: Path, candidate: str | None = None, git_root: Path | None = None) -> dict[str, Any]:
    try:
        policy = json.loads(fixture_path.read_text(encoding="utf-8"))
        expected = sorted(str(name) for name in policy["canonicalSkills"])
    except (OSError, json.JSONDecodeError, KeyError, TypeError) as exc:
        return {"schemaVersion": 1, "ok": False, "checks": [], "summary": {"total": 0, "passed": 0, "failed": 1, "conditional": 0, "requiredFailures": ["fixture"]}, "diagnostics": [str(exc)]}
    rows: list[dict[str, Any]] = []
    observed = inventory(root)
    rows.append(check_result("physical-inventory", "passed" if observed == expected else "failed", "inventory", "skills/", "physical inventory matches eight-skill policy" if observed == expected else "physical inventory drift detected", observed=observed, expected=expected, required=True))
    rows.extend(readme_checks(root, policy, expected))
    manifest_rows, canonical_version = manifest_checks(root, policy, expected)
    rows.extend(manifest_rows)
    rows.extend(host_checks(root, policy))
    candidate_ref = candidate or str(policy.get("tag", {}).get("candidate", "HEAD"))
    rows.append(tag_check(git_root or root, policy, candidate_ref))
    failures = [row for row in rows if row["status"] == "failed" and row.get("required", True)]
    return {"schemaVersion": 1, "ok": not failures, "candidate": candidate_ref, "canonicalVersion": canonical_version, "inventory": observed, "checks": rows, "summary": {"total": len(rows), "passed": sum(row["status"] == "passed" for row in rows), "failed": sum(row["status"] == "failed" for row in rows), "conditional": sum(row["status"] == "conditional" for row in rows), "requiredFailures": [row["id"] for row in failures]}}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--fixture", type=Path, default=Path("tests/fixtures/public-surface-policy.json"))
    parser.add_argument("--candidate")
    parser.add_argument("--git-root", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    root = args.root.resolve()
    fixture = args.fixture if args.fixture.is_absolute() else root / args.fixture
    report = audit(root, fixture, args.candidate, args.git_root.resolve() if args.git_root else None)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 1 if args.check and not report["ok"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
