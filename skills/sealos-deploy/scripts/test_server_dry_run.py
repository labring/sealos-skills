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
with Path(os.environ["MOCK_KUBECTL_LOG"]).open("a", encoding="utf-8") as handle:
    handle.write(json.dumps(record) + "\\n")

if document["kind"] == os.environ.get("MOCK_FAIL_KIND"):
    sys.stderr.write(
        'Error from server (BadRequest): strict decoding error: '
        'unknown field "spec.componentSpecs[0].noCreatePDB"\\n'
    )
    raise SystemExit(1)

sys.stdout.write(document["kind"].lower() + "/" + document["metadata"]["name"] + "\\n")
"""


class ServerDryRunTests(unittest.TestCase):
    def run_gate(self, template_text, fail_kind=None):
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
            environment = dict(os.environ)
            environment["MOCK_KUBECTL_LOG"] = str(log)
            if fail_kind:
                environment["MOCK_FAIL_KIND"] = fail_kind
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
            return result, payload, records, private_log.read_text(encoding="utf-8")

    def test_renders_branches_skips_template_and_checks_one_document_at_a_time(self):
        result, payload, records, _ = self.run_gate(TEMPLATE)

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
        result, payload, records, private_log = self.run_gate(
            cluster, fail_kind="Cluster"
        )

        self.assertEqual(1, result.returncode)
        self.assertEqual("failed", payload["status"])
        self.assertEqual(1, len(payload["failures"]))
        failure = payload["failures"][0]
        self.assertEqual("schema", failure["category"])
        self.assertEqual(
            ["spec.componentSpecs[0].noCreatePDB"], failure["field_paths"]
        )
        self.assertNotIn("Error from server", result.stdout)
        self.assertNotIn("Error from server", private_log)
        self.assertEqual(
            {"Deployment", "Service", "Cluster"}, {item["kind"] for item in records}
        )


if __name__ == "__main__":
    unittest.main()
