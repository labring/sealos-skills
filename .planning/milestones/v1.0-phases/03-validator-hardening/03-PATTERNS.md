# Phase 3: Validator Hardening - Pattern Map

**Mapped:** 2026-06-15
**Files analyzed:** 1
**Analogs found:** 1 / 1

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `scripts/validate-codex-plugin.py` | utility | file-I/O, transform | `scripts/validate-codex-plugin.py` | exact |

## Pattern Assignments

### `scripts/validate-codex-plugin.py` (utility, file-I/O, transform)

**Analog:** `scripts/validate-codex-plugin.py`

**Imports and root path pattern** (lines 1-15):
```python
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
PLATFORMS_PATH = ROOT / "distribution" / "platforms.json"
```

**Apply to Phase 3:**
- Add new repository-level path constants beside the existing constants.
- Recommended constants: `README_PATH = ROOT / "README.md"` and `ROOT_MARKETPLACE_PATH = ROOT / "marketplace.json"`.
- Add canonical contract constants near `PLUGIN_PARITY_KEYS`, keeping values centralized and visible.

**Payload and parity constant pattern** (lines 16-35):
```python
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
```

**Apply to Phase 3:**
- Use tuples for canonical command sequences and parity key lists.
- Recommended constants:
```python
CANONICAL_REPOSITORY = "labring/sealos-skills"
CANONICAL_REPOSITORY_URL = "https://github.com/labring/sealos-skills"
CANONICAL_PLUGIN_ID = "sealos"
CANONICAL_INSTALL_SELECTOR = "sealos@sealos"
CANONICAL_DISPLAY_NAME = "Sealos"
README_NATIVE_COMMANDS = (
    "codex plugin marketplace add labring/sealos-skills",
    "codex plugin add sealos@sealos",
)
README_FALLBACK_COMMAND = "npx plugins add https://github.com/labring/sealos-skills --target codex"
```

**Error and PASS output pattern** (lines 38-55):
```python
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
```

**Apply to Phase 3:**
- Every new check should use `require(condition, "specific invariant")`.
- JSON syntax coverage should come from `load_json()` for `.codex-plugin/plugin.json`, root `plugin.json`, `.agents/plugins/marketplace.json`, root `marketplace.json`, and `distribution/platforms.json`.
- README file access should mirror `load_json()` with UTF-8 reads and `fail(f"missing {path.relative_to(ROOT)}")` on missing files if factored into a helper.

**Path handling pattern** (lines 58-61):
```python
def require_relative_path(value: str, field: str) -> None:
    require(isinstance(value, str) and value.startswith("./"), f"{field} uses ./ relative path")
    target = ROOT / value[2:]
    require(target.exists(), f"{field} target exists: {value}")
```

**Apply to Phase 3:**
- Keep repository-relative paths rooted through `ROOT`.
- Preserve exact string checks for stable metadata paths such as `./skills/` and `./plugins/sealos`.
- Use `path.relative_to(ROOT)` in failure messages for maintainer-readable paths.

**Parity helper pattern** (lines 64-70):
```python
def require_manifest_parity(root_plugin: dict, codex_plugin: dict) -> None:
    mismatched = [
        key
        for key in PLUGIN_PARITY_KEYS
        if root_plugin.get(key) != codex_plugin.get(key)
    ]
    require(not mismatched, "root plugin.json matches .codex-plugin/plugin.json key fields")
```

**Apply to Phase 3:**
- Add small `require_*` helpers for each coherent contract area.
- Recommended helpers:
```python
def require_readme_commands(readme: str) -> None:
    first = readme.find(README_NATIVE_COMMANDS[0])
    second = readme.find(README_NATIVE_COMMANDS[1])
    require(first >= 0, "README includes Codex marketplace add command")
    require(second >= 0, "README includes Codex plugin add command")
    require(first < second, "README lists native Codex install commands in canonical order")
    require(README_FALLBACK_COMMAND in readme, "README includes fallback npx Codex install command")
```
- Use direct indexing only after a preceding shape check has established the expected list length.

