#!/usr/bin/env python3
"""Deterministic Docker Compose -> Sealos template converter."""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import shlex
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Set, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

import yaml

from path_converter import path_to_vn_name


DB_TYPE_PATTERNS: Dict[str, Tuple[str, ...]] = {
    "postgres": ("postgres", "postgresql", "postgis", "timescaledb"),
    "mysql": ("mysql", "mariadb", "apecloud-mysql"),
    "mongodb": (
        "mongo",
        "mongodb",
        "mongodb-community-server",
        "mongodb-sharded",
        "percona-server-mongodb",
    ),
    "redis": ("redis", "valkey"),
    "kafka": ("kafka",),
}
SPECIAL_DB_RESOURCE_TYPES = {"postgres", "mysql", "mongodb", "redis", "kafka"}
EDGE_GATEWAY_SERVICE_HINTS: Tuple[str, ...] = ("traefik",)
EDGE_GATEWAY_IMAGE_HINTS: Tuple[str, ...] = ("traefik",)
EDGE_GATEWAY_PORT_HINTS = {80, 443}
EDGE_GATEWAY_COMMAND_HINTS: Tuple[str, ...] = (
    "--entrypoints.",
    "--providers.",
    "--api.dashboard",
    "--ping",
    "traefik",
)

DB_FQDN_BY_TYPE: Dict[str, str] = {
    "postgres": "${{ defaults.app_name }}-pg-postgresql.${{ SEALOS_NAMESPACE }}.svc.cluster.local",
    "mysql": "${{ defaults.app_name }}-mysql-mysql.${{ SEALOS_NAMESPACE }}.svc.cluster.local",
    "mongodb": "${{ defaults.app_name }}-mongo-mongodb.${{ SEALOS_NAMESPACE }}.svc.cluster.local",
    "redis": "${{ defaults.app_name }}-redis-redis-redis.${{ SEALOS_NAMESPACE }}.svc.cluster.local",
    "kafka": "${{ defaults.app_name }}-broker-kafka.${{ SEALOS_NAMESPACE }}.svc.cluster.local",
}
DB_SECRET_NAME_BY_TYPE: Dict[str, str] = {
    "postgres": "${{ defaults.app_name }}-pg-conn-credential",
    "mysql": "${{ defaults.app_name }}-mysql-conn-credential",
    "mongodb": "${{ defaults.app_name }}-mongo-mongodb-account-root",
    "redis": "${{ defaults.app_name }}-redis-redis-account-default",
    "kafka": "${{ defaults.app_name }}-broker-account-admin",
}
DB_ENV_HINTS_BY_TYPE: Dict[str, Tuple[str, ...]] = {
    "postgres": ("POSTGRES", "POSTGRESQL", "PG"),
    "mysql": ("MYSQL", "MARIADB"),
    "mongodb": ("MONGO", "MONGODB"),
    "redis": ("REDIS",),
    "kafka": ("KAFKA",),
}

OBJECT_STORAGE_BASE_ENV_NAMES = {
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "BACKEND_STORAGE_MINIO_EXTERNAL_ENDPOINT",
}
OBJECT_STORAGE_BUCKET_ENV_NAME = "S3_BUCKET"
COMPOSE_REFERENCE_RE = re.compile(r"\$\{[^}]+\}")
INVALID_NAME_RE = re.compile(r"[^a-z0-9]+")
MODE_SUFFIXES = {"ro", "rw", "z", "Z", "cached", "delegated", "consistent"}
TLS_TERMINATION_PORT = 443
TLS_CERT_DIR_NAMES = {"ssl", "cert", "certs", "tls"}
TLS_CERT_MOUNT_EXACT_PATHS = {
    "/etc/nginx/ssl",
    "/etc/ssl",
    "/etc/certs",
    "/etc/tls",
    "/ssl",
    "/certs",
    "/tls",
}
WEBSOCKET_FIELD_HINTS = (
    "websocket",
    "web-socket",
    "web_socket",
    "ws",
    "wss",
    "devtools",
    "chrome_devtools",
    "cdp",
    "debugger",
    "socketio",
)
WEBSOCKET_VALUE_HINTS = (
    "ws://",
    "wss://",
    "websocket",
    "web-socket",
    "chrome devtools",
    "devtools",
    "cdp",
    "socket.io",
)
EXPLICIT_VERSION_TAG_RE = re.compile(
    r"^v?(?P<major>\d+)\.(?P<minor>\d+)\.(?P<patch>\d+)(?:[-+](?P<suffix>[0-9A-Za-z][0-9A-Za-z._-]*))?$"
)
FLOATING_NUMERIC_TAG_RE = re.compile(r"^v?\d+(?:\.\d+)?$")
FLOATING_ALIAS_TAGS = {"latest", "stable", "main", "master", "edge", "nightly", "dev"}
COMPOSE_BRACED_VAR_RE = re.compile(r"\$\{([^}]+)\}")
COMPOSE_SIMPLE_VAR_RE = re.compile(r"\$([A-Za-z_][A-Za-z0-9_]*)")
SEALOS_CPU_REQUEST_BY_LIMIT = {
    "100m": "10m",
    "200m": "20m",
    "500m": "50m",
    "1": "100m",
    "2": "200m",
    "3": "300m",
    "4": "400m",
    "8": "800m",
}
SEALOS_MEMORY_REQUEST_BY_LIMIT = {
    "128Mi": "12Mi",
    "256Mi": "25Mi",
    "512Mi": "51Mi",
    "1024Mi": "102Mi",
    "2048Mi": "204Mi",
    "4096Mi": "409Mi",
    "8192Mi": "819Mi",
    "16384Mi": "1638Mi",
}
DEFAULT_RESOURCE_LIMITS = {"cpu": "200m", "memory": "256Mi"}
DEFAULT_RESOURCE_REQUESTS = {
    "cpu": SEALOS_CPU_REQUEST_BY_LIMIT[DEFAULT_RESOURCE_LIMITS["cpu"]],
    "memory": SEALOS_MEMORY_REQUEST_BY_LIMIT[DEFAULT_RESOURCE_LIMITS["memory"]],
}
DB_COMPONENT_RESOURCE_LIMITS = {"cpu": "500m", "memory": "512Mi"}
DB_COMPONENT_RESOURCE_REQUESTS = {
    "cpu": SEALOS_CPU_REQUEST_BY_LIMIT[DB_COMPONENT_RESOURCE_LIMITS["cpu"]],
    "memory": SEALOS_MEMORY_REQUEST_BY_LIMIT[DB_COMPONENT_RESOURCE_LIMITS["memory"]],
}
ZH_CHAR_RE = re.compile(r"[\u3400-\u4DBF\u4E00-\u9FFF]")
EN_DESCRIPTION_REWRITE_PATTERNS: Tuple[Tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(
            r"\bopen[- ]source identity and access management platform for authentication and authorization\b"
        ),
        "开源身份与访问管理平台，提供认证与授权能力",
    ),
)
EN_DESCRIPTION_TERM_REPLACEMENTS: Tuple[Tuple[str, str], ...] = (
    ("identity and access management", "身份与访问管理"),
    ("authentication and authorization", "认证与授权"),
    ("open-source", "开源"),
    ("open source", "开源"),
    ("self-hosted", "可自托管"),
    ("platform", "平台"),
    ("service", "服务"),
    ("application", "应用"),
    ("tool", "工具"),
    ("database", "数据库"),
    ("monitoring", "监控"),
    ("analytics", "分析"),
    ("authentication", "认证"),
    ("authorization", "授权"),
    ("for", "用于"),
    ("with", "支持"),
    ("and", "与"),
)
ALLOWED_TEMPLATE_CATEGORIES = {
    "tool",
    "ai",
    "game",
    "database",
    "low-code",
    "monitor",
    "dev-ops",
    "blog",
    "storage",
    "frontend",
    "backend",
}
CATEGORY_ALIASES = {
    "security": "backend",
    "devops": "dev-ops",
    "dev-ops": "dev-ops",
    "dev_ops": "dev-ops",
    "ml": "ai",
    "machine-learning": "ai",
}
TEMPLATE_README_BASE = "https://raw.githubusercontent.com/labring-actions/templates/kb-0.9/template"
SVGL_API_BASE = "https://api.svgl.app"
SVGL_REQUEST_TIMEOUT = 10
SVGL_LOGO_EXT = "svg"
HTTP_INGRESS_ANNOTATIONS = {
    "kubernetes.io/ingress.class": "nginx",
    "nginx.ingress.kubernetes.io/proxy-body-size": "32m",
    "nginx.ingress.kubernetes.io/server-snippet": (
        "client_header_buffer_size 64k;\n"
        "large_client_header_buffers 4 128k;"
    ),
    "nginx.ingress.kubernetes.io/ssl-redirect": "true",
    "nginx.ingress.kubernetes.io/backend-protocol": "HTTP",
    "nginx.ingress.kubernetes.io/client-body-buffer-size": "64k",
    "nginx.ingress.kubernetes.io/proxy-buffer-size": "64k",
    "nginx.ingress.kubernetes.io/proxy-send-timeout": "300",
    "nginx.ingress.kubernetes.io/proxy-read-timeout": "300",
    "nginx.ingress.kubernetes.io/configuration-snippet": (
        "if ($request_uri ~* \\.(js|css|gif|jpe?g|png)) {\n"
        "  expires 30d;\n"
        "  add_header Cache-Control \"public\";\n"
        "}"
    ),
}
WEBSOCKET_INGRESS_ANNOTATIONS = {
    "kubernetes.io/ingress.class": "nginx",
    "nginx.ingress.kubernetes.io/proxy-body-size": "32m",
    "nginx.ingress.kubernetes.io/proxy-read-timeout": "3600",
    "nginx.ingress.kubernetes.io/proxy-send-timeout": "3600",
    "nginx.ingress.kubernetes.io/backend-protocol": "WS",
    "nginx.ingress.kubernetes.io/ssl-redirect": "true",
}
COMPOSE_DURATION_PART_RE = re.compile(r"(\d+)(ns|us|ms|s|m|h)")
URL_IN_COMMAND_RE = re.compile(r"https?://[^\s\"'`]+")

OFFICIAL_HEALTH_HTTP_PROFILES: Dict[str, Dict[str, Any]] = {
    "goauthentik/server": {
        "liveness_path": "/-/health/live/",
        "readiness_path": "/-/health/ready/",
        "startup_path": "/-/health/ready/",
        "preferred_port": 9000,
        "scheme": "HTTP",
        "initialDelaySeconds": 30,
        "periodSeconds": 10,
        "timeoutSeconds": 5,
        "failureThreshold": 6,
        "startupPeriodSeconds": 10,
        "startupTimeoutSeconds": 5,
        "startupFailureThreshold": 90,
    },
    "ghcr.io/danny-avila/librechat-rag-api-dev-lite": {
        "liveness_path": "/health",
        "readiness_path": "/health",
        "startup_path": "/health",
        "preferred_port": 8000,
        "scheme": "HTTP",
        "initialDelaySeconds": 10,
        "periodSeconds": 10,
        "timeoutSeconds": 5,
        "failureThreshold": 6,
        "startupPeriodSeconds": 10,
        "startupTimeoutSeconds": 5,
        "startupFailureThreshold": 30,
    },
    "ghcr.io/clickhouse/librechat-admin-panel": {
        "liveness_path": "/health",
        "readiness_path": "/health",
        "startup_path": "/health",
        "preferred_port": 3000,
        "scheme": "HTTP",
        "initialDelaySeconds": 10,
        "periodSeconds": 10,
        "timeoutSeconds": 5,
        "failureThreshold": 6,
        "startupPeriodSeconds": 10,
        "startupTimeoutSeconds": 5,
        "startupFailureThreshold": 30,
    },
}
OFFICIAL_HEALTH_WORKER_PROFILES: Dict[str, Dict[str, Any]] = {
    "goauthentik/server": {
        "command": ["sh", "-c", "ak healthcheck"],
        "startup_command": ["sh", "-c", "ak healthcheck"],
        "initialDelaySeconds": 30,
        "periodSeconds": 10,
        "timeoutSeconds": 5,
        "failureThreshold": 6,
        "startupPeriodSeconds": 10,
        "startupTimeoutSeconds": 5,
        "startupFailureThreshold": 90,
    }
}

# --- env semantics guards (host rewrite must never touch these) ---

# Env keys whose value is a database/driver NAME, never a network host.
ENV_KEY_HOST_REWRITE_FORBIDDEN_RE = re.compile(
    r"(?:^|_)(?:NAME|DB|DATABASE|DRIVER|DIALECT|ENGINE|VENDOR|ADAPTER|CLIENT|SCHEME|PROTOCOL|TYPE)$"
)

# Values that are database driver/engine identifiers, never hosts.
DB_DRIVER_NAME_VALUES = {
    "postgres",
    "postgresql",
    "pgsql",
    "pg",
    "mysql",
    "mysql2",
    "mariadb",
    "redis",
    "valkey",
    "mongo",
    "mongodb",
    "sqlite",
    "sqlite3",
    "better-sqlite3",
    "kafka",
    "mssql",
}

# --- public URL / host derivation ---

# Env keys that carry the app's public browser URL (scheme + host).
PUBLIC_URL_ENV_KEYS = {
    "BASE_URL",
    "APP_URL",
    "SITE_URL",
    "PUBLIC_URL",
    "EXTERNAL_URL",
    "WEB_URL",
    "ROOT_URL",
    "SERVER_URL",
    "APPLICATION_URL",
    "NEXTAUTH_URL",
    "NEXT_PUBLIC_APP_URL",
    "PUBLIC_BASE_URL",
    "WEBUI_URL",
}

# Env keys that carry the public host only (no scheme).
PUBLIC_HOST_ENV_KEYS = {
    "DOMAIN",
    "DEFAULT_DOMAIN",
    "APP_DOMAIN",
    "PUBLIC_DOMAIN",
    "SERVER_NAME",
    "VIRTUAL_HOST",
    "HOSTNAME_PUBLIC",
}

# Existing values that clearly need replacement by the real public location.
PUBLIC_URL_PLACEHOLDER_RE = re.compile(
    r"^$|^(?:https?://)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|example\.(?:com|org|net)|.*\.example\.(?:com|org|net))(?::\d+)?/?$",
    re.IGNORECASE,
)

PUBLIC_URL_TEMPLATE = "https://${{ defaults.app_host }}.${{ SEALOS_CLOUD_DOMAIN }}"
PUBLIC_HOST_TEMPLATE = "${{ defaults.app_host }}.${{ SEALOS_CLOUD_DOMAIN }}"

# --- bootstrap credentials and generated secrets ---

# App-level deployer-selected bootstrap identity/credential envs.
BOOTSTRAP_CRED_ENV_RE = re.compile(
    r"^(?:[A-Z0-9]+_)*(?:ADMIN|ROOT|INITIAL_ADMIN|SUPERUSER|SUPER_ADMIN)_?(?:USER|USERNAME|EMAIL|MAIL|PASSWORD|PASS|PWD)$"
)

BOOTSTRAP_CRED_IDENTITY_RE = re.compile(r"(?:USER|USERNAME|EMAIL|MAIL)$")

# Keys whose literal compose value is a to-be-generated app secret.
GENERATED_SECRET_ENV_RE = re.compile(
    r"(?:^|_)(?:SECRET|SECRET_KEY|SECRETKEY|JWT_SECRET|SESSION_SECRET|COOKIE_SECRET|ENCRYPTION_KEY|APP_KEY|API_SECRET|SIGNING_KEY|AUTH_SECRET|SALT|MASTER_KEY)$"
)

# Placeholder-looking literal values that must never ship in a template.
PLACEHOLDER_SECRET_VALUE_RE = re.compile(
    r"^(?:|x+|\*+|change ?me.*|replace.*|your.*|example.*|sample.*|dummy.*|test\d*|secret\d*|password\d*|admin\d*|1234\d*|abc\d*|token\d*|key\d*|placeholder.*|insecure.*|please.*|todo.*)$",
    re.IGNORECASE,
)

# --- database wait gates (initContainers) ---

