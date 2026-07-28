#!/usr/bin/env python3
"""Convert rendered Kubernetes resources into a Sealos Template.

This adapter intentionally operates on Kubernetes resources instead of turning
them into a synthetic Compose model. That preserves resource kinds, RBAC,
KubeBlocks objects, probes, storage, and multi-route Services/Ingresses.
"""

from __future__ import annotations

import argparse
import copy
import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Optional, Sequence, Set, Tuple

import yaml

from compose_to_template import (
    HTTP_INGRESS_ANNOTATIONS,
    MetadataOptions,
    WEBSOCKET_INGRESS_ANNOTATIONS,
    build_app_resource,
    build_template_resource,
    detect_db_type,
    normalize_k8s_name,
    render_index_yaml,
)


SUPPORTED_KINDS = {
    "ConfigMap",
    "CronJob",
    "DaemonSet",
    "Deployment",
    "Ingress",
    "Job",
    "Namespace",
    "ObjectStorageBucket",
    "PersistentVolumeClaim",
    "Role",
    "RoleBinding",
    "Secret",
    "Service",
    "ServiceAccount",
    "StatefulSet",
}
KUBEBLOCKS_CLUSTER_PREFIX = "apps.kubeblocks.io/"
TOPOLOGY_KINDS = {"Deployment", "StatefulSet", "DaemonSet", "CronJob", "Cluster", "ObjectStorageBucket"}
CPU_LADDER = ("100m", "200m", "500m", "1", "2", "3", "4", "8")
MEMORY_LADDER = ("128Mi", "256Mi", "512Mi", "1024Mi", "2048Mi", "4096Mi", "8192Mi", "16384Mi")
CPU_REQUESTS = {
    "100m": "10m",
    "200m": "20m",
    "500m": "50m",
    "1": "100m",
    "2": "200m",
    "3": "300m",
    "4": "400m",
    "8": "800m",
}
MEMORY_REQUESTS = {
    "128Mi": "12Mi",
    "256Mi": "25Mi",
    "512Mi": "51Mi",
    "1024Mi": "102Mi",
    "2048Mi": "204Mi",
    "4096Mi": "409Mi",
    "8192Mi": "819Mi",
    "16384Mi": "1638Mi",
}
DB_RESOURCE_LIMITS = {"cpu": "500m", "memory": "512Mi"}
DB_RESOURCE_REQUESTS = {"cpu": "50m", "memory": "51Mi"}
RESOURCE_METADATA_FIELDS = {
    "creationTimestamp",
    "deletionTimestamp",
    "deletionGracePeriodSeconds",
    "generateName",
    "generation",
    "managedFields",
    "resourceVersion",
    "selfLink",
    "uid",
}
HOOK_ANNOTATION = "helm.sh/hook"


def _metadata(document: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    metadata = document.setdefault("metadata", {})
    if not isinstance(metadata, dict):
        raise ValueError("Kubernetes resource metadata must be a mapping")
    return metadata


def _name(document: Mapping[str, Any]) -> str:
    metadata = document.get("metadata")
    name = metadata.get("name") if isinstance(metadata, Mapping) else None
    if not isinstance(name, str) or not name.strip():
        raise ValueError(f"{document.get('kind', 'resource')} is missing metadata.name")
    return name.strip()


def _strip_runtime_metadata(document: MutableMapping[str, Any]) -> None:
    metadata = _metadata(document)
    metadata.pop("namespace", None)
    for field in RESOURCE_METADATA_FIELDS:
        metadata.pop(field, None)
    document.pop("status", None)


def _is_cluster(document: Mapping[str, Any]) -> bool:
    return (
        document.get("kind") == "Cluster"
        and isinstance(document.get("apiVersion"), str)
        and document["apiVersion"].startswith(KUBEBLOCKS_CLUSTER_PREFIX)
    )


def _is_hook(document: Mapping[str, Any]) -> bool:
    annotations = document.get("metadata", {}).get("annotations", {})
    return isinstance(annotations, Mapping) and bool(annotations.get(HOOK_ANNOTATION))


def _is_source_pull_secret(document: Mapping[str, Any]) -> bool:
    if document.get("kind") != "Secret":
        return False
    secret_type = document.get("type")
    return secret_type == "kubernetes.io/dockerconfigjson" or ".dockerconfigjson" in (
        document.get("data") or {}
    )


def _pod_spec(document: MutableMapping[str, Any]) -> Optional[MutableMapping[str, Any]]:
    kind = document.get("kind")
    if kind == "CronJob":
        job_template = document.setdefault("spec", {}).setdefault("jobTemplate", {})
        return job_template.setdefault("spec", {}).setdefault("template", {}).setdefault("spec", {})
    if kind in {"Deployment", "StatefulSet", "DaemonSet", "Job"}:
        return document.setdefault("spec", {}).setdefault("template", {}).setdefault("spec", {})
    return None


def _all_containers(document: MutableMapping[str, Any]) -> List[Tuple[MutableMapping[str, Any], str]]:
    pod_spec = _pod_spec(document)
    if pod_spec is None:
        return []
    result: List[Tuple[MutableMapping[str, Any], str]] = []
    for role in ("initContainers", "containers"):
        containers = pod_spec.get(role)
        if not isinstance(containers, list):
            continue
        for container in containers:
            if isinstance(container, dict):
                result.append((container, "init" if role == "initContainers" else "main"))
    return result


def _service_key(workload_name: str, container_name: str, total: int) -> str:
    return workload_name if total == 1 else f"{workload_name}.{container_name}"


def _container_service_keys(documents: Sequence[MutableMapping[str, Any]]) -> Set[str]:
    keys: Set[str] = set()
    for document in documents:
        containers = _all_containers(document)
        if not containers:
            continue
        workload_name = _name(document)
        total = len(containers)
        for index, (container, _) in enumerate(containers):
            container_name = str(container.get("name") or f"container-{index + 1}")
            key = _service_key(workload_name, container_name, total)
            if key in keys:
                raise ValueError(f"duplicate Kubernetes container service key {key!r}")
            keys.add(key)
    return keys


def _parse_cpu(value: Any) -> float:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value) * 1000
    text = str(value or "").strip()
    if not text:
        return 200
    if text.endswith("m"):
        return float(text[:-1])
    return float(text) * 1000


