# Phase 4: Generate the Template

## Purpose

Write `.sealos/template/index.yaml` and run the Sealos deployment gate. This is the terminal phase.

Do not deploy the YAML. Do not collect deployment configuration. Do not run a dry-run against a cluster.

If `.sealos/template/index.yaml` exists, run the deployment gate.
If the gate passes, report the YAML and stop.
If the gate fails, recreate the YAML from saved Phase 0–4 artifacts.
Do not inspect deployment state.

## Official-Template Route

If `official_template` is not `null` and `deployment_plan` is absent, use this route.

1. Read `official_template` from `analysis.json`.
2. Run `scripts/materialize-official-template.mjs` to copy the saved current catalog YAML into `.sealos/template/index.yaml`.
3. Run the deployment-gate rule subset on that file.
4. Stop after the gate passes.

Phase 1 must not write this YAML. Phase 4 owns its materialization.

## Standard Route

If `analysis.json` contains `deployment_plan`, use this route.

1. Read the deployment plan. Read only its `deployment_source` pointer.
2. Do not inspect the repository again to choose another source.
3. Copy the selected source into `.sealos/phase-4/source/`.
4. For Helm, run `helm template` and write `.sealos/phase-4/rendered.yaml`.
5. For Kubernetes, use the copied manifest as the converter input.
6. For Compose, keep the copied canonical Compose file as the conversion source.
7. For each repository-built service, determine whether `build-result.json` contains a digest.
8. If a required digest is absent, run Phase 3. Then return here at step 7.
9. Resolve every upstream image to a `repository@sha256:...` reference.
10. Pass repository-built digest overrides to the selected converter.
11. If a service has `pull_access: ghcr_secret_required`, pass a pull-secret service.
12. If `.sealos/config.json` has `public_service`, pass it to the selected converter.
13. Generate the converter output in a temporary Phase 4 directory.
14. Move the generated `index.yaml` to `.sealos/template/index.yaml`.
15. Write `.sealos/phase-4/resource-map.json` for the selected source.
16. Run the deployment-gate rule subset on the final YAML.
17. Stop after the gate passes.

Use one normalized app name from `repo_name` for every converter command.

For Compose, use `compose_to_template.py --kompose-mode always`. Use repeatable `--image-override` values for built services.

For Helm, use `kubernetes_to_template.py` on `rendered.yaml`. For Kubernetes, use it on the copied manifest. Pass `--mapping-output` to `.sealos/phase-4/resource-map.json`.

For Compose, write the resource map from source services to generated workloads.

For Compose, pass `--output-dir "<PHASE4_TMP>"`. For Helm and Kubernetes, run the converter from `<PHASE4_TMP>`. Both converters create an app-name directory. Move only its `index.yaml` into the fixed final path.

Run only these deployment-gate rules:

```text
R001,R002,R003,R004,R005,R006,R008,R009,R010,R011,R012,R015,R017,R019,R020,R026,R028,R032,R033,R034,R035,R038,R039,R040,R045,R048,R051,R052
```

Run this command:

```bash
python3 <SKILL_DIR>/../docker-to-sealos/scripts/check_consistency.py \
  --skill <SKILL_DIR>/../docker-to-sealos/SKILL.md \
  --artifacts "<WORK_DIR>/.sealos/template/index.yaml" \
  --only R001,R002,R003,R004,R005,R006,R008,R009,R010,R011,R012,R015,R017,R019,R020,R026,R028,R032,R033,R034,R035,R038,R039,R040,R045,R048,R051,R052
```

Do not run `quality_gate.py` in this phase.

## Stop Conditions

If the selected source is incomplete or invalid, return to Phase 2.

If a digest cannot resolve, conversion fails, or the deployment gate fails, stop.

## Exit Contract

After the deployment gate passes, report this file:

```text
<WORK_DIR>/.sealos/template/index.yaml
```

State that Phase 4 completed and no Sealos resources were deployed.
