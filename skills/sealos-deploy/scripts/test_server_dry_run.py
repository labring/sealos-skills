#!/usr/bin/env python3

import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("server_dry_run.py")


TEMPLATE = """\
apiVersion: app.sealos.io/v1
kind: Template
metadata:
  name: validation-demo
spec:
  defaults:
    app_name:
      type: string
      value: validation-demo-${{ random(8) }}
    app_host:
      type: string
      value: validation-demo-${{ random(8) }}
  inputs:
    enable_service:
      type: boolean
      default: "false"
      required: false
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${{ defaults.app_name }}
spec:
  selector:
    matchLabels:
      app: ${{ defaults.app_name }}
  template:
    metadata:
      labels:
        app: ${{ defaults.app_name }}
    spec:
      serviceAccountName: ${{ SEALOS_SERVICE_ACCOUNT }}
      containers:
        - name: app
          image: example.invalid/app@sha256:\
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
          env:
            - name: TOKEN
              value: ${{ base64('validation') }}
---
${{ if(inputs.enable_service === 'true') }}
apiVersion: v1
kind: Service
metadata:
  name: ${{ defaults.app_name }}
spec:
  selector:
    app: ${{ defaults.app_name }}
  ports:
    - port: 8080
${{ endif() }}
"""


MOCK_KUBECTL = """\
#!/usr/bin/env python3
import json
import os
import stat
import sys
from pathlib import Path

import yaml

args = sys.argv[1:]
path = Path(args[args.index("-f") + 1])
text = path.read_text(encoding="utf-8")
documents = [item for item in yaml.safe_load_all(text) if item is not None]
if len(documents) != 1:
    raise SystemExit("expected exactly one YAML document")
document = documents[0]
record = {
    "kind": document["kind"],
    "name": document["metadata"]["name"],
    "mode": stat.S_IMODE(path.stat().st_mode),
    "has_expression": "${{" in text,
    "args": args,
}
containers = (
    document.get("spec", {})
    .get("template", {})
    .get("spec", {})
    .get("containers", [])
)
record["env"] = [
    {"name": item.get("name"), "value": item.get("value")}
    for container in containers
    for item in container.get("env", [])
]
record["data"] = document.get("data", {})
with Path(os.environ["MOCK_KUBECTL_LOG"]).open("a", encoding="utf-8") as handle:
    handle.write(json.dumps(record) + "\\n")

fail_kinds = set(filter(None, os.environ.get("MOCK_FAIL_KINDS", "").split(",")))
if document["kind"] in fail_kinds:
    if os.environ.get("MOCK_FAIL_MODE") == "authorization":
        action = "escalate" if document["kind"] == "Role" else "bind"
        status = "BadRequest" if document["kind"] == "Role" else "Forbidden"
        sys.stderr.write(
            "Error from server (" + status + "): current identity cannot "
            + action + " this RBAC resource\\n"
        )
    elif os.environ.get("MOCK_FAIL_MODE") == "admission":
        sys.stderr.write(
            'Error from server: admission webhook "policy.example.invalid" '
            "denied the request\\n"
        )
    else:
        sys.stderr.write(
            'Error from server (BadRequest): strict decoding error: '
            'unknown field "spec.componentSpecs[0].noCreatePDB"\\n'
        )
    raise SystemExit(1)

sys.stdout.write(document["kind"].lower() + "/" + document["metadata"]["name"] + "\\n")
"""


