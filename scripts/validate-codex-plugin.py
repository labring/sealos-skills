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


def load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        fail(f"missing {path.relative_to(ROOT)}")
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON in {path.relative_to(ROOT)}: {exc}")


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        fail(f"missing {path.relative_to(ROOT)}")


def require(condition: bool, message: str) -> None:
    if not condition:
        fail(message)
    print(f"PASS: {message}")


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


def require_readme_contract(readme: str) -> None:
    command_positions = []
    for command in README_NATIVE_COMMANDS:
        position = readme.find(command)
        command_positions.append(position)
        require(position >= 0, f"README includes native Codex command: {command}")
    require(
        command_positions == sorted(command_positions),
        "README lists native Codex commands in canonical order",
    )
    require(README_FALLBACK_COMMAND in readme, "README includes fallback Codex npx install command")
    for token in (REPOSITORY_SLUG, PLUGIN_SELECTOR, "$sealos", DISPLAY_LABEL):
        require(token in readme, f"README includes canonical identity token: {token}")


def require_manifest_contract(root_plugin: dict, codex_plugin: dict) -> None:
    require_manifest_parity(root_plugin, codex_plugin)
    for label, manifest in (("root plugin.json", root_plugin), ("Codex plugin manifest", codex_plugin)):
        require(manifest.get("name") == PLUGIN_ID, f"{label} uses canonical plugin id")
        require(manifest.get("homepage") == REPOSITORY_URL, f"{label} uses canonical homepage")
        require(manifest.get("repository") == REPOSITORY_URL, f"{label} uses canonical repository")
        require(manifest.get("skills") == SKILLS_SOURCE, f"{label} points to root skills directory")
        require(
            manifest.get("interface", {}).get("displayName") == DISPLAY_LABEL,
            f"{label} uses canonical display label",
        )


def require_plugin_source_link() -> None:
    require(PLUGIN_SOURCE_LINK.is_symlink(), "Codex marketplace plugin source is a symlink")
    require(PLUGIN_SOURCE_LINK.resolve() == ROOT, "Codex marketplace plugin source resolves to repository root")


def require_plugin_payload(root: Path, label: str) -> None:
    for relative_path in REQUIRED_PLUGIN_PAYLOAD_PATHS:
        require((root / relative_path).exists(), f"{label} payload contains {relative_path}")


def require_codex_marketplace_contract(marketplace: dict) -> None:
    require(marketplace.get("name") == PLUGIN_ID, "Codex marketplace uses canonical marketplace id")
    require(
        marketplace.get("interface", {}).get("displayName") == DISPLAY_LABEL,
        "Codex marketplace uses canonical display label",
    )
    plugins = marketplace.get("plugins", [])
    require(len(plugins) == 1, "Codex marketplace has one plugin entry")
    entry = plugins[0]
    require(entry.get("name") == PLUGIN_ID, "Codex marketplace entry names Sealos")
    require(entry.get("source", {}).get("source") == "local", "Codex marketplace uses local source")
    require(
        entry.get("source", {}).get("path") == CODEX_MARKETPLACE_SOURCE,
        "Codex marketplace points at repo-root plugin source",
    )
    require(entry.get("policy", {}).get("installation") == "AVAILABLE", "Codex marketplace installation policy is available")
    require(entry.get("policy", {}).get("authentication") == "ON_INSTALL", "Codex marketplace authentication policy is on install")
    require(entry.get("category") == "Coding", "Codex marketplace category is Coding")


def require_root_marketplace_contract(root_marketplace: dict, codex_plugin: dict) -> None:
    require(root_marketplace.get("name") == PLUGIN_ID, "root marketplace uses canonical marketplace id")
    require(
        root_marketplace.get("metadata", {}).get("repository") == REPOSITORY_URL,
        "root marketplace uses canonical repository URL",
    )
    plugins = root_marketplace.get("plugins", [])
    require(len(plugins) == 1, "root marketplace has one plugin entry")
    entry = plugins[0]
    require(entry.get("name") == PLUGIN_ID, "root marketplace entry uses canonical plugin id")
    require(entry.get("source") == ROOT_MARKETPLACE_SOURCE, "root marketplace entry points to repository root")
    require(entry.get("commands") == ROOT_MARKETPLACE_COMMANDS, "root marketplace entry points to commands directory")
    require(entry.get("version") == codex_plugin.get("version"), "root marketplace version matches Codex manifest")


def require_platform_codex_contract(platforms: dict) -> None:
    codex_entries = [platform for platform in platforms.get("platforms", []) if platform.get("id") == CODEX_PLATFORM_ID]
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
    root_plugin = load_json(ROOT_PLUGIN_PATH)
    plugin = load_json(PLUGIN_PATH)
    marketplace = load_json(MARKETPLACE_PATH)
    root_marketplace = load_json(ROOT_MARKETPLACE_PATH)
    platforms = load_json(PLATFORMS_PATH)

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

    interface = plugin.get("interface", {})
    require(interface.get("displayName") == DISPLAY_LABEL, "Codex display name is Sealos")
    require(interface.get("category") == "Coding", "Codex category is Coding")
    require(interface.get("brandColor") == "#15B8A6", "Codex brand color is set")
    require(len(interface.get("defaultPrompt", [])) <= 3, "Codex default prompts are limited to 3")
    require("Interactive" in interface.get("capabilities", []), "Codex capabilities include Interactive")
    require("Read" in interface.get("capabilities", []), "Codex capabilities include Read")
    require("Write" in interface.get("capabilities", []), "Codex capabilities include Write")
    require_relative_path(interface.get("composerIcon", ""), "composerIcon")
    require_relative_path(interface.get("logo", ""), "logo")

    require_codex_marketplace_contract(marketplace)
    require_root_marketplace_contract(root_marketplace, plugin)
    require_platform_codex_contract(platforms)

    print("Sealos Codex plugin integration validation passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
