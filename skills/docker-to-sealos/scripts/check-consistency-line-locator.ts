/**
 * Line-location helper with lightweight key indexing.
 */

const SIMPLE_KEY_LINE_PATTERN = /^\s*([A-Za-z0-9_.\-/]+)\s*:/
const SIMPLE_KEY_REGEX_PATTERN = /^\^\\s\*([A-Za-z0-9_.\\\-/]+)\\s\*:\$?$/
const ESCAPED_CHAR_PATTERN = /\\(.)/g

function unescapeRegexLiteral(value: string): string {
  return value.replace(ESCAPED_CHAR_PATTERN, '$1')
}

function extractSimpleKey(pattern: string): string | null {
  const match = pattern.match(SIMPLE_KEY_REGEX_PATTERN)
  if (!match || match[0] !== pattern) return null
  return unescapeRegexLiteral(match[1])
}

function buildKeyIndex(lines: readonly string[], startLine: number): Map<string, number> {
  const index = new Map<string, number>()
  for (let offset = 0; offset < lines.length; offset++) {
    const match = SIMPLE_KEY_LINE_PATTERN.exec(lines[offset])
    if (!match) continue
    const key = match[1]
    if (!index.has(key)) {
      index.set(key, startLine + offset)
    }
  }
  return index
}

export class LineLocator {
  readonly startLine: number
  readonly lines: readonly string[]
  private readonly keyIndex: Map<string, number>
  private readonly patternCache = new Map<string, number | null>()

  constructor(startLine: number, lines: readonly string[]) {
    this.startLine = startLine
    this.lines = lines
    this.keyIndex = buildKeyIndex(lines, startLine)
  }

  find(pattern: string, defaultLine: number | null = null): number {
    if (this.patternCache.has(pattern)) {
      const cached = this.patternCache.get(pattern)
      return cached != null ? cached : this.defaultLine(defaultLine)
    }

    const key = extractSimpleKey(pattern)
    if (key != null && this.keyIndex.has(key)) {
      const line = this.keyIndex.get(key)!
      this.patternCache.set(pattern, line)
      return line
    }

    const regex = new RegExp(pattern)
    for (let offset = 0; offset < this.lines.length; offset++) {
      if (regex.test(this.lines[offset])) {
        const found = this.startLine + offset
        this.patternCache.set(pattern, found)
        return found
      }
    }

    this.patternCache.set(pattern, null)
    return this.defaultLine(defaultLine)
  }

  private defaultLine(defaultLine: number | null): number {
    if (defaultLine != null) return defaultLine
    return this.startLine
  }
}
