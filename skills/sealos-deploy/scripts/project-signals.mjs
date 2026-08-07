#!/usr/bin/env node

/**
 * Project signal detection for sealos-deploy Phase 1.
 *
 * Reads the local repo filesystem and prints JSON signals for language,
 * framework, port, databases, runtime version, and related facts.
 *
 * Usage:
 *   node scripts/project-signals.mjs <repo-path>
 *   import { collectProjectSignals } from './scripts/project-signals.mjs'
 */

import fs from 'fs';
import path from 'path';

import { inspectSourceReadyStaticSite } from './static-site.mjs';

// ─── Language Priority ───────────────────────────────────────

const LANGUAGE_PRIORITY = ['go', 'rust', 'java', 'node', 'python', 'php', 'ruby', 'dotnet', 'html'];

function pickPrimaryLanguage(langSignals, fwSignals) {
  const detected = Object.entries(langSignals).filter(([, v]) => v).map(([k]) => k);
  if (detected.length <= 1) return detected[0] || null;

  // Prefer languages with a detected web framework
  const withFramework = detected.filter(lang => {
    if (lang === 'node') return fwSignals.nextjs || fwSignals.nuxt || fwSignals.express || fwSignals.hono || fwSignals.fastify || fwSignals.nestjs;
    if (lang === 'python') return fwSignals.fastapi || fwSignals.django || fwSignals.flask;
    if (lang === 'go') return fwSignals.gin || fwSignals.echo || fwSignals.fiber;
    if (lang === 'java') return fwSignals.spring;
    return false;
  });

  if (withFramework.length === 1) return withFramework[0];

  // Multiple with frameworks or none → sort by priority (compiled > interpreted)
  const pool = withFramework.length > 0 ? withFramework : detected;
  return pool.sort((a, b) => LANGUAGE_PRIORITY.indexOf(a) - LANGUAGE_PRIORITY.indexOf(b))[0];
}

// ─── Signal Detection ───────────────────────────────────────

