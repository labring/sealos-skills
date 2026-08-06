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


def _pointer_checks(root: Path, names: set[str]) -> list[DesignDiagnostic]:
    """Validate directory and manifest pointers separately from explicit arrays."""

    diagnostics: list[DesignDiagnostic] = []

    codex, errors = _load_json(root, ".codex-plugin/plugin.json")
    diagnostics.extend(errors)
    if isinstance(codex, dict):
        if codex.get("skills") != "./skills/":
            diagnostics.append(_diag("pointer.invalid", root, root / ".codex-plugin/plugin.json", "Codex plugin must point to the canonical skills directory", field="skills", target=str(codex.get("skills"))))
        elif not (root / "skills").is_dir():
            diagnostics.append(_diag("pointer.missing", root, root / ".codex-plugin/plugin.json", "Codex skills directory pointer does not resolve", field="skills", target="./skills/"))

    local_marketplace, errors = _load_json(root, ".agents/plugins/marketplace.json")
    diagnostics.extend(errors)
    local_source: Any = local_marketplace
    try:
        for key in ("plugins", 0, "source", "path"):
            local_source = local_source[key] if not isinstance(key, int) else local_source[key]
    except (KeyError, IndexError, TypeError):
        diagnostics.append(_diag("pointer.malformed", root, root / ".agents/plugins/marketplace.json", "local Codex marketplace source path is missing", field="plugins[0].source.path"))
    else:
        if local_source != "./plugins/sealos":
            diagnostics.append(_diag("pointer.invalid", root, root / ".agents/plugins/marketplace.json", "local Codex marketplace must point to ./plugins/sealos", field="plugins[0].source.path", target=str(local_source)))
        link = root / "plugins/sealos"
        if not link.is_symlink():
            diagnostics.append(_diag("pointer.missing", root, link, "local Codex marketplace source must be a symlink", target="./plugins/sealos"))
        elif link.resolve() != root.resolve():
            diagnostics.append(_diag("pointer.invalid", root, link, "local Codex marketplace symlink must resolve to repository root", target=link.resolve().as_posix()))

    openclaw, errors = _load_json(root, "openclaw.plugin.json")
    diagnostics.extend(errors)
    if isinstance(openclaw, dict):
        if openclaw.get("source") != ".claude-plugin/plugin.json":
            diagnostics.append(_diag("pointer.invalid", root, root / "openclaw.plugin.json", "OpenClaw must point to the Claude plugin manifest", field="source", target=str(openclaw.get("source"))))
        if openclaw.get("commands") != ["./commands/"]:
            diagnostics.append(_diag("pointer.invalid", root, root / "openclaw.plugin.json", "OpenClaw must expose the shared command directory", field="commands", target=str(openclaw.get("commands"))))
        if openclaw.get("commandCount") != 1:
            diagnostics.append(_diag("pointer.invalid", root, root / "openclaw.plugin.json", "OpenClaw commandCount must remain one", field="commandCount", target=str(openclaw.get("commandCount"))))
        if "skills" in openclaw:
            diagnostics.append(_diag("pointer.copied_tree", root, root / "openclaw.plugin.json", "OpenClaw pointer must not embed a copied skill list", field="skills"))
        if not (root / ".claude-plugin/plugin.json").is_file():
            diagnostics.append(_diag("pointer.missing", root, root / "openclaw.plugin.json", "OpenClaw source manifest does not exist", field="source", target=".claude-plugin/plugin.json"))

    qoder, errors = _load_json(root, ".qoder-plugin/plugin.json")
    diagnostics.extend(errors)
    if isinstance(qoder, dict):
        expected = _canonical_paths(names)
        current = qoder.get("skills")
        if not isinstance(current, list) or set(current) != expected or len(current) != len(expected):
            diagnostics.append(_diag("pointer.qoder_inventory", root, root / ".qoder-plugin/plugin.json", "Qoder skill list must equal the derived physical inventory", field="skills"))
        command = qoder.get("commands", {}).get("sealos") if isinstance(qoder.get("commands"), dict) else None
        if not isinstance(command, dict) or command.get("source") != "./commands/sealos.md":
            diagnostics.append(_diag("pointer.invalid", root, root / ".qoder-plugin/plugin.json", "Qoder command must point to commands/sealos.md", field="commands.sealos.source", target=str(command.get("source") if isinstance(command, dict) else None)))

    return diagnostics