**Existing manifest and payload checks** (lines 83-108):
```python
root_plugin = load_json(ROOT_PLUGIN_PATH)
plugin = load_json(PLUGIN_PATH)
marketplace = load_json(MARKETPLACE_PATH)
platforms = load_json(PLATFORMS_PATH)

require(ROOT_PLUGIN_PATH.is_file(), "root plugin.json exists")
require(PLUGIN_PATH.is_file(), "Codex plugin manifest exists")
require_manifest_parity(root_plugin, plugin)
require_plugin_source_link()
require_plugin_payload(PLUGIN_SOURCE_LINK, "Codex marketplace source")
require(plugin.get("name") == "sealos", "Codex plugin name is sealos")
require(plugin.get("version") == "1.0.0", "Codex plugin version is current")
require(plugin.get("skills") == "./skills/", "Codex plugin points to root skills directory")
require((ROOT / "skills").is_dir(), "skills directory exists")

interface = plugin.get("interface", {})
require(interface.get("displayName") == "Sealos", "Codex display name is Sealos")
```

**Apply to Phase 3:**
- Load `readme = README_PATH.read_text(encoding="utf-8")` and `root_marketplace = load_json(ROOT_MARKETPLACE_PATH)` at the top of `main()`.
- Replace hardcoded identity strings with canonical constants only where it improves readability.
- Add explicit checks for `repository`, `homepage`, display name, and `skills` parity across `.codex-plugin/plugin.json` and root `plugin.json`.

**Marketplace and platform registry checks** (lines 110-123):
```python
plugins = marketplace.get("plugins", [])
require(len(plugins) == 1, "Codex marketplace has one plugin entry")
entry = plugins[0]
require(entry.get("name") == "sealos", "Codex marketplace entry names Sealos")
require(entry.get("source", {}).get("source") == "local", "Codex marketplace uses local source")
require(entry.get("source", {}).get("path") == "./plugins/sealos", "Codex marketplace points at repo-root plugin source")
require(entry.get("policy", {}).get("installation") == "AVAILABLE", "Codex marketplace installation policy is available")
require(entry.get("policy", {}).get("authentication") == "ON_INSTALL", "Codex marketplace authentication policy is on install")
require(entry.get("category") == "Coding", "Codex marketplace category is Coding")

codex_entries = [p for p in platforms.get("platforms", []) if p.get("id") == "codex"]
require(len(codex_entries) == 1, "platform registry includes Codex")
require("codex_manifest+repo_marketplace" in codex_entries[0].get("evidence", ""), "Codex platform evidence records manifest and repo marketplace")
require(codex_entries[0].get("commands") == "supported", "Codex command support matches platform registry")
```

**Apply to Phase 3:**
- Keep the list-filter idiom for locating the Codex platform entry.
- Add checks for platform `install`, `alternateInstall`, and invocation copy using canonical constants.
- Add root `marketplace.json` parsing and one-plugin identity checks using the same `plugins = ...`, `require(len(plugins) == 1, ...)`, `entry = plugins[0]` style.
- Keep one `PASS:` line per invariant so drift points are visible.

**Exit and success message pattern** (lines 125-130):
```python
print("Sealos Codex plugin integration validation passed")
return 0


if __name__ == "__main__":
    sys.exit(main())
```

**Apply to Phase 3:**
- Preserve the existing success message.
- Keep `main() -> int` with `sys.exit(main())`.

## Additional Local Analogs

### `skills/docker-to-sealos/scripts/check_consistency.py` (utility, file-I/O, transform)

Use this only for CLI-style return behavior if the validator grows argument parsing later.

**Error handling and return code pattern** (lines 37-79):
```python
def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)

    skill_path = Path(args.skill).resolve()
    if not skill_path.exists():
        print(f"ERROR: skill file not found: {skill_path}")
        return 2
```

