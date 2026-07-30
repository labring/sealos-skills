---
name: cloud-native-readiness
description: Assess cloud-native readiness with a 0-12 score. At the start of Phase 1, stop only when AI is certain the project cannot run on Sealos; otherwise continue silently. Use for containerization readiness, Docker/Kubernetes compatibility, deployment feasibility, workload eligibility, or pre-deployment assessment. Also triggers on "/cloud-native-readiness".
---

# Cloud Native Readiness Assessment Skill

## Overview

This skill evaluates a repository's readiness for cloud-native microservice deployment through a 3-phase workflow:

1. **Assess** - Stop only an obviously impossible target; otherwise score it
2. **Detect** - Check if Docker artifacts already exist (Dockerfile, docker-compose, container images)
3. **Route** - If artifacts exist, return the result directly; if not, invoke `dockerfile-skill` to containerize

## Workflow

```
cloud-native-readiness
  │
  ├─ Phase 1: Cloud-Native Assessment
  │    ├─ Certainly cannot run on Sealos → Short reason, END
  │    └─ Otherwise → Calculate readiness score
  │
  ├─ Phase 2: Existing Artifacts Detection
  │    ├─ Found Dockerfile/docker-compose/image → Report existing setup, END
  │    └─ Not found → Continue
  │
  └─ Phase 3: Route to dockerfile-skill
       └─ Invoke /dockerfile to generate Docker configuration
```

## Usage

```
/cloud-native-readiness              # Assess current directory
/cloud-native-readiness <path>       # Assess specific path
/cloud-native-readiness <github-url> # Clone and assess
```

## Quick Start

When invoked, ALWAYS follow this sequence:

1. Read and execute [modules/assess.md](modules/assess.md) — Cloud-native readiness evaluation
2. Read and execute [modules/detect.md](modules/detect.md) — Existing Docker artifacts detection
3. Read and execute [modules/route.md](modules/route.md) — Decision routing

## Phase 1: Cloud-Native Readiness Assessment

Load and execute: [modules/assess.md](modules/assess.md)

Begin Phase 1 with one internal AI judgment: if the project is certainly
impossible to run on Sealos, stop with one short concrete reason. Otherwise say
nothing about the judgment and continue into scoring. Do not create a separate
status, score, report, candidate list, evidence object, prompt, or file for it.

**Evaluates 6 dimensions** (each scored 0-2):

| Dimension | What to check |
|-----------|---------------|
| Statelessness | Does the app store state locally (sessions in memory, local file writes)? |
| Config Externalization | Are configs hardcoded or driven by env vars / config files? |
| Horizontal Scalability | Can multiple instances run without conflicts? |
| Startup/Shutdown | Does the app start fast and handle SIGTERM gracefully? |
| Observability | Does it have health checks, structured logging, metrics? |
| Service Boundaries | Is it a focused service or a tightly-coupled monolith? |

**Scoring**:
- **10-12**: Excellent — fully cloud-native ready
- **7-9**: Good — ready with minor adjustments
- **4-6**: Fair — needs some refactoring before containerization
- **0-3**: Poor — high-risk containerization attempt; continue with explicit warnings when requested

**Output**: Structured readiness report with score, findings, and recommendations.

## Phase 2: Existing Artifacts Detection

Load and execute: [modules/detect.md](modules/detect.md)

**Checks for**:
- `Dockerfile` / `Dockerfile.*` (multi-stage, multi-service)
- `docker-compose.yml` / `docker-compose.yaml` / `compose.yml`
- `.dockerignore`
- `DOCKER.md` or docker-related documentation
- Container registry references (ghcr.io, docker.io, ECR, GCR, ACR)
- Kubernetes manifests (`k8s/`, `kubernetes/`, `deploy/`, `helm/`, `charts/`)
- CI/CD pipeline with Docker build steps (`.github/workflows/`, `.gitlab-ci.yml`)

**Output**: Inventory of existing Docker/K8s artifacts with quality assessment.

## Phase 3: Routing Decision

Load and execute: [modules/route.md](modules/route.md)

**Decision Matrix**:

| Readiness Score | Artifacts Exist | Action |
|-----------------|-----------------|--------|
| ≥ 7 | Yes, complete | Report existing setup. Done. |
| ≥ 7 | Yes, partial | Report gaps, suggest improvements. Done. |
| ≥ 7 | No | Invoke `dockerfile-skill` to generate. |
| 4-6 | Any | Report issues + remediation steps. Optionally proceed with `dockerfile-skill`. |
| 0-3 | Any | Report severe concerns; if containerization/deployment was requested, attempt it with warnings. |

## Readiness Report Format

The final output MUST use this format:

If the preliminary AI check stops the workflow, give only its short concrete reason
and do not produce this report. Otherwise use the following readiness format:

```markdown
# Cloud-Native Readiness Report

## Summary
- **Project**: {name}
- **Score**: {score}/12 ({rating})
- **Verdict**: {Ready | Ready with caveats | Needs work | High risk}

## Assessment Details

### ✅ Strengths
- {what's already cloud-native friendly}

### ⚠️ Concerns
- {issues that need attention}

### ❌ Blockers (if any)
- {critical issues preventing containerization}

## Dimension Scores

| Dimension | Score | Notes |
|-----------|-------|-------|
| Statelessness | {0-2} | {detail} |
| Config Externalization | {0-2} | {detail} |
| Horizontal Scalability | {0-2} | {detail} |
| Startup/Shutdown | {0-2} | {detail} |
| Observability | {0-2} | {detail} |
| Service Boundaries | {0-2} | {detail} |

## Existing Docker Artifacts
- {inventory or "None found"}

## Recommendation
- {next steps}
```

## Supporting Resources

- **Assessment Criteria**: [knowledge/criteria.md](knowledge/criteria.md) — Detailed scoring rubrics
- **Anti-Patterns**: [knowledge/anti-patterns.md](knowledge/anti-patterns.md) — Common cloud-native anti-patterns
- **Examples**: [examples/](examples/) — Sample readiness reports

## Integration with dockerfile-skill

When routing to `dockerfile-skill`, pass the assessment context:

1. The readiness report findings inform Dockerfile generation decisions
2. Detected external services map directly to `docker-compose.yml` services
3. Identified concerns become Dockerfile comments / `DOCKER.md` caveats
4. The assessment's config externalization findings drive ENV/ARG setup

**Handoff**: When invoking `dockerfile-skill`, include a summary of:
- Detected language/framework/package manager
- External service dependencies
- Config externalization status
- Any special concerns (stateful components, long startup, etc.)
