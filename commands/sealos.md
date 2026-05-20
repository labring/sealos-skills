---
name: sealos
description: "Deploy projects to Sealos Cloud, prepare Docker artifacts, convert Compose files, assess cloud readiness, or build Sealos Desktop apps."
argument-hint: "[deploy|app|assess|dockerfile|compose] [path-or-url]"
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
- Build or adapt a Sealos Desktop app with the Sealos app SDK → `sealos-app-builder`
- Assess whether a project is cloud-native/container-ready → `cloud-native-readiness`
- Generate or fix Docker packaging → `dockerfile-skill`
- Convert Docker Compose or install docs into a Sealos template → `docker-to-sealos`

## Rules

- Prefer the most specific skill above instead of inventing a new workflow.
- Treat `/sealos` as the plugin entry point. Do not tell plugin users to invoke `/sealos-deploy`; `/sealos-deploy` is the direct `skills.sh` skill entry.
- For deployments, follow the safety and auth rules in `skills/sealos-deploy/SKILL.md`.
- Ask for confirmation before destructive Kubernetes operations or system tool installation.

## Examples

```text
/sealos deploy this repo to Sealos Cloud
/sealos deploy /path/to/project
/sealos deploy https://github.com/labring-sigs/kite
/sealos build a Sealos Desktop app from this web project
/sealos assess whether this repo is ready for Sealos Cloud
```