function detectSignals(repoDir) {
  const has = (f) => fs.existsSync(path.join(repoDir, f));
  const hasAny = (...files) => files.some(has);
  const readJson = (f) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(repoDir, f), 'utf-8'));
    } catch {
      return null;
    }
  };
  const grepFile = (f, pattern) => {
    try {
      const content = fs.readFileSync(path.join(repoDir, f), 'utf-8');
      return pattern.test(content);
    } catch {
      return false;
    }
  };
  const grepDir = (dir, pattern, exts = ['.ts', '.js', '.py', '.go', '.java', '.rs', '.php', '.rb']) => {
    try {
      return grepRecursive(path.join(repoDir, dir), pattern, exts, 0);
    } catch {
      return false;
    }
  };

  const isSourceReadyStaticSite = inspectSourceReadyStaticSite(repoDir).eligible;

  // ── Language Detection (check root + up to 2 levels deep for monorepos) ──
  const lang = {};
  const hasDeep = (pattern) => findFiles(repoDir, pattern, 2).length > 0;
  lang.node = has('package.json') || hasDeep(/^package\.json$/);
  lang.go = has('go.mod') || hasDeep(/^go\.mod$/);
  lang.python = hasAny('requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile') || hasDeep(/^(requirements\.txt|pyproject\.toml)$/);
  lang.java = hasAny('pom.xml', 'build.gradle', 'build.gradle.kts') || hasDeep(/^(pom\.xml|build\.gradle)$/);
  lang.rust = has('Cargo.toml') || hasDeep(/^Cargo\.toml$/);
  lang.php = has('composer.json') || hasDeep(/^composer\.json$/);
  lang.ruby = has('Gemfile') || hasDeep(/^Gemfile$/);
  lang.dotnet = findFiles(repoDir, /\.(csproj|sln)$/, 2).length > 0;
  lang.html = isSourceReadyStaticSite;

  // ── Framework Detection (scans root + all sub package.json for monorepos) ──
  const fw = {};
  fw.static_html = isSourceReadyStaticSite;
  let _allNodeDeps = {};
  if (lang.node) {
    // Collect ALL deps across all package.json files (monorepo support)
    const allPkgFiles = [
      path.join(repoDir, 'package.json'),
      ...findFiles(repoDir, /^package\.json$/, 3),
    ];
    const allNodeDeps = {};
    for (const pkgFile of allPkgFiles) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf-8'));
        Object.assign(allNodeDeps, pkg.dependencies || {}, pkg.devDependencies || {});
      } catch { /* skip */ }
    }

    fw.nextjs = 'next' in allNodeDeps || hasAny('next.config.js', 'next.config.ts', 'next.config.mjs') || findFiles(repoDir, /^next\.config\.(js|ts|mjs)$/, 2).length > 0;
    fw.nuxt = 'nuxt' in allNodeDeps || has('nuxt.config.ts');
    fw.express = 'express' in allNodeDeps;
    fw.hono = 'hono' in allNodeDeps;
    fw.fastify = 'fastify' in allNodeDeps;
    fw.nestjs = '@nestjs/core' in allNodeDeps;
    fw.astro = 'astro' in allNodeDeps;
    fw.vite = 'vite' in allNodeDeps;
    fw.react = 'react' in allNodeDeps;
    fw.vue = 'vue' in allNodeDeps;

    // Override allDeps for state detection later
    _allNodeDeps = allNodeDeps;
  }
  if (lang.python) {
    fw.fastapi = grepFile('requirements.txt', /fastapi/i) || grepFile('pyproject.toml', /fastapi/i);
    fw.django = grepFile('requirements.txt', /django/i) || has('manage.py');
    fw.flask = grepFile('requirements.txt', /flask/i) || grepFile('pyproject.toml', /flask/i);
  }
  if (lang.go) {
    fw.gin = grepFile('go.mod', /gin-gonic/);
    fw.echo = grepFile('go.mod', /labstack\/echo/);
    fw.fiber = grepFile('go.mod', /gofiber\/fiber/);
  }
  if (lang.java) {
    fw.spring = grepFile('pom.xml', /spring-boot/) || grepFile('build.gradle', /spring-boot/);
  }

  // ── HTTP Server Detection (most critical signal) ──
  const http = {};
  http.has_port_listen = isSourceReadyStaticSite;
  http.has_http_handler = isSourceReadyStaticSite;

  if (lang.node) {
    const pkg = readJson('package.json');
    const scripts = pkg?.scripts || {};
    http.has_start_script = 'start' in scripts || 'serve' in scripts;
    http.has_port_listen = http.has_start_script || fw.nextjs || fw.nuxt || fw.express || fw.hono || fw.fastify || fw.nestjs;
    http.has_http_handler = fw.express || fw.hono || fw.fastify || fw.nestjs || fw.nextjs || fw.nuxt;
  }
  if (lang.go) {
    const hasGoWebFw = fw.gin || fw.echo || fw.fiber ||
      grepFile('go.mod', /go-chi\/chi|gorilla\/mux/);
    const hasGoHttpCode = grepDir('', /http\.ListenAndServe|ListenAndServeTLS/, ['.go']);
    http.has_http_handler = !!(hasGoWebFw || hasGoHttpCode);
    http.has_port_listen = http.has_http_handler;
  }
  if (lang.python) {
    http.has_port_listen = fw.fastapi || fw.django || fw.flask;
    http.has_http_handler = fw.fastapi || fw.django || fw.flask;
  }
  if (lang.java) {
    http.has_port_listen = fw.spring;
    http.has_http_handler = fw.spring;
  }
  if (lang.rust) {
    http.has_port_listen = grepFile('Cargo.toml', /actix-web|axum|rocket|warp|hyper/);
    http.has_http_handler = http.has_port_listen;
  }
  if (lang.php) {
    http.has_port_listen = true; // PHP always served via web server
    http.has_http_handler = true;
  }
  if (lang.ruby) {
    http.has_port_listen = has('config.ru') || grepFile('Gemfile', /rails|sinatra|puma/);
    http.has_http_handler = http.has_port_listen;
  }

  // ── State Externalization ──
  const state = {};
  const allDeps = lang.node ? (_allNodeDeps || readJson('package.json')?.dependencies || {}) : {};

  state.uses_postgres =
    'pg' in allDeps ||
    'postgres' in allDeps ||
    '@prisma/client' in allDeps ||
    'drizzle-orm' in allDeps ||
    'typeorm' in allDeps ||
    'sequelize' in allDeps ||
    hasAny('prisma/schema.prisma');
  state.uses_mysql = 'mysql2' in allDeps || 'mysql' in allDeps;
  state.uses_mongodb = 'mongoose' in allDeps || 'mongodb' in allDeps;
  state.uses_redis = 'redis' in allDeps || 'ioredis' in allDeps || '@upstash/redis' in allDeps;
  state.uses_sqlite = 'better-sqlite3' in allDeps || 'sqlite3' in allDeps;
  state.uses_s3 = '@aws-sdk/client-s3' in allDeps || 'minio' in allDeps;
  state.uses_external_db = state.uses_postgres || state.uses_mysql || state.uses_mongodb;

  if (lang.python) {
    state.uses_postgres = state.uses_postgres || grepFile('requirements.txt', /psycopg|asyncpg|sqlalchemy/i);
    state.uses_mysql = state.uses_mysql || grepFile('requirements.txt', /mysqlclient|pymysql/i);
    state.uses_mongodb = state.uses_mongodb || grepFile('requirements.txt', /pymongo|motor/i);
    state.uses_redis = state.uses_redis || grepFile('requirements.txt', /redis/i);
    state.uses_external_db = state.uses_postgres || state.uses_mysql || state.uses_mongodb;
  }

  if (lang.go) {
    state.uses_postgres = grepFile('go.mod', /lib\/pq|pgx|gorm\.io/);
    state.uses_mysql = grepFile('go.mod', /go-sql-driver\/mysql/);
    state.uses_mongodb = grepFile('go.mod', /mongo-driver/);
    state.uses_redis = grepFile('go.mod', /go-redis|redigo/);
    state.uses_external_db = state.uses_postgres || state.uses_mysql || state.uses_mongodb;
  }

  // ── Config Externalization ──
  const config = {};
  config.has_env_example = hasAny('.env.example', '.env.sample', '.env.template', '.dev.vars.example') ||
    findFiles(repoDir, /^\.(env\.example|env\.sample|env\.template|dev\.vars\.example)$/, 2).length > 0;
  config.has_env_file = hasAny('.env', '.env.local', '.env.development') ||
    findFiles(repoDir, /^\.env(\.local|\.development)?$/, 2).length > 0;
  config.has_env_validation = lang.node && (
    '@t3-oss/env-nextjs' in allDeps ||
    'envalid' in allDeps ||
    'env-var' in allDeps
  );

  // ── Docker Artifacts ──
  const docker = {};
  const _dockerfilePaths = findFiles(repoDir, /^(Dockerfile|dockerfile)(\.[\w.-]+)?$/, 3);
  const _composePaths = findFiles(repoDir, /^(docker-compose|compose)\.(yml|yaml)$/, 3);
  docker.has_dockerfile = _dockerfilePaths.length > 0;
  docker.has_compose = _composePaths.length > 0;
  docker._dockerfile_paths = _dockerfilePaths.map(f => path.relative(repoDir, f));
  docker.has_dockerignore = has('.dockerignore');
  docker.has_k8s = hasAny('k8s', 'kubernetes', 'helm', 'charts', 'Chart.yaml', 'kustomization.yaml');
  docker.has_any = docker.has_dockerfile || docker.has_compose;

  // ── Monorepo ──
  const mono = {};
  mono.is_monorepo = hasAny('pnpm-workspace.yaml', 'turbo.json', 'nx.json', 'lerna.json');
  mono.has_apps_dir = has('apps') || has('services');

  // ── Lifecycle ──
  const lifecycle = {};
  if (isSourceReadyStaticSite) {
    lifecycle.has_start = true;
    lifecycle.has_build = false;
  }
  if (lang.node) {
    const pkg = readJson('package.json');
    const scripts = pkg?.scripts || {};
    lifecycle.has_start = 'start' in scripts;
    lifecycle.has_build = 'build' in scripts;
    lifecycle.has_dev = 'dev' in scripts;
  }
  lifecycle.has_health_check = _dockerfilePaths.some(f => {
    try { return /HEALTHCHECK/.test(fs.readFileSync(f, 'utf-8')); } catch { return false; }
  });
  if (lang.java) {
    lifecycle.has_build = hasAny('pom.xml', 'gradlew', 'mvnw', 'build.gradle', 'build.gradle.kts');
    lifecycle.has_start = !!fw.spring;
    if (!lifecycle.has_health_check) {
      lifecycle.has_health_check =
        grepFile('pom.xml', /spring-boot-starter-actuator/) ||
        grepFile('build.gradle', /spring-boot-starter-actuator/) ||
        grepFile('build.gradle.kts', /spring-boot-starter-actuator/);
    }
  }

  // ── Package Manager Detection ──
  const pm = {};
  if (lang.node) {
    if (has('pnpm-lock.yaml')) pm.name = 'pnpm';
    else if (has('yarn.lock')) pm.name = 'yarn';
    else if (has('bun.lockb') || has('bun.lock')) pm.name = 'bun';
    else pm.name = 'npm';
  } else if (lang.python) {
    pm.name = has('Pipfile') ? 'pipenv' : 'pip';
  } else if (lang.go) {
    pm.name = 'go';
  } else if (lang.java) {
    pm.name = has('gradlew') || has('build.gradle') || has('build.gradle.kts') ? 'gradle' : 'maven';
  } else if (lang.rust) {
    pm.name = 'cargo';
  } else if (lang.php) {
    pm.name = 'composer';
  } else if (lang.ruby) {
    pm.name = 'bundler';
  }

  // ── Port Detection (concrete value) ──
  const port = {};
  if (lang.node) {
    if (fw.nextjs || fw.nuxt) port.value = 3000;
    else if (fw.nestjs) port.value = 3000;
    else if (fw.astro) port.value = 4321;
  }
  if (lang.go && !port.value) port.value = 8080;
  if (lang.python && (fw.fastapi || fw.flask) && !port.value) port.value = 8000;
  if (lang.python && fw.django && !port.value) port.value = 8000;
  if (lang.java && fw.spring && !port.value) port.value = 8080;
  if (lang.rust && !port.value) port.value = 8080;
  if (lang.php && !port.value) port.value = 80;
  if (lang.ruby && !port.value) port.value = 3000;
  if (lang.html && !port.value) port.value = 8080;
  port.source = port.value ? 'framework-default' : 'unknown';

  // ── Database Types (concrete list) ──
  const databases = [];
  if (state.uses_postgres) databases.push('postgres');
  if (state.uses_mysql) databases.push('mysql');
  if (state.uses_mongodb) databases.push('mongodb');
  if (state.uses_redis) databases.push('redis');
  if (state.uses_sqlite) databases.push('sqlite');

  // ── Runtime Version Detection ──
  const runtime_version = {};
  if (lang.node) {
    const pkg = readJson('package.json');
    const engines = pkg?.engines?.node;
    if (engines) {
      const match = engines.match(/(\d+)/);
      runtime_version.node = match ? match[1] : '22';
      runtime_version.source = 'engines';
    } else {
      const versionFiles = ['.node-version', '.nvmrc'];
      for (const f of versionFiles) {
        if (has(f)) {
          try {
            const raw = fs.readFileSync(path.join(repoDir, f), 'utf-8').trim();
            const m = raw.match(/(\d+)/);
            if (m) { runtime_version.node = m[1]; runtime_version.source = f; break; }
          } catch { /* skip */ }
        }
      }
      if (!runtime_version.node) {
        if (has('.tool-versions')) {
          try {
            const content = fs.readFileSync(path.join(repoDir, '.tool-versions'), 'utf-8');
            const m = content.match(/nodejs?\s+(\d+)/);
            if (m) { runtime_version.node = m[1]; runtime_version.source = '.tool-versions'; }
          } catch { /* skip */ }
        }
      }
      if (!runtime_version.node) { runtime_version.node = '22'; runtime_version.source = 'default'; }
    }
  } else if (lang.python) {
    if (has('.python-version')) {
      try {
        const raw = fs.readFileSync(path.join(repoDir, '.python-version'), 'utf-8').trim();
        const m = raw.match(/(\d+\.\d+)/);
        if (m) { runtime_version.python = m[1]; runtime_version.source = '.python-version'; }
      } catch { /* skip */ }
    }
    if (!runtime_version.python) {
      const pyproject = has('pyproject.toml') ?
        fs.readFileSync(path.join(repoDir, 'pyproject.toml'), 'utf-8') : '';
      const m = pyproject.match(/requires-python\s*=\s*"[><=]*(\d+\.\d+)/);
      if (m) { runtime_version.python = m[1]; runtime_version.source = 'pyproject.toml'; }
    }
    if (!runtime_version.python) { runtime_version.python = '3.12'; runtime_version.source = 'default'; }
  } else if (lang.go) {
    if (has('go.mod')) {
      try {
        const content = fs.readFileSync(path.join(repoDir, 'go.mod'), 'utf-8');
        const m = content.match(/^go\s+(\d+\.\d+)/m);
        if (m) { runtime_version.go = m[1]; runtime_version.source = 'go.mod'; }
      } catch { /* skip */ }
    }
    if (!runtime_version.go) { runtime_version.go = '1.23'; runtime_version.source = 'default'; }
  } else if (lang.java) {
    runtime_version.java = '21'; runtime_version.source = 'default';
    if (has('pom.xml')) {
      try {
        const pom = fs.readFileSync(path.join(repoDir, 'pom.xml'), 'utf-8');
        const m = pom.match(/<java\.version>(\d+)</) || pom.match(/<maven\.compiler\.source>(\d+)</);
        if (m) { runtime_version.java = m[1]; runtime_version.source = 'pom.xml'; }
      } catch { /* skip */ }
    }
  } else if (lang.rust) {
    if (has('rust-toolchain.toml') || has('rust-toolchain')) {
      runtime_version.rust = 'stable'; runtime_version.source = 'rust-toolchain';
    } else {
      runtime_version.rust = 'stable'; runtime_version.source = 'default';
    }
  } else if (lang.html) {
    runtime_version.html = 'static';
    runtime_version.nginx = '1.31.3';
    runtime_version.source = 'static-html-fast-path';
  }

  return { lang, fw, http, state, config, docker, mono, lifecycle, pm, port, databases, runtime_version };
}

