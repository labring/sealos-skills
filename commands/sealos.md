---
name: sealos
description: "Deploy projects to Sealos Cloud, prepare Docker artifacts, convert Compose files, assess cloud readiness, build Sealos Desktop apps, connect databases, or use Sealos S3 object storage."
argument-hint: "[deploy|database|s3|canvas|app|assess|dockerfile|compose] [path-or-url]"
parameters:
  - name: task
    type: string
    required: false
    description: "Natural-language Sealos task, local path, or GitHub URL"
---

# Sealos Command

Use this command as the Claude Code and compatible plugin entry point for Sealos tasks.

## Route

| Intent | Canonical skill | Plugin entry | Direct skills.sh entry | Interaction class | Capability tuple | Ordered handoff |
| --- | --- | --- | --- | --- | --- | --- |
| Deploy, update, or publish a local/GitHub project to Sealos Cloud | `sealos-deploy` | `$sealos` / `/sealos` | `/sealos-deploy` | `composite-orchestration` | `base=observation; escalations=local-write,cloud-write,public-exposure,destructive` | `target=cloud-native-readiness; inputArtifact=project source and readiness request; allowedAction=run scoped assessment; failureReturn=sealos-deploy; responseOwner=sealos-deploy => target=dockerfile-skill?; inputArtifact=conditional readiness report when packaging is missing; allowedAction=generate or repair Dockerfile; failureReturn=cloud-native-readiness; responseOwner=sealos-deploy => target=docker-to-sealos?; inputArtifact=Dockerfile and Compose or install-doc evidence; allowedAction=produce validated Sealos template; failureReturn=dockerfile-skill; responseOwner=sealos-deploy => target=sealos-deploy; inputArtifact=validated image or template and sanitized analysis; allowedAction=build, push, deploy, or update within the selected scope; failureReturn=sealos-deploy; responseOwner=sealos-deploy => target=sealos-canvas?; inputArtifact=.sealos/state.json last_deploy plus Runtime Truth; allowedAction=read-only canvas inspection; failureReturn=sealos-deploy; responseOwner=sealos-deploy` |
| Create, connect, or manage a Sealos Cloud database for local development or Devbox | `sealos-database` | `$sealos` / `/sealos` | `/sealos-database` | `cloud-local-mutation` | `base=observation; escalations=local-write,cloud-write,public-exposure,destructive` | `none` |
| Create, connect, or operate Sealos S3-compatible object storage | `sealos-s3` | `$sealos` / `/sealos` | `/sealos-s3` | `cloud-local-mutation` | `base=observation; escalations=local-write,cloud-write,public-exposure,destructive` | `none` |
| View resources created by a previous deployment in a local read-only canvas | `sealos-canvas` | `$sealos` / `/sealos` | host selection through the installed pack | `read-only-observation` | `base=observation; escalations=none` | `none` |
| Build or adapt a Sealos Desktop app with the Sealos app SDK | `sealos-app-builder` | `$sealos` / `/sealos` | host selection through the installed pack | `local-artifact-mutation` | `base=observation; escalations=local-write,cloud-write` | `none` |
| Assess whether a project is cloud-native/container-ready | `cloud-native-readiness` | `$sealos` / `/sealos` | host selection through the installed pack | `read-only-observation` | `base=observation; escalations=local-write` | `target=dockerfile-skill?; inputArtifact=eligible readiness report with missing packaging evidence; allowedAction=generate or repair Dockerfile; failureReturn=cloud-native-readiness; responseOwner=cloud-native-readiness` |
| Generate or fix Docker packaging | `dockerfile-skill` | `$sealos` / `/sealos` | host selection through the installed pack | `local-artifact-mutation` | `base=local-write; escalations=none` | `target=docker-to-sealos?; inputArtifact=Dockerfile and packaging evidence; allowedAction=convert or validate the Sealos template; failureReturn=dockerfile-skill; responseOwner=dockerfile-skill => target=sealos-deploy?; inputArtifact=validated packaging evidence; allowedAction=continue the selected deployment request; failureReturn=dockerfile-skill; responseOwner=dockerfile-skill` |
| Convert Docker Compose or install docs into a Sealos template | `docker-to-sealos` | `$sealos` / `/sealos` | host selection through the installed pack | `local-artifact-mutation` | `base=local-write; escalations=cloud-write` | `target=sealos-deploy?; inputArtifact=validated Sealos template and conversion evidence; allowedAction=build or deploy within the selected scope; failureReturn=docker-to-sealos; responseOwner=docker-to-sealos` |

## Rules

- Prefer the most specific skill above instead of inventing a new workflow.
- Treat `/sealos` as the plugin entry point. Do not tell plugin users to invoke `/sealos-deploy`; `/sealos-deploy` is the direct `skills.sh` skill entry.
- Classify the request's interaction class and capability tuple before delegation. Ambiguous mutation requests return a `stopped` clarification at the boundary before provider, filesystem, or Kubernetes side effects, with no downstream handoff or mutation action.
- Treat ordered handoffs as routing metadata. The receiving skill owns its detailed preconditions, confirmation gates, behavior, and terminal verification.
- For deployments, follow the safety and auth rules in `skills/sealos-deploy/SKILL.md`.
- For database work, follow the secret-handling and public-access rules in `skills/sealos-database/SKILL.md`.
- For S3 object storage work, follow the secret-handling, bucket-policy, and destructive-operation rules in `skills/sealos-s3/SKILL.md`.
- Ask for confirmation before destructive Kubernetes operations or system tool installation.

## Examples

```text
/sealos deploy this repo to Sealos Cloud
/sealos deploy /path/to/project
/sealos deploy https://github.com/labring-sigs/kite
/sealos create a cloud Postgres database for this repo and wire DATABASE_URL
/sealos connect this project to a Sealos Redis database for local development
/sealos create private S3 object storage for uploads and wire env vars
/sealos generate a presigned URL for an object in my Sealos bucket
/sealos build a Sealos Desktop app from this web project
/sealos assess whether this repo is ready for Sealos Cloud
```
