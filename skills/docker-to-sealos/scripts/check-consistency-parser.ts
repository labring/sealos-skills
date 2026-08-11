/**
 * Parsing and context-building utilities for consistency checks.
 */

import fs from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import { LineLocator } from './check-consistency-line-locator.ts'
import {
  NEGATIVE_MARKERS,
  createScanContext,
  type ScanContext,
  type Violation,
  type YamlBlock,
  type YamlDocument,
} from './check-consistency-models.ts'

const SUPPORTED_SCAN_SUFFIXES = new Set(['.md', '.yaml', '.yml'])
const TEMPLATE_CONTROL_LINE_PATTERN =
  /^(\s*)\$\{\{\s*(?:if\([^}]*\)|elif\([^}]*\)|else\(\)|endif\(\))\s*\}\}\s*$/

function* iterMarkdownFiles(root: string): Generator<string> {
  const entries = fs.readdirSync(root, { withFileTypes: true })
  const dirs: string[] = []
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) dirs.push(full)
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(full)
  }
  for (const file of files.sort()) yield file
  for (const dir of dirs.sort()) yield* iterMarkdownFiles(dir)
}

function* iterYamlFiles(root: string): Generator<string> {
  const entries = fs.readdirSync(root, { withFileTypes: true })
  const dirs: string[] = []
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) dirs.push(full)
    else if (
      entry.isFile() &&
      (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))
    ) {
      files.push(full)
    }
  }
  for (const file of files.sort()) yield file
  for (const dir of dirs.sort()) yield* iterYamlFiles(dir)
}

export function* iterSupportedFiles(root: string): Generator<string> {
  const seen = new Set<string>()
  for (const file of [...iterMarkdownFiles(root), ...iterYamlFiles(root)].sort()) {
    if (seen.has(file)) continue
    seen.add(file)
    yield file
  }
}

export function hasNegativeMarkers(text: string): boolean {
  const lowered = text.toLowerCase()
  return NEGATIVE_MARKERS.some((marker) => lowered.includes(marker))
}

export function extractYamlBlocks(filePath: string, text: string): YamlBlock[] {
  const lines = text.split(/\r?\n/)
  const blocks: YamlBlock[] = []

  let inBlock = false
  let blockStart = 0
  let collected: string[] = []
  let blockSkipChecks = false

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const lineNo = index + 1
    const stripped = line.trim()

    if (!inBlock) {
      if (stripped.startsWith('```')) {
        const rest = stripped.slice(3).trim()
        const lang = rest ? rest.split(/\s+/, 1)[0].toLowerCase() : ''
        if (lang === 'yaml' || lang === 'yml') {
          inBlock = true
          blockStart = lineNo + 1
          collected = []
          const contextLines = lines.slice(Math.max(0, index - 3), index)
          blockSkipChecks = hasNegativeMarkers(contextLines.join('\n'))
        }
      }
      continue
    }

    if (stripped.startsWith('```')) {
      const source = collected.join('\n').replace(/^\n+|\n+$/g, '')
      if (source) {
        const skipChecks = blockSkipChecks || hasNegativeMarkers(source)
        blocks.push({
          path: filePath,
          startLine: blockStart,
          source,
          skipChecks,
        })
      }
      inBlock = false
      blockStart = 0
      collected = []
      blockSkipChecks = false
      continue
    }

    collected.push(line)
  }

  return blocks
}

export function splitYamlDocuments(block: YamlBlock): Array<[number, string]> {
  const docs: Array<[number, string]> = []
  const lines = block.source.split(/\r?\n/)

  let current: string[] = []
  let docStart = block.startLine

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const index = block.startLine + i
    if (/^\s*---\s*$/.test(line)) {
      const text = current.join('\n').trim()
      if (text) docs.push([docStart, text])
      current = []
      docStart = index + 1
      continue
    }
    current.push(line)
  }

  const tail = current.join('\n').trim()
  if (tail) docs.push([docStart, tail])
  return docs
}

export function shouldIgnoreYamlParseError(docText: string): boolean {
  const lines = docText.split(/\r?\n/).map((line) => line.trim())
  if (lines.some((line) => line === '...')) return true

  const templateControlPrefixes = [
    '${{ if(',
    '${{ elif(',
    '${{ else() }}',
    '${{ endif() }}',
  ]
  return lines.some((line) =>
    templateControlPrefixes.some((prefix) => line.startsWith(prefix)),
  )
}

