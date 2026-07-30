#!/usr/bin/env python3
from __future__ import annotations

import copy
import unittest

from compose_to_template import MetadataOptions
from kubernetes_to_template import convert_documents


DIGEST_A = "sha256:" + ("1" * 64)
DIGEST_B = "sha256:" + ("2" * 64)


def metadata() -> MetadataOptions:
    return MetadataOptions(
        app_name="multi-source",
        title="Multi Source",
        description="Generic multi-service source fixture.",
        url="https://example.com/multi-source",
        git_repo="https://github.com/example/multi-source",
        author="Sealos",
        categories=("tool",),
        repo_raw_base="https://raw.githubusercontent.com/labring-actions/templates/kb-0.9",
    )


def deployment(name: str, image: str, env=None):
    return {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": name, "labels": {"app": name}},
        "spec": {
            "replicas": 1,
            "selector": {"matchLabels": {"app": name}},
            "template": {
                "metadata": {"labels": {"app": name}},
                "spec": {
                    "containers": [
                        {
                            "name": name,
                            "image": image,
                            "env": env or [],
                            "ports": [{"name": "http", "containerPort": 8080}],
                        }
                    ]
                },
            },
        },
    }


def service(name: str, workload: str):
    return {
        "apiVersion": "v1",
        "kind": "Service",
        "metadata": {"name": name},
        "spec": {
            "selector": {"app": workload},
            "ports": [{"name": "http", "port": 8080, "targetPort": 8080}],
        },
    }


def ingress(name: str, service_name: str, host: str):
    return {
        "apiVersion": "networking.k8s.io/v1",
        "kind": "Ingress",
        "metadata": {"name": name},
        "spec": {
            "rules": [
                {
                    "host": host,
                    "http": {
                        "paths": [
                            {
                                "path": "/",
                                "pathType": "Prefix",
                                "backend": {
                                    "service": {
                                        "name": service_name,
                                        "port": {"number": 8080},
                                    }
                                },
                            }
                        ]
                    },
                }
            ]
        },
    }


def postgres_cluster():
    return {
        "apiVersion": "apps.kubeblocks.io/v1alpha1",
        "kind": "Cluster",
        "metadata": {
            "name": "database",
            "labels": {
                "clusterdefinition.kubeblocks.io/name": "postgresql",
            },
        },
        "spec": {
            "clusterDefinitionRef": "postgresql",
            "clusterVersionRef": "postgresql-16.4.0",
            "componentSpecs": [
                {
                    "name": "postgresql",
                    "replicas": 1,
                    "volumeClaimTemplates": [
                        {
                            "name": "data",
                            "spec": {
                                "resources": {
                                    "requests": {"storage": "2Gi"},
                                }
                            },
                        }
                    ],
                }
            ],
        },
    }


def source_documents():
    return [
        service("api-service", "api"),
        deployment(
            "api",
            "ghcr.io/example/api:latest",
            env=[
                {"name": "POSTGRES_HOST", "value": "database"},
                {
                    "name": "API_URL",
                    "value": "https://api.127.0.0.1.nip.io/v1",
                },
                {
                    "name": "PUBLIC_CALLBACK_URL",
                    "value": "https://callback.127.0.0.1.nip.io/oauth",
                },
            ],
        ),
        ingress("api-public", "api-service", "api.127.0.0.1.nip.io"),
        postgres_cluster(),
    ]


