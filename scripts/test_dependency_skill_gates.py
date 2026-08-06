#!/usr/bin/env python3
"""Run the Phase 8 dependency gates sequentially with actionable prerequisites."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def python_with_yaml() -> str:
    candidates = []
    env_python = os.environ.get("DOCKER_TO_SEALOS_PYTHON")
    if env_python:
        candidates.append(env_python)
    candidates.extend([sys.executable, shutil.which("python3") or "", shutil.which("python") or ""])
    candidates.append("/opt/homebrew/Caskroom/miniforge/base/bin/python3")
    seen: set[str] = set()
    for candidate in candidates:
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        check = subprocess.run([candidate, "-c", "import yaml"], cwd=ROOT, capture_output=True, text=True)
        if check.returncode == 0:
            return candidate
    raise RuntimeError("PyYAML is required for Docker-to-Sealos gates; set DOCKER_TO_SEALOS_PYTHON to a Python with yaml installed")


def run(label: str, command: list[str], cwd: Path = ROOT, env: dict[str, str] | None = None) -> None:
    print(f"[RUN] {label}")
    completed = subprocess.run(command, cwd=cwd, env=env, text=True)
    if completed.returncode:
        raise SystemExit(f"[FAIL] {label} exited with {completed.returncode}")


def main() -> int:
    yaml_python = python_with_yaml()
    run("dependency contract tests", [sys.executable, "scripts/test_dependency_skill_contract.py"])
    run("skill inventory tests", [sys.executable, "scripts/test_skill_design_inventory.py"])
    run("skill router tests", [sys.executable, "scripts/test_skill_design_router.py"])
    run("safety canary tests", [sys.executable, "scripts/test_skill_design_safety.py"])
    run("aggregate design validator tests", [sys.executable, "scripts/test_validate_skill_design.py"])
    run("Dockerfile helper syntax", ["node", "--check", "skills/dockerfile-skill/scripts/validate-dockerfile.mjs"])
    run("baseline checker", ["node", "scripts/skill-design-baseline.mjs", "--fixture", "tests/fixtures/skill-design-baseline.json", "--check"])
    run("baseline Node suite", ["node", "scripts/test-skill-design-baseline.mjs"])
    docker_dir = ROOT / "skills" / "docker-to-sealos"
    run("MUST coverage", [yaml_python, "scripts/check_must_coverage.py", "--skill", "SKILL.md", "--mapping", "references/must-rules-map.yaml", "--rules-file", "references/rules-registry.yaml"], docker_dir)
    run("consistency validator", [yaml_python, "scripts/check_consistency.py", "--skill", "SKILL.md", "--references", "references", "--rules-file", "references/rules-registry.yaml"], docker_dir)
    run("consistency tests", [yaml_python, "scripts/test_check_consistency.py"], docker_dir)
    run("Compose converter tests", [yaml_python, "scripts/test_compose_to_template.py"], docker_dir)
    run("MUST coverage tests", [yaml_python, "scripts/test_check_must_coverage.py"], docker_dir)
    run("quality gate tests", [yaml_python, "scripts/test_quality_gate.py"], docker_dir)
    gate_env = os.environ.copy()
    gate_env["DOCKER_TO_SEALOS_ALLOW_EMPTY_ARTIFACTS"] = "1"
    run("quality gate without artifacts", [yaml_python, "scripts/quality_gate.py"], docker_dir, gate_env)
    print("[PASS] Phase 8 dependency gates complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