export function neutralizeTemplateControlLines(docText: string): string {
  return docText
    .split(/\r?\n/)
    .map((line) =>
      line.replace(TEMPLATE_CONTROL_LINE_PATTERN, (_full, indent: string) => {
        return `${indent}# ${_full.trim()}`
      }),
    )
    .join('\n')
}

export function parseYamlDocuments(
  blocks: readonly YamlBlock[],
): [YamlDocument[], Violation[]] {
  const documents: YamlDocument[] = []
  const violations: Violation[] = []

  for (const block of blocks) {
    for (const [startLine, docText] of splitYamlDocuments(block)) {
      const parseText = neutralizeTemplateControlLines(docText)
      let parsed: unknown
      try {
        // Match PyYAML: duplicate keys are allowed (last wins).
        parsed = parseYaml(parseText, { uniqueKeys: false })
      } catch (error) {
        if (block.skipChecks || shouldIgnoreYamlParseError(docText)) continue
        let line = startLine
        const mark = (error as { linePos?: Array<{ line: number }> })?.linePos?.[0]
        if (mark?.line != null) {
          line += mark.line - 1
        }
        violations.push({
          ruleId: 'R000',
          path: block.path,
          line,
          message: `invalid YAML snippet: ${(error as Error).name || 'Error'}`,
        })
        continue
      }

      if (parsed == null) continue

      documents.push({
        path: block.path,
        startLine,
        source: docText,
        data: parsed,
        skipChecks: block.skipChecks,
        lineLocator: new LineLocator(startLine, parseText.split(/\r?\n/)),
      })
    }
  }

  return [documents, violations]
}

export function findLine(
  doc: YamlDocument,
  pattern: string,
  defaultLine: number | null = null,
): number {
  return doc.lineLocator.find(pattern, defaultLine)
}

export function resolvePath(value: string, base: string): string {
  if (path.isAbsolute(value)) return value
  return path.resolve(base, value)
}

export function buildScanPaths(
  skillPath: string,
  referencesDir: string,
  includePaths: readonly string[],
): string[] {
  if (includePaths.length === 0) {
    return [skillPath, ...iterSupportedFiles(referencesDir)]
  }

  const skillRoot = path.dirname(skillPath)
  const resolved: string[] = []
  for (const rel of includePaths) {
    const p = resolvePath(rel, skillRoot)
    if (!fs.existsSync(p)) {
      throw new Error(`included path does not exist: ${p}`)
    }
    const stat = fs.statSync(p)
    if (stat.isDirectory()) {
      resolved.push(...iterSupportedFiles(p))
    } else {
      const suffix = path.extname(p).toLowerCase()
      if (!SUPPORTED_SCAN_SUFFIXES.has(suffix)) {
        const allowed = [...SUPPORTED_SCAN_SUFFIXES].sort().join(', ')
        throw new Error(`unsupported included file type: ${p} (allowed: ${allowed})`)
      }
      resolved.push(p)
    }
  }

  const unique: string[] = []
  const seen = new Set<string>()
  for (const filePath of resolved) {
    if (!seen.has(filePath)) {
      unique.push(filePath)
      seen.add(filePath)
    }
  }
  return unique
}

export function buildContext(
  skillPath: string,
  referencesDir: string,
  includePaths: readonly string[],
): [ScanContext, Violation[]] {
  const scanPaths = buildScanPaths(skillPath, referencesDir, includePaths)
  const fileTexts: Record<string, string> = {}
  const blocks: YamlBlock[] = []

  for (const filePath of scanPaths) {
    const text = fs.readFileSync(filePath, 'utf8')
    fileTexts[filePath] = text
    if (path.extname(filePath).toLowerCase() === '.md') {
      blocks.push(...extractYamlBlocks(filePath, text))
      continue
    }
    blocks.push({
      path: filePath,
      startLine: 1,
      source: text,
      skipChecks: false,
    })
  }

  const [yamlDocuments, parseViolations] = parseYamlDocuments(blocks)
  const context = createScanContext({
    skillPath,
    referencesDir,
    scannedPaths: scanPaths,
    fileTexts,
    yamlDocuments,
  })
  return [context, parseViolations]
}