def _parse_memory(value: Any) -> float:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    text = str(value or "").strip()
    if not text:
        return 256 * 1024 * 1024
    match = re.fullmatch(r"([0-9]+(?:\.[0-9]+)?)([A-Za-z]*)", text)
    if not match:
        raise ValueError(f"unsupported memory quantity: {value!r}")
    number = float(match.group(1))
    suffix = match.group(2).lower()
    factors = {
        "": 1,
        "k": 1000,
        "m": 1000**2,
        "g": 1000**3,
        "ki": 1024,
        "mi": 1024**2,
        "gi": 1024**3,
    }
    if suffix not in factors:
        raise ValueError(f"unsupported memory quantity: {value!r}")
    return number * factors[suffix]


def _ladder_value(value: Any, ladder: Sequence[str], parser) -> str:
    requested = parser(value)
    for candidate in ladder:
        if parser(candidate) >= requested:
            return candidate
    return ladder[-1]


def _normalise_resources(container: MutableMapping[str, Any]) -> None:
    resources = container.setdefault("resources", {})
    if not isinstance(resources, dict):
        resources = {}
        container["resources"] = resources
    limits = resources.setdefault("limits", {})
    if not isinstance(limits, dict):
        limits = {}
        resources["limits"] = limits
    requests = resources.setdefault("requests", {})
    if not isinstance(requests, dict):
        requests = {}
        resources["requests"] = requests

    cpu = _ladder_value(limits.get("cpu") or requests.get("cpu") or "200m", CPU_LADDER, _parse_cpu)
    memory = _ladder_value(
        limits.get("memory") or requests.get("memory") or "256Mi",
        MEMORY_LADDER,
        _parse_memory,
    )
    limits["cpu"] = cpu
    limits["memory"] = memory
    requests["cpu"] = CPU_REQUESTS[cpu]
    requests["memory"] = MEMORY_REQUESTS[memory]


def _replace_service_reference(value: str, mapping: Mapping[str, str]) -> str:
    result = value
    for old, new in sorted(mapping.items(), key=lambda item: len(item[0]), reverse=True):
        pattern = rf"(?<![A-Za-z0-9_-]){re.escape(old)}(?=$|[-.:/\s\"'])"
        result = re.sub(pattern, new, result)
    return result


def _replace_references(value: Any, mapping: Mapping[str, str]) -> Any:
    if isinstance(value, str):
        return _replace_service_reference(value, mapping)
    if isinstance(value, list):
        return [_replace_references(item, mapping) for item in value]
    if isinstance(value, dict):
        return {key: _replace_references(item, mapping) for key, item in value.items()}
    return value


def _service_name_mapping(documents: Sequence[Mapping[str, Any]]) -> Dict[str, str]:
    mapping: Dict[str, str] = {}
    targets: Dict[str, str] = {}
    for document in documents:
        if document.get("kind") != "Service":
            continue
        metadata = document.get("metadata")
        spec = document.get("spec")
        old_name = metadata.get("name") if isinstance(metadata, Mapping) else None
        selector = spec.get("selector") if isinstance(spec, Mapping) else None
        app_name = selector.get("app") if isinstance(selector, Mapping) else None
        if not isinstance(old_name, str) or not isinstance(app_name, str) or not app_name.strip():
            continue
        old_name = old_name.strip()
        app_name = app_name.strip()
        if old_name == app_name:
            continue
        previous = targets.get(app_name)
        if previous and previous != old_name:
            raise ValueError(
                f"multiple Services select app {app_name!r}; set an explicit Kubernetes adapter mapping"
            )
        targets[app_name] = old_name
        mapping[old_name] = app_name
    return mapping


def _normalise_service(document: MutableMapping[str, Any]) -> None:
    metadata = _metadata(document)
    spec = document.setdefault("spec", {})
    if not isinstance(spec, dict):
        raise ValueError(f"Service {_name(document)} spec must be a mapping")
    metadata.setdefault("labels", {})
    labels = metadata["labels"]
    if not isinstance(labels, dict):
        labels = {}
        metadata["labels"] = labels
    selector = spec.get("selector")
    selector_app = selector.get("app") if isinstance(selector, dict) else None
    if isinstance(selector_app, str) and selector_app.strip():
        component = _name(document)
        labels["app"] = component
        labels["cloud.sealos.io/app-deploy-manager"] = component
        selector["app"] = component
    ports = spec.get("ports")
    if isinstance(ports, list):
        for index, port in enumerate(ports):
            if not isinstance(port, dict):
                continue
            name = port.get("name")
            if not isinstance(name, str) or not name.strip():
                number = port.get("port", port.get("targetPort", index + 1))
                port["name"] = f"tcp-{number}"
    for field in (
        "clusterIP",
        "clusterIPs",
        "ipFamilies",
        "ipFamilyPolicy",
        "healthCheckNodePort",
        "internalTrafficPolicy",
        "allocateLoadBalancerNodePorts",
        "loadBalancerClass",
    ):
        spec.pop(field, None)


