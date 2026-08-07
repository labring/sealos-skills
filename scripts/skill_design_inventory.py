#!/usr/bin/env python3
"""Discover the canonical Sealos skill inventory and broad route table."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@dataclass(frozen=True)
class Diagnostic:
    code: str
    path: str
    message: str
    skill: str | None = None
    field: str | None = None
    target: str | None = None

    def to_dict(self) -> dict[str, str]:
        return {key: value for key, value in asdict(self).items() if value is not None}


@dataclass(frozen=True)
class InventoryEntry:
    name: str
    path: str
    description: str
    frontmatter: dict[str, str]


INTERACTION_CLASSES = frozenset(
    {
        "read-only-observation",
        "local-artifact-mutation",
        "cloud-local-mutation",
        "composite-orchestration",
    }
)
EXPECTED_INTERACTION_CLASSES = {
    "sealos-deploy": "composite-orchestration",
    "sealos-database": "cloud-local-mutation",
    "sealos-s3": "cloud-local-mutation",
    "sealos-canvas": "read-only-observation",
    "sealos-app-builder": "local-artifact-mutation",
    "cloud-native-readiness": "read-only-observation",
    "dockerfile-skill": "local-artifact-mutation",
    "docker-to-sealos": "local-artifact-mutation",
}
CAPABILITY_LEVELS = (
    "observation",
    "local-write",
    "cloud-write",
    "public-exposure",
    "destructive",
)
CAPABILITY_RANK = {name: index for index, name in enumerate(CAPABILITY_LEVELS)}


@dataclass(frozen=True)
class CapabilityTuple:
    base: str
    escalations: tuple[str, ...]


@dataclass(frozen=True)
class HandoffStep:
    target: str
    input_artifact: str
    allowed_action: str
    failure_return: str
    response_owner: str
    conditional: bool = False


@dataclass(frozen=True)
class RouteEntry:
    intent: str
    skill: str
    plugin_entry: str
    direct_entry: str
    interaction_class: str
    capability: CapabilityTuple
    handoff: tuple[HandoffStep, ...]
    line: int
    path: str


class InventoryError(ValueError):
    """Raised when a caller asks for strict parsing of invalid source."""

    def __init__(self, diagnostics: Iterable[Diagnostic]):
        self.diagnostics = tuple(diagnostics)
        super().__init__("; ".join(item.message for item in self.diagnostics))


def _relative(root: Path, path: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def _diagnostic(code: str, root: Path, path: Path, message: str, **kwargs: str | None) -> Diagnostic:
    try:
        relative = _relative(root, path)
    except ValueError:
        relative = path.as_posix()
    return Diagnostic(code=code, path=relative, message=message, **kwargs)


def _clean_value(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        return value[1:-1].strip()
    return value


def parse_skill_frontmatter(path: Path, root: Path | None = None) -> dict[str, str]:
    """Parse the simple YAML frontmatter used by a skill entry."""

    root = (root or path.parent).resolve()
    diagnostics: list[Diagnostic] = []
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        diagnostics.append(_diagnostic("frontmatter.unreadable", root, path, str(exc)))
        raise InventoryError(diagnostics) from exc
    lines = text.replace("\r\n", "\n").replace("\r", "\n").splitlines()
    if not lines or lines[0].strip() != "---":
        diagnostics.append(_diagnostic("frontmatter.missing", root, path, "entry must start with ---"))
        raise InventoryError(diagnostics)
    end = next((index for index in range(1, len(lines)) if lines[index].strip() == "---"), None)
    if end is None:
        diagnostics.append(_diagnostic("frontmatter.unclosed", root, path, "frontmatter block is not closed"))
        raise InventoryError(diagnostics)
    values: dict[str, str] = {}
    for index, line in enumerate(lines[1:end], start=2):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            diagnostics.append(_diagnostic("frontmatter.malformed", root, path, f"line {index} is not key: value"))
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]*", key):
            diagnostics.append(_diagnostic("frontmatter.malformed", root, path, f"invalid key on line {index}", field=key))
            continue
        if key in values:
            diagnostics.append(_diagnostic("frontmatter.duplicate", root, path, f"duplicate key {key}", field=key))
            continue
        values[key] = _clean_value(value)
    if not values.get("name"):
        diagnostics.append(_diagnostic("frontmatter.name_missing", root, path, "frontmatter name is required", field="name"))
    if not values.get("description"):
        diagnostics.append(_diagnostic("frontmatter.description_missing", root, path, "frontmatter description is required", field="description"))
    if diagnostics:
        raise InventoryError(diagnostics)
    return values


def discover_inventory(root: Path) -> list[InventoryEntry]:
    """Discover and strictly validate immediate ``skills/*/SKILL.md`` entries."""

    root = root.resolve()
    skills_root = root / "skills"
    diagnostics: list[Diagnostic] = []
    entries: list[InventoryEntry] = []
    if not skills_root.is_dir():
        raise InventoryError([_diagnostic("inventory.missing_root", root, skills_root, "skills directory is missing")])
    for entry_path in sorted(skills_root.glob("*/SKILL.md")):
        try:
            frontmatter = parse_skill_frontmatter(entry_path, root)
        except InventoryError as exc:
            diagnostics.extend(exc.diagnostics)
            continue
        directory_name = entry_path.parent.name
        name = frontmatter["name"]
        if name != directory_name:
            diagnostics.append(_diagnostic("frontmatter.name_mismatch", root, entry_path, f"frontmatter name {name!r} differs from directory {directory_name!r}", skill=name, field="name", target=directory_name))
        entries.append(InventoryEntry(name=name, path=_relative(root, entry_path), description=frontmatter["description"], frontmatter=frontmatter))
    names = [entry.name for entry in entries]
    for name in sorted({item for item in names if names.count(item) > 1}):
        paths = [entry.path for entry in entries if entry.name == name]
        diagnostics.append(Diagnostic("frontmatter.duplicate_name", ",".join(paths), f"duplicate canonical skill name {name!r}", skill=name, field="name"))
    if diagnostics:
        raise InventoryError(diagnostics)
    return entries


