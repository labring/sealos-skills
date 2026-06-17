---
name: sealos
description: "Deploy projects to Sealos Cloud, prepare Docker artifacts, convert Compose files, assess cloud readiness, build Sealos Desktop apps, connect databases, or use Sealos S3 object storage."
argument-hint: "[deploy|database|s3|app|assess|dockerfile|compose] [path-or-url]"
parameters:
  - name: task
    type: string
    required: false
    description: "Natural-language Sealos task, local path, or GitHub URL"
---

# Sealos Command

Use this command as the Claude Code and compatible plugin entry point for Sealos tasks.

## Route

- Deploy, update, or publish a local/GitHub project to Sealos Cloud → `sealos-deploy`
- Create, connect, or manage a Sealos Cloud database for local development or Devbox → `sealos-database`
- Create, connect, or operate Sealos S3-compatible object storage → `sealos-s3`
- Build or adapt a Sealos Desktop app with the Sealos app SDK → `sealos-app-builder`
- Assess whether a project is cloud-native/container-ready → `cloud-native-readiness`
- Generate or fix Docker packaging → `dockerfile-skill`
- Convert Docker Compose or install docs into a Sealos template → `docker-to-sealos`

## Rules

- Prefer the most specific skill above instead of inventing a new workflow.
- Treat `/sealos` as the plugin entry point. Do not tell plugin users to invoke `/sealos-deploy`; `/sealos-deploy` is the direct `skills.sh` skill entry.
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
