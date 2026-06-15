#!/usr/bin/env python3
"""Validate Sealos Codex plugin integration files."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROOT_PLUGIN_PATH = ROOT / "plugin.json"
PLUGIN_PATH = ROOT / ".codex-plugin" / "plugin.json"
MARKETPLACE_PATH = ROOT / ".agents" / "plugins" / "marketplace.json"
PLATFORMS_PATH = ROOT / "distribution" / "platforms.json"
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


def main() -> int:
    root_plugin = load_json(ROOT_PLUGIN_PATH)
    plugin = load_json(PLUGIN_PATH)
    marketplace = load_json(MARKETPLACE_PATH)
    platforms = load_json(PLATFORMS_PATH)

    require(ROOT_PLUGIN_PATH.is_file(), "root plugin.json exists")
    require_manifest_parity(root_plugin, plugin)
    require(plugin.get("name") == "sealos", "Codex plugin name is sealos")
    require(plugin.get("version") == "1.0.0", "Codex plugin version is current")
    require(plugin.get("skills") == "./skills/", "Codex plugin points to root skills directory")
    require((ROOT / "skills").is_dir(), "skills directory exists")

    interface = plugin.get("interface", {})
    require(interface.get("displayName") == "Sealos", "Codex display name is Sealos")
    require(interface.get("category") == "Coding", "Codex category is Coding")
    require(interface.get("brandColor") == "#15B8A6", "Codex brand color is set")
    require(len(interface.get("defaultPrompt", [])) <= 3, "Codex default prompts are limited to 3")
    require("Interactive" in interface.get("capabilities", []), "Codex capabilities include Interactive")
    require("Read" in interface.get("capabilities", []), "Codex capabilities include Read")
    require("Write" in interface.get("capabilities", []), "Codex capabilities include Write")
    require_relative_path(interface.get("composerIcon", ""), "composerIcon")
    require_relative_path(interface.get("logo", ""), "logo")

    plugins = marketplace.get("plugins", [])
    require(len(plugins) == 1, "Codex marketplace has one plugin entry")
    entry = plugins[0]
    require(entry.get("name") == "sealos", "Codex marketplace entry names Sealos")
    require(entry.get("source", {}).get("source") == "local", "Codex marketplace uses local source")
    require(entry.get("source", {}).get("path") == "./", "Codex marketplace points at repo root")
    require(entry.get("policy", {}).get("installation") == "AVAILABLE", "Codex marketplace installation policy is available")
    require(entry.get("policy", {}).get("authentication") == "ON_INSTALL", "Codex marketplace authentication policy is on install")
    require(entry.get("category") == "Coding", "Codex marketplace category is Coding")

    codex_entries = [p for p in platforms.get("platforms", []) if p.get("id") == "codex"]
    require(len(codex_entries) == 1, "platform registry includes Codex")
    require("codex_manifest+repo_marketplace" in codex_entries[0].get("evidence", ""), "Codex platform evidence records manifest and repo marketplace")
    require(codex_entries[0].get("commands") == "supported", "Codex command support matches platform registry")

    print("Sealos Codex plugin integration validation passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