def _normalise_workload(
    document: MutableMapping[str, Any],
    image_overrides: Mapping[str, str],
    pull_secret_services: Set[str],
) -> List[str]:
    workload_name = _name(document)
    pod_spec = _pod_spec(document)
    if pod_spec is None:
        raise ValueError(f"{document.get('kind')} {workload_name} has no Pod template")
    containers = _all_containers(document)
    if not containers:
        raise ValueError(f"{document.get('kind')} {workload_name} has no containers")

    metadata = _metadata(document)
    labels = metadata.setdefault("labels", {})
    if not isinstance(labels, dict):
        labels = {}
        metadata["labels"] = labels
    labels["app"] = workload_name
    labels["cloud.sealos.io/app-deploy-manager"] = workload_name
    annotations = metadata.setdefault("annotations", {})
    if not isinstance(annotations, dict):
        annotations = {}
        metadata["annotations"] = annotations

    template = document.setdefault("spec", {}).setdefault("template", {})
    template_metadata = template.setdefault("metadata", {})
    if not isinstance(template_metadata, dict):
        template_metadata = {}
        template["metadata"] = template_metadata
    template_labels = template_metadata.setdefault("labels", {})
    if not isinstance(template_labels, dict):
        template_labels = {}
        template_metadata["labels"] = template_labels
    template_labels["app"] = workload_name

    spec = document["spec"]
    if document.get("kind") in {"Deployment", "StatefulSet", "DaemonSet"}:
        spec["revisionHistoryLimit"] = 1
    selector = spec.setdefault("selector", {})
    if isinstance(selector, dict):
        match_labels = selector.setdefault("matchLabels", {})
        if isinstance(match_labels, dict):
            match_labels["app"] = workload_name

    service_keys: List[str] = []
    main_images: List[str] = []
    total = len(containers)
    needs_pull_secret = False
    for index, (container, role) in enumerate(containers):
        original_name = str(container.get("name") or f"container-{index + 1}")
        key = _service_key(workload_name, original_name, total)
        service_keys.append(key)
        image = container.get("image")
        override = image_overrides.get(key)
        if override is not None:
            image = override
            container["image"] = override
        if not isinstance(image, str) or not re.search(r"@sha256:[0-9a-fA-F]{64}$", image):
            raise ValueError(
                f"{document.get('kind')} {workload_name} container {original_name} requires an immutable image override"
            )
        if role == "main" and not main_images:
            main_images.append(image)
        container["imagePullPolicy"] = "IfNotPresent"
        _normalise_resources(container)
        if key in pull_secret_services:
            needs_pull_secret = True

        if role == "main" and not main_images[:-1] and index == next(
            (position for position, (_, item_role) in enumerate(containers) if item_role == "main"),
            index,
        ):
            container["name"] = workload_name

        for volume in pod_spec.get("volumes", []) if isinstance(pod_spec.get("volumes"), list) else []:
            if isinstance(volume, dict) and "emptyDir" in volume:
                raise ValueError(
                    f"{document.get('kind')} {workload_name} uses emptyDir volume {volume.get('name', '<unnamed>')}; "
                    "the Kubernetes adapter requires a persistent equivalent"
                )

    if main_images:
        annotations["originImageName"] = main_images[0]
    if needs_pull_secret:
        pod_spec["imagePullSecrets"] = [{"name": "${{ defaults.app_name }}"}]
    else:
        pod_spec.pop("imagePullSecrets", None)

    service_account = pod_spec.get("serviceAccountName")
    pod_spec["automountServiceAccountToken"] = bool(
        service_account or pod_spec.get("automountServiceAccountToken") is True
    )

    if document.get("kind") == "StatefulSet":
        claims = spec.get("volumeClaimTemplates")
        if isinstance(claims, list):
            for claim in claims:
                if not isinstance(claim, dict):
                    continue
                claim_meta = claim.setdefault("metadata", {})
                claim_name = claim_meta.get("name") if isinstance(claim_meta, dict) else None
                if not isinstance(claim_name, str) or not claim_name.strip():
                    raise ValueError(f"StatefulSet {workload_name} has an unnamed volumeClaimTemplate")
                claim_meta.setdefault("annotations", {})
                claim_meta["annotations"]["value"] = "1"
                mounts = [
                    item
                    for container, _ in containers
                    for item in (container.get("volumeMounts") or [])
                    if isinstance(item, dict) and item.get("name") == claim_name
                ]
                if not mounts:
                    raise ValueError(
                        f"StatefulSet {workload_name} claim {claim_name} has no matching volumeMount"
                    )
                claim_meta["annotations"].setdefault("path", mounts[0].get("mountPath", "/data"))
                claim_meta.pop("namespace", None)
                claim_meta.setdefault("labels", {})
                if isinstance(claim_meta["labels"], dict):
                    claim_meta["labels"].pop("cloud.sealos.io/deploy-on-sealos", None)

    return service_keys