# command receives HOST/PORT via env; secret-backed when the db secret carries them
DB_WAIT_GATE_BY_TYPE: Dict[str, Dict[str, Any]] = {
    "postgres": {
        "image": "postgres:16.4-alpine",
        "command": [
            "sh",
            "-c",
            'for i in $(seq 1 150); do pg_isready -h "$DB_GATE_HOST" -p "$DB_GATE_PORT" >/dev/null 2>&1 && exit 0; sleep 2; done; echo "timed out waiting for postgresql" >&2; exit 1',
        ],
        "host_from_secret": True,
        "default_port": "5432",
    },
    "mysql": {
        "image": "busybox:1.36.1",
        "command": [
            "sh",
            "-c",
            'for i in $(seq 1 150); do nc -z -w 2 "$DB_GATE_HOST" "$DB_GATE_PORT" >/dev/null 2>&1 && exit 0; sleep 2; done; echo "timed out waiting for mysql" >&2; exit 1',
        ],
        "host_from_secret": True,
        "default_port": "3306",
    },
    "redis": {
        "image": "redis:7.2.7-alpine",
        "command": [
            "sh",
            "-c",
            'for i in $(seq 1 150); do OUT="$(redis-cli -h "$DB_GATE_HOST" -p "$DB_GATE_PORT" ping 2>&1)"; case "$OUT" in *PONG*|*NOAUTH*|*Authentication*) exit 0;; esac; sleep 2; done; echo "timed out waiting for redis" >&2; exit 1',
        ],
        "host_from_secret": False,
        "default_port": "6379",
    },
    "mongodb": {
        "image": "busybox:1.36.1",
        "command": [
            "sh",
            "-c",
            'for i in $(seq 1 150); do nc -z -w 2 "$DB_GATE_HOST" "$DB_GATE_PORT" >/dev/null 2>&1 && exit 0; sleep 2; done; echo "timed out waiting for mongodb" >&2; exit 1',
        ],
        "host_from_secret": False,
        "default_port": "27017",
    },
    "kafka": {
        "image": "busybox:1.36.1",
        "command": [
            "sh",
            "-c",
            'for i in $(seq 1 150); do nc -z -w 2 "$DB_GATE_HOST" "$DB_GATE_PORT" >/dev/null 2>&1 && exit 0; sleep 2; done; echo "timed out waiting for kafka" >&2; exit 1',
        ],
        "host_from_secret": False,
        "default_port": "9092",
    },
}

DB_WAIT_GATE_RESOURCES = {
    "limits": {"cpu": "100m", "memory": "128Mi"},
    "requests": {"cpu": "10m", "memory": "12Mi"},
}

# --- resource sizing hints ---

# Image/basename fingerprints that need a larger boot-time tier than the
# 200m/256Mi personal low-load default (JVM heap, boot-time asset builds).
HEAVY_RUNTIME_IMAGE_HINTS: Tuple[Tuple[re.Pattern[str], Dict[str, str]], ...] = (
    (
        re.compile(r"(?:^|[/-])(?:jenkins|sonarqube|keycloak|kestra|zulip|gitlab)(?:[/:@-]|$)", re.IGNORECASE),
        {"cpu": "1", "memory": "2048Mi"},
    ),
    (
        re.compile(r"(?:java|jdk|jre|tomcat|spring)", re.IGNORECASE),
        {"cpu": "1", "memory": "1024Mi"},
    ),
    (
        re.compile(r"(?:^|[/-])(?:nodebb|discourse|mastodon|openproject)(?:[/:@-]|$)", re.IGNORECASE),
        {"cpu": "1", "memory": "2048Mi"},
    ),
)

# --- probes without healthcheck evidence ---

DEFAULT_TCP_READINESS = {
    "periodSeconds": 10,
    "timeoutSeconds": 3,
    "failureThreshold": 3,
}

DEFAULT_TCP_STARTUP = {
    "periodSeconds": 10,
    "timeoutSeconds": 3,
    "failureThreshold": 30,
}

# Floor for compose start_period-derived startup windows (seconds).
STARTUP_WINDOW_FLOOR_SECONDS = 120
STARTUP_FAILURE_THRESHOLD_FLOOR = 4

SAFE_DB_NAME_RE = re.compile(r"^[A-Za-z0-9_-]+$")
DEPLOY_GITHUB_REPO_RE = re.compile(r"^https?://github\.com/([^/]+)/([^/]+?)(?:\.git)?/?$", re.IGNORECASE)
RESOURCE_HINT_RE = re.compile(r"^([^=]+)=([^,]+),(.+)$")


@dataclass(frozen=True)
class MetadataOptions:
    app_name: str
    title: str
    description: str
    url: str
    git_repo: str
    author: str
    categories: Sequence[str]
    repo_raw_base: str
    logo_ext: str = "png"


@dataclass(frozen=True)
class ServiceShape:
    ports: Tuple[int, ...]
    mount_paths: Tuple[str, ...]


@dataclass(frozen=True)
class ConfigMount:
    target: str
    key: str
    content: str


# One image entry per reference from resolve-images.ts output.
ImageResolutionMap = Dict[str, Dict[str, Any]]


@dataclass(frozen=True)
class EnvBuildResult:
    entries: List[Dict[str, Any]]
    inputs: Dict[str, Dict[str, Any]]
    defaults: Dict[str, Dict[str, str]]
    # db_type -> database name referenced by the app (from URL path or *_NAME family member).
    db_databases: Dict[str, str]
    report_items: List[Dict[str, Any]]


@dataclass(frozen=True)
class PodSecurityContextResult:
    context: Optional[Dict[str, Any]]
    unresolved_user: Optional[str]


def new_conversion_report(profile: str) -> Dict[str, Any]:
    generated_at = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return {
        "generated_at": generated_at,
        "profile": profile,
        "items": [],
        "inputs_added": [],
        "defaults_added": [],
    }


def db_component_resources() -> Dict[str, Dict[str, str]]:
    return {
        "limits": dict(DB_COMPONENT_RESOURCE_LIMITS),
        "requests": dict(DB_COMPONENT_RESOURCE_REQUESTS),
    }


def normalize_k8s_name(raw: str) -> str:
    value = INVALID_NAME_RE.sub("-", raw.strip().lower()).strip("-")
    if not value:
        raise ValueError(f"unable to derive a valid name from: {raw!r}")
    return value


def _normalize_search_text(raw: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", raw.lower())


def _logo_search_terms(meta: MetadataOptions) -> List[str]:
    terms = [meta.title, meta.app_name.replace("-", " ")]
    for url in (meta.url, meta.git_repo):
        parsed = urlparse(url)
        host = parsed.netloc.lower().removeprefix("www.")
        if host:
            terms.append(host.split(".")[0])
        path_name = Path(parsed.path).stem
        if path_name:
            terms.append(path_name.replace("-", " "))

    unique: List[str] = []
    seen = set()
    for term in terms:
        normalized = re.sub(r"\s+", " ", term.strip())
        if not normalized:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(normalized)
    return unique


def _read_json_url(url: str, timeout: int = SVGL_REQUEST_TIMEOUT) -> Any:
    request = Request(url, headers={"User-Agent": "docker-to-sealos/1.0"})
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _read_text_url(url: str, timeout: int = SVGL_REQUEST_TIMEOUT) -> str:
    request = Request(url, headers={"User-Agent": "docker-to-sealos/1.0"})
    with urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8")


def _select_svg_route(route: Any) -> str:
    if isinstance(route, str) and route.lower().endswith(".svg"):
        return route
    if isinstance(route, dict):
        for key in ("light", "dark"):
            value = route.get(key)
            if isinstance(value, str) and value.lower().endswith(".svg"):
                return value
        for value in route.values():
            if isinstance(value, str) and value.lower().endswith(".svg"):
                return value
    return ""


def _score_svgl_result(
    result: Mapping[str, Any],
    meta: MetadataOptions,
    term: str,
) -> Tuple[int, int, str]:
    title = str(result.get("title") or "")
    url = str(result.get("url") or result.get("brandUrl") or "")
    title_key = _normalize_search_text(title)
    term_key = _normalize_search_text(term)
    app_key = _normalize_search_text(meta.app_name)
    meta_title_key = _normalize_search_text(meta.title)

    score = 0
    if title_key and title_key == term_key:
        score += 120
    elif title_key and term_key and (title_key in term_key or term_key in title_key):
        score += 70
    if title_key and title_key in {app_key, meta_title_key}:
        score += 90

    parsed_meta = urlparse(meta.url)
    parsed_result = urlparse(url)
    meta_host = parsed_meta.netloc.lower().removeprefix("www.")
    result_host = parsed_result.netloc.lower().removeprefix("www.")
    if meta_host and result_host:
        hosts_match = (
            meta_host == result_host
            or meta_host.endswith(f".{result_host}")
            or result_host.endswith(f".{meta_host}")
        )
        if hosts_match:
            score += 100

    route = _select_svg_route(result.get("route"))
    if route:
        score += 20
    return score, -len(title_key), route


def find_svgl_logo_url(meta: MetadataOptions) -> str:
    best: Tuple[int, int, str] = (0, 0, "")
    for term in _logo_search_terms(meta):
        search_url = f"{SVGL_API_BASE}?search={quote(term)}"
        try:
            payload = _read_json_url(search_url)
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, OSError):
            continue
        if not isinstance(payload, list):
            continue
        for item in payload:
            if not isinstance(item, dict):
                continue
            score = _score_svgl_result(item, meta, term)
            if score[2] and score > best:
                best = score
    return best[2]


def fetch_svgl_logo(meta: MetadataOptions, output_path: Path) -> bool:
    logo_url = find_svgl_logo_url(meta)
    if not logo_url:
        return False
    try:
        svg_text = _read_text_url(logo_url)
    except (HTTPError, URLError, TimeoutError, UnicodeDecodeError, OSError):
        return False
    if "<svg" not in svg_text[:500].lower():
        return False
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(svg_text, encoding="utf-8")
    return True


def prepare_logo_asset(meta: MetadataOptions, app_dir: Path, enabled: bool) -> MetadataOptions:
    if not enabled:
        return meta
    logo_path = app_dir / f"logo.{SVGL_LOGO_EXT}"
    if fetch_svgl_logo(meta, logo_path):
        return replace(meta, logo_ext=SVGL_LOGO_EXT)
    existing_logo = next(iter(sorted(app_dir.glob("logo.*"))), None)
    if existing_logo is not None and existing_logo.suffix:
        return replace(meta, logo_ext=existing_logo.suffix.lstrip("."))
    return meta


def has_pinned_image(image: str) -> bool:
    text = image.strip()
    if not text:
        return False
    if "@sha256:" in text:
        return True
    without_digest = text.split("@", 1)[0]
    last_segment = without_digest.rsplit("/", 1)[-1]
    return ":" in last_segment


def split_image_reference(image: str) -> Tuple[str, Optional[str], Optional[str]]:
    text = image.strip()
    digest: Optional[str] = None
    if "@" in text:
        text, digest = text.split("@", 1)
    last_slash = text.rfind("/")
    last_colon = text.rfind(":")
    if last_colon > last_slash:
        return text[:last_colon], text[last_colon + 1 :], digest
    return text, None, digest


def is_explicit_version_tag(tag: str) -> bool:
    return EXPLICIT_VERSION_TAG_RE.fullmatch(tag.strip()) is not None


def is_floating_tag(tag: str) -> bool:
    normalized = tag.strip().lower()
    if normalized in FLOATING_ALIAS_TAGS:
        return True
    return FLOATING_NUMERIC_TAG_RE.fullmatch(normalized) is not None


def _version_sort_key(tag: str) -> Tuple[int, int, int, int, str]:
    match = EXPLICIT_VERSION_TAG_RE.fullmatch(tag.strip())
    if match is None:
        raise ValueError(f"not an explicit version tag: {tag}")
    suffix = match.group("suffix") or ""
    is_stable = 1 if not suffix else 0
    return (
        int(match.group("major")),
        int(match.group("minor")),
        int(match.group("patch")),
        is_stable,
        suffix,
    )


def select_best_version_tag(tags: Sequence[str]) -> str:
    explicit_tags = [tag for tag in tags if is_explicit_version_tag(tag)]
    if not explicit_tags:
        raise ValueError("no explicit version tags available")
    return max(explicit_tags, key=_version_sort_key)


def require_crane_binary() -> str:
    crane_bin = shutil.which("crane")
    if not crane_bin:
        raise ValueError("crane is required to resolve floating image tags but was not found in PATH")
    return crane_bin


def run_crane_command(crane_bin: str, args: Sequence[str]) -> str:
    command = [crane_bin, *args]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "unknown error"
        raise ValueError(f"crane command failed ({' '.join(command)}): {detail}")
    return result.stdout.strip()


def resolve_image_reference(
    image: str,
    *,
    digest_cache: Optional[Dict[str, str]] = None,
    tag_cache: Optional[Dict[str, List[str]]] = None,
    image_resolution: Optional[ImageResolutionMap] = None,
) -> str:
    trimmed = image.strip()
    resolution_entry = (image_resolution or {}).get(trimmed)
    if isinstance(resolution_entry, dict):
        resolved = resolution_entry.get("resolved")
        if isinstance(resolved, str) and resolved:
            return resolved.strip()
    repository, tag, digest = split_image_reference(image)
    if digest:
        return trimmed
    if not repository or not tag:
        return trimmed
    if is_explicit_version_tag(tag):
        return trimmed
    if not is_floating_tag(tag):
        return trimmed

    digest_cache = digest_cache if digest_cache is not None else {}
    tag_cache = tag_cache if tag_cache is not None else {}
    crane_bin = require_crane_binary()

    source_image = f"{repository}:{tag}"
    source_digest = digest_cache.get(source_image)
    if source_digest is None:
        source_digest = run_crane_command(crane_bin, ["digest", source_image])
        digest_cache[source_image] = source_digest

    tags = tag_cache.get(repository)
    if tags is None:
        tags_output = run_crane_command(crane_bin, ["ls", repository])
        tags = [line.strip() for line in tags_output.splitlines() if line.strip()]
        tag_cache[repository] = tags

    candidate_tags = [candidate for candidate in tags if is_explicit_version_tag(candidate)]
    matched_tags: List[str] = []
    for candidate_tag in candidate_tags:
        candidate_image = f"{repository}:{candidate_tag}"
        candidate_digest = digest_cache.get(candidate_image)
        if candidate_digest is None:
            try:
                candidate_digest = run_crane_command(crane_bin, ["digest", candidate_image])
            except ValueError:
                continue
            digest_cache[candidate_image] = candidate_digest
        if candidate_digest == source_digest:
            matched_tags.append(candidate_tag)

    if matched_tags:
        best_tag = select_best_version_tag(matched_tags)
        return f"{repository}:{best_tag}"

    return f"{repository}@{source_digest}"


def _coerce_exposed_ports(raw_ports: Any) -> Optional[List[int]]:
    if not isinstance(raw_ports, list):
        return None
    ports: List[int] = []
    for item in raw_ports:
        if isinstance(item, bool):
            continue
        if isinstance(item, int):
            ports.append(item)
        elif isinstance(item, float) and item.is_integer():
            ports.append(int(item))
        elif isinstance(item, str) and re.fullmatch(r"-?\d+", item.strip()):
            ports.append(int(item.strip()))
    return ports


def load_image_resolution_file(path: Path) -> ImageResolutionMap:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError("image resolution file must be a JSON object")
    images = raw.get("images")
    if images is None:
        images = raw
    if not isinstance(images, dict):
        raise ValueError("image resolution images section must be a JSON object")
    resolution: ImageResolutionMap = {}
    for ref, entry in images.items():
        if not isinstance(entry, dict):
            continue
        resolved = entry.get("resolved")
        if not isinstance(resolved, str) or not resolved.strip():
            continue
        normalized: Dict[str, Any] = {
            "resolved": resolved.strip(),
            "digest": entry.get("digest") if isinstance(entry.get("digest"), str) else None,
            "version_tag": entry.get("version_tag") if isinstance(entry.get("version_tag"), str) else None,
            "platforms": (
                [item for item in entry.get("platforms") if isinstance(item, str)]
                if isinstance(entry.get("platforms"), list)
                else None
            ),
        }
        config = entry.get("config")
        if isinstance(config, dict):
            normalized["config"] = {
                "user": config.get("user") if isinstance(config.get("user"), str) else None,
                "exposed_ports": _coerce_exposed_ports(config.get("exposed_ports")),
            }
        resolution[str(ref)] = normalized
    return resolution


def image_repository_basename(image: str) -> str:
    reference = image.strip()
    if "@" in reference:
        reference = reference.split("@", 1)[0]

    slash_index = reference.rfind("/")
    colon_index = reference.rfind(":")
    if colon_index > slash_index:
        reference = reference[:colon_index]

    return reference.rsplit("/", 1)[-1].lower()


def detect_db_type(image: str) -> Optional[str]:
    repository_basename = image_repository_basename(image)
    for db_type, patterns in DB_TYPE_PATTERNS.items():
        if repository_basename in patterns:
            return db_type
    return None


def _matches_gateway_hint(text: str, hints: Sequence[str]) -> bool:
    normalized = text.strip().lower()
    if not normalized:
        return False
    return any(hint in normalized for hint in hints)


def is_platform_edge_gateway_service(service_name: str, service: Mapping[str, Any], image: str) -> bool:
    if not _matches_gateway_hint(service_name, EDGE_GATEWAY_SERVICE_HINTS) and not _matches_gateway_hint(
        image, EDGE_GATEWAY_IMAGE_HINTS
    ):
        return False

    ports = parse_ports(service)
    if any(port in EDGE_GATEWAY_PORT_HINTS for port in ports):
        return True

    command_args = parse_command_args(service)
    merged = " ".join(command_args).lower()
    if _matches_gateway_hint(merged, EDGE_GATEWAY_COMMAND_HINTS):
        return True
    return False


