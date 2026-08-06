# Sealos Skill Design System

**Status:** Phase 5 shared contract
**Policy source:** The canonical `skills/*/SKILL.md` entry owns behavior. This document defines the shared shape and vocabulary; each skill keeps its domain evidence and procedures.

## Contract Use

Every canonical entry presents the following core sections in this order before domain-specific extensions:

1. `Identity and Discovery`
2. `Scope and Boundaries`
3. `Risk and Confirmation`
4. `Lifecycle Workflow`
5. `Progressive Disclosure`
6. `Output, Stop, and Error States`
7. `Handoffs`
8. `Verification`

The core is a request-scoped contract. It describes the current request, the selected owner, the resources loaded for that request, the actions taken, and the evidence available at termination. Domain-specific sections follow the core and remain the owning skill's policy. Universal output JSON and universal line-count rules remain outside this contract.

## Identity and Discovery

Each entry states:

- canonical skill name and physical `SKILL.md` path;
- supported trigger aliases and the request forms it owns;
- the owned outcome and interaction class;
- the first routing decision and the evidence that selects this owner.

The physical `skills/` tree is the behavior source. The root skills directory is the canonical implementation boundary. `commands/sealos.md`, plugin manifests, marketplaces, context files, and host adapters project that source for their host syntax. A projection can route or describe an entry; it does not redefine the entry's behavior.

## Scope and Boundaries

Each entry states accepted inputs, required preconditions, mutation boundaries, and explicit exclusions. Use one of these interaction classes:

| Class | Meaning | Required boundary |
| --- | --- | --- |
| `read-only-observation` | Inspect local files or already-authorized read APIs | Do not mutate project or cloud state. |
| `local-artifact-mutation` | Write the named project artifacts or documentation | Keep writes inside the selected project and named output set. |
| `cloud-local-mutation` | Change Sealos or local credentials/configuration | Scope the mutation, preserve existing values, and confirm gated actions. |
| `composite-orchestration` | Chain multiple owned skills and runtime phases | Preserve typed handoffs and accept only the strongest downstream evidence. |

An entry names the resources it owns and the mutation verbs it may use. A handoff does not expand the upstream owner's authority: the receiving owner must re-check its own preconditions and safety boundary.

## Risk and Confirmation

The entry keeps its load-bearing safety canaries visible before detailed modules load. It identifies applicable risk classes:

- credential, secret, kubeconfig, environment, and complete connection-string disclosure;
- public exposure, credential rotation, deletion, restore collision, or other destructive cloud changes;
- system-tool installation and changes outside the selected project;
- eligibility or runtime acceptance gates;
- read-only boundaries and generated artifact quality gates.

Confirmation is explicit and request-scoped. A gated operation states the impact, the exact operation, the safe private/read-only alternative, and the evidence required after confirmation. The entry remains the policy source; `docs/skill-safety-canaries.md` supplies stable IDs for static and behavior checks.

## Lifecycle Workflow

Every request follows this observable sequence:

1. Select the owner and load the entry.
2. Check scope, preconditions, and applicable canaries.
3. Load owned resources one level at a time when their trigger condition is met.
4. Perform the allowed observation, artifact mutation, cloud mutation, or handoff.
5. Verify the strongest domain evidence and redact sensitive values.
6. Emit one terminal state: `success`, `stopped`, or `error`.

Lifecycle terms are request-scoped. They describe this invocation and do not imply a persistent session, hook, persona, or universal runtime mode.

`sealos-canvas` has one additional lifecycle rule: its loopback server exists only while the current canvas request is active and must stop when the user/task ends or on `SIGINT`/`SIGTERM`. The entry must expose `local_url`, `html_path`, and sanitized resource counts before the server is accepted.

## Progressive Disclosure

The entry contains the trigger, boundary, canary, and evidence contract. Detailed procedures live in the owning skill's `modules/`, `references/`, `knowledge/`, `scripts/`, or `evals/` paths.

Load at most one level of owned references from the entry. A referenced module may link to its own domain-specific data only when the module names the condition and the loader has reached that branch. Do not recursively load an entire skill tree, copy host adapter prose into a second source, or hide a safety canary behind an unconditionally deferred chain.

Each loaded reference is observable through its repository-relative path. Later validators can compare the loaded path set with the expected entry and canary records.

## Output, Stop, and Error States

The terminal vocabulary is fixed while evidence remains domain-specific:

| State | Meaning | Minimum observable fields |
| --- | --- | --- |
| `success` | The request's owned outcome is complete and its strongest available evidence passed. | `selected_owner`, `terminal_state`, domain result, artifact or URL paths, verification evidence, redaction result. |
| `stopped` | A precondition, eligibility gate, read-only boundary, or confirmation boundary intentionally prevented continuation. | `selected_owner`, `terminal_state`, unmet condition or boundary, evidence observed, safe next action, redaction result. |
| `error` | An attempted step or artifact failed after the request entered the owner workflow. | `selected_owner`, `terminal_state`, failed step/artifact, sanitized diagnostic, recovery action, redaction result. |

An error names the failed step and recovery action without exposing passwords, tokens, cookies, kubeconfig contents, environment values, or complete connection strings. A stopped result does not claim downstream work. A success result does not rely on a URL, build, or artifact that was merely planned.

## Handoffs

Every handoff uses these typed fields:

| Field | Contract |
| --- | --- |
| `target` | Canonical receiving skill or `none`. |
| `inputArtifact` | Named report, file, state object, or redacted contract passed to the receiver. |
| `allowedAction` | The receiver's permitted next action under its own policy. |
| `failureReturn` | The diagnostic and owner to which an unmet handoff condition returns. |
| `responseOwner` | The skill responsible for the final user-facing response for this request. |

The readiness → Dockerfile → Docker-to-Sealos → deploy chain passes structured evidence rather than prose assumptions. A verified deploy may hand sanitized `.sealos/state.json` and Runtime Truth evidence to Canvas for read-only inspection. Handoffs preserve the receiving skill's confirmation and verification gates.

## Verification

Verification is proportional to the interaction class and records observable evidence:

- read-only entries prove the selected source, loaded references, permitted read calls, and sanitized output;
- local artifact entries prove the named files, parser or quality checks, and redaction;
- cloud/local mutation entries prove scoped identity, requested state, connectivity/object/runtime evidence, and full sensitive-value redaction;
- composite entries prove each typed handoff and the strongest downstream runtime result.

The entry names the narrowest deterministic helper or test gate that proves its contract. Existing skill-local validators, eval fixtures, artifact checks, Runtime Truth checks, and footprint tests remain the preservation oracle. Live provider smoke belongs to later phases when the plan explicitly scopes it.

## Domain Extensions

After the eight core sections, a skill may add domain-specific workflow phases, schemas, examples, error knowledge, or reference indexes. Extensions may refine evidence and commands for the owned domain while preserving the core order, terminal vocabulary, canary visibility, handoff fields, and source ownership.

## Maintainer Checklist

- The physical entry remains the behavior owner.
- The first screen names the owner, scope, risk canaries, lifecycle, terminal states, handoffs, and verification.
- References load one level deep under explicit conditions.
- `success`, `stopped`, and `error` each include their required evidence and safe next action.
- Sensitive values are redacted in traces, artifacts, and final responses.
- Domain extensions preserve existing runtime artifacts and safety gates.