def _normalise_cluster(document: MutableMapping[str, Any]) -> None:
    name = _name(document)
    metadata = _metadata(document)
    labels = metadata.setdefault("labels", {})
    if not isinstance(labels, dict):
        labels = {}
        metadata["labels"] = labels
    labels.setdefault("sealos-db-provider-cr", name)
    labels.setdefault("app.kubernetes.io/instance", name)
    labels.setdefault("app.kubernetes.io/managed-by", "kbcli")
    labels.setdefault("kb.io/database", labels.get("clusterdefinition.kubeblocks.io/name", "postgresql"))
    labels.setdefault("clusterdefinition.kubeblocks.io/name", labels.get("kb.io/database", "postgresql"))
    spec = document.setdefault("spec", {})
    components = spec.get("componentSpecs") if isinstance(spec, dict) else None
    if not isinstance(components, list) or not components:
        raise ValueError(f"KubeBlocks Cluster {name} has no componentSpecs")
    for component in components:
        if not isinstance(component, dict):
            continue
        component["resources"] = {
            "limits": dict(DB_RESOURCE_LIMITS),
            "requests": dict(DB_RESOURCE_REQUESTS),
        }
        claims = component.get("volumeClaimTemplates")
        if isinstance(claims, list):
            for claim in claims:
                if not isinstance(claim, dict):
                    continue
                claim_meta = claim.setdefault("metadata", {})
                if isinstance(claim_meta, dict):
                    claim_meta.pop("namespace", None)
                claim_spec = claim.setdefault("spec", {})
                resources = claim_spec.setdefault("resources", {})
                requests = resources.setdefault("requests", {})
                if isinstance(requests, dict):
                    storage = requests.get("storage", "1Gi")
                    try:
                        if _parse_memory(storage) > _parse_memory("1Gi"):
                            requests["storage"] = "1Gi"
                    except ValueError:
                        requests["storage"] = "1Gi"


def _cluster_db_type(document: Mapping[str, Any]) -> str:
    spec = document.get("spec") if isinstance(document.get("spec"), Mapping) else {}
    candidates = [
        spec.get("clusterDefinitionRef"),
        spec.get("clusterVersionRef"),
        (document.get("metadata", {}).get("labels", {}) or {}).get(
            "clusterdefinition.kubeblocks.io/name"
        ),
        (document.get("metadata", {}).get("labels", {}) or {}).get("kb.io/database"),
    ]
    text = " ".join(str(item).lower() for item in candidates if item)
    if "mongo" in text:
        return "mongodb"
    if "mysql" in text or "mariadb" in text:
        return "mysql"
    if "redis" in text or "valkey" in text:
        return "redis"
    if "kafka" in text:
        return "kafka"
    return "postgres"


def _database_name_mapping(documents: Sequence[Mapping[str, Any]]) -> Dict[str, str]:
    clusters = [
        document
        for document in documents
        if _is_cluster(document)
    ]
    by_type: Dict[str, List[Mapping[str, Any]]] = defaultdict(list)
    for cluster in clusters:
        by_type[_cluster_db_type(cluster)].append(cluster)

    suffixes = {
        "postgres": "pg",
        "mysql": "mysql",
        "mongodb": "mongo",
        "redis": "redis",
        "kafka": "broker",
    }
    mapping: Dict[str, str] = {}
    for db_type, items in by_type.items():
        suffix = suffixes[db_type]
        for index, cluster in enumerate(items):
            old_name = _name(cluster)
            if len(items) == 1:
                new_name = f"${{{{ defaults.app_name }}}}-{suffix}"
            else:
                new_name = (
                    f"${{{{ defaults.app_name }}}}-{suffix}-{normalize_k8s_name(old_name)}"
                )
            mapping[old_name] = new_name
    return mapping


def _normalise_database_envs(
    document: MutableMapping[str, Any],
    database_name_mapping: Mapping[str, str],
) -> None:
    if document.get("kind") not in {"Deployment", "StatefulSet", "DaemonSet", "Job", "CronJob"}:
        return
    for container, _ in _all_containers(document):
        env = container.get("env")
        if not isinstance(env, list):
            continue
        for item in env:
            if not isinstance(item, dict):
                continue
            name = item.get("name")
            if not isinstance(name, str):
                continue
            upper = re.sub(r"[^A-Z0-9]+", "_", name.upper())
            if not re.search(r"(?:^|_)(?:PG|POSTGRES|POSTGRESQL|DB|DATABASE)", upper):
                continue
            if any(token in upper for token in ("PUBLIC", "API", "URL", "URI", "DSN")):
                continue
            field = None
            if re.search(r"(?:^|_)(?:PASSWORD|PASS|PWD)$", upper) or upper.endswith(
                ("PASSWORD", "PASS", "PWD")
            ):
                field = "password"
            elif re.search(r"(?:^|_)(?:USERNAME|USER)$", upper) or upper.endswith(
                ("USERNAME", "USER")
            ):
                field = "username"
            elif re.search(r"(?:^|_)(?:HOST|SERVER)$", upper) or upper.endswith(
                ("HOST", "SERVER")
            ):
                field = "host"
            elif re.search(r"(?:^|)PORT$", upper) or upper.endswith("PORT"):
                field = "port"
            if field not in {"host", "port"}:
                continue
            if isinstance(item.get("valueFrom"), Mapping):
                continue
            secret_name = next(iter(database_name_mapping.values()), "")
            if not secret_name:
                continue
            item.pop("value", None)
            item["valueFrom"] = {
                "secretKeyRef": {
                    "name": f"{secret_name}-conn-credential",
                    "key": field,
                }
            }


def _normalise_service_namespace_references(value: Any) -> Any:
    if isinstance(value, str):
        return re.sub(
            r"\.default\.svc(\.cluster\.local)?",
            r".${{ SEALOS_NAMESPACE }}.svc\1",
            value,
        )
    if isinstance(value, list):
        return [_normalise_service_namespace_references(item) for item in value]
    if isinstance(value, dict):
        return {
            key: _normalise_service_namespace_references(item)
            for key, item in value.items()
        }
    return value