def _resolve_compose_variable_expression(expr: str) -> str:
    if ":-" in expr:
        var_name, default = expr.split(":-", 1)
        value = os.environ.get(var_name)
        return value if value else default
    if "-" in expr:
        var_name, default = expr.split("-", 1)
        value = os.environ.get(var_name)
        return value if value is not None else default
    if ":?" in expr:
        var_name, message = expr.split(":?", 1)
        value = os.environ.get(var_name)
        if value:
            return value
        detail = message or f"{var_name} is required"
        raise ValueError(detail)
    if "?" in expr:
        var_name, message = expr.split("?", 1)
        value = os.environ.get(var_name)
        if value is not None:
            return value
        detail = message or f"{var_name} is required"
        raise ValueError(detail)
    if ":+" in expr:
        var_name, alternate = expr.split(":+", 1)
        value = os.environ.get(var_name)
        return alternate if value else ""
    if "+" in expr:
        var_name, alternate = expr.split("+", 1)
        value = os.environ.get(var_name)
        return alternate if value is not None else ""
    var_name = expr.strip()
    value = os.environ.get(var_name)
    if value is None:
        raise ValueError(f"environment variable {var_name} is required to resolve image")
    return value


def resolve_compose_value(raw: str) -> str:
    result = raw

    def _replace_braced(match: re.Match[str]) -> str:
        return _resolve_compose_variable_expression(match.group(1))

    result = COMPOSE_BRACED_VAR_RE.sub(_replace_braced, result)

    def _replace_simple(match: re.Match[str]) -> str:
        var_name = match.group(1)
        value = os.environ.get(var_name)
        if value is None:
            raise ValueError(f"environment variable {var_name} is required to resolve image")
        return value

    result = COMPOSE_SIMPLE_VAR_RE.sub(_replace_simple, result)
    return result


def normalize_image_reference(raw_image: str, service_name: str) -> str:
    text = raw_image.strip()
    if not text:
        raise ValueError(f"service {service_name!r} must define image")
    if "$" not in text:
        return text
    try:
        resolved = resolve_compose_value(text).strip()
    except ValueError as exc:
        raise ValueError(f"service {service_name!r} image interpolation cannot be resolved: {exc}") from exc
    if not resolved:
        raise ValueError(f"service {service_name!r} image interpolation resolved to an empty value")
    if "$" in resolved or "${" in resolved:
        raise ValueError(f"service {service_name!r} image interpolation resolved incompletely: {resolved}")
    return resolved


