#!/usr/bin/env node
/**
 * Deterministic Docker Compose -> Sealos template converter (TypeScript).
 * CLI-compatible with compose_to_template.py.
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  convertComposeToTemplate,
  inferMetadata,
  parseCompose,
  resolveKomposeShapes,
  type CliOptions,
} from './compose-to-template-lib.ts'

// Re-export library surface for programmatic use / parity with Python module.
export * from './compose-to-template-lib.ts'
export { pathToVnName } from './path-converter.ts'

function printUsage(): void {
  console.error(`usage: compose-to-template.ts [-h] --compose COMPOSE
                           [--output-dir OUTPUT_DIR] [--app-name APP_NAME]
                           [--title TITLE] [--description DESCRIPTION] [--url URL]
                           [--git-repo GIT_REPO] [--author AUTHOR]
                           [--category CATEGORY] [--repo-raw-base REPO_RAW_BASE]
                           [--kompose-mode {auto,always,never}] [--no-fetch-logo]
                           [--dry-run]

Convert Docker Compose to Sealos template deterministically

options:
  -h, --help            show this help message and exit
  --compose COMPOSE     Path to docker-compose YAML
  --output-dir OUTPUT_DIR
                        Output template root directory
  --app-name APP_NAME   Template app name (lowercase k8s format)
  --title TITLE         Template title
  --description DESCRIPTION
                        Template description
  --url URL             Official app URL
  --git-repo GIT_REPO   Source repository URL
  --author AUTHOR       Template author
  --category CATEGORY   Template category (repeatable)
  --repo-raw-base REPO_RAW_BASE
                        Raw repository base URL for icon fields
  --kompose-mode {auto,always,never}
                        Use kompose-generated workload shapes: always (required,
                        default), auto (best effort), never (disable)
  --no-fetch-logo       Disable default svgl.app SVG logo search and keep the
                        fallback logo path
  --dry-run             Print index.yaml content without writing files`)
}

export function parseArgs(argv: string[] = process.argv.slice(2)): CliOptions {
  const opts: CliOptions = {
    compose: '',
    outputDir: 'template',
    appName: '',
    title: '',
    description: '',
    url: '',
    gitRepo: '',
    author: 'Sealos',
    category: [],
    repoRawBase: 'https://raw.githubusercontent.com/labring-actions/templates/kb-0.9',
    komposeMode: 'always',
    noFetchLogo: false,
    dryRun: false,
  }

  const takeValue = (i: number, flag: string): [string, number] => {
    if (i + 1 >= argv.length) {
      console.error(`compose-to-template.ts: error: argument ${flag}: expected one argument`)
      printUsage()
      process.exit(2)
    }
    return [argv[i + 1], i + 1]
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '-h' || arg === '--help') {
      printUsage()
      process.exit(0)
    }
    if (arg === '--compose') {
      ;[opts.compose, i] = takeValue(i, '--compose')
      continue
    }
    if (arg === '--output-dir') {
      ;[opts.outputDir, i] = takeValue(i, '--output-dir')
      continue
    }
    if (arg === '--app-name') {
      ;[opts.appName, i] = takeValue(i, '--app-name')
      continue
    }
    if (arg === '--title') {
      ;[opts.title, i] = takeValue(i, '--title')
      continue
    }
    if (arg === '--description') {
      ;[opts.description, i] = takeValue(i, '--description')
      continue
    }
    if (arg === '--url') {
      ;[opts.url, i] = takeValue(i, '--url')
      continue
    }
    if (arg === '--git-repo') {
      ;[opts.gitRepo, i] = takeValue(i, '--git-repo')
      continue
    }
    if (arg === '--author') {
      ;[opts.author, i] = takeValue(i, '--author')
      continue
    }
    if (arg === '--category') {
      const [value, next] = takeValue(i, '--category')
      opts.category.push(value)
      i = next
      continue
    }
    if (arg === '--repo-raw-base') {
      ;[opts.repoRawBase, i] = takeValue(i, '--repo-raw-base')
      continue
    }
    if (arg === '--kompose-mode') {
      const [value, next] = takeValue(i, '--kompose-mode')
      if (value !== 'auto' && value !== 'always' && value !== 'never') {
        console.error(
          `compose-to-template.ts: error: argument --kompose-mode: invalid choice: '${value}' (choose from auto, always, never)`,
        )
        process.exit(2)
      }
      opts.komposeMode = value
      i = next
      continue
    }
    if (arg === '--no-fetch-logo') {
      opts.noFetchLogo = true
      continue
    }
    if (arg === '--dry-run') {
      opts.dryRun = true
      continue
    }
    console.error(`compose-to-template.ts: error: unrecognized arguments: ${arg}`)
    printUsage()
    process.exit(2)
  }

  if (!opts.compose) {
    console.error('compose-to-template.ts: error: the following arguments are required: --compose')
    printUsage()
    process.exit(2)
  }

  return opts
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv)
  const composePath = resolve(args.compose)
  if (!existsSync(composePath)) {
    console.error(`ERROR: compose file not found: ${composePath}`)
    return 1
  }

  let composeData: Record<string, unknown>
  try {
    composeData = parseCompose(composePath)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`ERROR: ${message}`)
    return 1
  }

  const meta = inferMetadata(args, composeData, composePath)
  const outputRoot = resolve(args.outputDir)

  let indexPath: string
  let rendered: string
  try {
    const komposeShapes = resolveKomposeShapes(composePath, args.komposeMode)
    ;[indexPath, rendered] = await convertComposeToTemplate({
      composePath,
      outputRoot,
      meta,
      komposeShapes,
      writeFiles: !args.dryRun,
      fetchLogo: !args.noFetchLogo,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`ERROR: ${message}`)
    return 1
  }

  if (args.dryRun) {
    console.log(rendered)
  } else {
    console.log(`Generated: ${indexPath}`)
  }
  return 0
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('compose-to-template.ts') ||
    process.argv[1].endsWith('compose-to-template.js'))

if (isDirectRun) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`ERROR: ${message}`)
      process.exit(1)
    })
}
