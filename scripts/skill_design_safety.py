#!/usr/bin/env python3
"""Validate entry-visible safety canaries and their mutation fixture schema."""

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

from scripts.skill_design_inventory import Diagnostic, InventoryError, validate_repo_path


@dataclass(frozen=True)
class Canary:
    canary_id: str
    skill: str
    entry: str
    marker: str
    evidence: str
    baseline_cases: str


@dataclass(frozen=True)
class SafetyDiagnostic:
    code: str
    path: str
    message: str
    canary_id: str | None = None
    skill: str | None = None
    category: str | None = None

    def to_dict(self) -> dict[str, str]:
        return {key: value for key, value in asdict(self).items() if value is not None}


class SafetyError(ValueError):
    def __init__(self, diagnostics: Iterable[SafetyDiagnostic]):
        self.diagnostics = tuple(diagnostics)
        super().__init__("; ".join(item.message for item in self.diagnostics))


_STOPWORDS = {
    "a", "an", "and", "any", "are", "as", "at", "before", "by", "for", "from", "has", "have", "in", "is", "it", "no", "of", "on", "or", "only", "plus", "the", "to", "when", "with",
}


def normalize(value: str) -> str:
    value = value.replace("<br>", " ").replace("`", "")
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def _tokens(value: str) -> list[str]:
    return [token for token in normalize(value).split() if token not in _STOPWORDS and len(token) > 2]