def parse_compose(compose_path: Path) -> Mapping[str, Any]:
    data = yaml.safe_load(compose_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("compose file must be a YAML object")
    services = data.get("services")
    if not isinstance(services, dict) or not services:
        raise ValueError("compose file must contain a non-empty services map")
    return data


def infer_app_name(compose_data: Mapping[str, Any], compose_path: Path) -> str:
    compose_name = compose_data.get("name")
    if isinstance(compose_name, str) and compose_name.strip():
        return normalize_k8s_name(compose_name)
    return normalize_k8s_name(compose_path.stem)


def normalize_category(raw: str) -> str:
    value = INVALID_NAME_RE.sub("-", raw.strip().lower()).strip("-")
    if not value:
        return ""
    return CATEGORY_ALIASES.get(value, value)


def normalize_categories(values: Sequence[str]) -> Tuple[str, ...]:
    categories: List[str] = []
    for item in values:
        if not isinstance(item, str):
            continue
        normalized = normalize_category(item)
        if normalized not in ALLOWED_TEMPLATE_CATEGORIES:
            continue
        if normalized in categories:
            continue
        categories.append(normalized)
    if not categories:
        return ("tool",)
    return tuple(categories)


def infer_metadata(opts: argparse.Namespace, compose_data: Mapping[str, Any], compose_path: Path) -> MetadataOptions:
    app_name = normalize_k8s_name(opts.app_name) if opts.app_name else infer_app_name(compose_data, compose_path)
    title = opts.title or app_name.replace("-", " ").title()
    description = opts.description or f"Generated Sealos template for {title} from Docker Compose."
    url = opts.url or f"https://example.com/{app_name}"
    git_repo = opts.git_repo or f"https://github.com/example/{app_name}"
    categories = normalize_categories(opts.category or ("tool",))
    return MetadataOptions(
        app_name=app_name,
        title=title,
        description=description,
        url=url,
        git_repo=git_repo,
        author=opts.author,
        categories=tuple(categories),
        repo_raw_base=opts.repo_raw_base.rstrip("/"),
    )


def build_zh_description(title: str, description: str) -> str:
    raw = re.sub(r"\s+", " ", description.strip())
    if raw and ZH_CHAR_RE.search(raw):
        return raw
    rewritten = rewrite_english_description_to_zh(raw)
    if rewritten:
        return rewritten
    if raw:
        return f"{title} 的 Sealos 模板，提供 {title} 应用的部署能力。"
    return f"{title} 的 Sealos 模板。"


def rewrite_english_description_to_zh(description: str) -> str:
    normalized = description.strip().strip(".")
    if not normalized:
        return ""
    lowered = normalized.lower()

    for pattern, rewritten in EN_DESCRIPTION_REWRITE_PATTERNS:
        if pattern.search(lowered):
            return f"{rewritten}。"

    translated = lowered
    for source, target in EN_DESCRIPTION_TERM_REPLACEMENTS:
        translated = re.sub(rf"\b{re.escape(source)}\b", target, translated)
    translated = re.sub(r"\s+", " ", translated).strip(" ,;")
    translated = translated.replace(",", "，").replace(";", "；").replace(":", "：")
    translated = re.sub(r"\s*，\s*", "，", translated)
    translated = re.sub(r"\s*；\s*", "；", translated)
    translated = re.sub(r"\s*：\s*", "：", translated)
    translated = re.sub(r"\s+", " ", translated).strip()
    if not translated or not ZH_CHAR_RE.search(translated):
        return ""
    if translated.endswith(("。", "！", "？")):
        return translated
    return f"{translated}。"


def parse_env(service: Mapping[str, Any]) -> List[Tuple[str, str]]:
    env = service.get("environment")
    result: List[Tuple[str, str]] = []
    if isinstance(env, dict):
        for key, value in env.items():
            result.append((str(key), "" if value is None else str(value)))
        return result
    if isinstance(env, list):
        for item in env:
            if isinstance(item, str):
                if "=" in item:
                    key, value = item.split("=", 1)
                    result.append((key, value))
                else:
                    result.append((item, ""))
            elif isinstance(item, dict):
                for key, value in item.items():
                    result.append((str(key), "" if value is None else str(value)))
    return result


def parse_container_port(item: Any) -> Optional[int]:
    if isinstance(item, int):
        return item
    if isinstance(item, str):
        text = item.strip()
        if not text:
            return None
        if "/" in text:
            text = text.split("/", 1)[0]
        if ":" in text:
            text = text.rsplit(":", 1)[-1]
        if "-" in text:
            text = text.split("-", 1)[0]
        return int(text) if text.isdigit() else None
    if isinstance(item, dict):
        target = item.get("target")
        if isinstance(target, int):
            return target
        if isinstance(target, str) and target.isdigit():
            return int(target)
    return None


def _text_has_websocket_hint(value: Any) -> bool:
    normalized = str(value).lower()
    return any(hint in normalized for hint in WEBSOCKET_VALUE_HINTS)


def _field_has_websocket_hint(value: Any) -> bool:
    normalized = re.sub(r"[^a-z0-9]+", "-", str(value).lower()).strip("-")
    if not normalized:
        return False
    tokens = set(normalized.split("-"))
    return any(hint in normalized for hint in WEBSOCKET_FIELD_HINTS) or bool(tokens & set(WEBSOCKET_FIELD_HINTS))


def _iter_compose_values(value: Any) -> Iterable[Any]:
    if isinstance(value, dict):
        for key, item in value.items():
            yield key
            yield item
            yield from _iter_compose_values(item)
    elif isinstance(value, list):
        for item in value:
            yield item
            yield from _iter_compose_values(item)
    else:
        yield value


def parse_port_name(item: Any) -> Optional[str]:
    if isinstance(item, dict):
        for key in ("name", "app_protocol", "appProtocol", "protocol"):
            value = item.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None


def is_port_websocket(item: Any) -> bool:
    name = parse_port_name(item)
    if name and (_field_has_websocket_hint(name) or _text_has_websocket_hint(name)):
        return True
    if isinstance(item, dict):
        for key in ("app_protocol", "appProtocol", "protocol"):
            value = item.get(key)
            if isinstance(value, str) and _text_has_websocket_hint(value):
                return True
    return False


def parse_ports(service: Mapping[str, Any]) -> List[int]:
    ports = service.get("ports")
    if not isinstance(ports, list):
        return []
    values: List[int] = []
    seen = set()
    for item in ports:
        port = parse_container_port(item)
        if port is None or port in seen:
            continue
        seen.add(port)
        values.append(port)
    return values


def infer_websocket_ports(service: Mapping[str, Any]) -> Set[int]:
    websocket_ports: Set[int] = set()
    ports = service.get("ports")
    if isinstance(ports, list):
        for item in ports:
            port = parse_container_port(item)
            if port is not None and is_port_websocket(item):
                websocket_ports.add(port)

    expose = service.get("expose")
    if isinstance(expose, list):
        for item in expose:
            port = parse_container_port(item)
            if port is not None and is_port_websocket(item):
                websocket_ports.add(port)

    for key, value in parse_env(service):
        if (_field_has_websocket_hint(key) or _text_has_websocket_hint(value)) and value.isdigit():
            websocket_ports.add(int(value))

    return websocket_ports


def service_requires_websocket_ingress(service_name: str, service: Mapping[str, Any], selected_port: int) -> bool:
    websocket_ports = infer_websocket_ports(service)
    if selected_port in websocket_ports:
        return True
    if _field_has_websocket_hint(service_name):
        return True
    for key, value in parse_env(service):
        if _field_has_websocket_hint(key) or _text_has_websocket_hint(value):
            return True
    for value in _iter_compose_values(
        {
            "labels": service.get("labels"),
            "command": service.get("command"),
            "entrypoint": service.get("entrypoint"),
        }
    ):
        if _text_has_websocket_hint(value) or _field_has_websocket_hint(value):
            return True
    return False


def normalize_ports_for_gateway_tls_termination(ports: Sequence[int]) -> List[int]:
    normalized = list(ports)
    # Sealos Ingress terminates TLS. If an app exposes both HTTP and HTTPS ports,
    # keep only HTTP-facing ports to avoid redundant in-container TLS.
    if TLS_TERMINATION_PORT in normalized and any(port != TLS_TERMINATION_PORT for port in normalized):
        normalized = [port for port in normalized if port != TLS_TERMINATION_PORT]
    return normalized


def parse_mount_target_from_string(raw: str) -> Optional[str]:
    text = raw.strip()
    if not text:
        return None
    parts = text.split(":")
    if len(parts) == 1:
        return parts[0] if parts[0].startswith("/") else None
    if len(parts) >= 3 and parts[-1] in MODE_SUFFIXES:
        target = parts[-2]
    else:
        target = parts[-1]
    return target if target.startswith("/") else None


def is_persistent_mount_target(target: str) -> bool:
    if not target.startswith("/"):
        return False
    # Runtime sockets (for example docker.sock) should not be converted to PVC.
    return not target.lower().endswith(".sock")


def is_tls_certificate_mount_target(target: str) -> bool:
    normalized = target.strip().rstrip("/").lower()
    if not normalized:
        return False
    if normalized in TLS_CERT_MOUNT_EXACT_PATHS:
        return True
    parts = [part for part in normalized.split("/") if part]
    if not parts:
        return False
    return parts[-1] in TLS_CERT_DIR_NAMES


def parse_mount_paths(service: Mapping[str, Any]) -> List[str]:
    volumes = service.get("volumes")
    if not isinstance(volumes, list):
        return []
    paths: List[str] = []
    seen = set()
    for item in volumes:
        target: Optional[str] = None
        if isinstance(item, str):
            target = parse_mount_target_from_string(item)
        elif isinstance(item, dict):
            raw_target = item.get("target")
            if isinstance(raw_target, str) and raw_target.startswith("/"):
                target = raw_target
        if (
            target
            and is_persistent_mount_target(target)
            and not is_tls_certificate_mount_target(target)
            and target not in seen
        ):
            seen.add(target)
            paths.append(target)
    return paths


def _resolve_config_file_path(raw_path: Any, compose_dir: Path) -> Optional[Path]:
    if not isinstance(raw_path, str) or not raw_path.strip():
        return None
    path = Path(raw_path.strip())
    if not path.is_absolute():
        path = compose_dir / path
    try:
        resolved = path.resolve()
    except OSError:
        return None
    return resolved if resolved.is_file() else None


def _root_config_file_sources(compose_data: Mapping[str, Any], compose_dir: Path) -> Dict[str, Path]:
    configs = compose_data.get("configs")
    if not isinstance(configs, dict):
        return {}
    sources: Dict[str, Path] = {}
    for name, config in configs.items():
        if not isinstance(name, str):
            continue
        if isinstance(config, dict):
            source_path = _resolve_config_file_path(config.get("file"), compose_dir)
        elif isinstance(config, str):
            source_path = _resolve_config_file_path(config, compose_dir)
        else:
            source_path = None
        if source_path is not None:
            sources[name] = source_path
    return sources


def parse_config_mounts(
    service: Mapping[str, Any],
    compose_data: Mapping[str, Any],
    compose_dir: Path,
) -> List[ConfigMount]:
    service_configs = service.get("configs")
    if not isinstance(service_configs, list):
        return []
    file_sources = _root_config_file_sources(compose_data, compose_dir)
    mounts: List[ConfigMount] = []
    seen_targets: Set[str] = set()
    for item in service_configs:
        source_name: Optional[str] = None
        target: Optional[str] = None
        if isinstance(item, str):
            source_name = item
        elif isinstance(item, dict):
            raw_source = item.get("source") or item.get("config")
            raw_target = item.get("target")
            if isinstance(raw_source, str):
                source_name = raw_source
            if isinstance(raw_target, str) and raw_target.startswith("/"):
                target = raw_target
        if not source_name:
            continue
        source_file = file_sources.get(source_name)
        if source_file is None:
            continue
        if target is None:
            target = f"/{source_name}"
        if not target.startswith("/") or target in seen_targets:
            continue
        seen_targets.add(target)
        mounts.append(
            ConfigMount(
                target=target,
                key=path_to_vn_name(target),
                content=source_file.read_text(encoding="utf-8"),
            )
        )
    return mounts


def parse_command_args(service: Mapping[str, Any]) -> List[str]:
    command = service.get("command")
    if isinstance(command, str):
        text = command.strip()
        if not text:
            return []
        try:
            return shlex.split(text)
        except ValueError:
            return [text]
    if isinstance(command, list):
        return [str(item) for item in command if item is not None and str(item).strip()]
    return []


def parse_compose_duration_seconds(raw: Any) -> Optional[int]:
    if isinstance(raw, (int, float)):
        return max(1, int(math.ceil(float(raw))))
    if not isinstance(raw, str):
        return None
    text = raw.strip().lower()
    if not text:
        return None
    if text.isdigit():
        return max(1, int(text))

    unit_to_seconds = {
        "ns": 1e-9,
        "us": 1e-6,
        "ms": 1e-3,
        "s": 1.0,
        "m": 60.0,
        "h": 3600.0,
    }
    total_seconds = 0.0
    cursor = 0
    for match in COMPOSE_DURATION_PART_RE.finditer(text):
        if match.start() != cursor:
            return None
        value = int(match.group(1))
        unit = match.group(2)
        total_seconds += value * unit_to_seconds[unit]
        cursor = match.end()
    if cursor != len(text):
        return None
    return max(1, int(math.ceil(total_seconds)))


def build_probe_timing_fields(healthcheck: Mapping[str, Any]) -> Dict[str, int]:
    interval = parse_compose_duration_seconds(healthcheck.get("interval"))
    timeout = parse_compose_duration_seconds(healthcheck.get("timeout"))
    start_period = parse_compose_duration_seconds(healthcheck.get("start_period"))

    retries_raw = healthcheck.get("retries")
    retries: Optional[int] = None
    if isinstance(retries_raw, int):
        retries = retries_raw
    elif isinstance(retries_raw, str) and retries_raw.strip().isdigit():
        retries = int(retries_raw.strip())

    return {
        "initialDelaySeconds": max(1, start_period or 10),
        "periodSeconds": max(1, interval or 10),
        "timeoutSeconds": max(1, timeout or 5),
        "failureThreshold": max(1, retries or 3),
    }


def parse_compose_healthcheck_command(healthcheck: Mapping[str, Any]) -> Optional[List[str]]:
    test = healthcheck.get("test")
    if isinstance(test, str):
        value = test.strip()
        if not value:
            return None
        if value.upper() == "NONE":
            return []
        return ["sh", "-c", value]

    if isinstance(test, list):
        tokens = [str(item).strip() for item in test if str(item).strip()]
        if not tokens:
            return None
        mode = tokens[0].upper()
        if mode == "NONE":
            return []
        if mode == "CMD":
            return tokens[1:]
        if mode == "CMD-SHELL":
            shell = " ".join(tokens[1:]).strip()
            if not shell:
                return None
            return ["sh", "-c", shell]
        return tokens
    return None


def extract_http_get_action_from_command(command: Sequence[str], ports: Sequence[int]) -> Optional[Dict[str, Any]]:
    merged = " ".join(command)
    url_match = URL_IN_COMMAND_RE.search(merged)
    if url_match is None:
        return None
    parsed = urlparse(url_match.group(0))
    scheme = parsed.scheme.upper() if parsed.scheme else "HTTP"
    if scheme not in {"HTTP", "HTTPS"}:
        scheme = "HTTP"
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"
    port = parsed.port or (443 if scheme == "HTTPS" else 80)
    if parsed.hostname in {"localhost", "127.0.0.1"} and ports:
        if port not in ports:
            port = ports[0]
    return {
        "httpGet": {
            "path": path,
            "port": port,
            "scheme": scheme,
        }
    }


def build_probe_pair_from_compose_healthcheck(service: Mapping[str, Any], ports: Sequence[int]) -> Dict[str, Any]:
    healthcheck = service.get("healthcheck")
    if not isinstance(healthcheck, dict):
        return {}

    command = parse_compose_healthcheck_command(healthcheck)
    if command is None:
        return {}
    if not command:
        return {}

    action = extract_http_get_action_from_command(command, ports)
    if action is None:
        action = {
            "exec": {
                "command": list(command),
            }
        }
    timing = build_probe_timing_fields(healthcheck)
    liveness = dict(action)
    liveness.update(timing)
    readiness = dict(action)
    readiness.update(timing)
    result = {
        "livenessProbe": liveness,
        "readinessProbe": readiness,
    }
    start_period = parse_compose_duration_seconds(healthcheck.get("start_period"))
    if start_period and start_period > 0:
        period = int(timing.get("periodSeconds", 10))
        # Give the window a hard floor: compose start_period describes the happy
        # path, while first boots run migrations and wait for databases. A
        # threshold of ceil(start_period/period) alone (often 1) kills slow cold
        # starts one probe into the run.
        window_seconds = max(start_period, STARTUP_WINDOW_FLOOR_SECONDS)
        startup = dict(action)
        startup.update(
            {
                "periodSeconds": max(1, period),
                "timeoutSeconds": int(timing.get("timeoutSeconds", 5)),
                "failureThreshold": max(
                    STARTUP_FAILURE_THRESHOLD_FLOOR,
                    int(math.ceil(window_seconds / max(1, period))),
                ),
            }
        )
        result["startupProbe"] = startup
    else:
        # Always emit startupProbe with liveness/readiness so slow apps without
        # compose start_period are not killed by the default 10s liveness delay.
        startup = dict(action)
        startup.update(
            {
                "periodSeconds": 10,
                "timeoutSeconds": 3,
                "failureThreshold": 12,
            }
        )
        result["startupProbe"] = startup
    return result


def is_worker_command(command_args: Sequence[str]) -> bool:
    if not command_args:
        return False
    first = str(command_args[0]).strip().lower()
    return first == "worker"


def pick_probe_port(ports: Sequence[int], preferred_port: int) -> int:
    if preferred_port in ports:
        return preferred_port
    if ports:
        return int(ports[0])
    return preferred_port


def build_probe_pair_from_official_profile(
    image: str,
    ports: Sequence[int],
    command_args: Sequence[str],
) -> Dict[str, Any]:
    image_lower = image.strip().lower()

    for marker, profile in OFFICIAL_HEALTH_WORKER_PROFILES.items():
        if marker in image_lower and is_worker_command(command_args):
            action = {
                "exec": {
                    "command": list(profile["command"]),
                }
            }
            startup_action = {
                "exec": {
                    "command": list(profile.get("startup_command", profile["command"])),
                }
            }
            timing = {
                "initialDelaySeconds": int(profile["initialDelaySeconds"]),
                "periodSeconds": int(profile["periodSeconds"]),
                "timeoutSeconds": int(profile["timeoutSeconds"]),
                "failureThreshold": int(profile["failureThreshold"]),
            }
            liveness = dict(action)
            liveness.update(timing)
            readiness = dict(action)
            readiness.update(timing)
            startup = dict(startup_action)
            startup.update(
                {
                    "periodSeconds": int(profile["startupPeriodSeconds"]),
                    "timeoutSeconds": int(profile["startupTimeoutSeconds"]),
                    "failureThreshold": int(profile["startupFailureThreshold"]),
                }
            )
            return {
                "livenessProbe": liveness,
                "readinessProbe": readiness,
                "startupProbe": startup,
            }

    for marker, profile in OFFICIAL_HEALTH_HTTP_PROFILES.items():
        if marker not in image_lower:
            continue
        port = pick_probe_port(ports, int(profile["preferred_port"]))
        timing = {
            "initialDelaySeconds": int(profile["initialDelaySeconds"]),
            "periodSeconds": int(profile["periodSeconds"]),
            "timeoutSeconds": int(profile["timeoutSeconds"]),
            "failureThreshold": int(profile["failureThreshold"]),
        }
        liveness = {
            "httpGet": {
                "path": str(profile["liveness_path"]),
                "port": port,
                "scheme": str(profile["scheme"]),
            }
        }
        liveness.update(timing)
        readiness = {
            "httpGet": {
                "path": str(profile["readiness_path"]),
                "port": port,
                "scheme": str(profile["scheme"]),
            }
        }
        readiness.update(timing)
        startup = {
            "httpGet": {
                "path": str(profile["startup_path"]),
                "port": port,
                "scheme": str(profile["scheme"]),
            },
            "periodSeconds": int(profile["startupPeriodSeconds"]),
            "timeoutSeconds": int(profile["startupTimeoutSeconds"]),
            "failureThreshold": int(profile["startupFailureThreshold"]),
        }
        return {
            "livenessProbe": liveness,
            "readinessProbe": readiness,
            "startupProbe": startup,
        }

    return {}


def build_probe_pair(
    service: Mapping[str, Any],
    image: str,
    ports: Sequence[int],
    command_args: Sequence[str],
) -> Dict[str, Any]:
    from_compose = build_probe_pair_from_compose_healthcheck(service, ports)
    if from_compose:
        return from_compose
    from_profile = build_probe_pair_from_official_profile(image, ports, command_args)
    if from_profile:
        return from_profile
    # No healthcheck evidence at all: emit conservative TCP readiness/startup
    # probes on the primary port so rollout status reflects real listening
    # state instead of container-started state. No liveness probe — killing a
    # container without health evidence does more harm than good.
    if ports:
        tcp_action = {"tcpSocket": {"port": ports[0]}}
        readiness = dict(tcp_action)
        readiness.update(DEFAULT_TCP_READINESS)
        startup = dict(tcp_action)
        startup.update(DEFAULT_TCP_STARTUP)
        return {
            "readinessProbe": readiness,
            "startupProbe": startup,
        }
    return {}


def _extract_shape_from_kompose_doc(doc: Mapping[str, Any]) -> Optional[Tuple[str, ServiceShape]]:
    kind = doc.get("kind")
    if kind not in {"Deployment", "StatefulSet", "DaemonSet"}:
        return None
    metadata = doc.get("metadata")
    name = metadata.get("name") if isinstance(metadata, dict) else None
    if not isinstance(name, str) or not name.strip():
        return None

    spec = doc.get("spec")
    template = spec.get("template") if isinstance(spec, dict) else None
    template_spec = template.get("spec") if isinstance(template, dict) else None
    containers = template_spec.get("containers") if isinstance(template_spec, dict) else None
    if not isinstance(containers, list) or not containers:
        return None
    first = containers[0] if isinstance(containers[0], dict) else None
    if not isinstance(first, dict):
        return None

    ports_raw = first.get("ports")
    ports: List[int] = []
    seen_ports = set()
    if isinstance(ports_raw, list):
        for item in ports_raw:
            if not isinstance(item, dict):
                continue
            container_port = item.get("containerPort")
            if isinstance(container_port, int) and container_port not in seen_ports:
                seen_ports.add(container_port)
                ports.append(container_port)

    mounts_raw = first.get("volumeMounts")
    mounts: List[str] = []
    seen_mounts = set()
    if isinstance(mounts_raw, list):
        for item in mounts_raw:
            if not isinstance(item, dict):
                continue
            mount_path = item.get("mountPath")
            if isinstance(mount_path, str) and mount_path.startswith("/") and mount_path not in seen_mounts:
                seen_mounts.add(mount_path)
                mounts.append(mount_path)

    return normalize_k8s_name(name), ServiceShape(ports=tuple(ports), mount_paths=tuple(mounts))


def load_service_shapes_with_kompose(compose_path: Path, required: bool) -> Optional[Dict[str, ServiceShape]]:
    kompose_bin = shutil.which("kompose")
    if not kompose_bin:
        if required:
            raise ValueError("kompose is required but not found in PATH")
        return None

    with tempfile.TemporaryDirectory() as temp_dir:
        workdir = Path(temp_dir)
        cmd = [kompose_bin, "convert", "-f", str(compose_path)]
        result = subprocess.run(cmd, cwd=workdir, capture_output=True, text=True)
        if result.returncode != 0:
            if required:
                stderr = result.stderr.strip() or result.stdout.strip() or "unknown error"
                raise ValueError(f"kompose convert failed: {stderr}")
            return None

        shapes: Dict[str, ServiceShape] = {}
        for path in sorted([*workdir.glob("*.yaml"), *workdir.glob("*.yml")]):
            text = path.read_text(encoding="utf-8")
            for doc in yaml.safe_load_all(text):
                if not isinstance(doc, dict):
                    continue
                extracted = _extract_shape_from_kompose_doc(doc)
                if extracted is None:
                    continue
                key, shape = extracted
                shapes.setdefault(key, shape)

        if required and not shapes:
            raise ValueError("kompose produced no workload manifests")
        return shapes


def resolve_kompose_shapes(compose_path: Path, mode: str) -> Optional[Dict[str, ServiceShape]]:
    if mode == "never":
        return None
    if mode == "always":
        return load_service_shapes_with_kompose(compose_path, required=True)
    if mode == "auto":
        return load_service_shapes_with_kompose(compose_path, required=False)
    raise ValueError(f"unsupported kompose mode: {mode}")


def deploy_profile_doc_links(meta: MetadataOptions) -> Optional[Dict[str, str]]:
    """Readme/icon targets for the deploy profile point at real, existing URLs."""
    match = DEPLOY_GITHUB_REPO_RE.match(meta.git_repo.strip())
    if match is None:
        return None
    owner = match.group(1)
    repo = match.group(2)
    readme = f"https://raw.githubusercontent.com/{owner}/{repo}/HEAD/README.md"
    return {
        "readme": readme,
        "readme_zh": readme,
        "icon": f"https://github.com/{owner}.png",
    }


def build_template_resource(
    meta: MetadataOptions,
    *,
    inputs: Optional[Mapping[str, Mapping[str, Any]]] = None,
    defaults: Optional[Mapping[str, Mapping[str, str]]] = None,
    profile: str = "template-repo",
) -> Dict[str, Any]:
    readme_base = f"{TEMPLATE_README_BASE}/{meta.app_name}"
    doc_links = deploy_profile_doc_links(meta) if profile == "deploy" else None
    readme = doc_links["readme"] if doc_links else f"{readme_base}/README.md"
    readme_zh = doc_links["readme_zh"] if doc_links else f"{readme_base}/README_zh.md"
    icon = (
        doc_links["icon"]
        if doc_links
        else f"{meta.repo_raw_base}/template/{meta.app_name}/logo.{meta.logo_ext}"
    )

    merged_defaults: Dict[str, Any] = {
        "app_host": {
            "type": "string",
            "value": f"{meta.app_name}-${{{{ random(8) }}}}",
        },
        "app_name": {
            "type": "string",
            "value": f"{meta.app_name}-${{{{ random(8) }}}}",
        },
    }
    for name, default_spec in (defaults or {}).items():
        if name in {"app_host", "app_name"}:
            continue
        merged_defaults[name] = {"type": default_spec["type"], "value": default_spec["value"]}

    spec: Dict[str, Any] = {
        "title": meta.title,
        "url": meta.url,
        "gitRepo": meta.git_repo,
        "author": meta.author,
        "description": meta.description,
        "readme": readme,
        "icon": icon,
        "templateType": "inline",
        "locale": "en",
        "i18n": {
            "zh": {
                "description": build_zh_description(meta.title, meta.description),
                "readme": readme_zh,
            }
        },
        "categories": list(meta.categories),
        "defaults": merged_defaults,
    }
    input_items = sorted((inputs or {}).items())
    if input_items:
        inputs_spec: Dict[str, Any] = {}
        for name, input_spec in input_items:
            entry: Dict[str, Any] = {
                "description": input_spec["description"],
                "type": input_spec["type"],
                "required": input_spec["required"],
            }
            if input_spec.get("default") is not None:
                entry["default"] = input_spec["default"]
            inputs_spec[name] = entry
        spec["inputs"] = inputs_spec

    return {
        "apiVersion": "app.sealos.io/v1",
        "kind": "Template",
        "metadata": {
            "name": meta.app_name,
        },
        "spec": spec,
    }


def build_postgres_resources() -> List[Dict[str, Any]]:
    name = "${{ defaults.app_name }}-pg"
    labels = {
        "sealos-db-provider-cr": name,
        "app.kubernetes.io/instance": name,
        "app.kubernetes.io/managed-by": "kbcli",
    }
    return [
        {
            "apiVersion": "v1",
            "kind": "ServiceAccount",
            "metadata": {
                "name": name,
                "labels": labels,
            },
        },
        {
            "apiVersion": "rbac.authorization.k8s.io/v1",
            "kind": "Role",
            "metadata": {
                "name": name,
                "labels": labels,
            },
            "rules": [
                {
                    "apiGroups": ["*"],
                    "resources": ["*"],
                    "verbs": ["*"],
                }
            ],
        },
        {
            "apiVersion": "rbac.authorization.k8s.io/v1",
            "kind": "RoleBinding",
            "metadata": {
                "name": name,
                "labels": labels,
            },
            "roleRef": {
                "apiGroup": "rbac.authorization.k8s.io",
                "kind": "Role",
                "name": name,
            },
            "subjects": [
                {
                    "kind": "ServiceAccount",
                    "name": name,
                }
            ],
        },
        {
            "apiVersion": "apps.kubeblocks.io/v1alpha1",
            "kind": "Cluster",
            "metadata": {
                "name": name,
                "labels": {
                    "sealos-db-provider-cr": name,
                    "app.kubernetes.io/instance": name,
                    "kb.io/database": "postgresql-16.4.0",
                    "clusterdefinition.kubeblocks.io/name": "postgresql",
                    "clusterversion.kubeblocks.io/name": "postgresql-16.4.0",
                },
            },
            "spec": {
                "affinity": {
                    "podAntiAffinity": "Preferred",
                    "tenancy": "SharedNode",
                },
                "clusterDefinitionRef": "postgresql",
                "clusterVersionRef": "postgresql-16.4.0",
                "terminationPolicy": "Delete",
                "componentSpecs": [
                    {
                        "name": "postgresql",
                        "componentDefRef": "postgresql",
                        "disableExporter": True,
                        "enabledLogs": ["running"],
                        "replicas": 1,
                        "serviceAccountName": name,
                        "switchPolicy": {"type": "Noop"},
                        "resources": db_component_resources(),
                        "volumeClaimTemplates": [
                            {
                                "name": "data",
                                "spec": {
                                    "accessModes": ["ReadWriteOnce"],
                                    "resources": {"requests": {"storage": "1Gi"}},
                                    "storageClassName": "openebs-backup",
                                },
                            }
                        ],
                    }
                ],
            },
        },
    ]


def build_mysql_resources() -> List[Dict[str, Any]]:
    name = "${{ defaults.app_name }}-mysql"
    labels = {
        "sealos-db-provider-cr": name,
        "app.kubernetes.io/instance": name,
        "app.kubernetes.io/managed-by": "kbcli",
    }
    return [
        {
            "apiVersion": "v1",
            "kind": "ServiceAccount",
            "metadata": {
                "name": name,
                "labels": labels,
            },
        },
        {
            "apiVersion": "rbac.authorization.k8s.io/v1",
            "kind": "Role",
            "metadata": {
                "name": name,
                "labels": labels,
            },
            "rules": [
                {
                    "apiGroups": ["*"],
                    "resources": ["*"],
                    "verbs": ["*"],
                }
            ],
        },
        {
            "apiVersion": "rbac.authorization.k8s.io/v1",
            "kind": "RoleBinding",
            "metadata": {
                "name": name,
                "labels": labels,
            },
            "roleRef": {
                "apiGroup": "rbac.authorization.k8s.io",
                "kind": "Role",
                "name": name,
            },
            "subjects": [
                {
                    "kind": "ServiceAccount",
                    "name": name,
                }
            ],
        },
        {
            "apiVersion": "apps.kubeblocks.io/v1alpha1",
            "kind": "Cluster",
            "metadata": {
                "name": name,
                "labels": {
                    "sealos-db-provider-cr": name,
                    "app.kubernetes.io/instance": name,
                    "kb.io/database": "ac-mysql-8.0.30-1",
                    "clusterdefinition.kubeblocks.io/name": "apecloud-mysql",
                    "clusterversion.kubeblocks.io/name": "ac-mysql-8.0.30-1",
                },
            },
            "spec": {
                "affinity": {
                    "nodeLabels": {},
                    "podAntiAffinity": "Preferred",
                    "tenancy": "SharedNode",
                    "topologyKeys": ["kubernetes.io/hostname"],
                },
                "clusterDefinitionRef": "apecloud-mysql",
                "clusterVersionRef": "ac-mysql-8.0.30-1",
                "componentSpecs": [
                    {
                        "name": "mysql",
                        "componentDefRef": "mysql",
                        "monitor": True,
                        "noCreatePDB": False,
                        "replicas": 1,
                        "serviceAccountName": name,
                        "switchPolicy": {"type": "Noop"},
                        "resources": db_component_resources(),
                        "volumeClaimTemplates": [
                            {
                                "name": "data",
                                "spec": {
                                    "accessModes": ["ReadWriteOnce"],
                                    "resources": {"requests": {"storage": "1Gi"}},
                                    "storageClassName": "openebs-backup",
                                },
                            }
                        ],
                    }
                ],
                "terminationPolicy": "Delete",
                "tolerations": [],
            },
        },
    ]


def build_mongodb_resources() -> List[Dict[str, Any]]:
    name = "${{ defaults.app_name }}-mongo"
    labels = {
        "sealos-db-provider-cr": name,
        "app.kubernetes.io/instance": name,
        "app.kubernetes.io/managed-by": "kbcli",
    }
    return [
        {
            "apiVersion": "v1",
            "kind": "ServiceAccount",
            "metadata": {
                "name": name,
                "labels": labels,
            },
        },
        {
            "apiVersion": "rbac.authorization.k8s.io/v1",
            "kind": "Role",
            "metadata": {
                "name": name,
                "labels": labels,
            },
            "rules": [
                {
                    "apiGroups": ["*"],
                    "resources": ["*"],
                    "verbs": ["*"],
                }
            ],
        },
        {
            "apiVersion": "rbac.authorization.k8s.io/v1",
            "kind": "RoleBinding",
            "metadata": {
                "name": name,
                "labels": labels,
            },
            "roleRef": {
                "apiGroup": "rbac.authorization.k8s.io",
                "kind": "Role",
                "name": name,
            },
            "subjects": [
                {
                    "kind": "ServiceAccount",
                    "name": name,
                }
            ],
        },
        {
            "apiVersion": "apps.kubeblocks.io/v1alpha1",
            "kind": "Cluster",
            "metadata": {
                "name": name,
                "labels": {
                    "sealos-db-provider-cr": name,
                    "kb.io/database": "mongodb-8.0.4",
                    "clusterdefinition.kubeblocks.io/name": "mongodb",
                    "app.kubernetes.io/instance": name,
                },
            },
            "spec": {
                "affinity": {
                    "podAntiAffinity": "Preferred",
                    "tenancy": "SharedNode",
                    "topologyKeys": ["kubernetes.io/hostname"],
                },
                "componentSpecs": [
                    {
                        "name": "mongodb",
                        "componentDef": "mongodb",
                        "serviceVersion": "8.0.4",
                        "replicas": 1,
                        "serviceAccountName": name,
                        "resources": db_component_resources(),
                        "volumeClaimTemplates": [
                            {
                                "name": "data",
                                "spec": {
                                    "accessModes": ["ReadWriteOnce"],
                                    "resources": {"requests": {"storage": "1Gi"}},
                                    "storageClassName": "openebs-backup",
                                },
                            }
                        ],
                    }
                ],
                "terminationPolicy": "Delete",
            },
        },
    ]


def build_redis_resources() -> List[Dict[str, Any]]:
    name = "${{ defaults.app_name }}-redis"
    labels = {
        "sealos-db-provider-cr": name,
        "app.kubernetes.io/instance": name,
        "app.kubernetes.io/managed-by": "kbcli",
    }
    return [
        {
            "apiVersion": "v1",
            "kind": "ServiceAccount",
            "metadata": {
                "name": name,
                "labels": labels,
            },
        },
        {
            "apiVersion": "rbac.authorization.k8s.io/v1",
            "kind": "Role",
            "metadata": {
                "name": name,
                "labels": labels,
            },
            "rules": [
                {
                    "apiGroups": ["*"],
                    "resources": ["*"],
                    "verbs": ["*"],
                }
            ],
        },
        {
            "apiVersion": "rbac.authorization.k8s.io/v1",
            "kind": "RoleBinding",
            "metadata": {
                "name": name,
                "labels": labels,
            },
            "roleRef": {
                "apiGroup": "rbac.authorization.k8s.io",
                "kind": "Role",
                "name": name,
            },
            "subjects": [
                {
                    "kind": "ServiceAccount",
                    "name": name,
                }
            ],
        },
        {
            "apiVersion": "apps.kubeblocks.io/v1alpha1",
            "kind": "Cluster",
            "metadata": {
                "name": name,
                "labels": {
                    "sealos-db-provider-cr": name,
                    "kb.io/database": "redis-7.2.7",
                    "app.kubernetes.io/instance": name,
                    "app.kubernetes.io/version": "7.2.7",
                    "clusterversion.kubeblocks.io/name": "redis-7.2.7",
                    "clusterdefinition.kubeblocks.io/name": "redis",
                },
            },
            "spec": {
                "affinity": {
                    "podAntiAffinity": "Preferred",
                    "tenancy": "SharedNode",
                    "topologyKeys": ["kubernetes.io/hostname"],
                },
                "clusterDefinitionRef": "redis",
                "componentSpecs": [
                    {
                        "name": "redis",
                        "componentDef": "redis-7",
                        "serviceVersion": "7.2.7",
                        "replicas": 1,
                        "serviceAccountName": name,
                        "enabledLogs": ["running"],
                        "env": [{"name": "CUSTOM_SENTINEL_MASTER_NAME"}],
                        "switchPolicy": {"type": "Noop"},
                        "resources": db_component_resources(),
                        "volumeClaimTemplates": [
                            {
                                "name": "data",
                                "spec": {
                                    "accessModes": ["ReadWriteOnce"],
                                    "resources": {"requests": {"storage": "1Gi"}},
                                    "storageClassName": "openebs-backup",
                                },
                            }
                        ],
                    },
                    {
                        "name": "redis-sentinel",
                        "componentDef": "redis-sentinel-7",
                        "serviceVersion": "7.2.7",
                        "replicas": 1,
                        "serviceAccountName": name,
                        "resources": db_component_resources(),
                        "volumeClaimTemplates": [
                            {
                                "name": "data",
                                "spec": {
                                    "accessModes": ["ReadWriteOnce"],
                                    "resources": {"requests": {"storage": "1Gi"}},
                                },
                            }
                        ],
                    },
                ],
                "terminationPolicy": "Delete",
                "topology": "replication",
            },
        },
    ]


def build_kafka_resources() -> List[Dict[str, Any]]:
    name = "${{ defaults.app_name }}-broker"
    labels = {
        "sealos-db-provider-cr": name,
        "app.kubernetes.io/instance": name,
        "app.kubernetes.io/managed-by": "kbcli",
    }
    return [
        {
            "apiVersion": "v1",
            "kind": "ServiceAccount",
            "metadata": {
                "name": name,
                "labels": labels,
            },
        },
        {
            "apiVersion": "rbac.authorization.k8s.io/v1",
            "kind": "Role",
            "metadata": {
                "name": name,
                "labels": labels,
            },
            "rules": [
                {
                    "apiGroups": ["*"],
                    "resources": ["*"],
                    "verbs": ["*"],
                }
            ],
        },
        {
            "apiVersion": "rbac.authorization.k8s.io/v1",
            "kind": "RoleBinding",
            "metadata": {
                "name": name,
                "labels": labels,
            },
            "roleRef": {
                "apiGroup": "rbac.authorization.k8s.io",
                "kind": "Role",
                "name": name,
            },
            "subjects": [
                {
                    "kind": "ServiceAccount",
                    "name": name,
                }
            ],
        },
        {
            "apiVersion": "apps.kubeblocks.io/v1alpha1",
            "kind": "Cluster",
            "metadata": {
                "name": name,
                "finalizers": ["cluster.kubeblocks.io/finalizer"],
                "labels": {
                    "sealos-db-provider-cr": name,
                    "app.kubernetes.io/instance": name,
                    "kb.io/database": "kafka-3.3.2",
                    "clusterdefinition.kubeblocks.io/name": "kafka",
                    "clusterversion.kubeblocks.io/name": "kafka-3.3.2",
                },
                "annotations": {
                    "kubeblocks.io/extra-env": (
                        '{"KB_KAFKA_ENABLE_SASL":"false","KB_KAFKA_BROKER_HEAP":"-XshowSettings:vm '
                        '-XX:MaxRAMPercentage=100 -Ddepth=64","KB_KAFKA_CONTROLLER_HEAP":"-XshowSettings:vm '
                        '-XX:MaxRAMPercentage=100 -Ddepth=64","KB_KAFKA_PUBLIC_ACCESS":"false"}'
                    )
                },
            },
            "spec": {
                "terminationPolicy": "Delete",
                "componentSpecs": [
                    {
                        "name": "broker",
                        "componentDef": "kafka-broker",
                        "tls": False,
                        "replicas": 1,
                        "affinity": {
                            "podAntiAffinity": "Preferred",
                            "topologyKeys": ["kubernetes.io/hostname"],
                            "tenancy": "SharedNode",
                        },
                        "tolerations": [
                            {
                                "key": "kb-data",
                                "operator": "Equal",
                                "value": "true",
                                "effect": "NoSchedule",
                            }
                        ],
                        "resources": db_component_resources(),
                        "volumeClaimTemplates": [
                            {
                                "name": "data",
                                "spec": {
                                    "accessModes": ["ReadWriteOnce"],
                                    "resources": {"requests": {"storage": "1Gi"}},
                                },
                            },
                            {
                                "name": "metadata",
                                "spec": {
                                    "storageClassName": None,
                                    "accessModes": ["ReadWriteOnce"],
                                    "resources": {"requests": {"storage": "1Gi"}},
                                },
                            },
                        ],
                    },
                    {
                        "name": "controller",
                        "componentDefRef": "controller",
                        "componentDef": "kafka-controller",
                        "tls": False,
                        "replicas": 1,
                        "resources": db_component_resources(),
                        "volumeClaimTemplates": [
                            {
                                "name": "metadata",
                                "spec": {
                                    "storageClassName": None,
                                    "accessModes": ["ReadWriteOnce"],
                                    "resources": {"requests": {"storage": "1Gi"}},
                                },
                            }
                        ],
                    },
                    {
                        "name": "metrics-exp",
                        "componentDef": "kafka-exporter",
                        "replicas": 1,
                        "resources": db_component_resources(),
                    },
                ],
            },
        },
    ]


def build_database_resources(db_type: str) -> List[Dict[str, Any]]:
    if db_type == "postgres":
        return build_postgres_resources()
    if db_type == "mysql":
        return build_mysql_resources()
    if db_type == "mongodb":
        return build_mongodb_resources()
    if db_type == "redis":
        return build_redis_resources()
    if db_type == "kafka":
        return build_kafka_resources()
    return []


def build_object_storage_bucket() -> Dict[str, Any]:
    return {
        "apiVersion": "objectstorage.sealos.io/v1",
        "kind": "ObjectStorageBucket",
        "metadata": {"name": "${{ defaults.app_name }}"},
        "spec": {"policy": "private"},
    }


def build_pg_init_job(database_name: str) -> Dict[str, Any]:
    """Idempotent create-database Job for custom PostgreSQL database names."""
    if SAFE_DB_NAME_RE.fullmatch(database_name) is None:
        raise ValueError(f"unsafe postgresql database name: {json.dumps(database_name)}")
    secret_name = DB_SECRET_NAME_BY_TYPE["postgres"]
    return {
        "apiVersion": "batch/v1",
        "kind": "Job",
        "metadata": {
            "name": "${{ defaults.app_name }}-pg-init",
        },
        "spec": {
            "backoffLimit": 6,
            "ttlSecondsAfterFinished": 300,
            "template": {
                "spec": {
                    "restartPolicy": "OnFailure",
                    "automountServiceAccountToken": False,
                    "containers": [
                        {
                            "name": "pg-init",
                            "image": DB_WAIT_GATE_BY_TYPE["postgres"]["image"],
                            "imagePullPolicy": "IfNotPresent",
                            "env": [
                                build_secret_ref_env_entry("PGHOST", secret_name, "host"),
                                build_secret_ref_env_entry("PGPORT", secret_name, "port"),
                                build_secret_ref_env_entry("PGUSER", secret_name, "username"),
                                build_secret_ref_env_entry("PGPASSWORD", secret_name, "password"),
                                {"name": "PG_TARGET_DB", "value": database_name},
                            ],
                            "command": [
                                "sh",
                                "-c",
                                "set -eu\n"
                                "for i in $(seq 1 150); do pg_isready >/dev/null 2>&1 && break; sleep 2; done\n"
                                "pg_isready >/dev/null 2>&1\n"
                                "if ! psql -d postgres -tAc \"SELECT 1 FROM pg_database WHERE datname='$PG_TARGET_DB'\" | grep -q 1; then\n"
                                '  psql -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \\"$PG_TARGET_DB\\";"\n'
                                "fi",
                            ],
                            "resources": {
                                "limits": dict(DB_WAIT_GATE_RESOURCES["limits"]),
                                "requests": dict(DB_WAIT_GATE_RESOURCES["requests"]),
                            },
                        }
                    ],
                }
            },
        },
    }


def build_mysql_init_job(database_name: str) -> Dict[str, Any]:
    """Idempotent create-database Job for custom MySQL database names."""
    if SAFE_DB_NAME_RE.fullmatch(database_name) is None:
        raise ValueError(f"unsafe mysql database name: {json.dumps(database_name)}")
    secret_name = DB_SECRET_NAME_BY_TYPE["mysql"]
    return {
        "apiVersion": "batch/v1",
        "kind": "Job",
        "metadata": {
            "name": "${{ defaults.app_name }}-mysql-init",
        },
        "spec": {
            "backoffLimit": 6,
            "ttlSecondsAfterFinished": 300,
            "template": {
                "spec": {
                    "restartPolicy": "OnFailure",
                    "automountServiceAccountToken": False,
                    "containers": [
                        {
                            "name": "mysql-init",
                            "image": "mysql:8.0.40",
                            "imagePullPolicy": "IfNotPresent",
                            "env": [
                                build_secret_ref_env_entry("MYSQL_GATE_HOST", secret_name, "host"),
                                build_secret_ref_env_entry("MYSQL_GATE_PORT", secret_name, "port"),
                                build_secret_ref_env_entry("MYSQL_GATE_USER", secret_name, "username"),
                                build_secret_ref_env_entry("MYSQL_PWD", secret_name, "password"),
                                {"name": "MYSQL_TARGET_DB", "value": database_name},
                            ],
                            "command": [
                                "sh",
                                "-c",
                                "set -eu\n"
                                'for i in $(seq 1 150); do mysqladmin ping -h "$MYSQL_GATE_HOST" -P "$MYSQL_GATE_PORT" --silent >/dev/null 2>&1 && break; sleep 2; done\n'
                                'mysqladmin ping -h "$MYSQL_GATE_HOST" -P "$MYSQL_GATE_PORT" --silent >/dev/null 2>&1\n'
                                'mysql -h "$MYSQL_GATE_HOST" -P "$MYSQL_GATE_PORT" -u "$MYSQL_GATE_USER" -e "CREATE DATABASE IF NOT EXISTS \\`$MYSQL_TARGET_DB\\`;"',
                            ],
                            "resources": {
                                "limits": {"cpu": "200m", "memory": "256Mi"},
                                "requests": {"cpu": "20m", "memory": "25Mi"},
                            },
                        }
                    ],
                }
            },
        },
    }


def env_key_forbids_host_rewrite(env_name: str) -> bool:
    """
    True when the env key's semantics forbid rewriting its bare value into a
    network host (driver / database / dialect names such as NODEBB_DB=postgres
    or DB_NAME=postgres must stay literal).
    """
    upper = re.sub(r"[^A-Z0-9]+", "_", env_name.upper())
    return ENV_KEY_HOST_REWRITE_FORBIDDEN_RE.search(upper) is not None


def map_compose_env_value(value: str, db_hosts: Mapping[str, str], env_name: str = "") -> str:
    if not isinstance(value, str):
        return str(value)
    if COMPOSE_REFERENCE_RE.search(value):
        return value
    if value in db_hosts:
        # Replace a bare service-name value with the DB FQDN only when the key
        # has host semantics. Driver/database-name keys keep the literal value,
        # and driver-name values (postgres, mysql, redis, ...) are never hosts
        # unless the key itself says host/endpoint.
        connection_key = detect_db_connection_key(env_name) if env_name else "host"
        host_semantics = connection_key in {"host", "endpoint"}
        forbidden = env_name != "" and (
            env_key_forbids_host_rewrite(env_name)
            or (value.strip().lower() in DB_DRIVER_NAME_VALUES and not host_semantics)
        )
        if not forbidden and (env_name == "" or host_semantics):
            return db_hosts[value]
        if not forbidden and connection_key is None:
            # Unclassified key with an exact service-name value: keep the literal.
            return value
        if forbidden:
            return value
    mapped = value
    for service_name, fqdn in db_hosts.items():
        mapped = mapped.replace(f"@{service_name}:", f"@{fqdn}:")
        mapped = mapped.replace(f"//{service_name}:", f"//{fqdn}:")
        mapped = mapped.replace(f"@{service_name}/", f"@{fqdn}/")
    return mapped


def detect_db_connection_key(env_name: str) -> Optional[str]:
    upper = re.sub(r"[^A-Z0-9]+", "_", env_name.upper())

    if re.search(r"(?:^|_)(?:PASSWORD|PASS|PWD)(?:$|_)", upper):
        return "password"
    if re.search(r"(?:^|_)(?:USERNAME|USER)(?:$|_)", upper):
        return "username"
    if re.search(r"(?:^|_)(?:ENDPOINT|URI|URL|DSN)(?:$|_)", upper):
        return "endpoint"
    if re.search(r"(?:^|_)(?:HOST|SERVER)(?:$|_)", upper):
        return "host"
    if re.search(r"(?:^|_)(?:PORT)(?:$|_)", upper):
        return "port"
    return None


def normalize_env_token(value: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "_", value.upper()).strip("_")


def normalize_endpoint_helper_token(value: str) -> str:
    token = normalize_env_token(value)
    if not token:
        return ""
    filtered = [part for part in token.split("_") if part and part not in {"URL", "URI", "DSN", "ENDPOINT"}]
    return "_".join(filtered)


def build_secret_ref_env_entry(env_name: str, secret_name: str, secret_key: str) -> Dict[str, Any]:
    return {
        "name": env_name,
        "valueFrom": {
            "secretKeyRef": {
                "name": secret_name,
                "key": secret_key,
            }
        },
    }


def infer_db_type_from_value(value: str, db_services: Mapping[str, str]) -> Optional[str]:
    text = value.strip().lower()
    matched: List[str] = []
    for service_name, db_type in db_services.items():
        service = service_name.lower()
        if text == service:
            matched.append(db_type)
            continue
        if f"//{service}" in text or f"@{service}" in text or f"{service}:" in text:
            matched.append(db_type)
            continue
    unique = sorted(set(matched))
    if len(unique) == 1:
        return unique[0]
    return None


def infer_db_type_from_env_name(env_name: str, available_db_types: Sequence[str]) -> Optional[str]:
    upper = env_name.upper()
    candidates: List[str] = []
    for db_type in sorted(set(available_db_types)):
        hints = DB_ENV_HINTS_BY_TYPE.get(db_type, ())
        if any(hint in upper for hint in hints):
            candidates.append(db_type)

    unique = sorted(set(candidates))
    if len(unique) == 1:
        return unique[0]

    deduped = sorted(set(available_db_types))
    if ("DB" in upper or "DATABASE" in upper) and len(deduped) == 1:
        return deduped[0]
    return None


def infer_db_secret_ref(
    env_name: str,
    value: str,
    db_services: Mapping[str, str],
    family_db_types: Optional[Mapping[str, str]] = None,
) -> Optional[Dict[str, str]]:
    connection_key = detect_db_connection_key(env_name)
    if connection_key is None:
        return None
    # Driver/database-name keys (DB_NAME, NODEBB_DB, DB_DIALECT, ...) are not
    # connection fields even when their token matches HOST/NAME heuristics.
    if env_key_forbids_host_rewrite(env_name):
        return None

    available_db_types = list(db_services.values())
    if not available_db_types:
        return None

    from_value = infer_db_type_from_value(value, db_services)
    from_name = infer_db_type_from_env_name(env_name, available_db_types)
    from_family = (family_db_types or {}).get(env_family_name(env_name))
    db_type = from_value or from_name or from_family
    if db_type is None:
        return None

    # Some KubeBlocks account secrets only expose credentials. Host/port use
    # stable Sealos Service FQDN values for those databases instead.
    if db_type == "redis" and connection_key in {"host", "port"}:
        return None

    secret_name = DB_SECRET_NAME_BY_TYPE.get(db_type)
    if not isinstance(secret_name, str):
        return None

    return {"name": secret_name, "key": connection_key, "db_type": db_type}


def build_db_url_composed_env_entries(
    env_name: str,
    raw_value: str,
    secret_name: str,
    db_type: str,
    db_services: Mapping[str, str],
) -> Optional[List[Dict[str, Any]]]:
    text = raw_value.strip()
    if not text or COMPOSE_REFERENCE_RE.search(text):
        return None

    parsed = urlparse(text)
    host = (parsed.hostname or "").strip().lower()
    if not parsed.scheme or not host or host not in db_services:
        return None

    env_token = normalize_endpoint_helper_token(env_name) or "DB_CONNECTION"
    db_token = normalize_env_token(db_type) or "DB"

    host_var = f"SEALOS_{env_token}_{db_token}_HOST"
    port_var = f"SEALOS_{env_token}_{db_token}_PORT"
    user_var = f"SEALOS_{env_token}_{db_token}_USERNAME"
    password_var = f"SEALOS_{env_token}_{db_token}_PASSWORD"

    helper_entries: List[Dict[str, Any]]
    if db_type == "redis":
        helper_entries = [
            {"name": host_var, "value": DB_FQDN_BY_TYPE["redis"]},
            {"name": port_var, "value": "6379"},
        ]
    elif db_type == "mongodb":
        helper_entries = [
            {"name": host_var, "value": DB_FQDN_BY_TYPE["mongodb"]},
            {"name": port_var, "value": "27017"},
        ]
    else:
        helper_entries = [
            build_secret_ref_env_entry(host_var, secret_name, "host"),
            build_secret_ref_env_entry(port_var, secret_name, "port"),
        ]

    auth_prefix = ""
    has_auth = "@" in parsed.netloc
    has_username = parsed.username not in (None, "")
    has_password = parsed.password is not None

    if has_username:
        helper_entries.append(build_secret_ref_env_entry(user_var, secret_name, "username"))
    if has_password:
        helper_entries.append(build_secret_ref_env_entry(password_var, secret_name, "password"))

    if has_auth:
        if has_username and has_password:
            auth_prefix = f"$({user_var}):$({password_var})@"
        elif has_username:
            auth_prefix = f"$({user_var})@"
        elif has_password:
            auth_prefix = f":$({password_var})@"

    # Always compose host:port — R017 accepts a $(VAR)-composed endpoint only
    # when it references the secret's endpoint or both host and port, and
    # engines behind KubeBlocks always publish a port key.
    host_port = f"$({host_var}):$({port_var})"

    suffix = parsed.path or ""
    if parsed.query:
        suffix = f"{suffix}?{parsed.query}"
    if parsed.fragment:
        suffix = f"{suffix}#{parsed.fragment}"

    composed_url = f"{parsed.scheme}://{auth_prefix}{host_port}{suffix}"
    helper_entries.append({"name": env_name, "value": composed_url})
    return helper_entries


def build_env_family_db_types(
    env_pairs: Sequence[Tuple[str, str]],
    db_services: Mapping[str, str],
) -> Dict[str, str]:
    """
    Family binding: group env keys by their prefix before the connection token
    (DB_HOST/DB_PORT/DB_PASSWORD share family "DB"), then bind each family to a
    database type using the members whose value provably references a db
    service (bare service name or URL host). This disambiguates generic
    families (DB_*) when the compose file has more than one database type.
    """
    family_types: Dict[str, Set[str]] = {}
    for key, value in env_pairs:
        connection_key = detect_db_connection_key(key)
        if connection_key is None:
            continue
        family = env_family_name(key)
        if not family:
            continue
        db_type: Optional[str] = None
        if connection_key in {"host", "endpoint"}:
            db_type = infer_db_type_from_value(value, db_services)
        if db_type is None:
            continue
        family_types.setdefault(family, set()).add(db_type)
    return {family: next(iter(types)) for family, types in family_types.items() if len(types) == 1}


def env_family_name(env_name: str) -> str:
    """Family name is the key prefix before its trailing connection token."""
    upper = re.sub(r"[^A-Z0-9]+", "_", env_name.upper())
    match = re.match(
        r"^(.*?)_?(?:PASSWORD|PASS|PWD|USERNAME|USER|ENDPOINT|URI|URL|DSN|HOST|SERVER|PORT|NAME|DATABASE|DB)$",
        upper,
    )
    if match is None:
        return ""
    return match.group(1) or ""


def _is_compose_reference(value: str) -> bool:
    return COMPOSE_REFERENCE_RE.search(value) is not None


def _input_name_for_env_key(env_key: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", env_key.lower()).strip("_")


def build_env_entries(
    service: Mapping[str, Any],
    db_hosts: Mapping[str, str],
    db_services: Mapping[str, str],
    *,
    service_name: str = "",
    profile: str = "template-repo",
) -> EnvBuildResult:
    entries: List[Dict[str, Any]] = []
    inputs: Dict[str, Dict[str, Any]] = {}
    defaults: Dict[str, Dict[str, str]] = {}
    db_databases: Dict[str, str] = {}
    report_items: List[Dict[str, Any]] = []
    env_pairs = parse_env(service)
    family_db_types = build_env_family_db_types(env_pairs, db_services)

    for key, value in env_pairs:
        upper_key = key.upper()

        # 1. Deployer-selected bootstrap credentials become required inputs.
        if BOOTSTRAP_CRED_ENV_RE.search(upper_key) and not _is_compose_reference(value):
            input_name = _input_name_for_env_key(key)
            identity = BOOTSTRAP_CRED_IDENTITY_RE.search(upper_key) is not None
            if identity:
                noun = "email" if "MAIL" in upper_key else "username"
                description = f"Initial administrator {noun} (created on first start)."
            else:
                description = (
                    "Initial administrator password (created on first start; "
                    "follow the upstream password rules)."
                )
            inputs[input_name] = {"description": description, "type": "string", "required": True}
            entries.append({"name": key, "value": f"${{{{ inputs.{input_name} }}}}"})
            report_items.append(
                {
                    "kind": "decision",
                    "code": "bootstrap-credential-input",
                    "service": service_name,
                    "detail": f'{key} converted to required template input "{input_name}" (was a compose literal).',
                }
            )
            continue

        # 2. Generated app secrets: replace placeholder literals with random defaults.
        normalized_key = re.sub(r"[^A-Z0-9]+", "_", upper_key)
        if (
            GENERATED_SECRET_ENV_RE.search(normalized_key)
            and not _is_compose_reference(value)
            and (PLACEHOLDER_SECRET_VALUE_RE.search(value.strip()) or len(value.strip()) < 24)
        ):
            default_name = _input_name_for_env_key(key)
            defaults[default_name] = {"type": "string", "value": "${{ random(32) }}"}
            entries.append({"name": key, "value": f"${{{{ defaults.{default_name} }}}}"})
            report_items.append(
                {
                    "kind": "decision",
                    "code": "generated-secret-default",
                    "service": service_name,
                    "detail": (
                        f"{key} generated via defaults.{default_name} = random(32); verify the app accepts "
                        "an opaque alphanumeric value (use a required input instead when the format is "
                        "constrained)."
                    ),
                }
            )
            continue

        # 3. Public URL / public host envs point at the app's own ingress.
        if upper_key in PUBLIC_URL_ENV_KEYS and PUBLIC_URL_PLACEHOLDER_RE.search(value.strip()):
            entries.append({"name": key, "value": PUBLIC_URL_TEMPLATE})
            report_items.append(
                {
                    "kind": "decision",
                    "code": "public-url-derived",
                    "service": service_name,
                    "detail": f"{key} set to the public app URL (was {json.dumps(value)}).",
                }
            )
            continue
        if upper_key in PUBLIC_HOST_ENV_KEYS and PUBLIC_URL_PLACEHOLDER_RE.search(value.strip()):
            entries.append({"name": key, "value": PUBLIC_HOST_TEMPLATE})
            report_items.append(
                {
                    "kind": "decision",
                    "code": "public-host-derived",
                    "service": service_name,
                    "detail": f"{key} set to the public app host (was {json.dumps(value)}).",
                }
            )
            continue

        # 4. Database connection wiring (secret refs / composed URLs).
        secret_ref = infer_db_secret_ref(key, value, db_services, family_db_types)
        if secret_ref is not None:
            if secret_ref["key"] == "endpoint":
                composed_entries = build_db_url_composed_env_entries(
                    env_name=key,
                    raw_value=value,
                    secret_name=secret_ref["name"],
                    db_type=secret_ref["db_type"],
                    db_services=db_services,
                )
                if composed_entries is not None:
                    entries.extend(composed_entries)
                    db_name = re.sub(r"^/", "", urlparse(value.strip()).path or "")
                    if db_name:
                        db_databases[secret_ref["db_type"]] = db_name
                    continue

            entries.append(build_secret_ref_env_entry(key, secret_ref["name"], secret_ref["key"]))
            continue

        # 5. Database-name members of a bound family: keep literal, record for init.
        family_type = family_db_types.get(env_family_name(key))
        if (
            family_type
            and re.search(r"(?:^|_)(?:NAME|DATABASE)$", normalized_key)
            and not _is_compose_reference(value)
            and value.strip() != ""
        ):
            db_databases[family_type] = value.strip()
            entries.append({"name": key, "value": value})
            continue

        entries.append(
            {
                "name": key,
                "value": map_compose_env_value(value, db_hosts, key),
            }
        )
    return EnvBuildResult(
        entries=entries,
        inputs=inputs,
        defaults=defaults,
        db_databases=db_databases,
        report_items=report_items,
    )


def build_pod_security_context(image_user: Optional[str], has_volumes: bool) -> PodSecurityContextResult:
    """
    Pod securityContext for non-root images that write persistent volumes.
    Context is None when the image runs as root (or user is unknown) or when
    the workload has no volumes to own.
    """
    if not has_volumes:
        return PodSecurityContextResult(context=None, unresolved_user=None)
    raw = (image_user or "").strip()
    if not raw or raw in {"root", "0", "0:0"}:
        return PodSecurityContextResult(context=None, unresolved_user=None)
    parts = raw.split(":")
    user_part = parts[0]
    group_part = parts[1] if len(parts) > 1 else ""
    if re.fullmatch(r"\d+", user_part) is None:
        # Symbolic user (e.g. "nodebb"): fsGroup needs a numeric id. Surface it
        # instead of guessing.
        return PodSecurityContextResult(context=None, unresolved_user=raw)
    uid = int(user_part)
    gid = int(group_part) if re.fullmatch(r"\d+", group_part) else uid
    return PodSecurityContextResult(
        context={
            "runAsNonRoot": True,
            "runAsUser": uid,
            "runAsGroup": gid,
            "fsGroup": gid,
            "fsGroupChangePolicy": "OnRootMismatch",
        },
        unresolved_user=None,
    )


def build_db_wait_init_containers(
    depends_on_db_types: Sequence[str],
    db_databases: Optional[Mapping[str, str]] = None,
) -> List[Dict[str, Any]]:
    """
    initContainers that gate app start on database readiness. One gate per
    database type the service depends on; kills the crash-loop-while-db-boots
    race that dominates first-deploy latency.

    When the app uses a custom database name (created by the emitted init
    Job), the gate waits for that database to exist — server readiness alone
    still races the init Job.
    """
    db_databases = db_databases or {}
    containers: List[Dict[str, Any]] = []
    for db_type in sorted(set(depends_on_db_types)):
        gate = DB_WAIT_GATE_BY_TYPE.get(db_type)
        if gate is None:
            continue
        secret_name = DB_SECRET_NAME_BY_TYPE[db_type]
        custom_db = db_databases.get(db_type)

        if (
            db_type == "postgres"
            and custom_db
            and custom_db != "postgres"
            and SAFE_DB_NAME_RE.fullmatch(custom_db)
        ):
            containers.append(
                {
                    "name": "wait-for-postgres",
                    "image": gate["image"],
                    "imagePullPolicy": "IfNotPresent",
                    "env": [
                        build_secret_ref_env_entry("PGHOST", secret_name, "host"),
                        build_secret_ref_env_entry("PGPORT", secret_name, "port"),
                        build_secret_ref_env_entry("PGUSER", secret_name, "username"),
                        build_secret_ref_env_entry("PGPASSWORD", secret_name, "password"),
                        {"name": "PG_TARGET_DB", "value": custom_db},
                    ],
                    "command": [
                        "sh",
                        "-c",
                        "for i in $(seq 1 150); do if psql -d postgres -tAc \"SELECT 1 FROM pg_database WHERE datname='$PG_TARGET_DB'\" 2>/dev/null | grep -q 1; then exit 0; fi; sleep 2; done; "
                        'echo "timed out waiting for database $PG_TARGET_DB" >&2; exit 1',
                    ],
                    "resources": {
                        "limits": dict(DB_WAIT_GATE_RESOURCES["limits"]),
                        "requests": dict(DB_WAIT_GATE_RESOURCES["requests"]),
                    },
                }
            )
            continue

        if (
            db_type == "mysql"
            and custom_db
            and custom_db != "mysql"
            and SAFE_DB_NAME_RE.fullmatch(custom_db)
        ):
            containers.append(
                {
                    "name": "wait-for-mysql",
                    "image": "mysql:8.0.40",
                    "imagePullPolicy": "IfNotPresent",
                    "env": [
                        build_secret_ref_env_entry("MYSQL_GATE_HOST", secret_name, "host"),
                        build_secret_ref_env_entry("MYSQL_GATE_PORT", secret_name, "port"),
                        build_secret_ref_env_entry("MYSQL_GATE_USER", secret_name, "username"),
                        build_secret_ref_env_entry("MYSQL_PWD", secret_name, "password"),
                        {"name": "MYSQL_TARGET_DB", "value": custom_db},
                    ],
                    "command": [
                        "sh",
                        "-c",
                        'for i in $(seq 1 150); do if mysql -h "$MYSQL_GATE_HOST" -P "$MYSQL_GATE_PORT" -u "$MYSQL_GATE_USER" -e "USE \\`$MYSQL_TARGET_DB\\`;" >/dev/null 2>&1; then exit 0; fi; sleep 2; done; '
                        'echo "timed out waiting for database $MYSQL_TARGET_DB" >&2; exit 1',
                    ],
                    "resources": {
                        "limits": {"cpu": "200m", "memory": "256Mi"},
                        "requests": {"cpu": "20m", "memory": "25Mi"},
                    },
                }
            )
            continue

        if gate["host_from_secret"]:
            env = [
                build_secret_ref_env_entry("DB_GATE_HOST", secret_name, "host"),
                build_secret_ref_env_entry("DB_GATE_PORT", secret_name, "port"),
            ]
        else:
            env = [
                {"name": "DB_GATE_HOST", "value": DB_FQDN_BY_TYPE[db_type]},
                {"name": "DB_GATE_PORT", "value": gate["default_port"]},
            ]
        containers.append(
            {
                "name": f"wait-for-{db_type}",
                "image": gate["image"],
                "imagePullPolicy": "IfNotPresent",
                "env": env,
                "command": list(gate["command"]),
                "resources": {
                    "limits": dict(DB_WAIT_GATE_RESOURCES["limits"]),
                    "requests": dict(DB_WAIT_GATE_RESOURCES["requests"]),
                },
            }
        )
    return containers


def normalize_memory_to_ladder(raw_bytesish: str) -> Optional[str]:
    """Normalize a compose memory string to the Sealos ladder (Mi values)."""
    match = re.fullmatch(
        r"(\d+(?:\.\d+)?)\s*(b|k|kb|ki|kib|m|mb|mi|mib|g|gb|gi|gib)?",
        raw_bytesish.strip(),
        re.IGNORECASE,
    )
    if match is None:
        return None
    value = float(match.group(1))
    unit = (match.group(2) or "b").lower()
    multipliers = {
        "b": 1,
        "k": 1024,
        "kb": 1000,
        "ki": 1024,
        "kib": 1024,
        "m": 1024**2,
        "mb": 1000**2,
        "mi": 1024**2,
        "mib": 1024**2,
        "g": 1024**3,
        "gb": 1000**3,
        "gi": 1024**3,
        "gib": 1024**3,
    }
    mi = value * multipliers[unit] / 1024**2
    for step in (128, 256, 512, 1024, 2048, 4096, 8192, 16384):
        if mi <= step:
            return f"{step}Mi"
    return "16384Mi"


def normalize_cpu_to_ladder(raw_cpus: str) -> Optional[str]:
    """Normalize a compose cpus value to the Sealos ladder."""
    try:
        value = float(raw_cpus.strip())
    except ValueError:
        return None
    if not math.isfinite(value) or value <= 0:
        return None
    milli = value * 1000
    for step in (100, 200, 500, 1000, 2000, 3000, 4000, 8000):
        if milli <= step:
            return str(step // 1000) if step >= 1000 else f"{step}m"
    return "8"


def infer_resource_tier(
    image: str,
    service: Mapping[str, Any],
    hint: Optional[Mapping[str, str]] = None,
) -> Dict[str, Any]:
    """
    Resource tier for an app container: explicit hint > compose deploy limits >
    heavy-runtime fingerprint > personal low-load default.
    """
    if hint:
        return {"limits": dict(hint), "source": "resource-hint"}

    deploy = service.get("deploy")
    if isinstance(deploy, dict):
        resources = deploy.get("resources")
        limits_raw = resources.get("limits") if isinstance(resources, dict) else None
        if isinstance(limits_raw, dict):
            raw_cpu = limits_raw.get("cpus")
            raw_memory = limits_raw.get("memory")
            cpu = (
                normalize_cpu_to_ladder(str(raw_cpu))
                if isinstance(raw_cpu, (str, int, float)) and not isinstance(raw_cpu, bool)
                else None
            )
            memory = normalize_memory_to_ladder(raw_memory) if isinstance(raw_memory, str) else None
            if cpu or memory:
                return {
                    "limits": {
                        "cpu": cpu or DEFAULT_RESOURCE_LIMITS["cpu"],
                        "memory": memory or DEFAULT_RESOURCE_LIMITS["memory"],
                    },
                    "source": "compose-deploy-limits",
                }

    for pattern, limits in HEAVY_RUNTIME_IMAGE_HINTS:
        if pattern.search(image):
            return {"limits": dict(limits), "source": "heavy-runtime-fingerprint"}
    return {"limits": dict(DEFAULT_RESOURCE_LIMITS), "source": "default"}


def derive_requests_from_limits(limits: Mapping[str, str]) -> Dict[str, str]:
    """Requests derived from limits by the Sealos drop-last-digit rule."""
    return {
        "cpu": SEALOS_CPU_REQUEST_BY_LIMIT.get(limits["cpu"], DEFAULT_RESOURCE_REQUESTS["cpu"]),
        "memory": SEALOS_MEMORY_REQUEST_BY_LIMIT.get(limits["memory"], DEFAULT_RESOURCE_REQUESTS["memory"]),
    }


def parse_service_replicas(service: Mapping[str, Any]) -> int:
    deploy = service.get("deploy")
    if deploy is None:
        return 1
    if not isinstance(deploy, dict):
        raise ValueError("service deploy must be an object when provided")

    replicas = deploy.get("replicas", 1)
    if isinstance(replicas, bool) or not isinstance(replicas, int) or replicas < 1:
        raise ValueError("service deploy.replicas must be a positive integer")
    return replicas


def build_workload(
    *,
    workload_name: str,
    image: str,
    replicas: int,
    ports: Sequence[int],
    websocket_ports: Set[int],
    env_entries: Sequence[Dict[str, Any]],
    command_args: Sequence[str],
    mount_paths: Sequence[str],
    config_mounts: Sequence[ConfigMount],
    probes: Mapping[str, Any],
    init_containers: Sequence[Dict[str, Any]] = (),
    security_context: Optional[Mapping[str, Any]] = None,
    resource_limits: Optional[Mapping[str, str]] = None,
) -> Dict[str, Any]:
    db_type = detect_db_type(image)
    if db_type in SPECIAL_DB_RESOURCE_TYPES:
        raise ValueError(
            f"refusing to generate an application workload for {db_type} database image {image!r}; "
            "database services must use KubeBlocks Cluster resources"
        )

    limits = dict(resource_limits) if resource_limits else dict(DEFAULT_RESOURCE_LIMITS)
    requests = derive_requests_from_limits(limits)
    is_stateful = bool(mount_paths)
    kind = "StatefulSet" if is_stateful else "Deployment"
    template_spec: Dict[str, Any] = {
        "automountServiceAccountToken": False,
        "containers": [
            {
                "name": workload_name,
                "image": image,
                "imagePullPolicy": "IfNotPresent",
                "resources": {
                    "limits": dict(limits),
                    "requests": dict(requests),
                },
            }
        ],
    }
    if security_context:
        template_spec["securityContext"] = dict(security_context)
    if init_containers:
        template_spec["initContainers"] = [dict(item) for item in init_containers]
    container = template_spec["containers"][0]
    if ports:
        container["ports"] = [
            {
                "containerPort": p,
                "name": "websocket" if p in websocket_ports else f"tcp-{p}",
            }
            for p in ports
        ]
    if env_entries:
        container["env"] = list(env_entries)
    if command_args:
        container["args"] = list(command_args)
    if probes:
        for key in ("livenessProbe", "readinessProbe", "startupProbe"):
            value = probes.get(key)
            if isinstance(value, dict):
                container[key] = value
    volume_mounts: List[Dict[str, Any]] = []
    if mount_paths:
        volume_mounts.extend(
            {
                "name": path_to_vn_name(path),
                "mountPath": path,
            }
            for path in mount_paths
        )
    if config_mounts:
        volume_mounts.extend(
            {
                "name": f"{workload_name}-cm",
                "mountPath": mount.target,
                "subPath": mount.key,
                "readOnly": True,
            }
            for mount in config_mounts
        )
    if volume_mounts:
        container["volumeMounts"] = volume_mounts

    spec: Dict[str, Any] = {
        "replicas": replicas,
        "revisionHistoryLimit": 1,
        "selector": {"matchLabels": {"app": workload_name}},
        "template": {
            "metadata": {"labels": {"app": workload_name}},
            "spec": template_spec,
        },
    }
    if is_stateful:
        spec["serviceName"] = workload_name
        spec["volumeClaimTemplates"] = [
            {
                "metadata": {
                    "name": path_to_vn_name(path),
                    "annotations": {"path": path, "value": "1"},
                },
                "spec": {
                    "accessModes": ["ReadWriteOnce"],
                    "resources": {"requests": {"storage": "1Gi"}},
                },
            }
            for path in mount_paths
        ]
    if config_mounts:
        template_spec.setdefault("volumes", []).append(
            {
                "name": f"{workload_name}-cm",
                "configMap": {
                    "name": workload_name,
                },
            }
        )

    return {
        "apiVersion": "apps/v1",
        "kind": kind,
        "metadata": {
            "name": workload_name,
            "annotations": {
                "originImageName": image,
                "deploy.cloud.sealos.io/minReplicas": str(replicas),
                "deploy.cloud.sealos.io/maxReplicas": str(replicas),
            },
            "labels": {
                "cloud.sealos.io/app-deploy-manager": workload_name,
                "app": workload_name,
            },
        },
        "spec": spec,
    }

def build_configmap(workload_name: str, config_mounts: Sequence[ConfigMount]) -> Dict[str, Any]:
    return {
        "apiVersion": "v1",
        "kind": "ConfigMap",
        "metadata": {
            "name": workload_name,
            "labels": {
                "app": workload_name,
                "cloud.sealos.io/app-deploy-manager": workload_name,
            },
        },
        "data": {mount.key: mount.content for mount in config_mounts},
    }


def build_service(workload_name: str, ports: Sequence[int], websocket_ports: Set[int]) -> Optional[Dict[str, Any]]:
    if not ports:
        return None
    service_ports = [
        {
            "name": "websocket" if p in websocket_ports else f"tcp-{p}",
            "port": p,
            "targetPort": p,
            "protocol": "TCP",
        }
        for p in ports
    ]
    return {
        "apiVersion": "v1",
        "kind": "Service",
        "metadata": {
            "name": workload_name,
            "labels": {
                "app": workload_name,
                "cloud.sealos.io/app-deploy-manager": workload_name,
            },
        },
        "spec": {
            "ports": service_ports,
            "selector": {"app": workload_name},
        },
    }


def build_ingress(primary_workload_name: str, port: int, protocol: str = "HTTP") -> Dict[str, Any]:
    annotations = WEBSOCKET_INGRESS_ANNOTATIONS if protocol.upper() == "WS" else HTTP_INGRESS_ANNOTATIONS
    return {
        "apiVersion": "networking.k8s.io/v1",
        "kind": "Ingress",
        "metadata": {
            "name": primary_workload_name,
            "labels": {
                "cloud.sealos.io/app-deploy-manager": primary_workload_name,
                "cloud.sealos.io/app-deploy-manager-domain": "${{ defaults.app_host }}",
            },
            "annotations": {
                **annotations,
            },
        },
        "spec": {
            "rules": [
                {
                    "host": "${{ defaults.app_host }}.${{ SEALOS_CLOUD_DOMAIN }}",
                    "http": {
                        "paths": [
                            {
                                "pathType": "Prefix",
                                "path": "/",
                                "backend": {
                                    "service": {
                                        "name": primary_workload_name,
                                        "port": {"number": port},
                                    }
                                },
                            }
                        ]
                    },
                }
            ],
            "tls": [
                {
                    "hosts": ["${{ defaults.app_host }}.${{ SEALOS_CLOUD_DOMAIN }}"],
                    "secretName": "${{ SEALOS_CERT_SECRET_NAME }}",
                }
            ],
        },
    }


def build_app_resource(meta: MetadataOptions) -> Dict[str, Any]:
    return {
        "apiVersion": "app.sealos.io/v1",
        "kind": "App",
        "metadata": {
            "name": "${{ defaults.app_name }}",
            "labels": {
                "cloud.sealos.io/app-deploy-manager": "${{ defaults.app_name }}",
            },
        },
        "spec": {
            "data": {
                "url": "https://${{ defaults.app_host }}.${{ SEALOS_CLOUD_DOMAIN }}",
            },
            "displayType": "normal",
            "icon": f"{meta.repo_raw_base}/template/{meta.app_name}/logo.{meta.logo_ext}",
            "name": meta.title,
            "type": "link",
        },
    }


def iter_services(compose_data: Mapping[str, Any]) -> Iterable[Tuple[str, Mapping[str, Any]]]:
    services = compose_data.get("services")
    assert isinstance(services, dict)
    for name, service in services.items():
        if isinstance(service, dict):
            yield str(name), service


def validate_images(compose_data: Mapping[str, Any]) -> Dict[str, str]:
    normalized_images: Dict[str, str] = {}
    for service_name, service in iter_services(compose_data):
        image = service.get("image")
        if not isinstance(image, str) or not image.strip():
            raise ValueError(f"service {service_name!r} must define image")
        normalized = normalize_image_reference(image, service_name)
        normalized_images[service_name] = normalized
        if not has_pinned_image(normalized):
            raise ValueError(
                f"service {service_name!r} uses unpinned image {normalized!r}; provide a fixed tag or digest"
            )
    return normalized_images


def render_index_yaml(documents: Sequence[Mapping[str, Any]]) -> str:
    parts = [yaml.safe_dump(doc, sort_keys=False, allow_unicode=True).rstrip() for doc in documents]
    return "\n---\n".join(parts) + "\n"


def cluster_database_type(document: Mapping[str, Any]) -> Optional[str]:
    if document.get("kind") != "Cluster":
        return None
    api_version = document.get("apiVersion")
    if not isinstance(api_version, str) or not api_version.startswith("apps.kubeblocks.io/"):
        return None

    metadata = document.get("metadata")
    labels = metadata.get("labels") if isinstance(metadata, dict) else None
    candidates: List[str] = []
    if isinstance(labels, dict):
        for key in ("clusterdefinition.kubeblocks.io/name", "kb.io/database"):
            value = labels.get(key)
            if isinstance(value, str):
                candidates.append(value.strip().lower())

    spec = document.get("spec")
    component_specs = spec.get("componentSpecs") if isinstance(spec, dict) else None
    if isinstance(component_specs, list):
        for component in component_specs:
            if not isinstance(component, dict):
                continue
            for key in ("componentDef", "componentDefRef", "name"):
                value = component.get(key)
                if isinstance(value, str):
                    candidates.append(value.strip().lower())

    for db_type, patterns in DB_TYPE_PATTERNS.items():
        for candidate in candidates:
            if any(candidate == pattern or candidate.startswith(f"{pattern}-") for pattern in patterns):
                return db_type
    return None


def validate_generated_database_contract(
    documents: Sequence[Mapping[str, Any]],
    db_services: Mapping[str, str],
) -> None:
    expected_types = set(db_services.values())
    actual_types = {
        db_type
        for document in documents
        if (db_type := cluster_database_type(document)) in SPECIAL_DB_RESOURCE_TYPES
    }
    missing_types = sorted(expected_types - actual_types)
    if missing_types:
        raise ValueError(
            "database conversion did not emit the required KubeBlocks Cluster resources for: "
            + ", ".join(missing_types)
        )

    for document in documents:
        # Long-running app workloads must not embed database engine images.
        # Jobs / CronJobs / initContainers may use database *client* images for
        # readiness and bootstrap gates (explicitly allowed by the MUST rules;
        # the pg-init reference Job itself runs a postgres client image).
        if document.get("kind") not in {"Deployment", "StatefulSet", "DaemonSet"}:
            continue
        spec = document.get("spec")
        if not isinstance(spec, dict):
            continue
        template = spec.get("template")
        template_spec = template.get("spec") if isinstance(template, dict) else None
        containers = template_spec.get("containers") if isinstance(template_spec, dict) else None
        if not isinstance(containers, list):
            continue
        for container in containers:
            image = container.get("image") if isinstance(container, dict) else None
            db_type = detect_db_type(image) if isinstance(image, str) else None
            if db_type in SPECIAL_DB_RESOURCE_TYPES:
                raise ValueError(
                    f"generated {document.get('kind')} contains {db_type} database image {image!r}; "
                    "database services must remain KubeBlocks Cluster resources"
                )


def parse_depends_on(service: Mapping[str, Any]) -> List[str]:
    """Parse compose depends_on into a service-name list."""
    depends_on = service.get("depends_on")
    if isinstance(depends_on, list):
        return [str(item) for item in depends_on if isinstance(item, str)]
    if isinstance(depends_on, dict):
        return [str(key) for key in depends_on.keys()]
    return []


def db_types_wired_in_env(env_entries: Sequence[Mapping[str, Any]], db_types: Sequence[str]) -> List[str]:
    """Database types actually wired into a service's generated env entries."""
    rendered = json.dumps(list(env_entries))
    wired: List[str] = []
    for db_type in dict.fromkeys(db_types):
        secret_name = DB_SECRET_NAME_BY_TYPE.get(db_type)
        fqdn = DB_FQDN_BY_TYPE.get(db_type)
        if (isinstance(secret_name, str) and secret_name in rendered) or (
            isinstance(fqdn, str) and fqdn in rendered
        ):
            wired.append(db_type)
    return wired


def build_documents(
    compose_data: Mapping[str, Any],
    meta: MetadataOptions,
    kompose_shapes: Optional[Mapping[str, ServiceShape]] = None,
    compose_path: Optional[Path] = None,
    *,
    image_resolution: Optional[ImageResolutionMap] = None,
    profile: str = "template-repo",
    resource_hints: Optional[Mapping[str, Mapping[str, str]]] = None,
    report: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    image_resolution = image_resolution or {}
    resource_hints = resource_hints or {}
    if report is None:
        report = new_conversion_report(profile)

    normalized_images = validate_images(compose_data)
    service_items = list(iter_services(compose_data))
    if not service_items:
        raise ValueError("compose file has no services")

    digest_cache: Dict[str, str] = {}
    tag_cache: Dict[str, List[str]] = {}
    resolved_images: Dict[str, str] = {}
    for service_name, service in service_items:
        source_image = normalized_images.get(service_name, str(service.get("image", "")).strip())
        if not source_image:
            continue
        if detect_db_type(source_image) in SPECIAL_DB_RESOURCE_TYPES:
            resolved_images[service_name] = source_image
            continue
        resolved_images[service_name] = resolve_image_reference(
            source_image,
            digest_cache=digest_cache,
            tag_cache=tag_cache,
            image_resolution=image_resolution,
        )

    db_services: Dict[str, str] = {}
    app_services: List[Tuple[str, Mapping[str, Any]]] = []
    gateway_services: List[Tuple[str, Mapping[str, Any]]] = []
    for name, service in service_items:
        image = resolved_images.get(name, str(service.get("image", "")))
        db_type = detect_db_type(image)
        if db_type in SPECIAL_DB_RESOURCE_TYPES:
            db_services[name] = db_type
        else:
            if is_platform_edge_gateway_service(name, service, image):
                gateway_services.append((name, service))
            else:
                app_services.append((name, service))

    if not app_services:
        if gateway_services:
            app_services = gateway_services[:1]
        elif db_services:
            raise ValueError(
                "compose contains database services but no application service; "
                "refusing to convert a database into an application workload"
            )
        else:
            app_services = service_items[:1]

    db_hosts = {name: DB_FQDN_BY_TYPE[db_type] for name, db_type in db_services.items() if db_type in DB_FQDN_BY_TYPE}

    all_env_keys = set()
    for _, service in app_services:
        for key, _ in parse_env(service):
            all_env_keys.add(key)

    ordered_db_types: List[str] = []
    for service_name, _ in service_items:
        db_type = db_services.get(service_name)
        if not isinstance(db_type, str):
            continue
        if db_type in ordered_db_types:
            continue
        ordered_db_types.append(db_type)

    workload_docs: List[Dict[str, Any]] = []
    service_docs: List[Dict[str, Any]] = []
    merged_inputs: Dict[str, Dict[str, Any]] = {}
    merged_defaults: Dict[str, Dict[str, str]] = {}
    merged_db_databases: Dict[str, str] = {}
    primary_port: Optional[int] = None
    primary_ingress_protocol = "HTTP"
    primary_workload_name = "${{ defaults.app_name }}"
    compose_dir = compose_path.parent if compose_path is not None else Path.cwd()
    for index, (service_name, service) in enumerate(app_services):
        workload_name = (
            primary_workload_name
            if index == 0
            else f"${{{{ defaults.app_name }}}}-{normalize_k8s_name(service_name)}"
        )
        image = resolved_images.get(service_name, str(service["image"]).strip())
        ports = parse_ports(service)
        env_result = build_env_entries(
            service,
            db_hosts,
            db_services,
            service_name=service_name,
            profile=profile,
        )
        merged_inputs.update(env_result.inputs)
        merged_defaults.update(env_result.defaults)
        merged_db_databases.update(env_result.db_databases)
        report["items"].extend(env_result.report_items)

        command_args = parse_command_args(service)
        mount_paths = parse_mount_paths(service)
        config_mounts = parse_config_mounts(service, compose_data, compose_dir)
        if kompose_shapes:
            shape = kompose_shapes.get(normalize_k8s_name(service_name))
            if shape is not None:
                if not ports:
                    ports = list(shape.ports)
                if not mount_paths:
                    mount_paths = list(shape.mount_paths)
        ports = normalize_ports_for_gateway_tls_termination(ports)
        websocket_ports = infer_websocket_ports(service)
        probes = build_probe_pair(service, image, ports, command_args)

        # Database readiness gates: union of declared depends_on database
        # services and databases actually wired into the env.
        depends_on_db_types = [db_services[dep] for dep in parse_depends_on(service) if dep in db_services]
        wired_db_types = db_types_wired_in_env(env_result.entries, list(db_services.values()))
        gate_db_types = list(dict.fromkeys([*depends_on_db_types, *wired_db_types]))
        init_containers = build_db_wait_init_containers(gate_db_types, dict(merged_db_databases))
        if init_containers:
            report["items"].append(
                {
                    "kind": "decision",
                    "code": "db-wait-gate",
                    "service": service_name,
                    "detail": f"added initContainer readiness gate(s) for: {', '.join(sorted(gate_db_types))}.",
                }
            )

        # Non-root images writing volumes need volume ownership context.
        original_ref = normalized_images.get(service_name, str(service.get("image", ""))).strip()
        resolution_entry = image_resolution.get(original_ref) or image_resolution.get(image) or {}
        resolution_config = resolution_entry.get("config") or {}
        security = build_pod_security_context(resolution_config.get("user"), bool(mount_paths))
        if security.context:
            report["items"].append(
                {
                    "kind": "decision",
                    "code": "security-context",
                    "service": service_name,
                    "detail": (
                        f"image runs as uid {resolution_config.get('user')} and writes volumes; "
                        "emitted pod securityContext with fsGroup."
                    ),
                }
            )
        elif security.unresolved_user:
            report["items"].append(
                {
                    "kind": "required_action",
                    "code": "security-context-unresolved-user",
                    "service": service_name,
                    "detail": (
                        f"image user {json.dumps(security.unresolved_user)} is symbolic and writes volumes; "
                        "resolve the numeric uid (docker run --rm <image> id -u) and add "
                        "runAsUser/runAsGroup/fsGroup to the pod securityContext."
                    ),
                }
            )

        tier = infer_resource_tier(image, service, resource_hints.get(service_name))
        if tier["source"] != "default":
            report["items"].append(
                {
                    "kind": "decision",
                    "code": "resource-tier",
                    "service": service_name,
                    "detail": (
                        f"container limits {tier['limits']['cpu']}/{tier['limits']['memory']} "
                        f"from {tier['source']}."
                    ),
                }
            )

        workload = build_workload(
            workload_name=workload_name,
            image=image,
            replicas=parse_service_replicas(service),
            ports=ports,
            websocket_ports=websocket_ports,
            env_entries=env_result.entries,
            command_args=command_args,
            mount_paths=mount_paths,
            config_mounts=config_mounts,
            probes=probes,
            init_containers=init_containers,
            security_context=security.context,
            resource_limits=tier["limits"],
        )
        if config_mounts:
            workload_docs.append(build_configmap(workload_name, config_mounts))
        workload_docs.append(workload)
        service_doc = build_service(workload_name, ports, websocket_ports)
        if service_doc is not None:
            service_docs.append(service_doc)
            if index == 0 and ports:
                primary_port = ports[0]
                if service_requires_websocket_ingress(service_name, service, primary_port):
                    primary_ingress_protocol = "WS"

    docs: List[Dict[str, Any]] = []
    docs.append(
        build_template_resource(
            meta,
            inputs=merged_inputs,
            defaults=merged_defaults,
            profile=profile,
        )
    )
    report["inputs_added"] = sorted(merged_inputs.keys())
    report["defaults_added"] = sorted(merged_defaults.keys())

    if OBJECT_STORAGE_BUCKET_ENV_NAME in all_env_keys or OBJECT_STORAGE_BASE_ENV_NAMES.intersection(all_env_keys):
        docs.append(build_object_storage_bucket())

    for db_type in ordered_db_types:
        docs.extend(build_database_resources(db_type))

    # Custom database names need an idempotent create Job — KubeBlocks only
    # provisions the engine default database.
    pg_database = merged_db_databases.get("postgres")
    if "postgres" in ordered_db_types and pg_database and pg_database != "postgres":
        if SAFE_DB_NAME_RE.fullmatch(pg_database):
            docs.append(build_pg_init_job(pg_database))
            report["items"].append(
                {
                    "kind": "decision",
                    "code": "pg-init-job",
                    "detail": (
                        f"app references postgresql database {json.dumps(pg_database)}; "
                        "emitted ${{ defaults.app_name }}-pg-init Job (idempotent create)."
                    ),
                }
            )
        else:
            report["items"].append(
                {
                    "kind": "required_action",
                    "code": "pg-init-unsafe-name",
                    "detail": (
                        f"postgresql database name {json.dumps(pg_database)} contains characters outside "
                        "[A-Za-z0-9_-]; add a pg-init Job manually or rename the database."
                    ),
                }
            )
    mysql_database = merged_db_databases.get("mysql")
    if "mysql" in ordered_db_types and mysql_database and mysql_database != "mysql":
        if SAFE_DB_NAME_RE.fullmatch(mysql_database):
            docs.append(build_mysql_init_job(mysql_database))
            report["items"].append(
                {
                    "kind": "decision",
                    "code": "mysql-init-job",
                    "detail": (
                        f"app references mysql database {json.dumps(mysql_database)}; "
                        "emitted ${{ defaults.app_name }}-mysql-init Job (idempotent create)."
                    ),
                }
            )
        else:
            report["items"].append(
                {
                    "kind": "required_action",
                    "code": "mysql-init-unsafe-name",
                    "detail": (
                        f"mysql database name {json.dumps(mysql_database)} contains characters outside "
                        "[A-Za-z0-9_-]; add a mysql-init Job manually or rename the database."
                    ),
                }
            )

    docs.extend(workload_docs)
    docs.extend(service_docs)
    if primary_port is not None:
        docs.append(build_ingress(primary_workload_name, primary_port, primary_ingress_protocol))
    docs.append(build_app_resource(meta))
    validate_generated_database_contract(docs, db_services)
    return docs


def convert_compose_to_template(
    *,
    compose_path: Path,
    output_root: Path,
    meta: MetadataOptions,
    kompose_shapes: Optional[Mapping[str, ServiceShape]] = None,
    write_files: bool = True,
    fetch_logo: bool = True,
    image_resolution: Optional[ImageResolutionMap] = None,
    profile: str = "template-repo",
    resource_hints: Optional[Mapping[str, Mapping[str, str]]] = None,
    report_path: str = "",
) -> Tuple[Path, str, Dict[str, Any]]:
    compose_data = parse_compose(compose_path)
    app_dir = output_root / meta.app_name
    if write_files:
        meta = prepare_logo_asset(meta, app_dir, fetch_logo)
    report = new_conversion_report(profile)
    documents = build_documents(
        compose_data,
        meta,
        kompose_shapes=kompose_shapes,
        compose_path=compose_path,
        image_resolution=image_resolution,
        profile=profile,
        resource_hints=resource_hints,
        report=report,
    )
    index_path = app_dir / "index.yaml"
    rendered = render_index_yaml(documents)
    if write_files:
        app_dir.mkdir(parents=True, exist_ok=True)
        index_path.write_text(rendered, encoding="utf-8")
    if report_path:
        report_target = Path(report_path).resolve()
        report_target.parent.mkdir(parents=True, exist_ok=True)
        report_target.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    return index_path, rendered, report


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert Docker Compose to Sealos template deterministically")
    parser.add_argument("--compose", required=True, help="Path to docker-compose YAML")
    parser.add_argument("--output-dir", default="template", help="Output template root directory")
    parser.add_argument("--app-name", default="", help="Template app name (lowercase k8s format)")
    parser.add_argument("--title", default="", help="Template title")
    parser.add_argument("--description", default="", help="Template description")
    parser.add_argument("--url", default="", help="Official app URL")
    parser.add_argument("--git-repo", default="", help="Source repository URL")
    parser.add_argument("--author", default="Sealos", help="Template author")
    parser.add_argument("--category", action="append", default=[], help="Template category (repeatable)")
    parser.add_argument(
        "--repo-raw-base",
        default="https://raw.githubusercontent.com/labring-actions/templates/kb-0.9",
        help="Raw repository base URL for icon fields",
    )
    parser.add_argument(
        "--kompose-mode",
        choices=("auto", "always", "never"),
        default="always",
        help="Use kompose-generated workload shapes: always (required, default), auto (best effort), never (disable)",
    )
    parser.add_argument(
        "--no-fetch-logo",
        action="store_true",
        help="Disable default svgl.app SVG logo search and keep the fallback logo path",
    )
    parser.add_argument(
        "--image-resolution",
        default="",
        help="resolve-images.ts output (digests + image configs); replaces crane resolution and feeds securityContext",
    )
    parser.add_argument(
        "--profile",
        choices=("deploy", "template-repo"),
        default="template-repo",
        help=(
            "deploy: sealos-deploy pipeline artifact (readme/icon point at the source repo); "
            "template-repo: labring templates contribution layout (default)"
        ),
    )
    parser.add_argument("--report", default="", help="Write the machine-readable conversion report JSON")
    parser.add_argument(
        "--resource-hint",
        action="append",
        default=[],
        metavar="SVC=CPU,MEMORY",
        help="Per-service resource limits override using Sealos ladder values (repeatable), e.g. web=1,2048Mi",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print index.yaml content without writing files")
    args = parser.parse_args(argv)

    resource_hints: Dict[str, Dict[str, str]] = {}
    for raw_hint in args.resource_hint:
        match = RESOURCE_HINT_RE.match(raw_hint.strip())
        if match is None:
            parser.error(f"argument --resource-hint: expected SVC=CPU,MEMORY got '{raw_hint}'")
        resource_hints[match.group(1).strip()] = {
            "cpu": match.group(2).strip(),
            "memory": match.group(3).strip(),
        }
    args.resource_hints = resource_hints
    return args


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    compose_path = Path(args.compose).resolve()
    if not compose_path.exists():
        raise SystemExit(f"ERROR: compose file not found: {compose_path}")

    compose_data = parse_compose(compose_path)
    meta = infer_metadata(args, compose_data, compose_path)
    output_root = Path(args.output_dir).resolve()

    image_resolution: ImageResolutionMap = {}
    if args.image_resolution:
        resolution_path = Path(args.image_resolution).resolve()
        if not resolution_path.exists():
            raise SystemExit(f"ERROR: image resolution file not found: {resolution_path}")
        try:
            image_resolution = load_image_resolution_file(resolution_path)
        except (OSError, ValueError) as exc:
            raise SystemExit(f"ERROR: failed to read image resolution file: {exc}") from exc

    try:
        kompose_shapes = resolve_kompose_shapes(compose_path, args.kompose_mode)
        index_path, rendered, _report = convert_compose_to_template(
            compose_path=compose_path,
            output_root=output_root,
            meta=meta,
            kompose_shapes=kompose_shapes,
            write_files=not args.dry_run,
            fetch_logo=not args.no_fetch_logo,
            image_resolution=image_resolution,
            profile=args.profile,
            resource_hints=args.resource_hints,
            report_path=args.report,
        )
    except ValueError as exc:
        raise SystemExit(f"ERROR: {exc}") from exc

    if args.dry_run:
        print(rendered)
    else:
        print(f"Generated: {index_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
