#!/usr/bin/env python3
"""Build a Qoder-compatible Sealos plugin ZIP from canonical repository files."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / ".qoder-plugin" / "plugin.json"
PACKAGE_ROOTS = (
    ROOT / ".qoder-plugin",
    ROOT / "skills",
    ROOT / "commands",
    ROOT / "assets",
)
PACKAGE_FILES = (
    ROOT / "qoder.md",
    ROOT / "README.md",
)
IGNORED_NAMES = {".DS_Store", "__pycache__"}
IGNORED_SUFFIXES = {".pyc", ".pyo"}


def should_include(path: Path) -> bool:
    return not any(part in IGNORED_NAMES for part in path.parts) and path.suffix not in IGNORED_SUFFIXES


def package_files() -> list[Path]:
    files = list(PACKAGE_FILES)
    for package_root in PACKAGE_ROOTS:
        files.extend(path for path in package_root.rglob("*") if path.is_file())
    return sorted({path for path in files if should_include(path)})


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=ROOT / "dist",
        help="Output directory (default: <repo>/dist)",
    )
    args = parser.parse_args()

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    archive_name = f"{manifest['name']}-{manifest['version']}.zip"
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    archive_path = output_dir / archive_name

    with ZipFile(archive_path, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for path in package_files():
            archive.write(path, path.relative_to(ROOT).as_posix())

    print(archive_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
