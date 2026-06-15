# Technology Stack Research: Codex Plugin Installation Upgrade

**Project:** Sealos Skills  
**Repository:** `/Users/longnv/.codex/worktrees/31e2/sealos-skills`  
**Reference:** `/tmp/pm-skills-ref` (`https://github.com/phuryn/pm-skills`)  
**Researched:** 2026-06-15  
**Dimension:** Stack / implementation surface  
**Overall confidence:** MEDIUM

## Recommendation

Make Codex native marketplace installation the primary Codex path, using the `pm-skills` command shape:

```bash
codex plugin marketplace add labring/sealos-skills
codex plugin add sealos@sealos
```

Keep this compatible path as the fallback and local validation path:

```bash
npx plugins add https://github.com/labring/sealos-skills --target codex
```

The implementation surface is small but crosses three distribution files and one validator:

| File | Action |
|------|--------|
| `README.md` | Promote `codex plugin marketplace add ...` + `codex plugin add ...` to the Codex install path. Keep `npx plugins add ... --target codex` under compatibility/local install. |
| `distribution/platforms.json` | Change the Codex `install` value to the native two-command flow or add an `alternateInstall` for `npx plugins`. Update `evidence` and `lastVerified`. |
| `.claude-plugin/marketplace.json` and `marketplace.json` | Verify or adjust the Claude-compatible marketplace shape so Codex can discover `sealos@sealos` from `labring/sealos-skills`. |
| `.codex-plugin/plugin.json` | Keep as the Codex plugin manifest. Only change copy if invocation or install wording is inaccurate. |
| `.agents/plugins/marketplace.json` | Keep as the local `npx plugins` marketplace entry. Use for compatibility testing, not as the native Codex marketplace source. |
| `scripts/validate-codex-plugin.py` | Extend validation to cover native Codex marketplace discoverability and README/platform command consistency. |

## Current State

The repo already has the classic Codex plugin surface:

| Surface | Current file | Status |
|---------|--------------|--------|
| Codex plugin manifest | `.codex-plugin/plugin.json` | Present. Names plugin `sealos`, points `skills` to `./skills/`, declares display metadata and prompts. |
| Local Codex marketplace entry | `.agents/plugins/marketplace.json` | Present. Supports local `npx plugins` style install. |
| Platform registry | `distribution/platforms.json` | Present. Codex install still says `npx plugins add https://github.com/labring/sealos-skills --target codex`. |
| README install copy | `README.md` | Present. Leads with `npx plugins`; native `codex plugin marketplace add` is absent. |
| Validator | `scripts/validate-codex-plugin.py` | Present. Validates manifest/local marketplace/platform fields, but not native Codex marketplace discovery. |
| Claude-compatible marketplace | `.claude-plugin/marketplace.json`, `marketplace.json` | Present. Names marketplace `sealos`, plugin `sealos`, source `./`, commands `./commands/`, and skills list. |

## Reference Finding

`pm-skills` uses a native marketplace-first Codex install section:

```bash
codex plugin marketplace add phuryn/pm-skills
codex plugin add pm-toolkit@pm-skills
```

Its marketplace file is `.claude-plugin/marketplace.json`, with:

- root marketplace `name`: `pm-skills`
- plugin entries under `plugins[]`
- each plugin `name` used as the left side of `PLUGIN@MARKETPLACE`
- each plugin `source` pointing to a plugin subdirectory such as `./pm-toolkit`
- each plugin subdirectory containing `.claude-plugin/plugin.json`, `skills/`, and optional `commands/`

Local verification with Codex CLI `0.139.0` succeeded:

```bash
HOME="$tmp" CODEX_HOME="$tmp/.codex" codex plugin marketplace add /tmp/pm-skills-ref --json
HOME="$tmp" CODEX_HOME="$tmp/.codex" codex plugin list --available --json
HOME="$tmp" CODEX_HOME="$tmp/.codex" codex plugin add pm-toolkit@pm-skills --json
```

Result: `pm-toolkit@pm-skills` appeared in available plugins and installed successfully.

## Codex CLI Semantics Verified Locally

Verified against local Codex CLI `codex-cli 0.139.0`.

| Command | Semantics |
|---------|-----------|
| `codex plugin marketplace add <SOURCE>` | Adds a local path, `owner/repo[@ref]`, HTTPS Git URL, or SSH Git URL as a marketplace source. Supports `--ref`, `--sparse`, and `--json`. |
| `codex plugin list --available --json` | Lists available marketplace plugins plus installed plugins. Use this after adding a marketplace. |
| `codex plugin add <PLUGIN@MARKETPLACE>` | Installs a plugin from a configured marketplace snapshot. The selector must resolve from `codex plugin list --available`. |
| `codex plugin add <PLUGIN> --marketplace <MARKETPLACE>` | Equivalent selector form when the marketplace name is passed separately. |