def validate_repo_path(root: Path, value: str | Path, *, must_exist: bool = True) -> Path:
    """Resolve a repository-relative POSIX path and reject traversal."""

    root = root.resolve()
    raw = str(value).replace("\\", "/")
    candidate = Path(raw)
    if not raw or candidate.is_absolute() or re.match(r"^[A-Za-z]:", raw):
        raise InventoryError([Diagnostic("path.outside_root", raw or "<empty>", "path must be repository-relative", target=raw)])
    normalized = Path(*[part for part in raw.split("/") if part not in ("", ".")])
    if ".." in normalized.parts:
        raise InventoryError([Diagnostic("path.outside_root", raw, "path traversal is not allowed", target=raw)])
    resolved = (root / normalized).resolve()
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise InventoryError([Diagnostic("path.outside_root", raw, "path resolves outside repository root", target=raw)]) from exc
    if must_exist and not resolved.exists():
        raise InventoryError([Diagnostic("path.missing", raw, "repository path does not exist", target=raw)])
    return resolved


def _strip_cell(value: str) -> str:
    value = value.strip()
    return value.replace("`", "").strip()


def _parse_capability(value: str, root: Path, path: Path, line: int) -> CapabilityTuple:
    fields: dict[str, str] = {}
    for raw_field in value.split(";"):
        if "=" not in raw_field:
            raise InventoryError([_diagnostic("route.capability_malformed", root, path, f"route row {line} capability field must use key=value syntax", field="capability")])
        key, raw_value = (part.strip() for part in raw_field.split("=", 1))
        if key in fields or key not in {"base", "escalations"}:
            raise InventoryError([_diagnostic("route.capability_malformed", root, path, f"route row {line} has an unknown or duplicate capability field {key!r}", field="capability")])
        fields[key] = raw_value
    if set(fields) != {"base", "escalations"}:
        raise InventoryError([_diagnostic("route.capability_malformed", root, path, f"route row {line} capability requires base and escalations", field="capability")])
    base = fields["base"]
    raw_escalations = fields["escalations"]
    escalations = () if raw_escalations == "none" else tuple(item.strip() for item in raw_escalations.split(","))
    if base not in CAPABILITY_RANK or not escalations or any(item not in CAPABILITY_RANK for item in escalations):
        if raw_escalations == "none" and base in CAPABILITY_RANK:
            return CapabilityTuple(base=base, escalations=())
        raise InventoryError([_diagnostic("route.capability_unknown", root, path, f"route row {line} uses an unknown capability label", field="capability", target=base)])
    if len(set(escalations)) != len(escalations) or any(CAPABILITY_RANK[item] <= CAPABILITY_RANK[previous] for previous, item in zip((base, *escalations), escalations)):
        raise InventoryError([_diagnostic("route.capability_order", root, path, f"route row {line} capability escalations must be unique and strictly increasing", field="capability")])
    return CapabilityTuple(base=base, escalations=escalations)


