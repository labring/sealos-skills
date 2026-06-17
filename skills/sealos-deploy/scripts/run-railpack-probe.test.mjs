import assert from 'assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import test from 'node:test'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(__dirname, 'run-railpack-probe.mjs')

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`)
}

function sampleAnalysis(workDir) {
  return {
    generated_at: '2026-06-17T00:00:00.000Z',
    project: {
      github_url: 'https://github.com/example/web',
      work_dir: workDir,
      repo_name: 'example/web',
      branch: 'main',
    },
    score: {
      total: 8,
      verdict: 'Good',
      dimensions: {
        statelessness: 1,
        config: 1,
        scalability: 1,
        startup: 1,
        observability: 2,
        boundaries: 2,
      },
    },
    language: 'node',
    all_languages: ['node'],
    framework: 'nextjs',
    package_manager: 'pnpm',
    port: 3000,
    databases: [],
    runtime_version: {
      source: 'default',
      node: '22',
    },
    env_vars: {},
    has_dockerfile: false,
    complexity_tier: 'L3',
    image_ref: null,
  }
}

function writeMockRailpackSuccess(root) {
  const railpack = path.join(root, 'railpack')
  fs.writeFileSync(railpack, `#!/bin/sh
set -eu
if [ "$1" = "--version" ]; then
  echo "railpack 1.0.0"
  exit 0
fi
if [ "$1" = "prepare" ]; then
  plan=""
  info=""
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --plan-out)
        shift
        plan="$1"
        ;;
      --info-out)
        shift
        info="$1"
        ;;
    esac
    shift || true
  done
  cat > "$info" <<'JSON'
{"project_type":"nodejs","package_manager":"pnpm","build_requirements":{"node_version":"20.x"},"environment":{"PORT":"4173"}}
JSON
  cat > "$plan" <<'JSON'
{"providers":["node"],"steps":[{"type":"install","command":"pnpm install --frozen-lockfile"},{"type":"build","command":"pnpm build"},{"type":"start","command":"pnpm start --port 4173"}]}
JSON
  exit 0
fi
exit 1
`)
  fs.chmodSync(railpack, 0o755)
  return railpack
}

function writeMockRailpackFallback(root) {
  const railpack = path.join(root, 'railpack-fallback')
  fs.writeFileSync(railpack, `#!/bin/sh
set -eu
if [ "$1" = "--version" ]; then
  echo "railpack 1.0.0"
  exit 0
fi
if [ "$1" = "prepare" ]; then
  exit 42
fi
if [ "$1" = "info" ]; then
  out=""
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --out)
        shift
        out="$1"
        ;;
    esac
    shift || true
  done
  cat > "$out" <<'JSON'
{"projectType":"python","buildRequirements":{"python_version":"3.12"}}
JSON
  exit 0
fi
if [ "$1" = "plan" ]; then
  out=""
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --out)
        shift
        out="$1"
        ;;
    esac
    shift || true
  done
  cat > "$out" <<'JSON'
{"build":[{"type":"build","command":"pip install -r requirements.txt"},{"type":"start","command":"gunicorn app:app --bind 0.0.0.0:8000"}]}
JSON
  exit 0
fi
exit 1
`)
  fs.chmodSync(railpack, 0o755)
  return railpack
}

test('writes Railpack evidence and normalized build environment into analysis', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'railpack-probe-'))
  const railpack = writeMockRailpackSuccess(workDir)
  const analysisPath = path.join(workDir, '.sealos', 'analysis.json')
  const configPath = path.join(workDir, '.sealos', 'config.json')
  writeJson(analysisPath, sampleAnalysis(workDir))
  writeJson(configPath, {
    port: 3000,
    build_command: 'pnpm build:prod',
  })

  const result = spawnSync(process.execPath, [
    script,
    '--work-dir',
    workDir,
    '--analysis',
    analysisPath,
    '--config',
    configPath,
    '--railpack-bin',
    railpack,
  ], { encoding: 'utf8' })

  assert.equal(result.status, 0, result.stderr)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.build_environment.status, 'detected')
  assert.equal(payload.build_environment.package_manager, 'pnpm')
  assert.equal(payload.build_environment.port, 4173)
  assert.equal(payload.build_environment.build_command, 'pnpm build')
  assert.deepEqual(payload.build_environment.config_overrides.sort(), ['build_command', 'port'].sort())
  assert.deepEqual(payload.build_environment.evidence_paths.sort(), [
    '.sealos/railpack-info.json',
    '.sealos/railpack-plan.json',
  ].sort())

  const updatedAnalysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'))
  assert.equal(updatedAnalysis.build_environment.status, 'detected')
  assert.equal(updatedAnalysis.build_environment.start_command, 'pnpm start --port 4173')
  assert(fs.existsSync(path.join(workDir, '.sealos', 'railpack-info.json')))
  assert(fs.existsSync(path.join(workDir, '.sealos', 'railpack-plan.json')))
})

test('uses info and plan fallback when Railpack prepare fails', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'railpack-probe-'))
  const railpack = writeMockRailpackFallback(workDir)
  const analysisPath = path.join(workDir, '.sealos', 'analysis.json')
  writeJson(analysisPath, sampleAnalysis(workDir))

  const result = spawnSync(process.execPath, [
    script,
    '--work-dir',
    workDir,
    '--analysis',
    analysisPath,
    '--railpack-bin',
    railpack,
  ], { encoding: 'utf8' })

  assert.equal(result.status, 0, result.stderr)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.build_environment.status, 'detected')
  assert.equal(payload.build_environment.project_type, 'python')
  assert.equal(payload.build_environment.install_command, 'pip install -r requirements.txt')
  assert.equal(payload.build_environment.start_command, 'gunicorn app:app --bind 0.0.0.0:8000')
})

test('skips cleanly when Railpack binary is missing', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'railpack-probe-'))
  const analysisPath = path.join(workDir, '.sealos', 'analysis.json')
  writeJson(analysisPath, sampleAnalysis(workDir))

  const result = spawnSync(process.execPath, [
    script,
    '--work-dir',
    workDir,
    '--analysis',
    analysisPath,
    '--railpack-bin',
    path.join(workDir, 'missing-railpack'),
  ], { encoding: 'utf8' })

  assert.equal(result.status, 0, result.stderr)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.build_environment.status, 'skipped')
  assert.match(payload.build_environment.reason, /not available/)
  assert.deepEqual(payload.build_environment.evidence_paths, [])

  const updatedAnalysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'))
  assert.equal(updatedAnalysis.build_environment.status, 'skipped')
})