```python
    try:
        violations = run_checks(
            skill_path=skill_path,
            references_dir=references_dir,
            registry_path=rules_file,
            only_rules=only_rules or None,
            additional_include_paths=additional_include_paths or None,
        )
    except ValueError as exc:
        print(f"ERROR: {exc}")
        return 2

    if violations:
        print("Consistency check failed with the following issues:")
        for item in violations:
            print(f"- [{item.rule_id}/{item.severity}] {item.path}:{item.line}: {item.message}")
        return 1

    total = len(only_rules) if only_rules else len(REGISTERED_RULES)
    print(f"Consistency check passed ({total} rules).")
    return 0
```

**Planner guidance:**
- Keep Phase 3 inside the current `FAIL:` / `PASS:` validator style.
- Use this analog only if adding future command-line options, because Phase 3 asks for one maintainer gate command with no flags.

### `skills/sealos-deploy/scripts/validate-artifacts.mjs` (utility, file-I/O, transform)

Use this only as the Node JSON-output analog for validation scripts. The Phase 3 target is Python, so this is a partial match.

**Structured failure payload pattern** (lines 28-39):
```javascript
function printAndExit(result, code) {
  console.log(JSON.stringify(result, null, 2))
  process.exit(code)
}

const args = process.argv.slice(2)

if (args.length === 0) {
  printAndExit({
    valid: false,
    error: 'Usage: node validate-artifacts.mjs <file> | <kind> <file> | --dir <work-dir>',
  }, 1)
}
```

**Planner guidance:**
- Do not copy JSON-output behavior into Phase 3.
- The relevant shared convention is deterministic validation plus non-zero exit codes on failure.

## Shared Patterns

### Python Validator Shape
**Source:** `scripts/validate-codex-plugin.py`
**Apply to:** All Phase 3 checks inside `scripts/validate-codex-plugin.py`
```python
ROOT = Path(__file__).resolve().parents[1]

def fail(message: str) -> None:
    print(f"FAIL: {message}")
    raise SystemExit(1)

def require(condition: bool, message: str) -> None:
    if not condition:
        fail(message)
    print(f"PASS: {message}")
```

### JSON Loading and Syntax Failure
**Source:** `scripts/validate-codex-plugin.py`
**Apply to:** `.codex-plugin/plugin.json`, `plugin.json`, `.agents/plugins/marketplace.json`, `marketplace.json`, `distribution/platforms.json`
```python
def load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        fail(f"missing {path.relative_to(ROOT)}")
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON in {path.relative_to(ROOT)}: {exc}")
```

### README Command Ordering
**Source:** Existing Phase 2 assertions from `.planning/phases/03-validator-hardening/03-CONTEXT.md`
**Apply to:** README validation helper in `scripts/validate-codex-plugin.py`
```python
first = readme.find("codex plugin marketplace add labring/sealos-skills")
second = readme.find("codex plugin add sealos@sealos")
require(first >= 0, "README includes Codex marketplace add command")
require(second >= 0, "README includes Codex plugin add command")
require(first < second, "README lists native Codex install commands in canonical order")
require(
    "npx plugins add https://github.com/labring/sealos-skills --target codex" in readme,
    "README includes fallback npx Codex install command",
)
```

### Root-Relative Paths
**Source:** `scripts/validate-codex-plugin.py`
**Apply to:** New manifest, marketplace, README, and platform checks
```python
ROOT = Path(__file__).resolve().parents[1]
target = ROOT / value[2:]
require(target.exists(), f"{field} target exists: {value}")
```

### PASS Output Conventions
**Source:** `scripts/validate-codex-plugin.py`
**Apply to:** Every new invariant
```python
require(plugin.get("skills") == "./skills/", "Codex plugin points to root skills directory")
require(entry.get("source", {}).get("path") == "./plugins/sealos", "Codex marketplace points at repo-root plugin source")
require(codex_entries[0].get("commands") == "supported", "Codex command support matches platform registry")
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| None | - | - | Phase 3 modifies the existing validator, which is its own exact analog. |

## Metadata

**Analog search scope:** `scripts/`, `skills/**/scripts/`
**Files scanned:** 23 validation/check/test scripts listed by `rg --files`
**Pattern extraction date:** 2026-06-15