def _parse_openai_scalars(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    in_interface = False
    for raw_line in path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n").splitlines():
        if raw_line.strip() == "interface:":
            in_interface = True
            continue
        if not in_interface:
            continue
        if raw_line and not raw_line.startswith((" ", "\t")):
            in_interface = False
            continue
        line = raw_line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1].strip()
        values[key.strip()] = value
    return values


def _openai_metadata_checks(root: Path, names: set[str]) -> list[DesignDiagnostic]:
    diagnostics: list[DesignDiagnostic] = []
    for name in sorted(names):
        relative = f"skills/{name}/agents/openai.yaml"
        path = root / relative
        if not path.is_file():
            diagnostics.append(_diag("metadata.missing_openai", root, path, "OpenAI presentation metadata is missing", skill=name))
            continue
        try:
            values = _parse_openai_scalars(path)
        except OSError as exc:
            diagnostics.append(_diag("metadata.unreadable_openai", root, path, str(exc), skill=name))
            continue
        display_name = values.get("display_name", "").strip()
        if not display_name:
            diagnostics.append(_diag("metadata.missing_display_name", root, path, "OpenAI display_name must be non-empty", field="interface.display_name", skill=name))
        if not values.get("short_description", "").strip():
            diagnostics.append(_diag("metadata.missing_short_description", root, path, "OpenAI short_description must be non-empty", field="interface.short_description", skill=name))
        expected_prompt = f"${name}"
        if expected_prompt not in values.get("default_prompt", ""):
            diagnostics.append(_diag("metadata.prompt_missing_skill", root, path, f"OpenAI default_prompt must include {expected_prompt}", field="interface.default_prompt", target=expected_prompt, skill=name))
    return diagnostics


