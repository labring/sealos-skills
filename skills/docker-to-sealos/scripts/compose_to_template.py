#!/usr/bin/env python3
"""Deterministic Docker Compose -> Sealos template converter."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import shlex
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional, Sequence, Set, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, quote, urlencode, urlparse, urlunparse
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

DB_CLUSTER_SUFFIX_BY_TYPE: Dict[str, str] = {
    "postgres": "pg",
    "mysql": "mysql",
    "mongodb": "mongo",
    "redis": "redis",
    "kafka": "broker",
}
DB_SERVICE_SUFFIX_BY_TYPE: Dict[str, str] = {
    "postgres": "postgresql",
    "mysql": "mysql",
    "mongodb": "mongodb",
    "redis": "redis-redis",
    "kafka": "kafka",
}
DB_SECRET_SUFFIX_BY_TYPE: Dict[str, str] = {
    "postgres": "conn-credential",
    "mysql": "conn-credential",
    "mongodb": "mongodb-account-root",
    "redis": "redis-account-default",
    "kafka": "account-admin",
}
DB_DEFAULT_PORT_BY_TYPE: Dict[str, int] = {
    "postgres": 5432,
    "mysql": 3306,
    "mongodb": 27017,
    "redis": 6379,
    "kafka": 9092,
}
DB_BOOTSTRAP_CLIENT_IMAGE_BY_TYPE: Dict[str, str] = {
    "postgres": "postgres:16.4",
    "mysql": "mysql:8.0.35",
}
DB_STANDARD_DATA_PATHS_BY_TYPE: Dict[str, Set[str]] = {
    "postgres": {"/var/lib/postgresql/data"},
    "mysql": {"/var/lib/mysql"},
    "mongodb": {"/data/db", "/data/configdb"},
    "redis": {"/data"},
    "kafka": {"/bitnami/kafka", "/var/lib/kafka/data"},
}
DB_STANDARD_ENV_NAMES_BY_TYPE: Dict[str, Set[str]] = {
    "postgres": {"POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD"},
    "mysql": {
        "MYSQL_DATABASE",
        "MYSQL_USER",
        "MYSQL_PASSWORD",
        "MYSQL_ROOT_PASSWORD",
        "MYSQL_RANDOM_ROOT_PASSWORD",
        "MYSQL_ALLOW_EMPTY_PASSWORD",
        "MARIADB_DATABASE",
        "MARIADB_USER",
        "MARIADB_PASSWORD",
        "MARIADB_ROOT_PASSWORD",
        "MARIADB_RANDOM_ROOT_PASSWORD",
        "MARIADB_ALLOW_EMPTY_ROOT_PASSWORD",
    },
    "mongodb": set(),
    "redis": set(),
    "kafka": set(),
}
DB_MANAGED_SERVICE_KEYS = {
    "image",
    "environment",
    "volumes",
    "healthcheck",
    "restart",
    "ports",
    "expose",
    "networks",
    "depends_on",
    "container_name",
    "deploy",
}
DB_KUBEBLOCKS_COMPATIBLE_IMAGE_NAMES: Dict[str, Set[str]] = {
    "postgres": {"postgres", "postgresql"},
    "mysql": {"mysql", "mariadb", "apecloud-mysql"},
    "mongodb": {"mongo", "mongodb", "mongodb-community-server"},
    "redis": {"redis", "valkey"},
    "kafka": {"kafka"},
}
DB_BOOTSTRAP_ANNOTATION = "docker-to-sealos.database-bootstrap"
DB_CLUSTER_ANNOTATION = "docker-to-sealos.database-cluster"
DB_ENGINE_ANNOTATION = "docker-to-sealos.database-engine"
KUBEBLOCKS_FALLBACK_ANNOTATION = "docker-to-sealos.kubeblocks-fallback-reason"
DATABASE_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9_]+$")
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
SHA256_DIGEST_RE = re.compile(r"^sha256:[0-9a-fA-F]{64}$")
REGISTRY_REQUEST_TIMEOUT = 20
REGISTRY_MANIFEST_ACCEPT = ", ".join(
    (
        "application/vnd.oci.image.index.v1+json",
        "application/vnd.oci.image.manifest.v1+json",
        "application/vnd.docker.distribution.manifest.list.v2+json",
        "application/vnd.docker.distribution.manifest.v2+json",
    )
)
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


@dataclass(frozen=True)
class DatabasePlan:
    service_name: str
    db_type: str
    source_image: str
    service: Mapping[str, Any]
    cluster_name: str = ""
    connection_secret_name: str = ""
    app_secret_name: str = ""
    password_default_name: str = ""
    database_name: str = ""
    app_username: str = ""
    fallback_reason: str = ""

    @property
    def use_kubeblocks(self) -> bool:
        return not self.fallback_reason

    @property
    def needs_bootstrap(self) -> bool:
        return self.use_kubeblocks and bool(self.database_name)

    @property
    def has_app_credentials(self) -> bool:
        return self.needs_bootstrap and bool(self.app_username)


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


RegistryRequester = Callable[
    [str, Mapping[str, str]],
    Tuple[int, Mapping[str, str], bytes],
]


def _registry_request(
    url: str,
    headers: Mapping[str, str],
) -> Tuple[int, Mapping[str, str], bytes]:
    request = Request(url, headers=dict(headers))
    try:
        with urlopen(request, timeout=REGISTRY_REQUEST_TIMEOUT) as response:
            return response.status, response.headers, response.read()
    except HTTPError as exc:
        return exc.code, exc.headers or {}, exc.read()
    except (URLError, TimeoutError, OSError) as exc:
        raise ValueError(f"registry request failed: {exc}") from exc


def _parse_bearer_challenge(challenge: str) -> Dict[str, str]:
    scheme, separator, parameters = challenge.partition(" ")
    if not separator or scheme.lower() != "bearer":
        raise ValueError("registry requires an unsupported authentication scheme")

    parsed: Dict[str, str] = {}
    pattern = re.compile(r'([A-Za-z][A-Za-z0-9_-]*)=(?:"((?:[^"\\]|\\.)*)"|([^,\s]+))')
    for match in pattern.finditer(parameters):
        quoted_value, bare_value = match.group(2), match.group(3)
        value = quoted_value if quoted_value is not None else bare_value
        parsed[match.group(1).lower()] = re.sub(r"\\(.)", r"\1", value or "")
    if not parsed.get("realm"):
        raise ValueError("registry bearer challenge does not include a token realm")
    return parsed


def _registry_location(repository: str) -> Tuple[str, str]:
    if not repository or repository.startswith("/") or "://" in repository:
        raise ValueError(f"invalid image repository: {repository!r}")

    parts = repository.split("/")
    first = parts[0]
    if len(parts) > 1 and ("." in first or ":" in first or first == "localhost"):
        registry = first
        registry_repository = "/".join(parts[1:])
    else:
        registry = "registry-1.docker.io"
        registry_repository = repository
        if "/" not in registry_repository:
            registry_repository = f"library/{registry_repository}"

    if registry in {"docker.io", "index.docker.io", "registry-1.docker.io"}:
        registry = "registry-1.docker.io"
        if "/" not in registry_repository:
            registry_repository = f"library/{registry_repository}"
    if not registry_repository:
        raise ValueError(f"invalid image repository: {repository!r}")
    return registry, registry_repository


def _bearer_token(
    challenge: str,
    registry_repository: str,
    requester: RegistryRequester,
) -> str:
    parameters = _parse_bearer_challenge(challenge)
    realm = parameters["realm"]
    parsed_realm = urlparse(realm)
    if parsed_realm.scheme not in {"http", "https"} or not parsed_realm.netloc:
        raise ValueError("registry bearer challenge contains an invalid token realm")

    query = list(parse_qsl(parsed_realm.query, keep_blank_values=True))
    existing_keys = {key for key, _ in query}
    if parameters.get("service") and "service" not in existing_keys:
        query.append(("service", parameters["service"]))
    if "scope" not in existing_keys:
        query.append(
            (
                "scope",
                parameters.get("scope") or f"repository:{registry_repository}:pull",
            )
        )
    token_url = urlunparse(parsed_realm._replace(query=urlencode(query)))
    status, _, body = requester(
        token_url,
        {
            "Accept": "application/json",
            "User-Agent": "docker-to-sealos/1.0",
        },
    )
    if status < 200 or status >= 300:
        raise ValueError(f"registry token request failed with HTTP {status}")
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("registry token endpoint returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise ValueError("registry token endpoint returned an invalid response")
    token = payload.get("token") or payload.get("access_token")
    if not isinstance(token, str) or not token:
        raise ValueError("registry token endpoint did not return a bearer token")
    return token


def resolve_registry_digest(
    image: str,
    *,
    requester: Optional[RegistryRequester] = None,
) -> str:
    repository, tag, declared_digest = split_image_reference(image)
    if not repository:
        raise ValueError(f"invalid image reference: {image!r}")
    if declared_digest is not None:
        if SHA256_DIGEST_RE.fullmatch(declared_digest) is None:
            raise ValueError(
                f"image {image!r} contains an invalid sha256 digest: {declared_digest!r}"
            )
        return declared_digest.lower()

    registry, registry_repository = _registry_location(repository)
    selector = tag or "latest"
    manifest_url = (
        f"https://{registry}/v2/{quote(registry_repository, safe='/')}/"
        f"manifests/{quote(selector, safe=':')}"
    )
    request_headers = {
        "Accept": REGISTRY_MANIFEST_ACCEPT,
        "User-Agent": "docker-to-sealos/1.0",
    }
    requester = requester or _registry_request
    status, response_headers, body = requester(manifest_url, request_headers)
    if status == 401:
        challenge = str(response_headers.get("WWW-Authenticate") or "")
        token = _bearer_token(challenge, registry_repository, requester)
        request_headers = dict(request_headers)
        request_headers["Authorization"] = f"Bearer {token}"
        status, response_headers, body = requester(manifest_url, request_headers)
    if status < 200 or status >= 300:
        raise ValueError(
            f"registry manifest request failed for {image!r} with HTTP {status}"
        )

    try:
        manifest = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(
            f"registry returned an invalid manifest for {image!r}"
        ) from exc
    if not isinstance(manifest, dict) or manifest.get("schemaVersion") != 2:
        raise ValueError(f"registry returned an invalid manifest for {image!r}")

    computed_digest = f"sha256:{hashlib.sha256(body).hexdigest()}"
    header_digest = str(response_headers.get("Docker-Content-Digest") or "").strip()
    if header_digest:
        if SHA256_DIGEST_RE.fullmatch(header_digest) is None:
            raise ValueError(
                f"registry returned an invalid sha256 digest for {image!r}: "
                f"{header_digest!r}"
            )
        header_digest = header_digest.lower()
        if header_digest != computed_digest:
            raise ValueError(
                f"registry digest for {image!r} does not match the returned manifest"
            )
        return header_digest
    return computed_digest


def resolve_image_reference(
    image: str,
    *,
    digest_cache: Optional[Dict[str, str]] = None,
    digest_resolver: Optional[Callable[[str], str]] = None,
) -> str:
    source_image = image.strip()
    repository, _, declared_digest = split_image_reference(source_image)
    if not repository:
        raise ValueError(f"invalid image reference: {image!r}")
    if declared_digest is not None:
        if SHA256_DIGEST_RE.fullmatch(declared_digest) is None:
            raise ValueError(
                f"image {source_image!r} contains an invalid sha256 digest: "
                f"{declared_digest!r}"
            )
        return f"{repository}@{declared_digest.lower()}"

    digest_cache = digest_cache if digest_cache is not None else {}
    source_digest = digest_cache.get(source_image)
    if source_digest is None:
        resolver = digest_resolver or resolve_registry_digest
        source_digest = resolver(source_image)
        if SHA256_DIGEST_RE.fullmatch(source_digest) is None:
            raise ValueError(
                f"registry returned an invalid sha256 digest for {source_image!r}: "
                f"{source_digest!r}"
            )
        source_digest = source_digest.lower()
        digest_cache[source_image] = source_digest
    return f"{repository}@{source_digest}"


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
    return parse_declared_ports(service.get("ports"))


def parse_expose_ports(service: Mapping[str, Any]) -> List[int]:
    return parse_declared_ports(service.get("expose"))


def parse_declared_ports(raw_ports: Any) -> List[int]:
    if not isinstance(raw_ports, list):
        return []
    values: List[int] = []
    seen = set()
    for item in raw_ports:
        port = parse_container_port(item)
        if port is None or port in seen:
            continue
        seen.add(port)
        values.append(port)
    return values


def merge_ports(*port_groups: Sequence[int]) -> List[int]:
    merged: List[int] = []
    seen = set()
    for ports in port_groups:
        for port in ports:
            if port not in seen:
                seen.add(port)
                merged.append(port)
    return merged


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
            and target not in seen
        ):
            seen.add(target)
            paths.append(target)
    return paths


def _resolve_database_contract_value(
    env_by_name: Mapping[str, str],
    names: Sequence[str],
) -> Tuple[str, str]:
    resolved_values: List[Tuple[str, str]] = []
    for name in names:
        raw = env_by_name.get(name)
        if raw is None:
            continue
        try:
            value = resolve_compose_value(raw).strip() if "$" in raw else raw.strip()
        except ValueError as exc:
            return "", f"{name} cannot be resolved: {exc}"
        if value:
            resolved_values.append((name, value))
    unique_values = sorted({value for _, value in resolved_values})
    if len(unique_values) > 1:
        fields = ", ".join(name for name, _ in resolved_values)
        return "", f"conflicting database initialization values in {fields}"
    return (unique_values[0] if unique_values else ""), ""


def plan_database_service(
    service_name: str,
    db_type: str,
    source_image: str,
    service: Mapping[str, Any],
) -> DatabasePlan:
    fallback_reasons: List[str] = []
    image_name = image_repository_basename(source_image)
    if image_name not in DB_KUBEBLOCKS_COMPATIBLE_IMAGE_NAMES.get(db_type, set()):
        fallback_reasons.append(
            f"database image variant {image_name!r} is not covered by the {db_type} KubeBlocks mapping"
        )

    unsupported_keys = sorted(set(service) - DB_MANAGED_SERVICE_KEYS)
    if unsupported_keys:
        fallback_reasons.append(
            "unsupported database service fields: " + ", ".join(unsupported_keys)
        )

    env_by_name = {name: value for name, value in parse_env(service)}
    allowed_env_names = DB_STANDARD_ENV_NAMES_BY_TYPE.get(db_type, set())
    unsupported_env_names = sorted(set(env_by_name) - allowed_env_names)
    if unsupported_env_names:
        fallback_reasons.append(
            "unmapped database initialization environment: "
            + ", ".join(unsupported_env_names)
        )

    standard_data_paths = DB_STANDARD_DATA_PATHS_BY_TYPE.get(db_type, set())
    unsupported_mounts = [
        target
        for target in parse_mount_paths(service)
        if target not in standard_data_paths
    ]
    if unsupported_mounts:
        fallback_reasons.append(
            "unmapped database mount targets: " + ", ".join(sorted(unsupported_mounts))
        )

    deploy = service.get("deploy")
    if isinstance(deploy, dict):
        replicas = deploy.get("replicas", 1)
        if isinstance(replicas, bool) or not isinstance(replicas, int) or replicas != 1:
            fallback_reasons.append(
                "database deploy.replicas is not exactly one and cannot be preserved by the current KubeBlocks template"
            )

    database_name = ""
    app_username = ""
    contract_error = ""
    if db_type == "mysql":
        database_name, contract_error = _resolve_database_contract_value(
            env_by_name,
            ("MARIADB_DATABASE", "MYSQL_DATABASE"),
        )
        if not contract_error:
            app_username, contract_error = _resolve_database_contract_value(
                env_by_name,
                ("MARIADB_USER", "MYSQL_USER"),
            )
        app_password_declared = any(
            env_by_name.get(name, "").strip()
            for name in ("MARIADB_PASSWORD", "MYSQL_PASSWORD")
        )
        if app_username and not database_name:
            contract_error = (
                "application database user is declared without a target database"
            )
        elif app_username and not app_password_declared:
            contract_error = (
                "application database user is declared without its matching password"
            )
        elif app_password_declared and not app_username:
            contract_error = (
                "application database password is declared without its matching user"
            )
    elif db_type == "postgres":
        database_name, contract_error = _resolve_database_contract_value(
            env_by_name,
            ("POSTGRES_DB",),
        )
        if not contract_error:
            source_username, contract_error = _resolve_database_contract_value(
                env_by_name,
                ("POSTGRES_USER",),
            )
            if source_username and source_username.lower() != "postgres":
                app_username = source_username
                if not database_name:
                    database_name = source_username
        if database_name.lower() == "postgres" and not app_username:
            database_name = ""

    if contract_error:
        fallback_reasons.append(contract_error)

    for identifier_name, identifier in (
        ("database", database_name),
        ("application database user", app_username),
    ):
        if identifier and DATABASE_IDENTIFIER_RE.fullmatch(identifier) is None:
            fallback_reasons.append(
                f"{identifier_name} {identifier!r} is outside the safely translated identifier subset"
            )

    return DatabasePlan(
        service_name=service_name,
        db_type=db_type,
        source_image=source_image,
        service=service,
        database_name=database_name,
        app_username=app_username,
        fallback_reason="; ".join(dict.fromkeys(fallback_reasons)),
    )


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


def _parse_bind_mount_source_and_target(
    item: Any,
) -> Tuple[Optional[str], Optional[str]]:
    if isinstance(item, str):
        parts = item.split(":")
        if len(parts) < 2:
            return None, parse_mount_target_from_string(item)
        if len(parts) >= 3 and parts[-1] in MODE_SUFFIXES:
            return ":".join(parts[:-2]), parts[-2]
        return ":".join(parts[:-1]), parts[-1]
    if isinstance(item, dict):
        source = item.get("source")
        target = item.get("target")
        mount_type = item.get("type")
        if mount_type not in (None, "bind"):
            return None, str(target) if isinstance(target, str) else None
        return (
            str(source) if isinstance(source, str) else None,
            str(target) if isinstance(target, str) else None,
        )
    return None, None


def parse_database_fallback_mounts(
    service: Mapping[str, Any],
    compose_dir: Path,
    db_type: str,
) -> Tuple[List[str], List[ConfigMount]]:
    volumes = service.get("volumes")
    if not isinstance(volumes, list):
        return [], []
    persistent_paths: List[str] = []
    config_mounts: List[ConfigMount] = []
    standard_data_paths = DB_STANDARD_DATA_PATHS_BY_TYPE.get(db_type, set())
    for item in volumes:
        source, target = _parse_bind_mount_source_and_target(item)
        if not isinstance(target, str) or not target.startswith("/"):
            continue
        if target in standard_data_paths:
            if target not in persistent_paths:
                persistent_paths.append(target)
            continue
        if not source:
            raise ValueError(
                f"raw database fallback cannot materialize volume target {target!r}; "
                "use the AI-native canonical template route"
            )
        source_path = Path(source)
        if not source_path.is_absolute():
            source_path = compose_dir / source_path
        try:
            source_path = source_path.resolve()
        except OSError as exc:
            raise ValueError(
                f"raw database fallback cannot resolve bind source {source!r}: {exc}"
            ) from exc
        if source_path.is_file():
            try:
                content = source_path.read_text(encoding="utf-8")
            except (OSError, UnicodeError) as exc:
                raise ValueError(
                    f"raw database fallback cannot preserve non-text bind source {source!r}"
                ) from exc
            config_mounts.append(
                ConfigMount(
                    target=target,
                    key=path_to_vn_name(target),
                    content=content,
                )
            )
            continue
        if source_path.is_dir():
            source_files = sorted(path for path in source_path.rglob("*") if path.is_file())
            if not source_files:
                raise ValueError(
                    f"raw database fallback bind directory {source!r} is empty"
                )
            for source_file in source_files:
                relative = source_file.relative_to(source_path).as_posix()
                mount_target = f"{target.rstrip('/')}/{relative}"
                try:
                    content = source_file.read_text(encoding="utf-8")
                except (OSError, UnicodeError) as exc:
                    raise ValueError(
                        f"raw database fallback cannot preserve non-text bind source {source_file}"
                    ) from exc
                config_mounts.append(
                    ConfigMount(
                        target=mount_target,
                        key=path_to_vn_name(mount_target),
                        content=content,
                    )
                )
            continue
        raise ValueError(
            f"raw database fallback bind source {source!r} does not exist; "
            "use the AI-native canonical template route"
        )
    return persistent_paths, config_mounts


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


def parse_entrypoint_command(service: Mapping[str, Any]) -> List[str]:
    entrypoint = service.get("entrypoint")
    if isinstance(entrypoint, str):
        text = entrypoint.strip()
        if not text:
            return []
        try:
            return shlex.split(text)
        except ValueError:
            return [text]
    if isinstance(entrypoint, list):
        return [
            str(item)
            for item in entrypoint
            if item is not None and str(item).strip()
        ]
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
        startup = dict(action)
        startup.update(
            {
                "periodSeconds": max(1, period),
                "timeoutSeconds": int(timing.get("timeoutSeconds", 5)),
                "failureThreshold": max(1, int(math.ceil(start_period / max(1, period)))),
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
    return build_probe_pair_from_official_profile(image, ports, command_args)


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


def build_template_resource(
    meta: MetadataOptions,
    password_defaults: Sequence[str] = (),
) -> Dict[str, Any]:
    readme_base = f"{TEMPLATE_README_BASE}/{meta.app_name}"
    defaults: Dict[str, Dict[str, str]] = {
        "app_host": {
            "type": "string",
            "value": f"{meta.app_name}-${{{{ random(8) }}}}",
        },
        "app_name": {
            "type": "string",
            "value": f"{meta.app_name}-${{{{ random(8) }}}}",
        },
    }
    for default_name in sorted(set(password_defaults)):
        defaults[default_name] = {
            "type": "string",
            "value": "Db${{ random(24) }}9",
        }
    return {
        "apiVersion": "app.sealos.io/v1",
        "kind": "Template",
        "metadata": {
            "name": meta.app_name,
        },
        "spec": {
            "title": meta.title,
            "url": meta.url,
            "gitRepo": meta.git_repo,
            "author": meta.author,
            "description": meta.description,
            "readme": f"{readme_base}/README.md",
            "icon": f"{meta.repo_raw_base}/template/{meta.app_name}/logo.{meta.logo_ext}",
            "templateType": "inline",
            "locale": "en",
            "i18n": {
                "zh": {
                    "description": build_zh_description(meta.title, meta.description),
                    "readme": f"{readme_base}/README_zh.md",
                }
            },
            "categories": list(meta.categories),
            "defaults": defaults,
        },
    }


def default_database_cluster_name(db_type: str) -> str:
    suffix = DB_CLUSTER_SUFFIX_BY_TYPE.get(db_type)
    if suffix is None:
        raise ValueError(f"unsupported database type: {db_type}")
    return f"${{{{ defaults.app_name }}}}-{suffix}"


def database_cluster_name(db_type: str, service_name: str, same_type_count: int) -> str:
    base_name = default_database_cluster_name(db_type)
    if same_type_count == 1:
        return base_name
    return f"{base_name}-{normalize_k8s_name(service_name)}"


def database_service_fqdn(db_type: str, cluster_name: str) -> str:
    suffix = DB_SERVICE_SUFFIX_BY_TYPE.get(db_type)
    if suffix is None:
        raise ValueError(f"unsupported database type: {db_type}")
    return f"{cluster_name}-{suffix}.${{{{ SEALOS_NAMESPACE }}}}.svc.cluster.local"


def database_secret_name(db_type: str, cluster_name: str) -> str:
    suffix = DB_SECRET_SUFFIX_BY_TYPE.get(db_type)
    if suffix is None:
        raise ValueError(f"unsupported database type: {db_type}")
    return f"{cluster_name}-{suffix}"


def database_app_secret_name(cluster_name: str) -> str:
    return f"{cluster_name}-app-credential"


def database_password_default_name(db_type: str, service_name: str) -> str:
    return (
        f"{normalize_env_token(db_type).lower()}_"
        f"{normalize_env_token(service_name).lower()}_app_password"
    )


def build_postgres_resources(
    name: str = "${{ defaults.app_name }}-pg",
) -> List[Dict[str, Any]]:
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


def build_mysql_resources(
    name: str = "${{ defaults.app_name }}-mysql",
) -> List[Dict[str, Any]]:
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


def build_mongodb_resources(
    name: str = "${{ defaults.app_name }}-mongo",
) -> List[Dict[str, Any]]:
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


def build_redis_resources(
    name: str = "${{ defaults.app_name }}-redis",
) -> List[Dict[str, Any]]:
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


def build_kafka_resources(
    name: str = "${{ defaults.app_name }}-broker",
) -> List[Dict[str, Any]]:
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


def build_database_resources(
    db_type: str,
    name: Optional[str] = None,
) -> List[Dict[str, Any]]:
    cluster_name = name or default_database_cluster_name(db_type)
    if db_type == "postgres":
        return build_postgres_resources(cluster_name)
    if db_type == "mysql":
        return build_mysql_resources(cluster_name)
    if db_type == "mongodb":
        return build_mongodb_resources(cluster_name)
    if db_type == "redis":
        return build_redis_resources(cluster_name)
    if db_type == "kafka":
        return build_kafka_resources(cluster_name)
    return []


def build_database_app_secret(plan: DatabasePlan) -> Dict[str, Any]:
    if not plan.has_app_credentials:
        raise ValueError("application database credentials require a bootstrap plan")
    return {
        "apiVersion": "v1",
        "kind": "Secret",
        "metadata": {
            "name": plan.app_secret_name,
            "annotations": {
                DB_BOOTSTRAP_ANNOTATION: "application-credential",
                DB_CLUSTER_ANNOTATION: plan.cluster_name,
                DB_ENGINE_ANNOTATION: plan.db_type,
            },
        },
        "type": "Opaque",
        "stringData": {
            "database": plan.database_name,
            "username": plan.app_username,
            "password": f"${{{{ defaults.{plan.password_default_name} }}}}",
        },
    }


def _database_bootstrap_env(plan: DatabasePlan) -> List[Dict[str, Any]]:
    env = [
        build_secret_ref_env_entry(
            "DB_ADMIN_HOST",
            plan.connection_secret_name,
            "host",
        ),
        build_secret_ref_env_entry(
            "DB_ADMIN_PORT",
            plan.connection_secret_name,
            "port",
        ),
        build_secret_ref_env_entry(
            "DB_ADMIN_USER",
            plan.connection_secret_name,
            "username",
        ),
        build_secret_ref_env_entry(
            "DB_ADMIN_PASSWORD",
            plan.connection_secret_name,
            "password",
        ),
        {"name": "DB_NAME", "value": plan.database_name},
    ]
    if plan.has_app_credentials:
        env.extend(
            [
                build_secret_ref_env_entry(
                    "DB_APP_USER",
                    plan.app_secret_name,
                    "username",
                ),
                build_secret_ref_env_entry(
                    "DB_APP_PASSWORD",
                    plan.app_secret_name,
                    "password",
                ),
            ]
        )
    return env


def _mysql_bootstrap_script(has_app_credentials: bool) -> str:
    app_account_script = ""
    if has_app_credentials:
        app_account_script = r"""
