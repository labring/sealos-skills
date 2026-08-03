---
name: sealos-deploy
description: >-
  Prepare a canonical Sealos deployment YAML from a GitHub repository, a local
  project, or the current directory. Run only Phase 0 through Phase 4. Select
  a matching current official-template YAML or a deployment source. Prepare
  required images.
  Write `.sealos/template/index.yaml`. Use for Sealos YAML preparation.
---

# Sealos Deploy

Prepare a Sealos deployment YAML. This skill does not deploy an application.

## Scope

Run only these phases:

1. Phase 0: Preflight
2. Phase 1: Assess
3. Phase 2: Discover and prepare images
4. Phase 3: Build and push images after a Phase 4 request
5. Phase 4: Generate the YAML

Stop after Phase 4 passes its deployment gate. Report the YAML path and the log path.

Do not run Phase 4.5, Phase 4.9, Phase 5, Phase 5.5, Phase U1, Phase U2, or Phase U3.
Do not call the Sealos Template API. Do not apply YAML with kubectl. Do not create, update, delete, or inspect application workloads.
A Phase 3 sandbox build can create only temporary Kaniko Jobs.

The final output is:

```text
<WORK_DIR>/.sealos/template/index.yaml
```

The JSON files under `<WORK_DIR>/.sealos/` are phase contracts. They are not the final output.

## Input

Accept one input:

```text
/sealos-deploy https://github.com/owner/repository
/sealos-deploy /absolute/or/relative/project-path
/sealos-deploy
```

With no input, use the current directory. Treat a repository as the source boundary.

## Execution Order

Read and run these modules in order:

1. [modules/phase-0-preflight.md](modules/phase-0-preflight.md)
2. [modules/phase-1-assess.md](modules/phase-1-assess.md)
3. [modules/phase-2-discover.md](modules/phase-2-discover.md), unless Phase 1 selects the official-template route
4. [modules/phase-4-template.md](modules/phase-4-template.md)
5. If Phase 4 needs build digests, run [modules/phase-3-build-push.md](modules/phase-3-build-push.md)
6. Return to Phase 4 after Phase 3

For an eligible exact official template, Phase 4 materializes the official YAML. This Phase 4 action replaces the former later fast path.

## Artifact Contract

Write all artifacts below the selected work directory:

```text
.sealos/
├── analysis.json
├── phase-1/
│   └── official-template.yaml
├── phase-2/
│   ├── gitingest-digest.txt
│   ├── deployment-plan.json
│   └── docker-compose.yml
├── phase-3/
│   └── build-result.json
├── phase-4/
│   ├── source/
│   ├── rendered.yaml
│   └── resource-map.json
└── template/
    └── index.yaml
```

Only create files that the selected route needs. Do not create `state.json`.

Use `scripts/validate-artifacts.mjs` at each stated artifact boundary. Use the phase-specific stage before Phase 2 completes.

## Safety

The user request authorizes dependency installation for this workflow. If a selected phase needs a dependency, install it.

Keep tokens, kubeconfig data, passwords, `.env` values, and complete connection strings out of artifacts and reports.

Phase 0 can update local Sealos authentication and kubeconfig files.

## Supporting Scripts

Use scripts only for their named phase:

| Script | Phase | Purpose |
| --- | --- | --- |
| `sealos-auth.mjs` | 0 | Select the local Sealos region, login, and workspace. |
| `find-official-template.mjs` | 1 | Copy one matched live catalog YAML and record its path or `null`. |
| `inspect-deployment-source.mjs` | 2 | List Helm, Kubernetes, and Compose source evidence. |
| `validate-artifacts.mjs` | 0–3 | Validate staged JSON artifacts. |
| `write-build-result.mjs` | 3 | Write one aggregate digest result and its analysis pointer. |
| `materialize-official-template.mjs` | 4 | Copy an approved official YAML into the final path. |

Phase 4 uses the sibling `docker-to-sealos` converters and its deployment-gate rule subset.

## Completion Report

Report only these facts:

- The selected route: `official-template` or `standard`.
- The completed phases.
- The final YAML path.
- The deployment-gate result.
- The log path.

State clearly that the skill stopped after Phase 4 and did not deploy resources.