def _parse_handoff(value: str, root: Path, path: Path, line: int) -> tuple[HandoffStep, ...]:
    if value == "none":
        return ()
    raw_steps = tuple(item.strip() for item in value.split(" => ") if item.strip())
    if not raw_steps or any(step == "none" for step in raw_steps):
        raise InventoryError([_diagnostic("route.handoff_malformed", root, path, f"route row {line} handoff must be none or an ordered five-field step list", field="handoff")])
    known = {entry.parent.name for entry in (root / "skills").glob("*/SKILL.md")}
    required = {"target", "inputArtifact", "allowedAction", "failureReturn", "responseOwner"}
    steps: list[HandoffStep] = []
    for raw_step in raw_steps:
        fields: dict[str, str] = {}
        for raw_field in raw_step.split(";"):
            if "=" not in raw_field:
                raise InventoryError([_diagnostic("route.handoff_malformed", root, path, f"route row {line} handoff fields must use key=value syntax", field="handoff")])
            key, raw_value = (part.strip() for part in raw_field.split("=", 1))
            if key in fields or key not in required:
                raise InventoryError([_diagnostic("route.handoff_malformed", root, path, f"route row {line} has an unknown or duplicate handoff field {key!r}", field="handoff")])
            fields[key] = raw_value
        if set(fields) != required or any(not value for value in fields.values()):
            raise InventoryError([_diagnostic("route.handoff_malformed", root, path, f"route row {line} handoff requires target, inputArtifact, allowedAction, failureReturn, and responseOwner", field="handoff")])
        raw_target = fields["target"]
        conditional = raw_target.endswith("?")
        target = raw_target[:-1] if conditional else raw_target
        if known and target not in known:
            raise InventoryError([_diagnostic("route.handoff_unknown_skill", root, path, f"route row {line} handoff names unknown skill {target!r}", field="handoff", target=target)])
        for field in ("failureReturn", "responseOwner"):
            owner = fields[field]
            if known and owner not in known and owner != "none":
                raise InventoryError([_diagnostic("route.handoff_unknown_skill", root, path, f"route row {line} {field} names unknown skill {owner!r}", field=field, target=owner)])
        steps.append(HandoffStep(target=target, input_artifact=fields["inputArtifact"], allowed_action=fields["allowedAction"], failure_return=fields["failureReturn"], response_owner=fields["responseOwner"], conditional=conditional))
    targets = tuple(step.target for step in steps)
    if len(set(targets)) != len(targets):
        raise InventoryError([_diagnostic("route.handoff_duplicate", root, path, f"route row {line} handoff repeats a skill", field="handoff")])
    return tuple(steps)