def _is_kubeblocks_service(document: Mapping[str, Any]) -> bool:
    if document.get("kind") != "Service":
        return False
    metadata = document.get("metadata") if isinstance(document.get("metadata"), Mapping) else {}
    labels = metadata.get("labels") if isinstance(metadata, Mapping) else {}
    if not isinstance(labels, Mapping):
        labels = {}
    selector = document.get("spec", {}).get("selector", {})
    values = [
        metadata.get("name"),
        *(labels.values() if isinstance(labels, Mapping) else []),
        *(selector.values() if isinstance(selector, Mapping) else []),
    ]
    text = " ".join(str(value).lower() for value in values if value is not None)
    return (
        "sealos-db-provider-cr" in labels
        or (
            "apps.kubeblocks.io/component-name" in selector
            and "app.kubernetes.io/instance" in selector
        )
        or bool(re.search(r"(?:^|[-_])(postgres|postgresql|mysql|mariadb|mongo|mongodb|redis|kafka|pg)(?:[-_]|$)", text))
    )
def _normalise_configmap(document: MutableMapping[str, Any]) -> None:
    metadata = _metadata(document)
    name = _name(document)
    labels = metadata.setdefault("labels", {})
    if not isinstance(labels, dict):
        labels = {}
        metadata["labels"] = labels
    labels["app"] = name
    labels["cloud.sealos.io/app-deploy-manager"] = name


def _normalise_pvc(document: MutableMapping[str, Any]) -> None:
    spec = document.setdefault("spec", {})
    resources = spec.setdefault("resources", {})
    requests = resources.setdefault("requests", {})
    if isinstance(requests, dict):
        storage = requests.get("storage", "1Gi")
        try:
            if _parse_memory(storage) > _parse_memory("1Gi"):
                requests["storage"] = "1Gi"
        except ValueError:
            requests["storage"] = "1Gi"


def _normalise_job(
    document: MutableMapping[str, Any],
    image_overrides: Mapping[str, str],
    pull_secret_services: Set[str],
) -> List[str]:
    keys = _normalise_workload(document, image_overrides, pull_secret_services)
    if document.get("kind") == "CronJob":
        metadata = _metadata(document)
        labels = metadata.setdefault("labels", {})
        if not isinstance(labels, dict):
            labels = {}
            metadata["labels"] = labels
        name = _name(document)
        labels["cloud.sealos.io/cronjob"] = name
        labels["cronjob-launchpad-name"] = ""
        labels["cronjob-type"] = "image"
    return keys


def _backend_records(document: Mapping[str, Any]) -> List[Tuple[str, Dict[str, Any], str]]:
    records: List[Tuple[str, Dict[str, Any], str]] = []
    spec = document.get("spec")
    rules = spec.get("rules") if isinstance(spec, Mapping) else None
    if not isinstance(rules, list):
        return records
    for rule in rules:
        if not isinstance(rule, Mapping):
            continue
        http = rule.get("http")
        paths = http.get("paths") if isinstance(http, Mapping) else None
        if not isinstance(paths, list):
            continue
        by_service: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for route in paths:
            if not isinstance(route, Mapping):
                continue
            backend = route.get("backend")
            service = backend.get("service") if isinstance(backend, Mapping) else None
            service_name = service.get("name") if isinstance(service, Mapping) else None
            if isinstance(service_name, str) and service_name.strip():
                by_service[service_name.strip()].append(copy.deepcopy(dict(route)))
        for service_name, service_paths in by_service.items():
            new_rule = {"http": {"paths": service_paths}}
            if isinstance(rule.get("host"), str):
                new_rule["host"] = rule["host"]
            records.append((service_name, new_rule, str(rule.get("host") or "")))
    return records


def _host_default_key(service_name: str, index: int, selected: bool) -> str:
    if selected and index == 0:
        return "app_host"
    base = normalize_k8s_name(service_name).replace("-", "_")
    return f"{base}_host" if index == 0 else f"{base}_{index + 1}_host"


