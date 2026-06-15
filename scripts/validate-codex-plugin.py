#!/usr/bin/env python3
"""Validate Sealos Codex plugin integration files."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROOT_PLUGIN_PATH = ROOT / "plugin.json"
PLUGIN_PATH = ROOT / ".codex-plugin" / "plugin.json"
PLUGIN_SOURCE_LINK = ROOT / "plugins" / "sealos"
MARKETPLACE_PATH = ROOT / ".agents" / "plugins" / "marketplace.json"
ROOT_MARKETPLACE_PATH = ROOT / "marketplace.json"
PLATFORMS_PATH = ROOT / "distribution" / "platforms.json"
README_PATH = ROOT / "README.md"
REPOSITORY_SLUG = "labring/sealos-skills"
REPOSITORY_URL = "https://github.com/labring/sealos-skills"
PLUGIN_ID = "sealos"
PLUGIN_SELECTOR = "sealos@sealos"
DISPLAY_LABEL = "Sealos"
SKILLS_SOURCE = "./skills/"
CODEX_MARKETPLACE_SOURCE = "./plugins/sealos"
ROOT_MARKETPLACE_SOURCE = "./"
ROOT_MARKETPLACE_COMMANDS = "./commands/"
README_NATIVE_COMMANDS = (
    "codex plugin marketplace add labring/sealos-skills",
    "codex plugin add sealos@sealos",
)
README_RECOMMENDED_CODEX_HEADING = "### Recommended: install in Codex"
README_FALLBACK_COMMAND = "npx plugins add https://github.com/labring/sealos-skills --target codex"
PLATFORM_INSTALL_COMMAND = "codex plugin marketplace add labring/sealos-skills && codex plugin add sealos@sealos"
CODEX_PLATFORM_ID = "codex"
CODEX_EVIDENCE_NATIVE = "Phase 1 native marketplace add/list/install"
CODEX_EVIDENCE_MANIFEST = "codex_manifest+repo_marketplace"
REQUIRED_PLUGIN_PAYLOAD_PATHS = (
    "plugin.json",
    ".codex-plugin/plugin.json",
    "skills/sealos-deploy/SKILL.md",
    "skills/sealos-database/SKILL.md",
    "skills/sealos-s3/SKILL.md",
    "assets/logo.svg",
)
PLUGIN_PARITY_KEYS = (
    "name",
    "version",
    "description",
    "author",
    "homepage",
    "repository",
    "license",
    "keywords",
    "skills",
    "interface",
)


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    raise SystemExit(1)


def load_json(path: Path) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        fail(f"missing {path.relative_to(ROOT)}")
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON in {path.relative_to(ROOT)}: {exc}")


def load_json_object(path: Path) -> dict:
    value = load_json(path)
    require(isinstance(value, dict), f"{path.relative_to(ROOT)} contains a JSON object")
    return value


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        fail(f"missing {path.relative_to(ROOT)}")


def require(condition: bool, message: str) -> None:
    if not condition:
        fail(message)
    print(f"PASS: {message}")


def require_list(value: object, label: str) -> list:
    require(isinstance(value, list), f"{label} is a JSON array")
    return value


def require_single_object_entry(value: object, label: str) -> dict:
    entries = require_list(value, f"{label} plugins")
    require(len(entries) == 1, f"{label} has one plugin entry")
    entry = entries[0]
    require(isinstance(entry, dict), f"{label} plugin entry is a JSON object")
    return entry


def optional_object(parent: dict, key: str, label: str) -> dict:
    value = parent.get(key, {})
    require(isinstance(value, dict), f"{label} is a JSON object")
    return value


def require_relative_path(value: str, field: str) -> None:
    require(isinstance(value, str) and value.startswith("./"), f"{field} uses ./ relative path")
    target = ROOT / value[2:]
    require(target.exists(), f"{field} target exists: {value}")


def require_manifest_parity(root_plugin: dict, codex_plugin: dict) -> None:
    mismatched = [
        key
        for key in PLUGIN_PARITY_KEYS
        if root_plugin.get(key) != codex_plugin.get(key)
    ]
    require(not mismatched, "root plugin.json matches .codex-plugin/plugin.json key fields")


def section_after_heading(text: str, heading: str) -> str:
    start = text.find(heading)
    require(start >= 0, f"README includes {heading} section")
    body_start = start + len(heading)
    next_heading = text.find("\n### ", body_start)
    if next_heading == -1:
        return text[body_start:]
    return text[body_start:next_heading]


def bash_blocks(markdown: str) -> list[list[str]]:
    blocks = []
    lines = markdown.splitlines()
    index = 0
    while index < len(lines):
        if lines[index].strip() == "```bash":
            index += 1
            block_lines = []
            while index < len(lines) and lines[index].strip() != "```":
                line = lines[index].strip()
                if line:
                    block_lines.append(line)
                index += 1
            blocks.append(block_lines)
        index += 1
    return blocks


def require_readme_contract(readme: str) -> None:
    recommended_section = section_after_heading(readme, README_RECOMMENDED_CODEX_HEADING)
    recommended_blocks = bash_blocks(recommended_section)
    require(
        list(README_NATIVE_COMMANDS) in recommended_blocks,
        "README Quick Start includes exact native Codex install block",
    )
    require(
        [README_FALLBACK_COMMAND] in recommended_blocks,
        "README Quick Start includes exact fallback Codex npx install block",
    )
    for token in (REPOSITORY_SLUG, PLUGIN_SELECTOR, "$sealos", DISPLAY_LABEL):
        require(token in readme, f"README includes canonical identity token: {token}")


def require_manifest_contract(root_plugin: dict, codex_plugin: dict) -> None:
    require_manifest_parity(root_plugin, codex_plugin)
    for label, manifest in (("root plugin.json", root_plugin), ("Codex plugin manifest", codex_plugin)):
        interface = optional_object(manifest, "interface", f"{label} interface")
        require(manifest.get("name") == PLUGIN_ID, f"{label} uses canonical plugin id")
        require(manifest.get("homepage") == REPOSITORY_URL, f"{label} uses canonical homepage")
        require(manifest.get("repository") == REPOSITORY_URL, f"{label} uses canonical repository")
        require(manifest.get("skills") == SKILLS_SOURCE, f"{label} points to root skills directory")
        require(
            interface.get("displayName") == DISPLAY_LABEL,
            f"{label} uses canonical display label",
        )


def require_plugin_source_link() -> None:
    require(PLUGIN_SOURCE_LINK.is_symlink(), "Codex marketplace plugin source is a symlink")
    require(PLUGIN_SOURCE_LINK.resolve() == ROOT, "Codex marketplace plugin source resolves to repository root")


def require_plugin_payload(root: Path, label: str) -> None:
    for relative_path in REQUIRED_PLUGIN_PAYLOAD_PATHS:
        require((root / relative_path).exists(), f"{label} payload contains {relative_path}")


def require_codex_marketplace_contract(marketplace: dict) -> None:
    interface = optional_object(marketplace, "interface", "Codex marketplace interface")
    require(marketplace.get("name") == PLUGIN_ID, "Codex marketplace uses canonical marketplace id")
    require(
        interface.get("displayName") == DISPLAY_LABEL,
        "Codex marketplace uses canonical display label",
    )
    entry = require_single_object_entry(marketplace.get("plugins", []), "Codex marketplace")
    source = optional_object(entry, "source", "Codex marketplace entry source")
    policy = optional_object(entry, "policy", "Codex marketplace entry policy")
    require(entry.get("name") == PLUGIN_ID, "Codex marketplace entry names Sealos")
    require(source.get("source") == "local", "Codex marketplace uses local source")
    require(
        source.get("path") == CODEX_MARKETPLACE_SOURCE,
        "Codex marketplace points at repo-root plugin source",
    )
    require(policy.get("installation") == "AVAILABLE", "Codex marketplace installation policy is available")
    require(policy.get("authentication") == "ON_INSTALL", "Codex marketplace authentication policy is on install")
    require(entry.get("category") == "Coding", "Codex marketplace category is Coding")


def require_root_marketplace_contract(root_marketplace: dict, codex_plugin: dict) -> None:
    metadata = optional_object(root_marketplace, "metadata", "root marketplace metadata")
    require(root_marketplace.get("name") == PLUGIN_ID, "root marketplace uses canonical marketplace id")
    require(
        metadata.get("repository") == REPOSITORY_URL,
        "root marketplace uses canonical repository URL",
    )
    entry = require_single_object_entry(root_marketplace.get("plugins", []), "root marketplace")
    require(entry.get("name") == PLUGIN_ID, "root marketplace entry uses canonical plugin id")
    require(entry.get("source") == ROOT_MARKETPLACE_SOURCE, "root marketplace entry points to repository root")
    require(entry.get("commands") == ROOT_MARKETPLACE_COMMANDS, "root marketplace entry points to commands directory")
    require(entry.get("version") == codex_plugin.get("version"), "root marketplace version matches Codex manifest")


def require_platform_codex_contract(platforms: dict) -> None:
    require(platforms.get("name") == PLUGIN_ID, "platform registry uses canonical plugin id")
    require(platforms.get("version") == "1.0.0", "platform registry version is current")
    require(platforms.get("repository") == REPOSITORY_URL, "platform registry uses canonical repository URL")
    platform_entries = require_list(platforms.get("platforms", []), "platform registry platforms")
    require(
        all(isinstance(platform, dict) for platform in platform_entries),
        "platform registry platform entries are JSON objects",
    )
    codex_entries = [platform for platform in platform_entries if platform.get("id") == CODEX_PLATFORM_ID]
    require(len(codex_entries) == 1, "platform registry includes one Codex entry")
    codex = codex_entries[0]
    require(codex.get("claim") == "verified", "Codex platform claim is verified")
    require(codex.get("runtime") == "plugin", "Codex platform runtime is plugin")
    require(codex.get("install") == PLATFORM_INSTALL_COMMAND, "Codex platform install command matches native contract")
    require(codex.get("alternateInstall") == README_FALLBACK_COMMAND, "Codex platform alternate install matches fallback contract")
    invocation = codex.get("invoke", "")
    require("$sealos" in invocation and DISPLAY_LABEL in invocation, "Codex platform invocation names CLI and app plugin entry")
    require(codex.get("commands") == "supported", "Codex command support matches platform registry")
    evidence = codex.get("evidence", "")
    require(CODEX_EVIDENCE_NATIVE in evidence, "Codex platform evidence records native marketplace proof")
    require(CODEX_EVIDENCE_MANIFEST in evidence, "Codex platform evidence records manifest and repo marketplace")
    require(codex.get("lastVerified") == "2026-06-15", "Codex platform lastVerified is current")


def main() -> int:
    readme = read_text(README_PATH)
    root_plugin = load_json_object(ROOT_PLUGIN_PATH)
    plugin = load_json_object(PLUGIN_PATH)
    marketplace = load_json_object(MARKETPLACE_PATH)
    root_marketplace = load_json_object(ROOT_MARKETPLACE_PATH)
    platforms = load_json_object(PLATFORMS_PATH)

    require(README_PATH.is_file(), "README.md exists")
    require(ROOT_PLUGIN_PATH.is_file(), "root plugin.json exists")
    require(PLUGIN_PATH.is_file(), "Codex plugin manifest exists")
    require(ROOT_MARKETPLACE_PATH.is_file(), "root marketplace.json exists")
    require_readme_contract(readme)
    require_manifest_contract(root_plugin, plugin)
    require_plugin_source_link()
    require_plugin_payload(PLUGIN_SOURCE_LINK, "Codex marketplace source")
    require(plugin.get("name") == PLUGIN_ID, "Codex plugin name is sealos")
    require(plugin.get("version") == "1.0.0", "Codex plugin version is current")
    require(plugin.get("skills") == SKILLS_SOURCE, "Codex plugin points to root skills directory")
    require((ROOT / "skills").is_dir(), "skills directory exists")

    interface = optional_object(plugin, "interface", "Codex plugin interface")
    require(interface.get("displayName") == DISPLAY_LABEL, "Codex display name is Sealos")
    require(interface.get("category") == "Coding", "Codex category is Coding")
    require(interface.get("brandColor") == "#15B8A6", "Codex brand color is set")
    default_prompts = require_list(interface.get("defaultPrompt", []), "Codex default prompts")
    capabilities = require_list(interface.get("capabilities", []), "Codex capabilities")
    require(len(default_prompts) <= 3, "Codex default prompts are limited to 3")
    require("Interactive" in capabilities, "Codex capabilities include Interactive")
    require("Read" in capabilities, "Codex capabilities include Read")
    require("Write" in capabilities, "Codex capabilities include Write")
    require_relative_path(interface.get("composerIcon", ""), "composerIcon")
    require_relative_path(interface.get("logo", ""), "logo")

    require_codex_marketplace_contract(marketplace)
    require_root_marketplace_contract(root_marketplace, plugin)
    require_platform_codex_contract(platforms)

    print("Sealos Codex plugin integration validation passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
