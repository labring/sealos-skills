#!/usr/bin/env python3
"""Collect read-only, secret-redacting evidence for the Phase 12 release boundary.

The audit resolves the recorded commit anchors first, then reads immutable Git
trees with ``git show`` and ``git ls-tree``. It never checks out, merges, writes,
or updates a ref. The policy fixture is repository-relative and secret-free.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path
from typing import Any, Iterable


SCHEMA_VERSION = 1
SHA_RE = re.compile(r"^[0-9a-f]{40}$", re.IGNORECASE)
SECRET_PATTERNS = (
    (
        re.compile(
            r"-----BEGIN [^-]+ PRIVATE KEY-----.*?-----END [^-]+ PRIVATE KEY-----",
            re.IGNORECASE | re.DOTALL,
        ),
        "<redacted-private-key>",
    ),
    (re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{12,}\b"), "<redacted-access-key>"),
    (
        re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr|github_pat|xox[baprs])-[A-Za-z0-9_-]{8,}\b", re.IGNORECASE),
        "<redacted-token>",
    ),
    (re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]{8,}", re.IGNORECASE), "Bearer <redacted-token>"),
    (
        re.compile(r"\b(?:postgres(?:ql)?|mysql|redis|mongodb(?:\+srv)?):\/\/[^\s<>]+", re.IGNORECASE),
        "<redacted-connection-string>",
    ),
    (
        re.compile(
            r"\b(password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)\s*([:=])\s*[^\s,;]+",
            re.IGNORECASE,
        ),
        None,
    ),
    (re.compile(r"\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9._-]{8,}\.[A-Za-z0-9._-]{8,}\b"), "<redacted-jwt>"),
)


def redact(value: Any, limit: int = 320) -> str:
    """Bound diagnostics and remove common credential-shaped values."""

    safe = str(value)
    for pattern, replacement in SECRET_PATTERNS:
        if replacement is None:
            safe = pattern.sub(lambda match: f"{match.group(1)}{match.group(2)}<redacted>", safe)
        else:
            safe = pattern.sub(replacement, safe)
    return safe.strip()[-limit:]


def _safe(value: Any) -> str:
    return redact(value, 240)


def run_git(root: Path, arguments: Iterable[str], *, check: bool = False) -> tuple[int, str, str]:
    """Run a read-only Git query and capture all output for redaction."""

    command = ["git", *arguments]
    completed = subprocess.run(command, cwd=root, capture_output=True, text=True, check=False)
    stdout = completed.stdout or ""
    stderr = completed.stderr or ""
    if check and completed.returncode != 0:
        detail = stderr or stdout or f"exit code {completed.returncode}"
        raise RuntimeError(redact(f"git {' '.join(arguments[:2])}: {detail}"))
    return completed.returncode, stdout, stderr


def resolve_ref(root: Path, ref: str) -> tuple[str | None, str | None]:
    """Resolve a ref to a commit without trusting a moving ref for tree reads."""

    code, stdout, stderr = run_git(root, ["rev-parse", "--verify", f"{ref}^{{commit}}"])
    if code:
        return None, redact(stderr or stdout or f"unable to resolve {ref}")
    resolved = stdout.strip().lower()
    return resolved, None


def read_tree(root: Path, sha: str, relative: str) -> tuple[str | None, str | None]:
    code, stdout, stderr = run_git(root, ["show", f"{sha}:{relative}"])
    if code:
        return None, redact(stderr or stdout or f"missing {relative}")
    return stdout, None


def tree_entries(root: Path, sha: str, relative: str) -> list[str]:
    code, stdout, _ = run_git(root, ["ls-tree", "-r", "--name-only", sha, "--", relative])
    if code:
        return []
    return [line.strip() for line in stdout.splitlines() if line.strip()]


def tree_path_exists(root: Path, sha: str, relative: str) -> bool:
    if tree_entries(root, sha, relative):
        return True
    code, _, _ = run_git(root, ["cat-file", "-e", f"{sha}:{relative}"])
    return code == 0


def _result(
    spec: dict[str, Any],
    status: str,
    sha: str | None,
    message: str,
    *,
    ref: str | None = None,
    **extra: Any,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": _safe(spec.get("id", "unknown")),
        "owner": _safe(spec.get("owner", "")),
        "status": status,
        "category": _safe(spec.get("category", "preservation")),
        "branch": _safe(spec.get("branch", "")),
        "ref": _safe(ref) if ref else None,
        "refSha": _safe(sha) if sha else None,
        "path": _safe(spec.get("path", "")),
        "message": redact(message),
        "required": bool(spec.get("required", True)),
    }
    payload.update({key: value for key, value in extra.items() if value is not None})
    return payload


def anchor_checks(root: Path, fixture: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, str]]:
    checks: list[dict[str, Any]] = []
    resolved: dict[str, str] = {}
    anchors = fixture.get("anchors", {})
    for name in ("source", "target", "candidate"):
        anchor = anchors.get(name, {})
        ref = str(anchor.get("ref", ""))
        expected = str(anchor.get("sha", "")).lower()
        actual, error = resolve_ref(root, ref)
        if error:
            checks.append(
                _result(
                    {"id": f"anchor-{name}", "owner": "policy fixture", "branch": name, "path": ""},
                    "failed",
                    None,
                    error,
                    ref=ref,
                    category="immutable-anchor",
                    expectedSha=_safe(expected),
                )
            )
            continue
        status = "passed" if SHA_RE.fullmatch(expected) and actual == expected else "failed"
        if status == "passed" and actual:
            resolved[name] = actual
        checks.append(
            _result(
                {"id": f"anchor-{name}", "owner": "policy fixture", "branch": name, "path": ""},
                status,
                actual,
                "ref resolves to the recorded immutable SHA" if status == "passed" else "ref resolves to a different SHA",
                ref=ref,
                category="immutable-anchor",
                expectedSha=_safe(expected),
                actualSha=_safe(actual),
            )
        )
    return checks, resolved


def marker_checks(root: Path, fixture: dict[str, Any], resolved: dict[str, str]) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    anchors = fixture.get("anchors", {})
    for item in fixture.get("checks", []):
        branch = str(item.get("branch", ""))
        sha = resolved.get(branch)
        ref = str(anchors.get(branch, {}).get("ref", ""))
        base = _result(item, "conditional", sha, "", ref=ref)
        if sha is None:
            base["message"] = "skipped because its immutable branch anchor did not resolve"
            checks.append(base)
            continue
        content, error = read_tree(root, sha, str(item["path"]))
        if error or content is None:
            base["status"] = "failed"
            base["message"] = f"required evidence path is missing: {error or item['path']}"
            checks.append(base)
            continue
        marker_results: list[dict[str, Any]] = []
        missing: list[str] = []
        haystack = content.casefold()
        for marker in item.get("markers", []):
            marker_text = str(marker)
            found = marker_text.casefold() in haystack
            marker_results.append({"marker": _safe(marker_text), "found": found})
            if not found:
                missing.append(_safe(marker_text))
        base["markerResults"] = marker_results
        if missing:
            base["status"] = "failed"
            base["message"] = "required markers are missing"
            base["missingMarkers"] = missing
        else:
            base["status"] = "passed"
            base["message"] = "required markers are present"
        checks.append(base)
    return checks


def evidence_checks(root: Path, fixture: dict[str, Any], resolved: dict[str, str]) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    specs = fixture.get("evidenceSources", fixture.get("evidence", []))
    anchors = fixture.get("anchors", {})
    for item in specs:
        branch = str(item.get("branch", "candidate"))
        sha = resolved.get(branch)
        ref = str(anchors.get(branch, {}).get("ref", ""))
        checks.extend(marker_checks(root, {"checks": [item]}, resolved))
        if checks:
            checks[-1]["category"] = _safe(item.get("category", "runtime-evidence"))
            checks[-1]["ref"] = _safe(ref)
            checks[-1]["branch"] = _safe(branch)
            checks[-1]["owner"] = _safe(item.get("owner", ""))
            checks[-1]["id"] = _safe(item.get("id", "unknown"))
            checks[-1]["refSha"] = _safe(sha) if sha else None
    return checks


def forbidden_checks(root: Path, fixture: dict[str, Any], resolved: dict[str, str]) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    specs = fixture.get("forbiddenPreview", fixture.get("forbidden", []))
    anchors = fixture.get("anchors", {})
    for item in specs:
        branch = str(item.get("branch", "target"))
        sha = resolved.get(branch)
        ref = str(anchors.get(branch, {}).get("ref", ""))
        base = _result(item, "conditional", sha, "", ref=ref)
        if sha is None:
            base["message"] = "skipped because its immutable branch anchor did not resolve"
            checks.append(base)
            continue
        path = str(item["path"])
        markers = item.get("markers", [])
        present = False
        entries: list[str] = []
        if not item.get("contentOnly", False):
            entries = tree_entries(root, sha, path)
            present = bool(entries) or tree_path_exists(root, sha, path)
        marker_results: list[dict[str, Any]] = []
        if markers:
            content, error = read_tree(root, sha, path)
            if content is not None and error is None:
                haystack = content.casefold()
                for marker in markers:
                    found = str(marker).casefold() in haystack
                    marker_results.append({"marker": _safe(marker), "found": found})
                    present = present or found
        base["markerResults"] = marker_results
        base["present"] = present
        base["entries"] = [_safe(entry) for entry in entries[:20]] if entries else None
        base["status"] = "failed" if present else "passed"
        base["message"] = "forbidden preview surface is present" if present else "forbidden preview surface is absent"
        checks.append(base)
    return checks


def _validate_fixture(fixture: dict[str, Any]) -> None:
    if not isinstance(fixture, dict) or fixture.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError("release preservation fixture requires schemaVersion 1")
    anchors = fixture.get("anchors")
    if not isinstance(anchors, dict) or not {"source", "target", "candidate"}.issubset(anchors):
        raise ValueError("release preservation fixture requires source, target, and candidate anchors")
    for name, anchor in anchors.items():
        if not isinstance(anchor, dict) or not isinstance(anchor.get("ref"), str) or not isinstance(anchor.get("sha"), str):
            raise ValueError(f"anchor {name} requires ref and sha")
        if not SHA_RE.fullmatch(anchor["sha"]):
            raise ValueError(f"anchor {name} has an invalid SHA")
    for key in ("checks", "evidenceSources", "forbiddenPreview"):
        if not isinstance(fixture.get(key), list):
            raise ValueError(f"release preservation fixture requires {key}[]")
        for index, item in enumerate(fixture[key]):
            if not isinstance(item, dict):
                raise ValueError(f"{key}[{index}] must be an object")
            for field in ("id", "owner", "branch", "path", "category"):
                if not isinstance(item.get(field), str) or not item[field]:
                    raise ValueError(f"{key}[{index}] requires {field}")
            if item["branch"] not in anchors:
                raise ValueError(f"{key}[{index}] refers to unknown branch {item['branch']!r}")
            relative = Path(item["path"])
            if relative.is_absolute() or ".." in relative.parts:
                raise ValueError(f"{key}[{index}] path must stay repository-relative")
            if key != "forbiddenPreview" and not isinstance(item.get("markers"), list):
                raise ValueError(f"{key}[{index}] requires markers[]")


def audit(root: Path, fixture_path: Path | dict[str, Any], candidate_ref: str | None = None) -> dict[str, Any]:
    try:
        fixture = json.loads(fixture_path.read_text(encoding="utf-8")) if isinstance(fixture_path, Path) else fixture_path
        _validate_fixture(fixture)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        return {
            "schemaVersion": SCHEMA_VERSION,
            "ok": False,
            "readOnly": True,
            "checks": [],
            "summary": {"total": 0, "passed": 0, "failed": 1, "conditional": 0, "requiredFailures": ["fixture"]},
            "diagnostics": [redact(str(exc))],
        }
    if candidate_ref:
        fixture = json.loads(json.dumps(fixture))
        fixture["anchors"]["candidate"]["ref"] = candidate_ref
    anchor_results, resolved = anchor_checks(root, fixture)
    anchors_ok = all(item["status"] == "passed" for item in anchor_results)
    checks = list(anchor_results)
    if anchors_ok:
        checks.extend(marker_checks(root, fixture, resolved))
        checks.extend(forbidden_checks(root, fixture, resolved))
        checks.extend(evidence_checks(root, fixture, resolved))
    else:
        checks.append(
            {
                "id": "anchor-gate",
                "owner": _safe(fixture.get("policyAuthority", "policy fixture")),
                "status": "failed",
                "category": "immutable-anchor",
                "branch": "all",
                "ref": None,
                "refSha": None,
                "path": _safe(fixture.get("policyAuthority", "")),
                "message": "branch checks were withheld until every recorded anchor matched",
                "required": True,
            }
        )
    required_failures = [item["id"] for item in checks if item.get("required", True) and item["status"] == "failed"]
    return {
        "schemaVersion": SCHEMA_VERSION,
        "auditId": _safe(fixture.get("auditId", "phase-12-01-release-preservation")),
        "readOnly": True,
        "policyAuthority": _safe(fixture.get("policyAuthority", "")),
        "anchors": {item["branch"]: item for item in anchor_results},
        "checks": checks,
        "ok": anchors_ok and not required_failures,
        "summary": {
            "total": len(checks),
            "passed": sum(item["status"] == "passed" for item in checks),
            "failed": sum(item["status"] == "failed" for item in checks),
            "conditional": sum(item["status"] == "conditional" for item in checks),
            "requiredFailures": required_failures,
        },
    }


run_audit = audit


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--fixture", type=Path, default=Path("tests/fixtures/release-preservation-policy.json"))
    parser.add_argument("--candidate", help="Override the candidate ref used for evidence checks")
    parser.add_argument("--check", action="store_true", help="return nonzero when required evidence fails")
    args = parser.parse_args(argv)
    root = args.root.resolve()
    fixture = args.fixture if args.fixture.is_absolute() else root / args.fixture
    report = audit(root, fixture, args.candidate)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 1 if args.check and not report["ok"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