def parse_router(path: Path) -> list[RouteEntry]:
    """Parse the canonical seven-column route table in ``commands/sealos.md``."""

    root = path.parent.parent.resolve()
    try:
        lines = path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n").splitlines()
    except OSError as exc:
        raise InventoryError([_diagnostic("route.unreadable", root, path, str(exc))]) from exc
    route_heading = next((index for index, line in enumerate(lines) if line.strip() == "## Route"), None)
    if route_heading is None:
        raise InventoryError([_diagnostic("route.missing_table", root, path, "## Route heading is missing")])
    header_index = next((index for index in range(route_heading + 1, len(lines)) if lines[index].strip().startswith("|") and "Intent" in lines[index]), None)
    if header_index is None:
        raise InventoryError([_diagnostic("route.missing_table", root, path, "route table header is missing")])
    expected = [
        "Intent",
        "Canonical skill",
        "Plugin entry",
        "Direct skills.sh entry",
        "Interaction class",
        "Capability tuple",
        "Ordered handoff",
    ]
    actual = [_strip_cell(cell) for cell in lines[header_index].split("|")[1:-1]]
    if actual != expected:
        raise InventoryError([_diagnostic("route.malformed", root, path, f"route columns must be {expected!r}")])
    rows: list[RouteEntry] = []
    index = header_index + 1
    if index >= len(lines) or not lines[index].strip().startswith("|"):
        raise InventoryError([_diagnostic("route.missing_separator", root, path, "route table separator is missing")])
    index += 1
    while index < len(lines) and lines[index].strip().startswith("|"):
        cells = [_strip_cell(cell) for cell in lines[index].split("|")[1:-1]]
        if len(cells) != len(expected) or any(not cell for cell in cells):
            raise InventoryError([_diagnostic("route.malformed", root, path, f"route row {index + 1} must contain {len(expected)} non-empty cells")])
        interaction_class = cells[4]
        if interaction_class not in INTERACTION_CLASSES:
            raise InventoryError([_diagnostic("route.interaction_class_invalid", root, path, f"route row {index + 1} uses unknown interaction class {interaction_class!r}", field="interaction_class", target=interaction_class)])
        expected_interaction_class = EXPECTED_INTERACTION_CLASSES.get(cells[1])
        if expected_interaction_class and interaction_class != expected_interaction_class:
            raise InventoryError([_diagnostic("route.interaction_class_mismatch", root, path, f"route row {index + 1} owner {cells[1]!r} requires interaction class {expected_interaction_class!r}", skill=cells[1], field="interaction_class", target=interaction_class)])
        capability = _parse_capability(cells[5], root, path, index + 1)
        handoff = _parse_handoff(cells[6], root, path, index + 1)
        targets = tuple(step.target for step in handoff)
        if cells[1] == "sealos-deploy" and targets != ("cloud-native-readiness", "dockerfile-skill", "docker-to-sealos", "sealos-deploy", "sealos-canvas"):
            raise InventoryError([_diagnostic("route.handoff_sequence", root, path, f"route row {index + 1} deploy handoff must preserve readiness, Dockerfile, Docker-to-Sealos, deploy, and Canvas order", field="handoff")])
        if cells[1] == "cloud-native-readiness" and targets != ("dockerfile-skill",):
            raise InventoryError([_diagnostic("route.handoff_sequence", root, path, f"route row {index + 1} readiness handoff must conditionally target dockerfile-skill", field="handoff")])
        rows.append(RouteEntry(intent=cells[0], skill=cells[1], plugin_entry=cells[2], direct_entry=cells[3], interaction_class=interaction_class, capability=capability, handoff=handoff, line=index + 1, path=_relative(root, path)))
        index += 1
    if not rows:
        raise InventoryError([_diagnostic("route.empty", root, path, "route table has no records")])
    return rows


def validate_inventory_and_router(root: Path, router: Path) -> list[Diagnostic]:
    """Collect structural diagnostics without raising for CLI/report consumers."""

    diagnostics: list[Diagnostic] = []
    try:
        entries = discover_inventory(root)
    except InventoryError as exc:
        diagnostics.extend(exc.diagnostics)
        entries = []
    try:
        routes = parse_router(router)
    except InventoryError as exc:
        diagnostics.extend(exc.diagnostics)
        routes = []
    entry_names = {entry.name for entry in entries}
    route_names = [route.skill for route in routes]
    router_path = _relative(root, router)
    for name in sorted(entry_names - set(route_names)):
        diagnostics.append(Diagnostic("route.missing_skill", router_path, f"router has no record for {name!r}", skill=name))
    for name in sorted(set(route_names) - entry_names):
        diagnostics.append(Diagnostic("route.unexpected_skill", router_path, f"router names unknown skill {name!r}", skill=name))
    for name in sorted({item for item in route_names if route_names.count(item) > 1}):
        diagnostics.append(Diagnostic("route.duplicate_skill", router_path, f"router repeats {name!r}", skill=name))
    return diagnostics


def _cli() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--router", type=Path, default=Path("commands/sealos.md"))
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    root = args.root.resolve()
    router = args.router if args.router.is_absolute() else root / args.router
    diagnostics = validate_inventory_and_router(root, router)
    payload: dict[str, object] = {"ok": not diagnostics, "diagnostics": [item.to_dict() for item in diagnostics]}
    if not diagnostics:
        entries = discover_inventory(root)
        routes = parse_router(router)
        payload.update({"skills": [asdict(entry) for entry in entries], "routes": [asdict(route) for route in routes]})
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 1 if args.check and diagnostics else 0


if __name__ == "__main__":
    raise SystemExit(_cli())