class ServerDryRunTests(unittest.TestCase):
    def run_gate(self, template_text, fail_kinds=None, fail_mode=None):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            template = root / "index.yaml"
            template.write_text(template_text, encoding="utf-8")
            original = template.read_bytes()
            mock = root / "kubectl"
            mock.write_text(MOCK_KUBECTL, encoding="utf-8")
            mock.chmod(0o700)
            log = root / "kubectl.jsonl"
            private_log = root / "private.log"
            repair_authorization = root / "schema-repair-authorization.json"
            environment = dict(os.environ)
            environment["MOCK_KUBECTL_LOG"] = str(log)
            if fail_kinds:
                environment["MOCK_FAIL_KINDS"] = ",".join(fail_kinds)
            if fail_mode:
                environment["MOCK_FAIL_MODE"] = fail_mode
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--template",
                    str(template),
                    "--namespace",
                    "validation-ns",
                    "--context",
                    "validation-context",
                    "--service-account",
                    "validation-sa",
                    "--cloud-domain",
                    "cloud.example.invalid",
                    "--cert-secret-name",
                    "validation-cert",
                    "--kubectl",
                    str(mock),
                    "--private-log",
                    str(private_log),
                    "--repair-authorization",
                    str(repair_authorization),
                ],
                capture_output=True,
                text=True,
                env=environment,
                check=False,
            )
            payload = json.loads(result.stdout)
            records = [
                json.loads(line)
                for line in log.read_text(encoding="utf-8").splitlines()
            ]
            self.assertEqual(original, template.read_bytes())
            self.assertEqual(0o600, stat.S_IMODE(private_log.stat().st_mode))
            authorization = (
                json.loads(repair_authorization.read_text(encoding="utf-8"))
                if repair_authorization.exists()
                else None
            )
            if repair_authorization.exists():
                self.assertEqual(
                    0o600,
                    stat.S_IMODE(repair_authorization.stat().st_mode),
                )
            return (
                result,
                payload,
                records,
                private_log.read_text(encoding="utf-8"),
                authorization,
            )

    def test_renders_branches_skips_template_and_checks_one_document_at_a_time(self):
        result, payload, records, _, _ = self.run_gate(TEMPLATE)

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("passed", payload["status"])
        self.assertEqual(2, payload["scenarios"])
        self.assertEqual(2, payload["documents_checked"])
        self.assertEqual({"Deployment", "Service"}, {item["kind"] for item in records})
        self.assertTrue(all(item["mode"] == 0o600 for item in records))
        self.assertTrue(all(not item["has_expression"] for item in records))
        self.assertTrue(
            all("--dry-run=server" in item["args"] for item in records)
        )
        self.assertTrue(all("--validate=strict" in item["args"] for item in records))
        self.assertNotIn("Template", {item["kind"] for item in records})

    def test_reports_target_schema_failure_without_raw_admission_output(self):
        cluster = TEMPLATE + """\
---
apiVersion: apps.kubeblocks.io/v1alpha1
kind: Cluster
metadata:
  name: ${{ defaults.app_name }}-mysql
spec:
  componentSpecs:
    - name: mysql
      noCreatePDB: false
"""
        result, payload, records, private_log, authorization = self.run_gate(
            cluster, fail_kinds=["Cluster"]
        )

        self.assertEqual(1, result.returncode)
        self.assertEqual("failed", payload["status"])
        self.assertEqual(1, len(payload["failures"]))
        failure = payload["failures"][0]
        self.assertEqual("schema", failure["category"])
        self.assertTrue(failure["repairable"])
        self.assertEqual(
            ["spec.componentSpecs[0].noCreatePDB"], failure["field_paths"]
        )
        self.assertNotIn("Error from server", result.stdout)
        self.assertNotIn("Error from server", private_log)
        self.assertEqual(
            {"Deployment", "Service", "Cluster"}, {item["kind"] for item in records}
        )
        self.assertEqual("1.0", authorization["version"])
        self.assertEqual(payload["template_sha256"], authorization["template_sha256"])
        self.assertEqual(
            ["spec.componentSpecs[0].noCreatePDB"],
            authorization["repairs"][0]["field_paths"],
        )

    def test_reports_rbac_authorization_failures_as_non_blocking_warnings(self):
        rbac = TEMPLATE + """\
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ${{ defaults.app_name }}
rules:
  - apiGroups: ["*"]
    resources: ["*"]
    verbs: ["*"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ${{ defaults.app_name }}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: ${{ defaults.app_name }}
subjects:
  - kind: ServiceAccount
    name: ${{ SEALOS_SERVICE_ACCOUNT }}
"""
        result, payload, records, private_log, authorization = self.run_gate(
            rbac,
            fail_kinds=["Role", "RoleBinding"],
            fail_mode="authorization",
        )

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("passed", payload["status"])
        self.assertEqual([], payload["failures"])
        authorization_warnings = [
            warning
            for warning in payload["warnings"]
            if warning["category"] == "authorization"
        ]
        self.assertEqual(
            {"Role", "RoleBinding"},
            {warning["kind"] for warning in authorization_warnings},
        )
        self.assertTrue(
            all(not warning["repairable"] for warning in authorization_warnings)
        )
        self.assertIn("status=warning category=authorization", private_log)
        self.assertEqual(
            {"Deployment", "Service", "Role", "RoleBinding"},
            {item["kind"] for item in records},
        )
        self.assertIsNone(authorization)

    def test_marks_non_schema_failures_as_not_repairable(self):
        result, payload, _, _, authorization = self.run_gate(
            TEMPLATE,
            fail_kinds=["Deployment"],
            fail_mode="admission",
        )

        self.assertEqual(1, result.returncode)
        self.assertEqual("failed", payload["status"])
        self.assertEqual(1, len(payload["failures"]))
        failure = payload["failures"][0]
        self.assertEqual("admission", failure["category"])
        self.assertFalse(failure["repairable"])
        self.assertIsNone(authorization)

    def test_renders_official_mastodon_expression_and_array_condition_shape(self):
        mastodon = """\
apiVersion: app.sealos.io/v1
kind: Template
metadata:
  name: mastodon
spec:
  defaults:
    app_name:
      type: string
      value: mastodon-${{ random(8) }}
    secret_key_base:
      type: string
      value: ${{ random(128).toLowerCase().replace(/[^0-9a-f]/g, 'a') }}
  inputs:
    enable_s3_storage:
      type: boolean
      default: "false"
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${{ defaults.app_name }}-env
data:
  SECRET_KEY_BASE: '${{ defaults.secret_key_base }}'
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${{ defaults.app_name }}
spec:
  selector:
    matchLabels:
      app: ${{ defaults.app_name }}
  template:
    metadata:
      labels:
        app: ${{ defaults.app_name }}
    spec:
      containers:
        - name: mastodon
          image: tootsuite/mastodon:v4.6.3
          env:
            - name: SERVICE_ACCOUNT
              value: ${{ SEALOS_SERVICE_ACCOUNT }}
            ${{ if(inputs.enable_s3_storage === 'true') }}
            - name: AWS_ACCESS_KEY_ID
              value: access
            ${{ endif() }}
            ${{ if(inputs.enable_s3_storage === 'false') }}
            - name: LOCAL_STORAGE
              value: enabled
            ${{ endif() }}
"""
        result, payload, records, _, authorization = self.run_gate(mastodon)

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("passed", payload["status"])
        deployment_envs = [
            {item["name"]: item.get("value") for item in record["env"]}
            for record in records
            if record["kind"] == "Deployment"
        ]
        self.assertTrue(
            any("AWS_ACCESS_KEY_ID" in environment for environment in deployment_envs)
        )
        self.assertTrue(
            any("LOCAL_STORAGE" in environment for environment in deployment_envs)
        )
        self.assertTrue(
            all(
                environment["SERVICE_ACCOUNT"] == "validation-sa"
                for environment in deployment_envs
            )
        )
        secret_values = [
            record["data"].get("SECRET_KEY_BASE", "")
            for record in records
            if record["kind"] == "ConfigMap"
        ]
        self.assertTrue(secret_values)
        self.assertTrue(
            all(
                len(value) == 128
                and all(character in "0123456789abcdef" for character in value)
                for value in secret_values
            )
        )
        self.assertIsNone(authorization)


if __name__ == "__main__":
    unittest.main()
