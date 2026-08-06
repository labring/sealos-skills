#!/usr/bin/env python3
"""Aggregate the Phase 6 skill-design inventory and safety diagnostics."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.skill_design_inventory import Diagnostic, InventoryError, discover_inventory, parse_router, validate_inventory_and_router, validate_repo_path
from scripts.skill_design_safety import SafetyDiagnostic, check_safety


@dataclass(frozen=True)
class DesignDiagnostic:
    code: str
    path: str
    message: str
    field: str | None = None
    target: str | None = None
    skill: str | None = None

    def to_dict(self) -> dict[str, str]:
        return {key: value for key, value in asdict(self).items() if value is not None}


def _convert_diagnostic(item: Diagnostic | SafetyDiagnostic) -> DesignDiagnostic:
    return DesignDiagnostic(
        code=item.code,
        path=item.path,
        message=item.message,
        field=getattr(item, "field", None),
        target=getattr(item, "target", None),
        skill=getattr(item, "skill", None),
    )


def _relative(root: Path, path: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return path.as_posix()


def _diag(code: str, root: Path, path: Path, message: str, **kwargs: str | None) -> DesignDiagnostic:
    return DesignDiagnostic(code, _relative(root, path), message, **kwargs)


def _load_json(root: Path, relative: str) -> tuple[Any | None, list[DesignDiagnostic]]:
    path = root / relative
    try:
        return json.loads(path.read_text(encoding="utf-8")), []
    except FileNotFoundError:
        return None, [_diag("path.missing", root, path, "JSON source is missing", target=relative)]
    except json.JSONDecodeError as exc:
        return None, [_diag("metadata.malformed", root, path, f"invalid JSON: {exc}")]


def _canonical_paths(names: Iterable[str]) -> set[str]:
    return {f"./skills/{name}" for name in names}


def _projection_checks(root: Path, names: set[str]) -> list[DesignDiagnostic]:
    projections: list[tuple[str, tuple[str, ...]]] = [
        (".claude-plugin/plugin.json", ("skills",)),
        ("marketplace.json", ("plugins", "0", "skills")),
        (".claude-plugin/marketplace.json", ("plugins", "0", "skills")),
        (".codebuddy-plugin/marketplace.json", ("plugins", "0", "skills")),
        (".qoder-plugin/plugin.json", ("skills",)),
    ]
    expected = _canonical_paths(names)
    diagnostics: list[DesignDiagnostic] = []
    for relative, field_path in projections:
        payload, errors = _load_json(root, relative)
        diagnostics.extend(errors)
        if payload is None:
            continue
        current: Any = payload
        try:
            for key in field_path:
                current = current[int(key)] if isinstance(current, list) else current[key]
        except (KeyError, IndexError, TypeError, ValueError):
            diagnostics.append(_diag("inventory.malformed_projection", root, root / relative, f"projection field {'.'.join(field_path)} is missing", field=".".join(field_path)))
            continue
        if not isinstance(current, list) or not all(isinstance(item, str) for item in current):
            diagnostics.append(_diag("inventory.malformed_projection", root, root / relative, "projection skills must be an array of strings", field=".".join(field_path)))
            continue
        duplicates = sorted({item for item in current if current.count(item) > 1})
        for item in duplicates:
            diagnostics.append(_diag("inventory.duplicate_projection", root, root / relative, f"projection repeats {item!r}", field=".".join(field_path), target=item))
        actual = set(current)
        for item in sorted(expected - actual):
            diagnostics.append(_diag("inventory.missing_projection", root, root / relative, f"projection is missing {item}", field=".".join(field_path), target=item))
        for item in sorted(actual - expected):
            diagnostics.append(_diag("inventory.unexpected_projection", root, root / relative, f"projection contains unexpected {item}", field=".".join(field_path), target=item))
    return diagnostics


def _version_checks(root: Path) -> list[DesignDiagnostic]:
    canonical_payload, errors = _load_json(root, ".codex-plugin/plugin.json")
    diagnostics = list(errors)
    if not isinstance(canonical_payload, dict) or not isinstance(canonical_payload.get("version"), str) or not canonical_payload.get("version"):
        diagnostics.append(_diag("version.malformed", root, root / ".codex-plugin/plugin.json", "canonical plugin version is missing", field="version"))
        return diagnostics
    canonical = canonical_payload["version"]
    fields: tuple[tuple[str, tuple[str, ...]], ...] = (
        ("plugin.json", ("version",)),
        (".codex-plugin/plugin.json", ("version",)),
        (".claude-plugin/plugin.json", ("version",)),
        (".qoder-plugin/plugin.json", ("version",)),
        ("marketplace.json", ("metadata", "version")),
        ("marketplace.json", ("plugins", "0", "version")),
        (".claude-plugin/marketplace.json", ("metadata", "version")),
        (".claude-plugin/marketplace.json", ("plugins", "0", "version")),
        (".codebuddy-plugin/marketplace.json", ("version",)),
        (".codebuddy-plugin/marketplace.json", ("plugins", "0", "version")),
        ("gemini-extension.json", ("version",)),
        ("qwen-extension.json", ("version",)),
        ("openclaw.plugin.json", ("version",)),
        ("distribution/platforms.json", ("version",)),
    )
    for relative, field_path in fields:
        payload, load_errors = _load_json(root, relative)
        diagnostics.extend(load_errors)
        if payload is None:
            continue
        current: Any = payload
        try:
            for key in field_path:
                current = current[int(key)] if isinstance(current, list) else current[key]
        except (KeyError, IndexError, TypeError, ValueError):
            diagnostics.append(_diag("version.missing", root, root / relative, f"version field {'.'.join(field_path)} is missing", field=".".join(field_path)))
            continue
        if current != canonical:
            diagnostics.append(_diag("version.mismatch", root, root / relative, f"expected canonical version {canonical!r}, found {current!r}", field=".".join(field_path), target=str(current)))
    ref_name = os.environ.get("GITHUB_REF_NAME")
    if ref_name and ref_name.lstrip("v") != canonical:
        diagnostics.append(_diag("version.mismatch", root, root / ".git", f"GITHUB_REF_NAME {ref_name!r} does not match canonical version {canonical!r}", target=ref_name))
    return diagnostics


def _link_checks(root: Path, entries: list[Any]) -> list[DesignDiagnostic]:
    diagnostics: list[DesignDiagnostic] = []
    link_pattern = re.compile(r"\]\(([^)#]+)(?:#[^)]*)?\)")
    placeholder_pattern = re.compile(r"<[^>]+>")
    for entry in entries:
        path = root / entry.path
        text = path.read_text(encoding="utf-8")
        for raw_target in link_pattern.findall(text):
            target = raw_target.strip()
            if not target or target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            if target.startswith("/"):
                diagnostics.append(_diag("path.outside_root", root, path, "absolute Markdown link is not repository-scoped", target=target, skill=entry.name))
                continue
            relative = (Path(entry.path).parent / target).as_posix()
            try:
                validate_repo_path(root, relative)
            except InventoryError as exc:
                for item in exc.diagnostics:
                    code = "link.broken" if item.code == "path.missing" else item.code
                    diagnostics.append(_diag(code, root, path, f"Markdown link {target!r} is invalid: {item.message}", target=target, skill=entry.name))
        for match in re.finditer(r"<SKILL_DIR>(/[^\s`\"')]+)", text):
            target = match.group(1)
            if placeholder_pattern.search(target):
                continue
            base = path.parent.resolve()
            resolved = (base / target.lstrip("/")).resolve()
            try:
                resolved.relative_to(root.resolve())
            except ValueError:
                diagnostics.append(_diag("path.outside_root", root, path, f"<SKILL_DIR> target {target!r} resolves outside the repository", target=target, skill=entry.name))
                continue
            if not resolved.exists():
                diagnostics.append(_diag("link.broken", root, path, f"<SKILL_DIR> target {target!r} does not exist", target=target, skill=entry.name))
    return diagnostics


def _eval_checks(root: Path, entries: list[Any]) -> list[DesignDiagnostic]:
    diagnostics: list[DesignDiagnostic] = []
    for entry in entries:
        relative = f"skills/{entry.name}/evals/evals.json"
        path = root / relative
        if not path.exists():
            continue
        payload, errors = _load_json(root, relative)
        diagnostics.extend(errors)
        if payload is None:
            continue
        if not isinstance(payload, dict) or payload.get("skill_name") != entry.name or not isinstance(payload.get("evals"), list):
            diagnostics.append(_diag("eval.malformed", root, path, "evals.json requires matching skill_name and evals array", skill=entry.name))
            continue
        seen_ids: set[str] = set()
        for index, record in enumerate(payload["evals"]):
            if not isinstance(record, dict):
                diagnostics.append(_diag("eval.malformed", root, path, f"eval {index} is not an object", skill=entry.name))
                continue
            record_id = str(record.get("id", ""))
            if not record_id or record_id in seen_ids or not isinstance(record.get("prompt"), str) or not record["prompt"].strip() or not isinstance(record.get("expected_output"), str) or not record["expected_output"].strip() or not isinstance(record.get("assertions"), list) or not record["assertions"]:
                diagnostics.append(_diag("eval.malformed", root, path, f"eval {index} has an invalid id, prompt, expected_output, or assertions", field=f"evals[{index}]", skill=entry.name))
            if record_id:
                seen_ids.add(record_id)
            assertion_names: set[str] = set()
            for assertion_index, assertion in enumerate(record.get("assertions", [])):
                if not isinstance(assertion, dict) or not isinstance(assertion.get("name"), str) or not assertion["name"].strip() or assertion["name"] in assertion_names or not isinstance(assertion.get("description"), str) or not assertion["description"].strip():
                    diagnostics.append(_diag("eval.malformed", root, path, f"eval {index} assertion {assertion_index} is malformed or duplicated", field=f"evals[{index}].assertions[{assertion_index}]", skill=entry.name))
                elif assertion["name"]:
                    assertion_names.add(assertion["name"])
    return diagnostics


def validate_design_system(root: Path) -> list[DesignDiagnostic]:
    """Return all Phase 6 diagnostics for a repository copy."""

    root = root.resolve()
    router = root / "commands/sealos.md"
    diagnostics: list[DesignDiagnostic] = []
    structural = validate_inventory_and_router(root, router)
    diagnostics.extend(_convert_diagnostic(item) for item in structural)
    try:
        entries = discover_inventory(root)
    except InventoryError as exc:
        entries = []
        diagnostics.extend(_convert_diagnostic(item) for item in exc.diagnostics)
    names = {entry.name for entry in entries}
    diagnostics.extend(_projection_checks(root, names))
    diagnostics.extend(_version_checks(root))
    diagnostics.extend(_link_checks(root, entries))
    diagnostics.extend(_eval_checks(root, entries))
    fixture = root / "tests/fixtures/skill-design-safety.json"
    if fixture.exists():
        diagnostics.extend(_convert_diagnostic(item) for item in check_safety(root, fixture))
    else:
        diagnostics.extend(_convert_diagnostic(item) for item in check_safety(root))
    return diagnostics


def _cli() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    diagnostics = validate_design_system(args.root)
    payload = {"ok": not diagnostics, "diagnostics": [item.to_dict() for item in diagnostics]}
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 1 if args.check and diagnostics else 0


if __name__ == "__main__":
    raise SystemExit(_cli())