def _normalise_ingresses(
    documents: Sequence[MutableMapping[str, Any]],
    public_service: str,
    template: MutableMapping[str, Any],
    source_mapping: List[Dict[str, Any]],
) -> Tuple[List[MutableMapping[str, Any]], Optional[str], Dict[str, str]]:
    ingress_documents = [document for document in documents if document.get("kind") == "Ingress"]
    records: List[Tuple[str, Dict[str, Any], str, str]] = []
    for document in ingress_documents:
        source_id = f"Ingress/{_name(document)}"
        for service_name, rule, host in _backend_records(document):
            records.append((service_name, rule, host, source_id))
    if ingress_documents and not records:
        raise ValueError("Ingress resources were found but none contains a supported Service backend")

    candidates = sorted({service_name for service_name, _, _, _ in records})
    selected = public_service.strip() if public_service.strip() else (candidates[0] if len(candidates) == 1 else None)
    if len(candidates) > 1 and not selected:
        raise ValueError(
            "multiple public Ingress services were discovered; set config.json public_service "
            f"to one of: {', '.join(candidates)}"
        )
    if selected and selected not in candidates:
        raise ValueError(
            f"config.json public_service {selected!r} has no matching Ingress service; "
            f"available services: {', '.join(candidates) or 'none'}"
        )

    grouped: Dict[str, List[Tuple[Dict[str, Any], str, str]]] = defaultdict(list)
    for service_name, rule, host, source_id in records:
        grouped[service_name].append((rule, host, source_id))

    output: List[MutableMapping[str, Any]] = []
    host_replacements: Dict[str, str] = {}
    all_hosts = list(dict.fromkeys(host for _, _, host, _ in records if host))
    common_suffix = ""
    if len(all_hosts) > 1:
        split_hosts = [host.split(".") for host in all_hosts]
        suffix_parts: List[str] = []
        for columns in zip(*[list(reversed(parts)) for parts in split_hosts]):
            values = {part for part in columns}
            if len(values) != 1:
                break
            suffix_parts.append(next(iter(values)))
        if len(suffix_parts) >= 2:
            common_suffix = ".".join(reversed(suffix_parts))
    for service_name in candidates:
        source_records = grouped[service_name]
        unique_hosts: List[str] = []
        for _, host, _ in source_records:
            if host not in unique_hosts:
                unique_hosts.append(host)
        host_values: Dict[str, str] = {}
        for index, host in enumerate(unique_hosts or [""]):
            key = _host_default_key(service_name, index, service_name == selected)
            if key != "app_host":
                spec = template.setdefault("spec", {})
                defaults = spec.setdefault("defaults", {})
                defaults[key] = {
                    "type": "string",
                    "value": f"{normalize_k8s_name(service_name)}-${{{{ random(8) }}}}",
                }
            host_values[host] = f"${{{{ defaults.{key} }}}}.${{{{ SEALOS_CLOUD_DOMAIN }}}}"
            if host:
                host_replacements[host] = host_values[host]

        rules: List[Dict[str, Any]] = []
        for rule, host, _ in source_records:
            cloned = copy.deepcopy(rule)
            cloned["host"] = host_values.get(host, host_values.get("", "${{ defaults.app_host }}.${{ SEALOS_CLOUD_DOMAIN }}"))
            rules.append(cloned)

        metadata = {
            "name": service_name,
            "labels": {
                "cloud.sealos.io/app-deploy-manager": service_name,
                "cloud.sealos.io/app-deploy-manager-domain": f"${{{{ defaults.{_host_default_key(service_name, 0, service_name == selected)} }}}}",
            },
            "annotations": dict(HTTP_INGRESS_ANNOTATIONS),
        }
        document: MutableMapping[str, Any] = {
            "apiVersion": "networking.k8s.io/v1",
            "kind": "Ingress",
            "metadata": metadata,
            "spec": {
                "rules": rules,
                "tls": [
                    {
                        "hosts": [rule["host"] for rule in rules],
                        "secretName": "${{ SEALOS_CERT_SECRET_NAME }}",
                    }
                ],
            },
        }
        output.append(document)
        for _, _, source_id in source_records:
            source_mapping.append({
                "source": source_id,
                "outputs": [f"Ingress/{service_name}"],
                "action": "normalized-and-consolidated",
            })
    if common_suffix:
        host_replacements.setdefault(common_suffix, "${{ SEALOS_CLOUD_DOMAIN }}")
    return output, selected, host_replacements


def _replace_host_references(value: Any, mapping: Mapping[str, str]) -> Any:
    if isinstance(value, str):
        result = value
        for old, new in sorted(mapping.items(), key=lambda item: len(item[0]), reverse=True):
            result = re.sub(
                rf"(?<![A-Za-z0-9.-]){re.escape(old)}(?![A-Za-z0-9.-])",
                new,
                result,
            )
        # nip.io loopback hosts are development placeholders. Preserve their
        # explicit subdomain while moving them onto the selected Sealos domain.
        # Exact Ingress hosts were replaced first so application URLs stay
        # coupled to the generated Template defaults.
        result = re.sub(
            r"(?<![A-Za-z0-9-])([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)"
            r"\.127\.0\.0\.1\.nip\.io(?![A-Za-z0-9.-])",
            lambda match: f"{match.group(1)}.${{{{ SEALOS_CLOUD_DOMAIN }}}}",
            result,
        )
        result = re.sub(
            r"(?<![A-Za-z0-9.-])127\.0\.0\.1\.nip\.io(?![A-Za-z0-9.-])",
            "${{ SEALOS_CLOUD_DOMAIN }}",
            result,
        )
        return result
    if isinstance(value, list):
        return [_replace_host_references(item, mapping) for item in value]
    if isinstance(value, dict):
        return {key: _replace_host_references(item, mapping) for key, item in value.items()}
    return value


def _collect_template_refs(value: Any, inputs: MutableMapping[str, Any], defaults: MutableMapping[str, Any]) -> None:
    if isinstance(value, str):
        for name in re.findall(r"\$\{\{\s*inputs\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}", value):
            inputs.setdefault(name, {
                "description": f"Value for {name}",
                "type": "string",
                "required": True,
            })
        for name in re.findall(r"\$\{\{\s*defaults\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}", value):
            if name not in defaults:
                defaults[name] = {
                    "type": "string",
                    "value": f"{normalize_k8s_name(name)}-${{{{ random(8) }}}}",
                }
    elif isinstance(value, list):
        for item in value:
            _collect_template_refs(item, inputs, defaults)
    elif isinstance(value, Mapping):
        for item in value.values():
            _collect_template_refs(item, inputs, defaults)


def _normalise_role_binding(document: MutableMapping[str, Any]) -> None:
    subjects = document.get("subjects")
    if not isinstance(subjects, list):
        return
    for subject in subjects:
        if not isinstance(subject, dict) or subject.get("kind") != "ServiceAccount":
            continue
        subject["namespace"] = "${{ SEALOS_NAMESPACE }}"


def _topology_evidence(app_name: str, source: str, documents: Sequence[Mapping[str, Any]]) -> Dict[str, Any]:
    resources: List[Dict[str, Any]] = []
    for document in documents:
        kind = document.get("kind")
        if kind not in TOPOLOGY_KINDS:
            continue
        name = _name(document)
        item: Dict[str, Any] = {"kind": kind, "name": name, "when": "always"}
        if kind in {"Deployment", "StatefulSet"}:
            replicas = document.get("spec", {}).get("replicas", 1)
            item["replicas"] = int(replicas)
        if kind == "Cluster":
            components = document.get("spec", {}).get("componentSpecs", [])
            item["components"] = [
                {"name": component["name"], "replicas": int(component["replicas"])}
                for component in components
                if isinstance(component, Mapping)
            ]
        resources.append(item)
    return {
        "apiVersion": "docker-to-sealos/v1",
        "kind": "TopologyEvidence",
        "metadata": {"name": f"{app_name}-topology"},
        "spec": {
            "appName": app_name,
            "source": source,
            "resources": resources,
        },
    }


