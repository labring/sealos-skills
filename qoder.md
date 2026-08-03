# Sealos Plugin

Use the Sealos plugin as the unified entry point for Sealos Cloud development and deployment tasks.

## Routing

- Deploy or update an application on Sealos Cloud: use `sealos-deploy`.
- Create, connect, or operate a Sealos Cloud database: use `sealos-database`.
- Create, connect, or operate Sealos S3-compatible object storage: use `sealos-s3`.
- Inspect resources created by a previous deployment in a local read-only canvas: use `sealos-canvas`.
- Build or adapt a Sealos Desktop app: use `sealos-app-builder`.
- Assess cloud-native readiness: use `cloud-native-readiness`.
- Generate or repair a Dockerfile: use `dockerfile-skill`.
- Convert Docker Compose or installation documentation into a Sealos template: use `docker-to-sealos`.

Prefer the most specific skill for the task and follow that skill's workflow and safety rules. Treat `/sealos` as the plugin command entry point.

Never expose credentials, kubeconfig contents, `.env` values, S3 secrets, or complete connection strings. Obtain explicit user confirmation before destructive Kubernetes, database, or bucket operations; public-access changes; credential rotation; or system tool installation.