def _public_claim_checks(root: Path, names: set[str]) -> list[DesignDiagnostic]:
    """Validate public invocation claims without executing a host runtime."""

    diagnostics: list[DesignDiagnostic] = []
    readme_path = root / "README.md"
    shared_path = root / "AGENTS.md"
    qoder_path = root / "qoder.md"
    try:
        readme = readme_path.read_text(encoding="utf-8")
    except OSError as exc:
        return [_diag("claim.source_missing", root, readme_path, str(exc), field="README")]
    try:
        shared = shared_path.read_text(encoding="utf-8")
    except OSError as exc:
        diagnostics.append(_diag("claim.source_missing", root, shared_path, str(exc), field="shared_context"))
        shared = ""
    try:
        qoder = qoder_path.read_text(encoding="utf-8")
    except OSError as exc:
        diagnostics.append(_diag("claim.source_missing", root, qoder_path, str(exc), field="qoder_context"))
        qoder = ""

    for path, text in ((readme_path, readme), (shared_path, shared), (qoder_path, qoder)):
        for name in sorted(names):
            if name not in text:
                diagnostics.append(_diag("claim.missing_capability", root, path, f"public context omits canonical capability {name!r}", field="capabilities", target=name))
    for token, path, text in (("$sealos", shared_path, shared), ("/sealos", shared_path, shared), ("context-only", shared_path, shared), ("OpenClaw", shared_path, shared), ("skills.sh", shared_path, shared)):
        if token not in text:
            diagnostics.append(_diag("claim.invocation", root, path, f"shared context omits host claim token {token!r}", field="host_invocation", target=token))

    direct_heading = "### Alternative: install as a `skills.sh` skill pack"
    direct_start = readme.find(direct_heading)
    direct_body = readme[direct_start:] if direct_start >= 0 else ""
    if direct_start < 0:
        diagnostics.append(_diag("claim.direct_entry", root, readme_path, "README direct skills.sh section is missing", field="direct_entries"))
    else:
        next_section = direct_body.find("\n## ", len(direct_heading))
        if next_section >= 0:
            direct_body = direct_body[:next_section]
        skill_aliases = {f"/{name}" for name in names}
        claimed = set(re.findall(r"(?<![A-Za-z0-9])/[A-Za-z0-9-]+", direct_body)) & skill_aliases
        expected_direct = {"/sealos-deploy", "/sealos-database", "/sealos-s3"}
        if claimed != expected_direct:
            diagnostics.append(_diag("claim.direct_entry", root, readme_path, "README direct skills.sh entries must be exactly deploy, database, and S3", field="direct_entries", target=",".join(sorted(claimed))))

    gemini, gemini_errors = _load_json(root, "gemini-extension.json")
    diagnostics.extend(gemini_errors)
    qwen, qwen_errors = _load_json(root, "qwen-extension.json")
    diagnostics.extend(qwen_errors)
    for host_id, payload, relative in (("gemini-cli", gemini, "gemini-extension.json"), ("qwen-code", qwen, "qwen-extension.json")):
        if not isinstance(payload, dict):
            continue
        if payload.get("contextFileName") != "CLAUDE.md":
            diagnostics.append(_diag("claim.context_target", root, root / relative, "context-only extension must load CLAUDE.md", field="contextFileName", target=str(payload.get("contextFileName"))))
        if not (root / "CLAUDE.md").exists():
            diagnostics.append(_diag("claim.context_target", root, root / relative, "context-only extension target CLAUDE.md is missing", field="contextFileName", target="CLAUDE.md"))
        platform_path = root / "distribution/platforms.json"
        try:
            platforms = json.loads(platform_path.read_text(encoding="utf-8"))
            platform = next(item for item in platforms.get("platforms", []) if item.get("id") == host_id)
        except (OSError, StopIteration, json.JSONDecodeError):
            platform = {}
        if platform.get("commands") != "not_claimed":
            diagnostics.append(_diag("claim.context_only", root, platform_path, f"{host_id} must keep commands: not_claimed", field="platforms.commands", target=str(platform.get("commands"))))

    platform_path = root / "distribution/platforms.json"
    platforms, errors = _load_json(root, "distribution/platforms.json")
    diagnostics.extend(errors)
    if isinstance(platforms, dict):
        entries = platforms.get("platforms", [])
        if isinstance(entries, list):
            by_id = {entry.get("id"): entry for entry in entries if isinstance(entry, dict)}
            skills_entry = by_id.get("skills-npx", {})
            direct_claimed = set(re.findall(r"/(?:sealos-[a-z0-9-]+)", str(skills_entry.get("invoke", ""))))
            if direct_claimed != {"/sealos-deploy", "/sealos-database", "/sealos-s3"}:
                diagnostics.append(_diag("claim.direct_entry", root, platform_path, "platform direct skills.sh entries must be exactly deploy, database, and S3", field="platforms.skills-npx.invoke", target=",".join(sorted(direct_claimed))))
            evidence = " ".join(str(entry.get("evidence", "")) for entry in entries)
            for token in ("Phase 7 offline", "route", "inventory", "pointer", "version", "link", "temporary Qoder"):
                if token.lower() not in evidence.lower():
                    diagnostics.append(_diag("claim.evidence", root, platform_path, f"platform evidence omits {token!r}", field="platforms.evidence", target=token))
            qoder_entry = by_id.get("qoder", {})
            if "verified .sealos/state.json deployment state" not in str(qoder_entry.get("invoke", "")):
                diagnostics.append(_diag("claim.canvas_precondition", root, platform_path, "Qoder Canvas claim must require verified .sealos/state.json deployment state", field="platforms.qoder.invoke"))
    canvas_readme_evidence = "`.sealos/state.json` contains verified `last_deploy`" in readme
    if not canvas_readme_evidence:
        diagnostics.append(_diag("claim.canvas_precondition", root, readme_path, "README Canvas claim must include verified .sealos/state.json deployment state", field="canvas_precondition"))
    if ".sealos/state.json" not in qoder or "verified deployment state" not in qoder.lower():
        diagnostics.append(_diag("claim.canvas_precondition", root, qoder_path, "Qoder Canvas claim must include verified .sealos/state.json deployment state", field="canvas_precondition"))

    openclaw, errors = _load_json(root, "openclaw.plugin.json")
    diagnostics.extend(errors)
    if isinstance(openclaw, dict) and (openclaw.get("source") != ".claude-plugin/plugin.json" or openclaw.get("commands") != ["./commands/"] or "skills" in openclaw):
        diagnostics.append(_diag("claim.pointer", root, root / "openclaw.plugin.json", "OpenClaw claim must remain a pointer to the Claude manifest without a copied skill list", field="source"))
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
    diagnostics.extend(_pointer_checks(root, names))
    diagnostics.extend(_openai_metadata_checks(root, names))
    diagnostics.extend(_public_claim_checks(root, names))
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