def convert_documents(
    documents: Sequence[Mapping[str, Any]],
    *,
    meta: MetadataOptions,
    image_overrides: Mapping[str, str],
    image_pull_secret_services: Set[str],
    public_service: str = "",
    source_name: str = "kubernetes",
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any]]:
    source_mapping: List[Dict[str, Any]] = []
    working: List[MutableMapping[str, Any]] = []
    seen_ids: Set[str] = set()

    for original in documents:
        if not isinstance(original, Mapping):
            continue
        document = copy.deepcopy(dict(original))
        kind = document.get("kind")
        source_id = f"{kind}/{_name(document)}" if document.get("metadata") else f"{kind}/<unnamed>"
        if source_id in seen_ids:
            raise ValueError(f"duplicate source resource {source_id}")
        seen_ids.add(source_id)
        if kind == "Namespace" or _is_hook(document) or _is_source_pull_secret(document):
            source_mapping.append({
                "source": source_id,
                "outputs": [],
                "action": "filtered",
            })
            continue
        if _is_kubeblocks_service(document):
            source_mapping.append({
                "source": source_id,
                "outputs": [],
                "action": "mapped-to-kubeblocks-cluster",
            })
            continue
        if kind not in SUPPORTED_KINDS and not _is_cluster(document):
            raise ValueError(
                f"unsupported Kubernetes resource {source_id}; the adapter cannot prove its Sealos equivalent"
            )
        _strip_runtime_metadata(document)
        if kind == "Secret":
            raise ValueError(
                f"custom Secret {source_id} is not converted automatically; use declared inputs or approved database/object-storage secrets"
            )
        working.append(document)

    database_name_mapping = _database_name_mapping(working)
    service_mapping = _service_name_mapping(working)
    reference_mapping = {**database_name_mapping, **service_mapping}
    if reference_mapping:
        working = [_replace_references(document, reference_mapping) for document in working]
    working = [_normalise_service_namespace_references(document) for document in working]

    template = build_template_resource(meta)
    ingresses, selected_service, host_replacements = _normalise_ingresses(
        working,
        public_service,
        template,
        source_mapping,
    )
    working = [_replace_host_references(document, host_replacements) for document in working]
    known_service_keys = _container_service_keys(working)
    unknown_overrides = sorted(set(image_overrides) - known_service_keys)
    if unknown_overrides:
        raise ValueError(
            "image override references unknown Kubernetes container service(s): "
            + ", ".join(unknown_overrides)
        )
    unknown_pull_services = sorted(image_pull_secret_services - known_service_keys)
    if unknown_pull_services:
        raise ValueError(
            "image pull secret references unknown Kubernetes container service(s): "
            + ", ".join(unknown_pull_services)
        )
    source_outputs: List[MutableMapping[str, Any]] = []
    workloads: List[MutableMapping[str, Any]] = []
    for document in working:
        kind = document.get("kind")
        source_id = f"{kind}/{_name(document)}"
        if _is_cluster(document):
            _normalise_cluster(document)
        elif kind in {"Deployment", "StatefulSet", "DaemonSet"}:
            _normalise_workload(document, image_overrides, image_pull_secret_services)
            _normalise_database_envs(document, database_name_mapping)
            workloads.append(document)
        elif kind in {"Job", "CronJob"}:
            _normalise_job(document, image_overrides, image_pull_secret_services)
            _normalise_database_envs(document, database_name_mapping)
        elif kind == "Service":
            _normalise_service(document)
        elif kind == "ConfigMap":
            _normalise_configmap(document)
        elif kind == "PersistentVolumeClaim":
            _normalise_pvc(document)
        elif kind == "ObjectStorageBucket":
            pass
        elif kind == "RoleBinding":
            _normalise_role_binding(document)
        elif kind in {"ServiceAccount", "Role"}:
            pass
        source_outputs.append(document)
        if kind != "Ingress":
            original_source_id = source_id
            resource_name = _name(document)
            reverse_candidates = list(database_name_mapping.items())
            if kind == "Service":
                reverse_candidates.extend(service_mapping.items())
            for old_name, new_name in reverse_candidates:
                if resource_name == new_name or (
                    old_name in database_name_mapping
                    and resource_name.startswith(f"{new_name}-")
                ):
                    suffix = resource_name[len(new_name):] if resource_name.startswith(new_name) else ""
                    original_source_id = f"{kind}/{old_name}{suffix}"
                    break
            source_mapping.append({
                "source": original_source_id,
                "outputs": [f"{kind}/{_name(document)}"],
                "action": "preserved-and-normalized",
            })

    # ConfigMaps mounted by managed workloads must use the workload name and
    # the converter's component volume convention. Reject ambiguous mounts
    # rather than silently changing application configuration.
    configmap_names = {
        _name(document)
        for document in source_outputs
        if document.get("kind") == "ConfigMap"
    }
    for workload in workloads:
        pod_spec = _pod_spec(workload) or {}
        for volume in pod_spec.get("volumes", []) if isinstance(pod_spec.get("volumes"), list) else []:
            if not isinstance(volume, Mapping):
                continue
            config_map = volume.get("configMap")
            config_name = config_map.get("name") if isinstance(config_map, Mapping) else None
            if config_name not in configmap_names:
                continue
            if config_name != _name(workload):
                raise ValueError(
                    f"{workload.get('kind')} {_name(workload)} mounts ConfigMap {config_name}; "
                    "the adapter requires a component-scoped ConfigMap with the workload name"
                )
            desired_volume = f"{_name(workload)}-cm"
            old_volume = volume.get("name")
            volume["name"] = desired_volume
            for container, _ in _all_containers(workload):
                for mount in container.get("volumeMounts", []) if isinstance(container.get("volumeMounts"), list) else []:
                    if isinstance(mount, dict) and mount.get("name") == old_volume:
                        mount["name"] = desired_volume
                        if "subPath" not in mount:
                            raise ValueError(
                                f"ConfigMap {_name(workload)} must mount every key with an explicit subPath"
                            )

    template_documents = [template]
    template_documents.extend(
        document
        for document in source_outputs
        if document.get("kind") not in {"Ingress"}
    )
    template_documents.extend(ingresses)
    if selected_service:
        template_documents.append(build_app_resource(meta))

    spec = template.setdefault("spec", {})
    inputs = spec.setdefault("inputs", {})
    defaults = spec.setdefault("defaults", {})
    _collect_template_refs(template_documents, inputs, defaults)
    spec["inputs"] = inputs
    spec["defaults"] = defaults

    # Ensure every source resource was accounted for exactly once, including
    # resources consolidated into a single Ingress.
    mapped_sources = {entry["source"] for entry in source_mapping}
    expected_sources = {
        f"{document.get('kind')}/{_name(document)}"
        for document in documents
        if isinstance(document, Mapping) and document.get("metadata")
    }
    if mapped_sources != expected_sources:
        missing = sorted(expected_sources - mapped_sources)
        extra = sorted(mapped_sources - expected_sources)
        raise ValueError(f"source resource mapping is incomplete; missing={missing}, extra={extra}")

    mapping = {
        "version": 1,
        "source": source_name,
        "app_name": meta.app_name,
        "resources": source_mapping,
    }
    return template_documents, [*source_outputs, *ingresses], mapping