The README should teach `codex plugin add sealos@sealos` only after the marketplace discoverability gap is fixed and verified.

## Critical Discovery Gap

Current Sealos native marketplace discovery does not expose `sealos@sealos` in an isolated Codex home.

Command used:

```bash
tmp=$(mktemp -d)
mkdir -p "$tmp/.codex"
HOME="$tmp" CODEX_HOME="$tmp/.codex" codex plugin marketplace add . --json
HOME="$tmp" CODEX_HOME="$tmp/.codex" codex plugin list --available --json
HOME="$tmp" CODEX_HOME="$tmp/.codex" codex plugin add sealos@sealos --json
rm -rf "$tmp"
```

Observed result:

- marketplace add returned `marketplaceName: "sealos"`
- marketplace list showed the repo root as a configured marketplace
- available plugin list was empty
- `codex plugin add sealos@sealos` failed with `plugin "sealos" was not found in marketplace "sealos"`

The same isolated procedure against `/tmp/pm-skills-ref` produced available plugins and installed `pm-toolkit@pm-skills`. This makes native marketplace discoverability the first implementation task.

## Prescriptive Implementation Surface

### 1. Fix Native Marketplace Discoverability

Target outcome:

```bash
codex plugin marketplace add labring/sealos-skills
codex plugin list --available --json
codex plugin add sealos@sealos --json
```

`codex plugin list --available --json` must include:

```json
{
  "pluginId": "sealos@sealos",
  "name": "sealos",
  "marketplaceName": "sealos"
}
```

Use `pm-skills` as the shape reference. The likely issue is that Sealos has one root plugin with `source: "./"` and richer marketplace fields, while `pm-skills` exposes installable plugin subdirectories. Do a focused spike before changing README:

1. Create a temporary branch or temp copy.
2. Test a minimal `sealos` plugin directory shape with `.claude-plugin/plugin.json`, `skills/`, and `commands/`.
3. Preserve the single canonical `skills/**` source by using references or manifest paths that avoid a second maintained skill copy.
4. Keep `.codex-plugin/plugin.json` as the Codex manifest for the `npx plugins` compatibility path.
5. Validate with an isolated `HOME` and `CODEX_HOME`.

Do not publish README native install commands as primary until `sealos@sealos` appears in `codex plugin list --available --json`.

### 2. Update README Codex Install Copy

Once native discovery works, make this the first Codex section:

```bash
# Step 1: Add the marketplace
codex plugin marketplace add labring/sealos-skills

# Step 2: Install Sealos
codex plugin add sealos@sealos
```

Recommended README positioning:

- Codex CLI native path first.
- Codex App instruction immediately after: select **Sealos** from **Plugins**.
- Plugin invocation examples use `$sealos`.
- `npx plugins add https://github.com/labring/sealos-skills --target codex` becomes compatibility/local install.
- Claude Code remains separate with `/sealos`.
- `skills.sh` direct entries remain in the direct skills section.

Avoid broad distribution rewrites. This milestone is Codex install plus README accuracy.

### 3. Update Platform Registry

Update only the Codex entry in `distribution/platforms.json`:

```json
{
  "id": "codex",
  "install": "codex plugin marketplace add labring/sealos-skills && codex plugin add sealos@sealos",
  "alternateInstall": "npx plugins add https://github.com/labring/sealos-skills --target codex",
  "invoke": "$sealos in Codex CLI; select Sealos from Plugins in Codex App",
  "commands": "supported",
  "evidence": "codex plugin marketplace add + codex plugin list --available + codex plugin add + codex_manifest+repo_marketplace",
  "lastVerified": "2026-06-15"
}
```

If native marketplace discovery remains unresolved after the spike, keep `npx plugins` as the primary install in `distribution/platforms.json` and record native marketplace as a research flag.

### 4. Extend Validator

Add validator checks for command drift:

| Check | File |
|-------|------|
| Codex platform install mentions `codex plugin marketplace add` after native discovery is supported. | `scripts/validate-codex-plugin.py` |
| Codex platform alternate install mentions `npx plugins add ... --target codex`. | `scripts/validate-codex-plugin.py` |
| README contains `codex plugin marketplace add labring/sealos-skills`. | `scripts/validate-codex-plugin.py` |
| README contains `codex plugin add sealos@sealos`. | `scripts/validate-codex-plugin.py` |
| README still contains `$sealos` examples for Codex. | `scripts/validate-codex-plugin.py` |
| README direct `/sealos-deploy` examples stay in `skills.sh` context. | Manual review or focused regex check. |

