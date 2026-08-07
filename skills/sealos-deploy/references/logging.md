# Deploy logging

Every **deploy** or **update** run must write one log file under `~/.sealos/logs/`.

## Create the log once

At the start of the run, create the log file one time:

```bash
mkdir -p ~/.sealos/logs
LOG_FILE=~/.sealos/logs/deploy-$(date +%Y%m%d-%H%M%S).log
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deploy started" > "$LOG_FILE"
```

Create the log file only once at the start. Append later lines with `>>` to the same `$LOG_FILE`. Do not create a second log file.

## Append at phase boundaries

At each phase boundary, append a short status block with Bash `>>`.

Example:

```
[2026-03-05 14:30:01] === Phase 0: Preflight ===
[2026-03-05 14:30:01] Docker: ✓ 27.5.1
[2026-03-05 14:30:01] Node.js: ✓ 22.12.0
[2026-03-05 14:30:02] Sealos auth: ✓ (region: <REGION from config.json>)
[2026-03-05 14:30:02] Project: /Users/dev/myapp (github: https://github.com/owner/repo)

[2026-03-05 14:30:03] === Phase 1: Assess ===
[2026-03-05 14:30:03] Score: 9/12 (good)
[2026-03-05 14:30:03] Language: python, Framework: fastapi, Port: 8000
[2026-03-05 14:30:03] Decision: CONTINUE

[2026-03-05 14:30:04] === Phase 2: Detect Image ===
[2026-03-05 14:30:05] Docker Hub: owner/repo:latest (arm64 only, no amd64)
[2026-03-05 14:30:05] GHCR: not found
[2026-03-05 14:30:05] Decision: no amd64 image → continue to Phase 3

[2026-03-05 14:30:06] === Phase 3: Dockerfile ===
[2026-03-05 14:30:06] Existing Dockerfile: none
[2026-03-05 14:30:07] Generated: python-fastapi template, port 8000

[2026-03-05 14:30:08] === Phase 4: Build & Push ===
[2026-03-05 14:30:08] Registry: ghcr (auto-detected via gh CLI)
[2026-03-05 14:30:30] Build: ✓ ghcr.io/zhujingyang/repo:20260305-143022
[2026-03-05 14:30:32] GHCR pullability: private package detected — deploy will auto-create image pull Secret from gh CLI
[2026-03-05 14:30:33] IMAGE_REF=ghcr.io/zhujingyang/repo:20260305-143022

[2026-03-05 14:30:34] === Phase 5: Template ===
[2026-03-05 14:30:35] Output: .sealos/template/index.yaml

[2026-03-05 14:30:36] === Phase 6: Deploy ===
[2026-03-05 14:30:36] Deploy URL: https://template.gzg.sealos.run/api/v2alpha/templates/raw
[2026-03-05 14:30:38] Status: 201 — deployed successfully
[2026-03-05 14:30:38] === DONE ===
```

## On error

Before you stop, append the error details:

```
[2026-03-05 14:30:10] === ERROR ===
[2026-03-05 14:30:10] Phase: 4 (Build & Push)
[2026-03-05 14:30:10] Error: docker buildx build failed — "npm ERR! Missing script: build"
[2026-03-05 14:30:10] Retry: 1/3
```

## At the end

Tell the user where the log is:

```
Log saved to: ~/.sealos/logs/deploy-20260305-143001.log
```