def parse_image_overrides(values: Sequence[str]) -> Dict[str, str]:
    result: Dict[str, str] = {}
    for value in values:
        key, separator, image = value.partition("=")
        if not separator or not key.strip() or not image.strip():
            raise ValueError(f"invalid --image-override value: {value!r}")
        if key.strip() in result:
            raise ValueError(f"duplicate image override for service {key.strip()!r}")
        result[key.strip()] = image.strip()
    return result


def load_documents(path: Path) -> List[Dict[str, Any]]:
    documents = list(yaml.safe_load_all(path.read_text(encoding="utf-8")))
    return [document for document in documents if isinstance(document, dict)]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Convert rendered Kubernetes resources to a Sealos Template")
    parser.add_argument("--manifests", required=True, help="Rendered Kubernetes multi-document YAML")
    parser.add_argument("--app-name", required=True)
    parser.add_argument("--title", default="")
    parser.add_argument("--description", default="")
    parser.add_argument("--url", default="")
    parser.add_argument("--git-repo", default="")
    parser.add_argument("--author", default="Sealos")
    parser.add_argument("--category", action="append", default=["tool"])
    parser.add_argument(
        "--repo-raw-base",
        default="https://raw.githubusercontent.com/labring-actions/templates/kb-0.9",
    )
    parser.add_argument("--image-override", action="append", default=[])
    parser.add_argument("--image-pull-secret-service", action="append", default=[])
    parser.add_argument("--public-service", default="")
    parser.add_argument("--mapping-output", default="")
    parser.add_argument("--topology-evidence-output", default="")
    parser.add_argument("--dry-run", action="store_true")
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        manifest_path = Path(args.manifests).resolve()
        documents = load_documents(manifest_path)
        if not documents:
            raise ValueError("manifest input contains no Kubernetes resources")
        app_name = normalize_k8s_name(args.app_name)
        meta = MetadataOptions(
            app_name=app_name,
            title=args.title or app_name.replace("-", " ").title(),
            description=args.description or f"Generated Sealos template for {app_name}.",
            url=args.url or f"https://example.com/{app_name}",
            git_repo=args.git_repo or f"https://github.com/example/{app_name}",
            author=args.author,
            categories=tuple(args.category),
            repo_raw_base=args.repo_raw_base.rstrip("/"),
        )
        overrides = parse_image_overrides(args.image_override)
        pull_services = {item.strip() for item in args.image_pull_secret_service if item.strip()}
        template_documents, normalized_documents, mapping = convert_documents(
            documents,
            meta=meta,
            image_overrides=overrides,
            image_pull_secret_services=pull_services,
            public_service=args.public_service,
            source_name=str(manifest_path),
        )

        if args.mapping_output:
            mapping_path = Path(args.mapping_output).resolve()
            mapping_path.parent.mkdir(parents=True, exist_ok=True)
            mapping_path.write_text(json.dumps(mapping, indent=2) + "\n", encoding="utf-8")
        if args.topology_evidence_output:
            evidence_path = Path(args.topology_evidence_output).resolve()
            evidence_path.parent.mkdir(parents=True, exist_ok=True)
            evidence = _topology_evidence(app_name, str(manifest_path), template_documents)
            evidence_path.write_text(yaml.safe_dump(evidence, sort_keys=False), encoding="utf-8")

        rendered = render_index_yaml(template_documents)
        if args.dry_run:
            print(rendered, end="")
        else:
            output_path = Path("template") / app_name / "index.yaml"
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(rendered, encoding="utf-8")
            print(f"Generated: {output_path}")
        return 0
    except (OSError, ValueError, yaml.YAMLError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