def _phrase_satisfied(text: str, phrase: str) -> bool:
    normalized_text = normalize(text)
    normalized_phrase = normalize(phrase)
    if not normalized_phrase:
        return True
    if normalized_phrase in normalized_text:
        return True
    phrase_tokens = _tokens(phrase)
    if not phrase_tokens:
        return True
    text_tokens = set(normalized_text.split())
    matched = sum(token in text_tokens for token in phrase_tokens)
    return matched >= max(1, (len(phrase_tokens) + 1) // 2)


def _marker_fragments(marker: str) -> list[str]:
    parts = re.split(r"\s+(?:plus|and)\s+", marker, flags=re.IGNORECASE)
    return [part.strip() for part in parts if part.strip()]


def _evidence_fragments(evidence: str) -> list[str]:
    return [part.strip() for part in evidence.split(",") if part.strip()]


def load_canaries(registry_path: Path) -> list[Canary]:
    """Parse the maintainer-facing registry without requiring a YAML package."""

    text = registry_path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")
    lines = text.splitlines()
    header = next((index for index, line in enumerate(lines) if line.strip().startswith("| ID | Skill / owning entry")), None)
    if header is None:
        raise SafetyError([SafetyDiagnostic("canary.registry_malformed", registry_path.as_posix(), "canary registry header is missing")])
    canaries: list[Canary] = []
    for line in lines[header + 2 :]:
        if line.startswith("## Canary Rules"):
            break
        if not line.strip().startswith("|"):
            continue
        cells = [cell.strip().replace("`", "") for cell in line.split("|")[1:-1]]
        if len(cells) != 6 or not cells[0]:
            continue
        owner_parts = [part.strip() for part in cells[1].split("/", 1)]
        if len(owner_parts) != 2:
            raise SafetyError([SafetyDiagnostic("canary.registry_malformed", registry_path.as_posix(), f"owner cell is malformed for {cells[0]}", canary_id=cells[0])])
        canaries.append(Canary(cells[0], owner_parts[0], owner_parts[1], cells[2], cells[4], cells[5]))
    if not canaries:
        raise SafetyError([SafetyDiagnostic("canary.registry_empty", registry_path.as_posix(), "canary registry has no records")])
    seen: set[str] = set()
    duplicates: list[SafetyDiagnostic] = []
    for canary in canaries:
        if canary.canary_id in seen:
            duplicates.append(SafetyDiagnostic("canary.duplicate_id", registry_path.as_posix(), f"duplicate canary {canary.canary_id}", canary_id=canary.canary_id, skill=canary.skill))
        seen.add(canary.canary_id)
    if duplicates:
        raise SafetyError(duplicates)
    return canaries


def _fixture_diagnostics(fixture_path: Path, canaries: list[Canary]) -> list[SafetyDiagnostic]:
    try:
        payload = json.loads(fixture_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [SafetyDiagnostic("canary.fixture_malformed", fixture_path.as_posix(), f"fixture is not valid JSON: {exc}")]
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1 or not isinstance(payload.get("cases"), list):
        return [SafetyDiagnostic("canary.fixture_malformed", fixture_path.as_posix(), "fixture requires schemaVersion 1 and a cases array")]
    expected = {canary.canary_id for canary in canaries}
    seen: set[str] = set()
    diagnostics: list[SafetyDiagnostic] = []
    for index, record in enumerate(payload["cases"]):
        if not isinstance(record, dict):
            diagnostics.append(SafetyDiagnostic("canary.fixture_malformed", fixture_path.as_posix(), f"case {index} is not an object"))
            continue
        case_id = record.get("canaryId")
        if not isinstance(case_id, str) or case_id not in expected:
            diagnostics.append(SafetyDiagnostic("canary.fixture_malformed", fixture_path.as_posix(), f"case {index} has an unknown canaryId", canary_id=str(case_id)))
            continue
        if case_id in seen:
            diagnostics.append(SafetyDiagnostic("canary.fixture_malformed", fixture_path.as_posix(), f"duplicate fixture canaryId {case_id}", canary_id=case_id))
        seen.add(case_id)
        for field in ("caseId", "kind", "mutation", "expectedCode", "category"):
            if not isinstance(record.get(field), str) or not record[field].strip():
                diagnostics.append(SafetyDiagnostic("canary.fixture_malformed", fixture_path.as_posix(), f"case {case_id} requires {field}", canary_id=case_id))
    missing = expected - seen
    for canary_id in sorted(missing):
        diagnostics.append(SafetyDiagnostic("canary.fixture_malformed", fixture_path.as_posix(), f"fixture has no mutation case for {canary_id}", canary_id=canary_id))
    return diagnostics


def check_safety(root: Path, fixture: Path | None = None, registry: Path | None = None) -> list[SafetyDiagnostic]:
    root = root.resolve()
    registry = registry or root / "docs/skill-safety-canaries.md"
    try:
        canaries = load_canaries(registry)
    except SafetyError as exc:
        return list(exc.diagnostics)
    diagnostics: list[SafetyDiagnostic] = []
    if fixture is not None:
        diagnostics.extend(_fixture_diagnostics(fixture, canaries))
    for canary in canaries:
        try:
            entry = validate_repo_path(root, canary.entry)
        except InventoryError:
            diagnostics.append(SafetyDiagnostic("canary.owner_missing", canary.entry, f"owner entry is missing for {canary.canary_id}", canary_id=canary.canary_id, skill=canary.skill))
            continue
        text = entry.read_text(encoding="utf-8")
        category = "safety"
        upper_id = canary.canary_id.upper()
        if "CONFIRM" in upper_id:
            category = "confirmation"
        elif "REDACT" in upper_id:
            category = "redaction"
        elif "READONLY" in upper_id:
            category = "read-only"
        elif "ELIGIBILITY" in upper_id or "DEPLOYED" in upper_id:
            category = "eligibility"
        elif "QUALITY" in upper_id or "MUST" in upper_id or "RUNTIME" in upper_id:
            category = "fail-closed"
        category_anchor = {
            "confirmation": ("confirmation", "confirm"),
            "redaction": ("redact", "sanitized", "redacted"),
            "read-only": ("read only", "read-only"),
            "eligibility": ("eligibility", "deployed state", "last deploy", "not deployed"),
        }.get(category, ())
        normalized_entry = normalize(text)
        if category == "read-only":
            anchor_present = "read only" in normalized_entry
        else:
            anchor_present = any(_phrase_satisfied(text, anchor) for anchor in category_anchor)
        if category_anchor and not anchor_present:
            diagnostics.append(SafetyDiagnostic("canary.missing", canary.entry, f"{category} guard anchor is missing", canary_id=canary.canary_id, skill=canary.skill, category=category))
            continue
        missing_marker = [fragment for fragment in _marker_fragments(canary.marker) if not _phrase_satisfied(text, fragment)]
        if missing_marker:
            diagnostics.append(SafetyDiagnostic("canary.missing", canary.entry, f"marker evidence missing: {', '.join(missing_marker)}", canary_id=canary.canary_id, skill=canary.skill, category=category))
            continue
        missing_evidence = [fragment for fragment in _evidence_fragments(canary.evidence) if not _phrase_satisfied(text, fragment)]
        if missing_evidence:
            diagnostics.append(SafetyDiagnostic("canary.evidence_missing", canary.entry, f"required evidence missing: {', '.join(missing_evidence)}", canary_id=canary.canary_id, skill=canary.skill, category=category))
    return diagnostics


def _cli() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--registry", type=Path)
    parser.add_argument("--fixture", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    root = args.root.resolve()
    registry = args.registry or root / "docs/skill-safety-canaries.md"
    fixture = args.fixture
    diagnostics = check_safety(root, fixture, registry)
    payload = {"ok": not diagnostics, "diagnostics": [item.to_dict() for item in diagnostics]}
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 1 if args.check and diagnostics else 0


if __name__ == "__main__":
    raise SystemExit(_cli())