case "$DB_APP_USER" in
  ''|*[!A-Za-z0-9_]*) echo "unsafe MySQL application username" >&2; exit 1 ;;
esac
escaped_password="$(printf '%s' "$DB_APP_PASSWORD" | sed "s/\\\\/\\\\\\\\/g; s/'/''/g")"
MYSQL_PWD="$DB_ADMIN_PASSWORD" mysql \
  -h "$DB_ADMIN_HOST" -P "$DB_ADMIN_PORT" -u "$DB_ADMIN_USER" <<SQL
CREATE USER IF NOT EXISTS '$DB_APP_USER'@'%' IDENTIFIED BY '$escaped_password';
ALTER USER '$DB_APP_USER'@'%' IDENTIFIED BY '$escaped_password';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_APP_USER'@'%';
SQL
"""
    return (
        r"""set -eu
case "$DB_NAME" in
  ''|*[!A-Za-z0-9_]*) echo "unsafe MySQL database name" >&2; exit 1 ;;
esac
for attempt in $(seq 1 90); do
  if MYSQL_PWD="$DB_ADMIN_PASSWORD" mysqladmin ping \
    -h "$DB_ADMIN_HOST" -P "$DB_ADMIN_PORT" -u "$DB_ADMIN_USER" --silent; then
    break
  fi
  sleep 2
