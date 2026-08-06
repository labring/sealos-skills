#!/usr/bin/env python3
"""Run the complete offline Sealos Skills design-system quality gate."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


SECRET_PATTERNS = (
    re.compile(r"-----BEGIN [^-]+ PRIVATE KEY-----.*?-----END [^-]+ PRIVATE KEY-----", re.IGNORECASE | re.DOTALL),
    re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{12,}\b"),
    re.compile(r"\b(?:ghp|gho|github_pat|xox[baprs])-[A-Za-z0-9_-]{10,}\b", re.IGNORECASE),
    re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]{12,}", re.IGNORECASE),
    re.compile(r"\b(?:postgres(?:ql)?|mysql|redis|mongodb(?:\+srv)?):\/\/[^\s<>]+", re.IGNORECASE),
    re.compile(r"\b(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)\s*[:=]\s*[^\s,;]+", re.IGNORECASE),
)


def redact(text: str, limit: int = 2400) -> str:
    """Keep diagnostics useful while removing credential-shaped values."""

    safe = text
    for pattern in SECRET_PATTERNS:
        safe = pattern.sub(lambda match: f"{match.group(0).split('=')[0].split(':')[0]}=<redacted>", safe)
    safe = safe.strip()
    return safe[-limit:]


def python_with_yaml() -> str | None:
    candidates = [
        os.environ.get("DOCKER_TO_SEALOS_PYTHON", ""),
        sys.executable,
        shutil.which("python3") or "",
        "/opt/homebrew/Caskroom/miniforge/base/bin/python3",
    ]
    seen: set[str] = set()
    for candidate in candidates:
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        check = subprocess.run([candidate, "-c", "import yaml"], capture_output=True, text=True)
        if check.returncode == 0:
            return candidate
    return None


def command_for(component: dict[str, Any]) -> list[str]:
    runner = component.get("runner", "shell")
    args = [str(value) for value in component.get("args", [])]
    if runner == "python":
        return [sys.executable, *args]
    if runner == "yaml-python":
        interpreter = python_with_yaml()
        if interpreter is None:
            raise RuntimeError("PyYAML interpreter unavailable")
        return [interpreter, *args]
    if runner == "node":
        return [shutil.which("node") or "node", *args]
    if runner == "shell":
        return args
    raise ValueError(f"unsupported runner: {runner}")


def run_component(component: dict[str, Any], root: Path) -> dict[str, Any]:
    component_id = str(component.get("id", "unknown"))
    required = bool(component.get("required", True))
    command_text = redact(" ".join(str(item) for item in component.get("args", [])))
    started = time.monotonic()
    try:
        command = command_for(component)
    except RuntimeError as exc:
        elapsed_ms = round((time.monotonic() - started) * 1000)
        return {
            "id": component_id,
            "status": "conditional" if not required else "failed",
            "required": required,
            "command": command_text,
            "exitCode": None,
            "elapsedMs": elapsed_ms,
            "diagnostics": [redact(str(exc))],
        }

    cwd = (root / str(component.get("cwd", "."))).resolve()
    try:
        completed = subprocess.run(command, cwd=cwd, capture_output=True, text=True, check=False)
        status = "passed" if completed.returncode == 0 else "failed"
        diagnostics = [] if status == "passed" else [redact(completed.stderr or completed.stdout or f"exit code {completed.returncode}")]
        result = {
            "id": component_id,
            "status": status,
            "required": required,
            "command": command_text,
            "exitCode": completed.returncode,
            "elapsedMs": round((time.monotonic() - started) * 1000),
            "diagnostics": diagnostics,
        }
        if status == "failed" and not required:
            result["status"] = "conditional"
            result["diagnostics"] = [redact(component.get("conditionalWhenMissing") or diagnostics[0])]
        return result
    except FileNotFoundError as exc:
        status = "conditional" if not required else "failed"
        reason = component.get("conditionalWhenMissing") if status == "conditional" else str(exc)
        return {
            "id": component_id,
            "status": status,
            "required": required,
            "command": command_text,
            "exitCode": None,
            "elapsedMs": round((time.monotonic() - started) * 1000),
            "diagnostics": [redact(str(reason))],
        }


def run_gate(root: Path, fixture_path: Path) -> dict[str, Any]:
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    if fixture.get("schemaVersion") != 1 or not isinstance(fixture.get("components"), list):
        raise ValueError("maintainer gate fixture requires schemaVersion 1 and components[]")
    checks = [run_component(component, root) for component in fixture["components"]]
    required_failures = [check for check in checks if check["required"] and check["status"] != "passed"]
    return {
        "schemaVersion": 1,
        "ok": not required_failures,
        "checks": checks,
        "summary": {
            "total": len(checks),
            "passed": sum(check["status"] == "passed" for check in checks),
            "failed": sum(check["status"] == "failed" for check in checks),
            "conditional": sum(check["status"] == "conditional" for check in checks),
            "requiredFailures": [check["id"] for check in required_failures],
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--fixture", type=Path, default=Path("tests/fixtures/maintainer-quality-gate.json"))
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    root = args.root.resolve()
    fixture = args.fixture if args.fixture.is_absolute() else root / args.fixture
    try:
        report = run_gate(root, fixture)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        report = {"schemaVersion": 1, "ok": False, "checks": [], "summary": {"total": 0, "passed": 0, "failed": 1, "conditional": 0, "requiredFailures": ["fixture"]}, "diagnostics": [redact(str(exc))]}
    print(json.dumps(report, indent=2, sort_keys=True))
    return 1 if args.check and not report["ok"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