class KubernetesToTemplateTests(unittest.TestCase):
    def convert(self, documents=None, **kwargs):
        return convert_documents(
            copy.deepcopy(documents or source_documents()),
            meta=metadata(),
            image_overrides={
                "api": f"ghcr.io/example/api@{DIGEST_A}",
                **kwargs.pop("image_overrides", {}),
            },
            image_pull_secret_services=set(
                kwargs.pop("image_pull_secret_services", set())
            ),
            public_service=kwargs.pop("public_service", "api"),
            source_name="fixture/manifests",
            **kwargs,
        )

    def test_preserves_resources_and_accounts_for_every_source(self):
        documents = source_documents()
        documents[-1]["spec"]["componentSpecs"][0]["resources"] = {
            "limits": {"cpu": "1", "memory": "1Gi"},
        }
        template_documents, normalized_documents, mapping = self.convert(documents)

        output_kinds = [document["kind"] for document in template_documents]
        self.assertEqual(output_kinds[0], "Template")
        self.assertIn("Deployment", output_kinds)
        self.assertIn("Service", output_kinds)
        self.assertIn("Ingress", output_kinds)
        self.assertIn("Cluster", output_kinds)
        self.assertEqual(output_kinds[-1], "App")

        expected_sources = {
            "Service/api-service",
            "Deployment/api",
            "Ingress/api-public",
            "Cluster/database",
        }
        self.assertEqual(
            {entry["source"] for entry in mapping["resources"]},
            expected_sources,
        )
        self.assertTrue(all(entry["outputs"] for entry in mapping["resources"]))

        deployment_doc = next(
            document
            for document in normalized_documents
            if document.get("kind") == "Deployment"
        )
        container = deployment_doc["spec"]["template"]["spec"]["containers"][0]
        self.assertEqual(container["image"], f"ghcr.io/example/api@{DIGEST_A}")
        self.assertEqual(container["imagePullPolicy"], "IfNotPresent")
        self.assertEqual(
            {"cpu": "200m", "memory": "256Mi"},
            container["resources"]["limits"],
        )
        cluster = next(
            document
            for document in template_documents
            if document.get("kind") == "Cluster"
        )
        self.assertEqual(
            {"cpu": "1", "memory": "1024Mi"},
            cluster["spec"]["componentSpecs"][0]["resources"]["limits"],
        )
        env = {item["name"]: item for item in container["env"]}
        self.assertEqual(
            env["POSTGRES_HOST"]["valueFrom"]["secretKeyRef"],
            {
                "name": "${{ defaults.app_name }}-pg-conn-credential",
                "key": "host",
            },
        )
        self.assertEqual(
            env["PUBLIC_CALLBACK_URL"]["value"],
            "https://callback.${{ SEALOS_CLOUD_DOMAIN }}/oauth",
        )
        self.assertEqual(
            env["API_URL"]["value"],
            "https://${{ defaults.app_host }}.${{ SEALOS_CLOUD_DOMAIN }}/v1",
        )

    def test_applies_pull_secret_to_only_the_selected_container(self):
        template_documents, _, _ = self.convert(
            image_pull_secret_services={"api"},
        )
        deployment_doc = next(
            document
            for document in template_documents
            if document.get("kind") == "Deployment"
        )
        self.assertEqual(
            deployment_doc["spec"]["template"]["spec"]["imagePullSecrets"],
            [{"name": "${{ defaults.app_name }}"}],
        )

    def test_converts_simple_raw_postgres_workload_to_kubeblocks(self):
        documents = source_documents()[:-1]
        documents[1]["spec"]["template"]["spec"]["containers"][0]["env"][0]["value"] = (
            "postgres-service"
        )
        postgres = deployment("postgres", "postgres:16")
        postgres["spec"]["template"]["spec"]["containers"][0]["ports"] = [
            {"name": "postgres", "containerPort": 5432}
        ]
        postgres["spec"]["template"]["spec"]["containers"][0]["resources"] = {
            "limits": {"cpu": "1", "memory": "1Gi"},
        }
        postgres_service = service("postgres-service", "postgres")
        postgres_service["spec"]["ports"] = [
            {"name": "postgres", "port": 5432, "targetPort": 5432}
        ]
        documents.extend([postgres_service, postgres])

        template_documents, normalized_documents, mapping = self.convert(documents)

        self.assertFalse(
            any(
                document.get("kind") in {"Deployment", "StatefulSet"}
                and document.get("metadata", {}).get("name") == "postgres"
                for document in normalized_documents
            )
        )
        self.assertFalse(
            any(
                document.get("kind") == "Service"
                and document.get("metadata", {}).get("name") == "postgres-service"
                for document in normalized_documents
            )
        )
        cluster = next(
            document
            for document in template_documents
            if document.get("kind") == "Cluster"
        )
        self.assertEqual(cluster["metadata"]["name"], "${{ defaults.app_name }}-pg")
        db_resources = cluster["spec"]["componentSpecs"][0]["resources"]
        self.assertEqual({"cpu": "1", "memory": "1024Mi"}, db_resources["limits"])
        self.assertEqual({"cpu": "100m", "memory": "102Mi"}, db_resources["requests"])
        app_deployment = next(
            document
            for document in normalized_documents
            if document.get("kind") == "Deployment"
        )
        app_env = {
            item["name"]: item
            for item in app_deployment["spec"]["template"]["spec"]["containers"][0]["env"]
        }
        self.assertEqual(
            app_env["POSTGRES_HOST"]["valueFrom"]["secretKeyRef"],
            {
                "name": "${{ defaults.app_name }}-pg-conn-credential",
                "key": "host",
            },
        )
        mapped = {item["source"]: item for item in mapping["resources"]}
        self.assertEqual(
            mapped["Deployment/postgres"]["action"],
            "transformed-to-kubeblocks",
        )
        self.assertEqual(
            mapped["Service/postgres-service"]["action"],
            "transformed-to-kubeblocks",
        )

    def test_preserves_custom_raw_database_with_fallback_reason(self):
        documents = source_documents()[:-1]
        postgres = deployment("postgres", "postgres:16")
        postgres["spec"]["template"]["spec"]["containers"][0]["args"] = [
            "postgres",
            "-c",
            "shared_buffers=256MB",
        ]
        postgres_service = service("postgres", "postgres")
        postgres_service["spec"]["ports"] = [
            {"name": "postgres", "port": 5432, "targetPort": 5432}
        ]
        documents.extend([postgres_service, postgres])

        template_documents, _, mapping = self.convert(
            documents,
            image_overrides={
                "postgres": f"ghcr.io/example/postgres@{DIGEST_B}",
            },
        )

        raw_database = next(
            document
            for document in template_documents
            if document.get("kind") == "Deployment"
            and document.get("metadata", {}).get("name") == "postgres"
        )
        raw_service = next(
            document
            for document in template_documents
            if document.get("kind") == "Service"
            and document.get("metadata", {}).get("name") == "postgres"
        )
        annotation = "docker-to-sealos.kubeblocks-fallback-reason"
        self.assertTrue(raw_database["metadata"]["annotations"][annotation])
        self.assertTrue(raw_service["metadata"]["annotations"][annotation])
        mapped = {item["source"]: item for item in mapping["resources"]}
        self.assertEqual(
            mapped["Deployment/postgres"]["reason"],
            raw_database["metadata"]["annotations"][annotation],
        )
        self.assertFalse(
            any(document.get("kind") == "Cluster" for document in template_documents)
        )

    def test_rejects_unknown_image_override(self):
        with self.assertRaisesRegex(ValueError, "unknown Kubernetes container"):
            self.convert(
                image_overrides={
                    "missing": f"ghcr.io/example/missing@{DIGEST_B}",
                }
            )

    def test_rejects_unknown_pull_secret_service(self):
        with self.assertRaisesRegex(ValueError, "unknown Kubernetes container"):
            self.convert(image_pull_secret_services={"missing"})

    def test_requires_public_service_for_multiple_ingress_backends(self):
        documents = source_documents()
        documents.extend(
            [
                service("worker-service", "worker"),
                deployment("worker", "ghcr.io/example/worker:latest"),
                ingress("worker-public", "worker-service", "worker.example.test"),
            ]
        )
        with self.assertRaisesRegex(ValueError, "multiple public Ingress services"):
            convert_documents(
                documents,
                meta=metadata(),
                image_overrides={
                    "api": f"ghcr.io/example/api@{DIGEST_A}",
                    "worker": f"ghcr.io/example/worker@{DIGEST_B}",
                },
                image_pull_secret_services=set(),
                public_service="",
                source_name="fixture/manifests",
            )

    def test_rejects_unknown_custom_resource(self):
        documents = source_documents()
        documents.append(
            {
                "apiVersion": "example.io/v1",
                "kind": "UnmappedRuntime",
                "metadata": {"name": "required-component"},
                "spec": {},
            }
        )
        with self.assertRaisesRegex(ValueError, "unsupported Kubernetes resource"):
            self.convert(documents)

    def test_rebinds_role_binding_service_accounts_to_the_deploy_namespace(self):
        documents = source_documents()
        documents.extend(
            [
                {
                    "apiVersion": "v1",
                    "kind": "ServiceAccount",
                    "metadata": {"name": "api"},
                },
                {
                    "apiVersion": "rbac.authorization.k8s.io/v1",
                    "kind": "Role",
                    "metadata": {"name": "api"},
                    "rules": [],
                },
                {
                    "apiVersion": "rbac.authorization.k8s.io/v1",
                    "kind": "RoleBinding",
                    "metadata": {"name": "api"},
                    "roleRef": {
                        "apiGroup": "rbac.authorization.k8s.io",
                        "kind": "Role",
                        "name": "api",
                    },
                    "subjects": [
                        {
                            "kind": "ServiceAccount",
                            "name": "api",
                            "namespace": "default",
                        }
                    ],
                },
            ]
        )

        template_documents, _, _ = self.convert(documents)
        role_binding = next(
            document
            for document in template_documents
            if document.get("kind") == "RoleBinding"
        )
        self.assertEqual(
            role_binding["subjects"][0]["namespace"],
            "${{ SEALOS_NAMESPACE }}",
        )


if __name__ == "__main__":
    unittest.main()