done
MYSQL_PWD="$DB_ADMIN_PASSWORD" mysqladmin ping \
  -h "$DB_ADMIN_HOST" -P "$DB_ADMIN_PORT" -u "$DB_ADMIN_USER" --silent
MYSQL_PWD="$DB_ADMIN_PASSWORD" mysql \
  -h "$DB_ADMIN_HOST" -P "$DB_ADMIN_PORT" -u "$DB_ADMIN_USER" \
  -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\`;"
"""
        + app_account_script.lstrip("\n")
    )


def _postgres_bootstrap_script(has_app_credentials: bool) -> str:
    app_account_script = ""
    owner_expression = '"$DB_ADMIN_USER"'
    if has_app_credentials:
        owner_expression = '"$DB_APP_USER"'
        app_account_script = r"""
psql -v ON_ERROR_STOP=1 -v app_user="$DB_APP_USER" -v app_password="$DB_APP_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')
\gexec
SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password')
\gexec
SQL
"""
    return (
        r"""set -eu
export PGHOST="$DB_ADMIN_HOST"
export PGPORT="$DB_ADMIN_PORT"
export PGUSER="$DB_ADMIN_USER"
export PGPASSWORD="$DB_ADMIN_PASSWORD"
export PGDATABASE=postgres
for attempt in $(seq 1 90); do
  if pg_isready >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
pg_isready
"""
        + app_account_script.lstrip("\n")
        + f"""DB_OWNER={owner_expression}
psql -v ON_ERROR_STOP=1 -v db_name="$DB_NAME" -v db_owner="$DB_OWNER" <<'SQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'db_name', :'db_owner')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db_name')
\\gexec
SELECT format('GRANT ALL PRIVILEGES ON DATABASE %I TO %I', :'db_name', :'db_owner')
\\gexec
SQL
"""
    )


def build_database_bootstrap_job(
    plan: DatabasePlan,
    client_image: str,
) -> Dict[str, Any]:
    if not plan.needs_bootstrap:
        raise ValueError("database bootstrap Job requires a target database")
    if plan.db_type == "mysql":
        script = _mysql_bootstrap_script(plan.has_app_credentials)
    elif plan.db_type == "postgres":
        script = _postgres_bootstrap_script(plan.has_app_credentials)
    else:
        raise ValueError(
            f"database bootstrap is not implemented for {plan.db_type}"
        )
    return {
        "apiVersion": "batch/v1",
        "kind": "Job",
        "metadata": {
            "name": f"{plan.cluster_name}-init",
            "annotations": {
                DB_BOOTSTRAP_ANNOTATION: "database-user-grants",
                DB_CLUSTER_ANNOTATION: plan.cluster_name,
                DB_ENGINE_ANNOTATION: plan.db_type,
            },
        },
        "spec": {
            "backoffLimit": 3,
            "template": {
                "spec": {
                    "automountServiceAccountToken": False,
                    "containers": [
                        {
                            "name": f"{plan.db_type}-init",
                            "image": client_image,
                            "imagePullPolicy": "IfNotPresent",
                            "env": _database_bootstrap_env(plan),
                            "command": ["/bin/sh", "-c"],
                            "args": [script],
                            "resources": {
                                "limits": dict(DEFAULT_RESOURCE_LIMITS),
                                "requests": dict(DEFAULT_RESOURCE_REQUESTS),
                            },
                        }
                    ],
                    "restartPolicy": "OnFailure",
                }
            },
            "ttlSecondsAfterFinished": 300,
        },
    }


def build_database_ready_init_container(
    plan: DatabasePlan,
    client_image: str,
) -> Dict[str, Any]:
    if not plan.needs_bootstrap:
        raise ValueError("database readiness gate requires a target database")
    credential_secret_name = (
        plan.app_secret_name
        if plan.has_app_credentials
        else plan.connection_secret_name
    )
    if plan.db_type == "mysql":
        script = (
            'set -eu\n'
            'for attempt in $(seq 1 90); do\n'
            '  if MYSQL_PWD="$DB_PASSWORD" mysql '
            '-h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME" '
            '-Nse "SELECT 1" >/dev/null 2>&1; then exit 0; fi\n'
            '  sleep 2\n'
            'done\n'
            'echo "application MySQL database contract is not ready" >&2\n'
            'exit 1\n'
        )
    elif plan.db_type == "postgres":
        script = (
            'set -eu\n'
            'export PGPASSWORD="$DB_PASSWORD"\n'
            'for attempt in $(seq 1 90); do\n'
            '  if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" '
            '-d "$DB_NAME" -tAc "SELECT 1" >/dev/null 2>&1; then exit 0; fi\n'
            '  sleep 2\n'
            'done\n'
            'echo "application PostgreSQL database contract is not ready" >&2\n'
            'exit 1\n'
        )
    else:
        raise ValueError(
            f"database readiness gate is not implemented for {plan.db_type}"
        )
    container_name = normalize_k8s_name(
        f"{plan.db_type}-{plan.service_name}-ready"
    )[:63].rstrip("-")
    return {
        "name": container_name,
        "image": client_image,
        "imagePullPolicy": "IfNotPresent",
        "env": [
            build_secret_ref_env_entry(
                "DB_HOST",
                plan.connection_secret_name,
                "host",
            ),
            build_secret_ref_env_entry(
                "DB_PORT",
                plan.connection_secret_name,
                "port",
            ),
            build_secret_ref_env_entry(
                "DB_USER",
                credential_secret_name,
                "username",
            ),
            build_secret_ref_env_entry(
                "DB_PASSWORD",
                credential_secret_name,
                "password",
            ),
            {"name": "DB_NAME", "value": plan.database_name},
        ],
        "command": ["/bin/sh", "-c"],
        "args": [script],
        "resources": {
            "limits": dict(DEFAULT_RESOURCE_LIMITS),
            "requests": dict(DEFAULT_RESOURCE_REQUESTS),
        },
    }


def build_object_storage_bucket() -> Dict[str, Any]:
    return {
        "apiVersion": "objectstorage.sealos.io/v1",
        "kind": "ObjectStorageBucket",
        "metadata": {"name": "${{ defaults.app_name }}"},
        "spec": {"policy": "private"},
    }


def map_compose_env_value(
    value: str,
    db_hosts: Mapping[str, str],
    service_hosts: Mapping[str, str],
) -> str:
    if not isinstance(value, str):
        return str(value)
    if COMPOSE_REFERENCE_RE.search(value):
        return value
    if value in db_hosts:
        return db_hosts[value]
    if value in service_hosts:
        return service_hosts[value]
    mapped = value
    for service_name, fqdn in db_hosts.items():
        mapped = mapped.replace(f"@{service_name}:", f"@{fqdn}:")
        mapped = mapped.replace(f"//{service_name}:", f"//{fqdn}:")
    return map_compose_service_reference(mapped, service_hosts)


def map_compose_service_reference(value: str, service_hosts: Mapping[str, str]) -> str:
    if not isinstance(value, str):
        return str(value)
    for service_name, fqdn in service_hosts.items():
        escaped_name = re.escape(service_name)
        direct_reference = re.fullmatch(rf"{escaped_name}(?P<port>:\d+)", value)
        if direct_reference:
            return f"{fqdn}{direct_reference.group('port')}"
        value = re.sub(
            rf"(?P<prefix>://|@){escaped_name}(?P<suffix>(?::\d+)?(?:[/?#]|$))",
            lambda match: f"{match.group('prefix')}{fqdn}{match.group('suffix')}",
            value,
        )
    return value


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


def infer_db_service_from_value(value: str, db_services: Mapping[str, str]) -> Optional[str]:
    text = value.strip().lower()
    matched: List[str] = []
    for service_name in db_services:
        service = service_name.lower()
        if text == service:
            matched.append(service_name)
            continue
        if f"//{service}" in text or f"@{service}" in text or f"{service}:" in text:
            matched.append(service_name)
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
    db_secret_names: Mapping[str, str],
    db_app_secret_names: Optional[Mapping[str, str]] = None,
) -> Optional[Dict[str, str]]:
    connection_key = detect_db_connection_key(env_name)
    if connection_key is None:
        return None

    available_db_types = list(db_services.values())
    if not available_db_types:
        return None

    db_service = infer_db_service_from_value(value, db_services)
    if db_service is None:
        from_name = infer_db_type_from_env_name(env_name, available_db_types)
        candidates = [
            service_name
            for service_name, service_type in db_services.items()
            if service_type == from_name
        ]
        if len(candidates) == 1:
            db_service = candidates[0]
    if db_service is None:
        return None
    db_type = db_services[db_service]

    # Some KubeBlocks account secrets only expose credentials. Host/port use
    # stable Sealos Service FQDN values for those databases instead.
    if db_type == "redis" and connection_key in {"host", "port"}:
        return None

    secret_name = db_secret_names.get(db_service)
    if connection_key in {"username", "password"}:
        app_secret_name = (db_app_secret_names or {}).get(db_service)
        if isinstance(app_secret_name, str):
            secret_name = app_secret_name
    if not isinstance(secret_name, str):
        return None

    return {
        "name": secret_name,
        "key": connection_key,
        "db_type": db_type,
        "db_service": db_service,
    }


def infer_service_database_dependencies(
    service: Mapping[str, Any],
    db_services: Mapping[str, str],
) -> Set[str]:
    dependencies: Set[str] = set()
    depends_on = service.get("depends_on")
    if isinstance(depends_on, dict):
        dependencies.update(
            name for name in depends_on if name in db_services
        )
    elif isinstance(depends_on, list):
        dependencies.update(
            str(name) for name in depends_on if str(name) in db_services
        )

    available_db_types = list(db_services.values())
    for env_name, value in parse_env(service):
        service_name = infer_db_service_from_value(value, db_services)
        if service_name is not None:
            dependencies.add(service_name)
            continue
        if detect_db_connection_key(env_name) is None:
            continue
        db_type = infer_db_type_from_env_name(env_name, available_db_types)
        candidates = [
            name
            for name, candidate_type in db_services.items()
            if candidate_type == db_type
        ]
        if len(candidates) == 1:
            dependencies.add(candidates[0])

    command_text = " ".join(
        [
            *parse_entrypoint_command(service),
            *parse_command_args(service),
        ]
    )
    for service_name in db_services:
        if re.search(
            rf"(?<![A-Za-z0-9_-]){re.escape(service_name)}(?![A-Za-z0-9_-])",
            command_text,
        ):
            dependencies.add(service_name)
    return dependencies


def build_db_url_composed_env_entries(
    env_name: str,
    raw_value: str,
    secret_name: str,
    db_type: str,
    credential_secret_name: str,
    db_services: Mapping[str, str],
    db_hosts: Mapping[str, str],
) -> Optional[List[Dict[str, Any]]]:
    text = raw_value.strip()
    if not text or COMPOSE_REFERENCE_RE.search(text):
        return None

    parsed = urlparse(text)
    host = (parsed.hostname or "").strip().lower()
    service_lookup = {service_name.lower(): service_name for service_name in db_services}
    db_service = service_lookup.get(host)
    if not parsed.scheme or not db_service:
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
            {"name": host_var, "value": db_hosts[db_service]},
            {"name": port_var, "value": "6379"},
        ]
    elif db_type == "mongodb":
        helper_entries = [
            {"name": host_var, "value": db_hosts[db_service]},
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
        helper_entries.append(
            build_secret_ref_env_entry(
                user_var,
                credential_secret_name,
                "username",
            )
        )
    if has_password:
        helper_entries.append(
            build_secret_ref_env_entry(
                password_var,
                credential_secret_name,
                "password",
            )
        )

    if has_auth:
        if has_username and has_password:
            auth_prefix = f"$({user_var}):$({password_var})@"
        elif has_username:
            auth_prefix = f"$({user_var})@"
        elif has_password:
            auth_prefix = f":$({password_var})@"

    host_port = f"$({host_var})"
    if parsed.port is not None or db_type in {"redis", "mongodb"}:
        host_port = f"{host_port}:$({port_var})"

    suffix = parsed.path or ""
    if parsed.query:
        suffix = f"{suffix}?{parsed.query}"
    if parsed.fragment:
        suffix = f"{suffix}#{parsed.fragment}"

    composed_url = f"{parsed.scheme}://{auth_prefix}{host_port}{suffix}"
    helper_entries.append({"name": env_name, "value": composed_url})
    return helper_entries


def build_env_entries(
    service: Mapping[str, Any],
    db_hosts: Mapping[str, str],
    db_services: Mapping[str, str],
    db_secret_names: Mapping[str, str],
    db_app_secret_names: Mapping[str, str],
    service_hosts: Mapping[str, str],
) -> List[Dict[str, Any]]:
    entries: List[Dict[str, Any]] = []
    for key, value in parse_env(service):
        secret_ref = infer_db_secret_ref(
            key,
            value,
            db_services,
            db_secret_names,
            db_app_secret_names,
        )
        if secret_ref is not None:
            if secret_ref["key"] == "endpoint":
                composed_entries = build_db_url_composed_env_entries(
                    env_name=key,
                    raw_value=value,
                    secret_name=secret_ref["name"],
                    db_type=secret_ref["db_type"],
                    credential_secret_name=db_app_secret_names.get(
                        secret_ref["db_service"],
                        db_secret_names[secret_ref["db_service"]],
                    ),
                    db_services=db_services,
                    db_hosts=db_hosts,
                )
                if composed_entries is not None:
                    entries.extend(composed_entries)
                    continue

            entries.append(build_secret_ref_env_entry(key, secret_ref["name"], secret_ref["key"]))
            continue
        entries.append(
            {
                "name": key,
                "value": map_compose_env_value(value, db_hosts, service_hosts),
            }
        )
    return entries


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
    entrypoint_command: Sequence[str] = (),
    image_pull_secret: bool = False,
    allow_database_image: bool = False,
    kubeblocks_fallback_reason: str = "",
) -> Dict[str, Any]:
    db_type = detect_db_type(image)
    if db_type in SPECIAL_DB_RESOURCE_TYPES and not allow_database_image:
        raise ValueError(
            f"refusing to generate an application workload for {db_type} database image {image!r}; "
            "database services must use KubeBlocks Cluster resources"
        )

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
                    "limits": dict(DEFAULT_RESOURCE_LIMITS),
                    "requests": dict(DEFAULT_RESOURCE_REQUESTS),
                },
            }
        ],
    }
    if image_pull_secret:
        template_spec["imagePullSecrets"] = [{"name": "${{ defaults.app_name }}"}]
    if init_containers:
        template_spec["initContainers"] = list(init_containers)
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
    if entrypoint_command:
        container["command"] = list(entrypoint_command)
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

    annotations = {
        "originImageName": image,
        "deploy.cloud.sealos.io/minReplicas": str(replicas),
        "deploy.cloud.sealos.io/maxReplicas": str(replicas),
    }
    if kubeblocks_fallback_reason:
        annotations[KUBEBLOCKS_FALLBACK_ANNOTATION] = kubeblocks_fallback_reason
    return {
        "apiVersion": "apps/v1",
        "kind": kind,
        "metadata": {
            "name": workload_name,
            "annotations": annotations,
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


def build_service(
    workload_name: str,
    ports: Sequence[int],
    websocket_ports: Set[int],
    kubeblocks_fallback_reason: str = "",
) -> Optional[Dict[str, Any]]:
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
    metadata: Dict[str, Any] = {
        "name": workload_name,
        "labels": {
            "app": workload_name,
            "cloud.sealos.io/app-deploy-manager": workload_name,
        },
    }
    if kubeblocks_fallback_reason:
        metadata["annotations"] = {
            KUBEBLOCKS_FALLBACK_ANNOTATION: kubeblocks_fallback_reason,
        }
    return {
        "apiVersion": "v1",
        "kind": "Service",
        "metadata": metadata,
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


def select_public_service(
    app_services: Sequence[Tuple[str, Mapping[str, Any]]],
    requested_service: str,
) -> Optional[str]:
    app_service_names = {name for name, _ in app_services}
    if requested_service:
        if requested_service not in app_service_names:
            raise ValueError(
                f"public service {requested_service!r} is not an application Compose service"
            )
        service = next(item for name, item in app_services if name == requested_service)
        if not parse_ports(service):
            raise ValueError(
                f"public service {requested_service!r} must declare at least one Compose ports entry"
            )
        return requested_service

    candidates = [name for name, service in app_services if parse_ports(service)]
    if len(candidates) <= 1:
        return candidates[0] if candidates else None
    raise ValueError(
        "multiple application services publish Compose ports: "
        + ", ".join(candidates)
        + "; select the public entry with --public-service SERVICE"
    )


def parse_image_overrides(raw_overrides: Sequence[str]) -> Dict[str, str]:
    image_overrides: Dict[str, str] = {}
    for raw_override in raw_overrides:
        service_name, separator, image = raw_override.partition("=")
        service_name = service_name.strip()
        image = image.strip()
        if not separator or not service_name or not image:
            raise ValueError(
                f"invalid image override {raw_override!r}; expected SERVICE=IMAGE"
            )
        if service_name in image_overrides:
            raise ValueError(f"duplicate image override for service {service_name!r}")
        image_overrides[service_name] = image
    return image_overrides


def validate_images(
    compose_data: Mapping[str, Any],
    image_overrides: Optional[Mapping[str, str]] = None,
) -> Dict[str, str]:
    image_overrides = image_overrides or {}
    service_names = {service_name for service_name, _ in iter_services(compose_data)}
    unknown_services = sorted(set(image_overrides) - service_names)
    if unknown_services:
        raise ValueError(
            "image override references unknown Compose service(s): "
            + ", ".join(unknown_services)
        )

    normalized_images: Dict[str, str] = {}
    for service_name, service in iter_services(compose_data):
        override = image_overrides.get(service_name)
        image = override if override is not None else service.get("image")
        if not isinstance(image, str) or not image.strip():
            raise ValueError(
                f"service {service_name!r} must define image or receive "
                f"--image-override {service_name}=IMAGE"
            )
        normalized = normalize_image_reference(image, service_name)
        normalized_images[service_name] = normalized
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
    database_plans: Sequence[DatabasePlan],
) -> None:
    actual_clusters: Dict[str, Optional[str]] = {}
    for document in documents:
        db_type = cluster_database_type(document)
        if db_type not in SPECIAL_DB_RESOURCE_TYPES:
            continue
        metadata = document.get("metadata")
        name = metadata.get("name") if isinstance(metadata, dict) else None
        if isinstance(name, str):
            actual_clusters[name] = db_type

    missing_services: List[str] = []
    mismatched_services: List[str] = []
    for plan in database_plans:
        if not plan.use_kubeblocks:
            continue
        actual_type = actual_clusters.get(plan.cluster_name)
        if actual_type is None:
            missing_services.append(
                f"{plan.service_name} ({plan.cluster_name})"
            )
        elif actual_type != plan.db_type:
            mismatched_services.append(
                f"{plan.service_name} ({plan.cluster_name}: "
                f"expected {plan.db_type}, got {actual_type})"
            )
    if missing_services:
        raise ValueError(
            "database conversion did not emit one required KubeBlocks Cluster per service: "
            + ", ".join(missing_services)
        )
    if mismatched_services:
        raise ValueError(
            "database conversion emitted a KubeBlocks Cluster with the wrong engine: "
            + ", ".join(mismatched_services)
        )

    document_by_kind_and_name: Dict[Tuple[str, str], Mapping[str, Any]] = {}
    for document in documents:
        metadata = document.get("metadata")
        name = metadata.get("name") if isinstance(metadata, dict) else None
        kind = document.get("kind")
        if isinstance(kind, str) and isinstance(name, str):
            document_by_kind_and_name[(kind, name)] = document

    for plan in database_plans:
        if plan.use_kubeblocks and plan.needs_bootstrap:
            job = document_by_kind_and_name.get(
                ("Job", f"{plan.cluster_name}-init")
            )
            if job is None:
                raise ValueError(
                    f"database service {plan.service_name!r} requires an idempotent "
                    "bootstrap Job but none was generated"
                )
            metadata = job.get("metadata")
            annotations = (
                metadata.get("annotations")
                if isinstance(metadata, dict)
                else None
            )
            if (
                not isinstance(annotations, dict)
                or annotations.get(DB_CLUSTER_ANNOTATION) != plan.cluster_name
            ):
                raise ValueError(
                    f"database bootstrap Job for {plan.service_name!r} is not linked "
                    "to its KubeBlocks Cluster"
                )
            if plan.has_app_credentials and (
                "Secret",
                plan.app_secret_name,
            ) not in document_by_kind_and_name:
                raise ValueError(
                    f"database service {plan.service_name!r} requires an application "
                    "credential Secret but none was generated"
                )
            continue

        if plan.use_kubeblocks:
            continue
        for kind in ("Deployment", "StatefulSet"):
            raw_workload = document_by_kind_and_name.get(
                (kind, plan.cluster_name)
            )
            if raw_workload is None:
                continue
            metadata = raw_workload.get("metadata")
            annotations = (
                metadata.get("annotations")
                if isinstance(metadata, dict)
                else None
            )
            if (
                not isinstance(annotations, dict)
                or annotations.get(KUBEBLOCKS_FALLBACK_ANNOTATION)
                != plan.fallback_reason
            ):
                raise ValueError(
                    f"raw database fallback for {plan.service_name!r} is missing "
                    f"{KUBEBLOCKS_FALLBACK_ANNOTATION}"
                )
            break
        else:
            raise ValueError(
                f"database service {plan.service_name!r} could not be converted "
                "losslessly and its raw workload was not preserved"
            )

    for document in documents:
        if document.get("kind") not in {"Deployment", "StatefulSet", "DaemonSet", "Job", "CronJob"}:
            continue
        spec = document.get("spec")
        if not isinstance(spec, dict):
            continue
        if document.get("kind") == "CronJob":
            job_template = spec.get("jobTemplate")
            job_spec = job_template.get("spec") if isinstance(job_template, dict) else None
            template = job_spec.get("template") if isinstance(job_spec, dict) else None
        else:
            template = spec.get("template")
        template_spec = template.get("spec") if isinstance(template, dict) else None
        containers = template_spec.get("containers") if isinstance(template_spec, dict) else None
        if not isinstance(containers, list):
            continue
        metadata = document.get("metadata")
        annotations = (
            metadata.get("annotations")
            if isinstance(metadata, dict)
            else None
        )
        if isinstance(annotations, dict):
            if annotations.get(DB_BOOTSTRAP_ANNOTATION):
                continue
            fallback_reason = annotations.get(KUBEBLOCKS_FALLBACK_ANNOTATION)
            if isinstance(fallback_reason, str) and fallback_reason.strip():
                continue
        for container in containers:
            image = container.get("image") if isinstance(container, dict) else None
            db_type = detect_db_type(image) if isinstance(image, str) else None
            if db_type in SPECIAL_DB_RESOURCE_TYPES:
                raise ValueError(
                    f"generated {document.get('kind')} contains {db_type} database image {image!r}; "
                    "database services must remain KubeBlocks Cluster resources"
                )


def build_documents(
    compose_data: Mapping[str, Any],
    meta: MetadataOptions,
    kompose_shapes: Optional[Mapping[str, ServiceShape]] = None,
    compose_path: Optional[Path] = None,
    image_overrides: Optional[Mapping[str, str]] = None,
    public_service: str = "",
    image_pull_secret_services: Optional[Sequence[str]] = None,
) -> List[Dict[str, Any]]:
    normalized_images = validate_images(compose_data, image_overrides=image_overrides)
    service_items = list(iter_services(compose_data))
    if not service_items:
        raise ValueError("compose file has no services")
    requested_pull_secret_services = {
        str(name).strip()
        for name in (image_pull_secret_services or ())
        if str(name).strip()
    }
    service_names = {name for name, _ in service_items}
    unknown_pull_secret_services = sorted(requested_pull_secret_services - service_names)
    if unknown_pull_secret_services:
        raise ValueError(
            "image pull secret references unknown Compose service(s): "
            + ", ".join(unknown_pull_secret_services)
        )

    database_plans: List[DatabasePlan] = []
    app_services: List[Tuple[str, Mapping[str, Any]]] = []
    for name, service in service_items:
        declared_image = service.get("image")
        classification_image = (
            normalize_image_reference(declared_image, name)
            if isinstance(declared_image, str) and declared_image.strip()
            else normalized_images[name]
        )
        db_type = detect_db_type(classification_image)
        if db_type in SPECIAL_DB_RESOURCE_TYPES:
            database_plans.append(
                plan_database_service(
                    name,
                    db_type,
                    classification_image,
                    service,
                )
            )
        else:
            app_services.append((name, service))

    if not app_services:
        if database_plans:
            raise ValueError(
                "compose contains database services but no application service; "
                "refusing to convert a database into an application workload"
            )
        raise ValueError("compose contains no application services")

    selected_public_service = select_public_service(app_services, public_service)
    primary_service = selected_public_service or app_services[0][0]
    primary_workload_name = "${{ defaults.app_name }}"
    workload_names = {
        service_name: (
            primary_workload_name
            if service_name == primary_service
            else f"${{{{ defaults.app_name }}}}-{normalize_k8s_name(service_name)}"
        )
        for service_name, _ in app_services
    }
    service_hosts = {
        service_name: f"{workload_name}.${{{{ SEALOS_NAMESPACE }}}}.svc.cluster.local"
        for service_name, workload_name in workload_names.items()
    }

    db_type_counts: Dict[str, int] = {}
    for plan in database_plans:
        db_type_counts[plan.db_type] = db_type_counts.get(plan.db_type, 0) + 1
    database_plans = [
        replace(
            plan,
            cluster_name=database_cluster_name(
                plan.db_type,
                plan.service_name,
                db_type_counts[plan.db_type],
            ),
        )
        for plan in database_plans
    ]
    database_plans = [
        replace(
            plan,
            connection_secret_name=database_secret_name(
                plan.db_type,
                plan.cluster_name,
            ),
            app_secret_name=(
                database_app_secret_name(plan.cluster_name)
                if plan.app_username
                else ""
            ),
            password_default_name=(
                database_password_default_name(
                    plan.db_type,
                    plan.service_name,
                )
                if plan.app_username
                else ""
            ),
        )
        for plan in database_plans
    ]
    database_plans_by_name = {
        plan.service_name: plan for plan in database_plans
    }
    managed_db_services = {
        plan.service_name: plan.db_type
        for plan in database_plans
        if plan.use_kubeblocks
    }
    database_pull_secret_services = sorted(
        requested_pull_secret_services.intersection(managed_db_services)
    )
    if database_pull_secret_services:
        raise ValueError(
            "image pull secret cannot target database service(s) converted to KubeBlocks: "
            + ", ".join(database_pull_secret_services)
        )

    db_hosts = {
        plan.service_name: (
            database_service_fqdn(plan.db_type, plan.cluster_name)
            if plan.use_kubeblocks
            else (
                f"{plan.cluster_name}.${{{{ SEALOS_NAMESPACE }}}}."
                "svc.cluster.local"
            )
        )
        for plan in database_plans
    }
    db_secret_names = {
        plan.service_name: plan.connection_secret_name
        for plan in database_plans
        if plan.use_kubeblocks
    }
    db_app_secret_names = {
        plan.service_name: plan.app_secret_name
        for plan in database_plans
        if plan.use_kubeblocks and plan.has_app_credentials
    }

    digest_cache: Dict[str, str] = {}
    resolved_images: Dict[str, str] = {}
    for service_name, _ in app_services:
        source_image = normalized_images[service_name]
        resolved_images[service_name] = resolve_image_reference(
            source_image,
            digest_cache=digest_cache,
        )
    for plan in database_plans:
        if plan.use_kubeblocks:
            continue
        resolved_images[plan.service_name] = resolve_image_reference(
            normalized_images[plan.service_name],
            digest_cache=digest_cache,
        )

    bootstrap_client_images: Dict[str, str] = {}
    for plan in database_plans:
        if not plan.needs_bootstrap:
            continue
        client_image = DB_BOOTSTRAP_CLIENT_IMAGE_BY_TYPE.get(plan.db_type)
        if client_image is None:
            raise ValueError(
                f"database bootstrap is not implemented for {plan.db_type}"
            )
        if plan.db_type not in bootstrap_client_images:
            bootstrap_client_images[plan.db_type] = resolve_image_reference(
                client_image,
                digest_cache=digest_cache,
            )

    docs: List[Dict[str, Any]] = []
    docs.append(
        build_template_resource(
            meta,
            password_defaults=[
                plan.password_default_name
                for plan in database_plans
                if plan.use_kubeblocks and plan.has_app_credentials
            ],
        )
    )

    all_env_keys = set()
    for _, service in app_services:
        for key, _ in parse_env(service):
            all_env_keys.add(key)
    if OBJECT_STORAGE_BUCKET_ENV_NAME in all_env_keys or OBJECT_STORAGE_BASE_ENV_NAMES.intersection(all_env_keys):
        docs.append(build_object_storage_bucket())

    for plan in database_plans:
        if not plan.use_kubeblocks:
            continue
        docs.extend(
            build_database_resources(
                plan.db_type,
                plan.cluster_name,
            )
        )
        if plan.has_app_credentials:
            docs.append(build_database_app_secret(plan))
        if plan.needs_bootstrap:
            docs.append(
                build_database_bootstrap_job(
                    plan,
                    bootstrap_client_images[plan.db_type],
                )
            )

    workload_docs: List[Dict[str, Any]] = []
    service_docs: List[Dict[str, Any]] = []
    compose_dir = compose_path.parent if compose_path is not None else Path.cwd()
    runtime_hosts = {**service_hosts, **db_hosts}

    for plan in database_plans:
        if plan.use_kubeblocks:
            continue
        service = plan.service
        image = resolved_images[plan.service_name]
        ports = merge_ports(
            parse_ports(service),
            parse_expose_ports(service),
            [DB_DEFAULT_PORT_BY_TYPE[plan.db_type]],
        )
        mount_paths, bind_config_mounts = parse_database_fallback_mounts(
            service,
            compose_dir,
            plan.db_type,
        )
        config_mounts = [
            *parse_config_mounts(service, compose_data, compose_dir),
            *bind_config_mounts,
        ]
        command_args = [
            map_compose_service_reference(arg, runtime_hosts)
            for arg in parse_command_args(service)
        ]
        entrypoint_command = [
            map_compose_service_reference(arg, runtime_hosts)
            for arg in parse_entrypoint_command(service)
        ]
        env_entries = [
            {
                "name": key,
                "value": map_compose_env_value(
                    value,
                    db_hosts,
                    service_hosts,
                ),
            }
            for key, value in parse_env(service)
        ]
        websocket_ports: Set[int] = set()
        probes = build_probe_pair(
            service,
            image,
            ports,
            command_args,
        )
        if config_mounts:
            docs.append(build_configmap(plan.cluster_name, config_mounts))
        docs.append(
            build_workload(
                workload_name=plan.cluster_name,
                image=image,
                replicas=parse_service_replicas(service),
                ports=ports,
                websocket_ports=websocket_ports,
                env_entries=env_entries,
                command_args=command_args,
                entrypoint_command=entrypoint_command,
                mount_paths=mount_paths,
                config_mounts=config_mounts,
                probes=probes,
                image_pull_secret=(
                    plan.service_name in requested_pull_secret_services
                ),
                allow_database_image=True,
                kubeblocks_fallback_reason=plan.fallback_reason,
            )
        )
        raw_service = build_service(
            plan.cluster_name,
            ports,
            websocket_ports,
            kubeblocks_fallback_reason=plan.fallback_reason,
        )
        if raw_service is not None:
            docs.append(raw_service)

    public_port: Optional[int] = None
    public_ingress_protocol = "HTTP"
    for service_name, service in app_services:
        workload_name = workload_names[service_name]
        image = resolved_images[service_name]
        published_ports = parse_ports(service)
        ports = merge_ports(published_ports, parse_expose_ports(service))
        env_entries = build_env_entries(
            service,
            db_hosts,
            managed_db_services,
            db_secret_names,
            db_app_secret_names,
            service_hosts,
        )
        command_args = parse_command_args(service)
        command_args = [
            map_compose_service_reference(arg, runtime_hosts)
            for arg in command_args
        ]
        entrypoint_command = [
            map_compose_service_reference(arg, runtime_hosts)
            for arg in parse_entrypoint_command(service)
        ]
        mount_paths = parse_mount_paths(service)
        config_mounts = parse_config_mounts(service, compose_data, compose_dir)
        if kompose_shapes:
            shape = kompose_shapes.get(normalize_k8s_name(service_name))
            if shape is not None:
                if not ports:
                    ports = list(shape.ports)
                if not mount_paths:
                    mount_paths = list(shape.mount_paths)
        websocket_ports = infer_websocket_ports(service)
        probes = build_probe_pair(service, image, ports, command_args)
        database_dependencies = infer_service_database_dependencies(
            service,
            managed_db_services,
        )
        init_containers = [
            build_database_ready_init_container(
                database_plans_by_name[db_service_name],
                bootstrap_client_images[
                    database_plans_by_name[db_service_name].db_type
                ],
            )
            for db_service_name in sorted(database_dependencies)
            if database_plans_by_name[db_service_name].needs_bootstrap
        ]
        workload = build_workload(
            workload_name=workload_name,
            image=image,
            replicas=parse_service_replicas(service),
            ports=ports,
            websocket_ports=websocket_ports,
            env_entries=env_entries,
            command_args=command_args,
            entrypoint_command=entrypoint_command,
            mount_paths=mount_paths,
            config_mounts=config_mounts,
            probes=probes,
            init_containers=init_containers,
            image_pull_secret=service_name in requested_pull_secret_services,
        )
        if config_mounts:
            workload_docs.append(build_configmap(workload_name, config_mounts))
        workload_docs.append(workload)
        service_doc = build_service(workload_name, ports, websocket_ports)
        if service_doc is not None:
            service_docs.append(service_doc)
            if service_name == selected_public_service and published_ports:
                public_port = published_ports[0]
                if service_requires_websocket_ingress(service_name, service, public_port):
                    public_ingress_protocol = "WS"

    docs.extend(workload_docs)
    docs.extend(service_docs)
    if public_port is not None:
        docs.append(build_ingress(primary_workload_name, public_port, public_ingress_protocol))
    docs.append(build_app_resource(meta))
    validate_generated_database_contract(
        docs,
        database_plans,
    )
    return docs


def convert_compose_to_template(
    *,
    compose_path: Path,
    output_root: Path,
    meta: MetadataOptions,
    kompose_shapes: Optional[Mapping[str, ServiceShape]] = None,
    image_overrides: Optional[Mapping[str, str]] = None,
    public_service: str = "",
    image_pull_secret_services: Optional[Sequence[str]] = None,
    write_files: bool = True,
    fetch_logo: bool = True,
) -> Tuple[Path, str]:
    compose_data = parse_compose(compose_path)
    app_dir = output_root / meta.app_name
    if write_files:
        meta = prepare_logo_asset(meta, app_dir, fetch_logo)
    documents = build_documents(
        compose_data,
        meta,
        kompose_shapes=kompose_shapes,
        compose_path=compose_path,
        image_overrides=image_overrides,
        public_service=public_service,
        image_pull_secret_services=image_pull_secret_services,
    )
    index_path = app_dir / "index.yaml"
    rendered = render_index_yaml(documents)
    if write_files:
        app_dir.mkdir(parents=True, exist_ok=True)
        index_path.write_text(rendered, encoding="utf-8")
    return index_path, rendered


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
        "--image-override",
        action="append",
        default=[],
        metavar="SERVICE=IMAGE",
        help=(
            "Use IMAGE for one Compose service without modifying the Compose file; "
            "repeat for multiple services"
        ),
    )
    parser.add_argument(
        "--public-service",
        default="",
        metavar="SERVICE",
        help=(
            "Compose service to expose through the generated public Ingress; "
            "required when multiple application services publish ports"
        ),
    )
    parser.add_argument(
        "--image-pull-secret-service",
        action="append",
        default=[],
        metavar="SERVICE",
        help=(
            "Reference the app-scoped image pull Secret for one Compose service; "
            "repeat for multiple services"
        ),
    )
    parser.add_argument("--dry-run", action="store_true", help="Print index.yaml content without writing files")
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    compose_path = Path(args.compose).resolve()
    if not compose_path.exists():
        raise SystemExit(f"ERROR: compose file not found: {compose_path}")

    compose_data = parse_compose(compose_path)
    meta = infer_metadata(args, compose_data, compose_path)
    output_root = Path(args.output_dir).resolve()

    try:
        image_overrides = parse_image_overrides(args.image_override)
        image_pull_secret_services = [item.strip() for item in args.image_pull_secret_service if item.strip()]
        if len(image_pull_secret_services) != len(set(image_pull_secret_services)):
            raise ValueError("duplicate image pull secret service")
        kompose_shapes = resolve_kompose_shapes(compose_path, args.kompose_mode)
        index_path, rendered = convert_compose_to_template(
            compose_path=compose_path,
            output_root=output_root,
            meta=meta,
            kompose_shapes=kompose_shapes,
            image_overrides=image_overrides,
            public_service=args.public_service,
            image_pull_secret_services=image_pull_secret_services,
            write_files=not args.dry_run,
            fetch_logo=not args.no_fetch_logo,
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
