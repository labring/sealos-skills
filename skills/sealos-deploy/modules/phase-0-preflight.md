# Phase 0: Preflight

## Purpose

Prepare a complete source workspace and write the initial `analysis.json` contract.

Do not judge deployability. Do not build an image. Do not generate a template. Do not create an application resource.

## Input

Read the invocation input. It can be a GitHub repository URL, a local directory, or no value.

Read `SEALAI_DEPLOY_TASK_ID`. Use it only to select the runtime profile.

## Procedure

1. If `SEALAI_DEPLOY_TASK_ID` exists, set `runtime_profile` to `sandbox`.
2. Otherwise set `runtime_profile` to `local`.
3. Create one log file under `~/.sealos/logs/`. Record each phase boundary in that file.
4. Install every missing common dependency.
5. Upgrade every outdated common dependency.
6. Validate the common dependencies:
   - Git and Git LFS
   - Node.js 18 or newer
   - Python 3.8 or newer and PyYAML
   - gitingest, kompose, Helm 3 or newer, kubectl, curl, and jq
7. In `sandbox`, validate `railpack --help`.
8. In `local`, install or upgrade `gh`, Docker, Docker Buildx, and railpack.
9. In `local`, validate each local dependency.
10. If the runtime profile is `local` and Docker exists but its daemon is stopped, start the daemon.
11. If the local daemon does not start, stop.
12. If the profile is `local` and `gh` lacks authentication or `write:packages`, complete GitHub authentication.
13. In `local`, validate the GitHub account and scope.
14. In `local`, select the Sealos region, login, and workspace with `scripts/sealos-auth.mjs`.
15. If the input is a GitHub URL, clone it into a new temporary directory. Use that directory as `work_dir`.
16. If the input is a local directory, resolve its absolute path. Preserve every existing local modification.
17. If the input is empty, resolve the current directory as `work_dir`.
18. Fetch declared submodules and LFS objects.
19. If checkout metadata declares a source-materialization tool, install that tool.
20. Do not install a tool from a README command alone.
21. Validate that the selected workspace contains the current commit and all required source files.
22. Set `repo_name` from the URL or the work directory name.
23. Set `github_url` from the input URL or the Git remote.
24. If no GitHub URL exists, set `github_url` to `null`.
25. Write the initial `.sealos/analysis.json` file.
26. Run the Phase 0 artifact validation.

The user invocation authorizes the dependency installation in this phase. Do not ask for one confirmation per dependency.

Use this initial artifact shape:

```json
{
  "runtime_profile": "local",
  "work_dir": "/absolute/path/to/project",
  "repo_name": "my-app",
  "github_url": "https://github.com/owner/repository"
}
```

Run this validation after the file exists:

```bash
node <SKILL_DIR>/scripts/validate-artifacts.mjs --stage phase-0 --dir "<WORK_DIR>"
```

## Stop Conditions

If a required tool cannot install or work, stop.

If local GitHub authentication or its `write:packages` scope cannot validate, stop.

If a local Sealos region, login, or workspace cannot be selected, stop.

If the source cannot resolve or materialize, stop.

If `analysis.json` cannot write or validate, stop.

## Exit Contract

If all values below are true, continue:

- `runtime_profile` is `local` or `sandbox`.
- `work_dir` is an absolute, complete source workspace.
- `.sealos/analysis.json` contains exactly the Phase 0 fields.
- The log contains the Phase 0 boundary and its decisions.