Keep the existing JSON and asset validations.

### 5. Verification Commands

Run these after implementation:

```bash
python3 scripts/validate-codex-plugin.py
python3 -m json.tool .codex-plugin/plugin.json >/dev/null
python3 -m json.tool .agents/plugins/marketplace.json >/dev/null
python3 -m json.tool distribution/platforms.json >/dev/null
python3 -m json.tool .claude-plugin/marketplace.json >/dev/null
python3 -m json.tool marketplace.json >/dev/null
```

Native Codex isolated verification:

```bash
tmp=$(mktemp -d)
mkdir -p "$tmp/.codex"
HOME="$tmp" CODEX_HOME="$tmp/.codex" codex plugin marketplace add . --json
HOME="$tmp" CODEX_HOME="$tmp/.codex" codex plugin list --available --json
HOME="$tmp" CODEX_HOME="$tmp/.codex" codex plugin add sealos@sealos --json
HOME="$tmp" CODEX_HOME="$tmp/.codex" codex plugin list --json
rm -rf "$tmp"
```

Remote verification before shipping:

```bash
tmp=$(mktemp -d)
mkdir -p "$tmp/.codex"
HOME="$tmp" CODEX_HOME="$tmp/.codex" codex plugin marketplace add https://github.com/labring/sealos-skills --json
HOME="$tmp" CODEX_HOME="$tmp/.codex" codex plugin list --available --json
rm -rf "$tmp"
```

Compatibility verification:

```bash
npx plugins add . --target codex --scope user --yes
codex plugin list
```

Use a disposable Codex home for destructive install tests when possible.

## Recommended Phase Order

1. **Native marketplace spike** - Prove `sealos@sealos` appears in `codex plugin list --available --json` from a local repo path.
2. **Metadata patch** - Apply the smallest marketplace/plugin metadata change needed for native Codex discovery while preserving root `skills/**` as canonical source.
3. **README and registry patch** - Promote native Codex commands and reposition `npx plugins`.
4. **Validator hardening** - Add checks so command drift is caught in future edits.
5. **Local and remote verification** - Run JSON checks, validator, isolated native Codex install, and compatibility install.

## Decisions

| Decision | Rationale |
|----------|-----------|
| Prefer native `codex plugin marketplace add` + `codex plugin add` for Codex docs. | It matches current Codex CLI semantics and the `pm-skills` reference. |
| Keep `npx plugins add ... --target codex` as fallback. | Existing Sealos repo supports this path, and local plugin-cache validation has historical precedent. |
| Do not duplicate `skills/**`. | Existing architecture and project constraints require root `skills/**` as the single source. |
| Fix discoverability before README promotion. | Current isolated Codex test cannot install `sealos@sealos` from this repo. |
| Extend `scripts/validate-codex-plugin.py` rather than add a new validator. | The repo already centralizes Codex distribution validation there. |

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Codex CLI command semantics | HIGH | Verified with local `codex-cli 0.139.0 --help` and isolated install tests. |
| `pm-skills` reference behavior | HIGH | Local isolated install from `/tmp/pm-skills-ref` succeeded. |
| Current Sealos native marketplace gap | HIGH | Local isolated test showed configured marketplace with empty available plugin list. |
| Exact metadata change required | MEDIUM | Evidence points to marketplace/plugin shape differences, but Codex internals are compiled and the precise filter condition needs a focused spike. |
| README/platform registry scope | HIGH | Required changes are visible in `README.md` and `distribution/platforms.json`. |

## Sources

- `.planning/PROJECT.md`
- `.planning/codebase/STACK.md`
- `.planning/codebase/ARCHITECTURE.md`
- `.codex-plugin/plugin.json`
- `.agents/plugins/marketplace.json`
- `distribution/platforms.json`
- `README.md`
- `marketplace.json`
- `.claude-plugin/marketplace.json`
- `.claude-plugin/plugin.json`
- `scripts/validate-codex-plugin.py`
- `/tmp/pm-skills-ref/README.md`
- `/tmp/pm-skills-ref/.claude-plugin/marketplace.json`
- `/tmp/pm-skills-ref/pm-toolkit/.claude-plugin/plugin.json`
- Local CLI: `codex --help`, `codex plugin --help`, `codex plugin marketplace add --help`, `codex plugin add --help`, `codex plugin list --help`