// ─── Helpers ────────────────────────────────────────────────

function findFiles(dir, pattern, maxDepth, depth = 0) {
  if (depth > maxDepth) return [];
  const results = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      if (entry.isFile() && pattern.test(entry.name)) {
        results.push(path.join(dir, entry.name));
      } else if (entry.isDirectory() && depth < maxDepth) {
        results.push(...findFiles(path.join(dir, entry.name), pattern, maxDepth, depth + 1));
      }
    }
  } catch { /* ignore permission errors */ }
  return results;
}

function grepRecursive(dir, pattern, exts, depth, maxDepth = 3) {
  if (depth > maxDepth) return false;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'vendor') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && exts.some((ext) => entry.name.endsWith(ext))) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (pattern.test(content)) return true;
        } catch { /* skip */ }
      } else if (entry.isDirectory()) {
        if (grepRecursive(fullPath, pattern, exts, depth + 1, maxDepth)) return true;
      }
    }
  } catch { /* ignore */ }
  return false;
}


// ─── Public signals ─────────────────────────────────────────

function collectProjectSignals(repoDir) {
  const s = detectSignals(repoDir);
  return {
    language: Object.entries(s.lang).filter(([, v]) => v).map(([k]) => k),
    primary_language: pickPrimaryLanguage(s.lang, s.fw),
    framework: Object.entries(s.fw).filter(([, v]) => v).map(([k]) => k),
    has_http_server: s.http.has_http_handler,
    external_db: s.state.uses_external_db,
    has_docker: s.docker.has_any,
    is_monorepo: s.mono.is_monorepo,
    has_env_example: s.config.has_env_example,
    dockerfile_paths: s.docker._dockerfile_paths || [],
    package_manager: s.pm.name || null,
    port: s.port.value || null,
    port_source: s.port.source,
    databases: s.databases,
    runtime_version: s.runtime_version,
  };
}

// ─── CLI ────────────────────────────────────────────────────

const repoDir = process.argv[2];
if (repoDir) {
  const absDir = path.resolve(repoDir);
  if (!fs.existsSync(absDir)) {
    console.error(`Directory not found: ${absDir}`);
    process.exit(1);
  }
  const signals = collectProjectSignals(absDir);
  console.log(JSON.stringify({ signals }, null, 2));
}

export { collectProjectSignals, detectSignals };
