#!/usr/bin/env node
/**
 * Validate rendered Sealos Template resources against the target API server.
 *
 * The delivery Template remains untouched. This helper renders validation-only
 * scenarios into a private temporary directory, skips the Sealos Template
 * metadata document, and sends each runtime document through server-side dry-run.
 * Schema failures are repairable; sandbox authorization failures are warnings.
 */

import { spawnSync } from 'node:child_process'
import { createHash, randomInt } from 'node:crypto'
import {
  accessSync,
  chmodSync,
  closeSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

const EXPRESSION_RE = /\$\{\{\s*(.*?)\s*\}\}/g
const RANDOM_HEX_EXPRESSION_RE =
  /^random\((\d+)\)\.toLowerCase\(\)\.replace\(\/\[\^0-9a-f\]\/g,\s*(?:'a'|"a")\)$/
const DOCUMENT_SEPARATOR_RE = /^---[ \t]*(?:#.*)?(?:\r?\n)?$/
const DNS_LABEL_RE = /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/
const DNS_SUBDOMAIN_RE =
  /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?(?:\.[a-z0-9](?:[-a-z0-9]*[a-z0-9])?)*$/
const SENSITIVE_NAME_RE =
  /(?:password|passwd|secret|token|api[_-]?key|private[_-]?key|credential|auth)/i

class GateSetupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GateSetupError'
  }
}

class ExpressionError extends GateSetupError {
  constructor(message: string) {
    super(message)
    this.name = 'ExpressionError'
  }
}

type Token = {
  kind: string
  value: unknown
  position: number
}

type ConditionalFrame = {
  parentActive: boolean
  active: boolean
  matched: boolean
  sawElse: boolean
}

type RuntimeDocument = {
  scenario: number
  kind: string
  name: string
  content: string
  digest: string
}

type AstNode =
  | ['literal', unknown]
  | ['path', string[]]
  | ['call', string, AstNode[]]
  | ['unary', string, AstNode]
  | ['ternary', AstNode, AstNode, AstNode]
  | ['binary', string, AstNode, AstNode]

type CliArgs = {
  template: string
  namespace: string
  context: string
  serviceAccount: string
  cloudDomain: string
  certSecretName: string
  kubectl: string
  privateLog: string | null
  repairAuthorization: string | null
  maxScenarios: number
  timeout: number
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value)
}

function jsTruthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false) {
    return false
  }
  if (typeof value === 'number') {
    return value !== 0
  }
  if (typeof value === 'string') {
    return value !== ''
  }
  return true
}

function jsString(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  if (value === true) {
    return 'true'
  }
  if (value === false) {
    return 'false'
  }
  if (typeof value === 'number' && Number.isInteger(value)) {
    return String(value)
  }
  return String(value)
}

function strictEqual(left: unknown, right: unknown): boolean {
  if (typeof left === 'boolean' || typeof right === 'boolean') {
    return typeof left === 'boolean' && typeof right === 'boolean' && left === right
  }
  if (isNumber(left) && isNumber(right)) {
    return left === right
  }
  return typeof left === typeof right && left === right
}

function randomString(lengthValue: unknown): string {
  const length = Number(lengthValue)
  if (!Number.isInteger(length)) {
    throw new ExpressionError('random() length must be an integer')
  }
  if (length < 1 || length > 256) {
    throw new ExpressionError('random() length must be between 1 and 256')
  }
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let index = 0; index < length; index += 1) {
    result += alphabet[randomInt(alphabet.length)]
  }
  return result
}

function tokenize(expression: string): Token[] {
  const tokens: Token[] = []
  let index = 0
  const operators = ['===', '!==', '==', '!=', '<=', '>=', '&&', '||']
  const singleOperators = new Set('().,?:!+-*/%<>')

  while (index < expression.length) {
    const char = expression[index]
    if (/\s/.test(char)) {
      index += 1
      continue
    }

    if (char === "'" || char === '"') {
      const quote = char
      const start = index
      index += 1
      const value: string[] = []
      let closed = false
      while (index < expression.length) {
        const current = expression[index]
        if (current === quote) {
          index += 1
          closed = true
          break
        }
        if (current !== '\\') {
          value.push(current)
          index += 1
          continue
        }
        index += 1
        if (index >= expression.length) {
          throw new ExpressionError('unterminated escape in Template expression')
        }
        const escaped = expression[index]
        const escapes: Record<string, string> = {
          n: '\n',
          r: '\r',
          t: '\t',
          b: '\b',
          f: '\f',
          '\\': '\\',
          "'": "'",
          '"': '"',
          '/': '/',
        }
        if (escaped === 'u') {
          const codepoint = expression.slice(index + 1, index + 5)
          if (codepoint.length !== 4 || !/^[0-9A-Fa-f]{4}$/.test(codepoint)) {
            throw new ExpressionError(
              'invalid unicode escape in Template expression',
            )
          }
          value.push(String.fromCharCode(Number.parseInt(codepoint, 16)))
          index += 5
          continue
        }
        value.push(escapes[escaped] ?? escaped)
        index += 1
      }
      if (!closed) {
        throw new ExpressionError('unterminated string in Template expression')
      }
      tokens.push({ kind: 'STRING', value: value.join(''), position: start })
      continue
    }

    if (/\d/.test(char)) {
      const start = index
      index += 1
      while (index < expression.length && /\d/.test(expression[index])) {
        index += 1
      }
      if (index < expression.length && expression[index] === '.') {
        index += 1
        while (index < expression.length && /\d/.test(expression[index])) {
          index += 1
        }
      }
      const raw = expression.slice(start, index)
      tokens.push({
        kind: 'NUMBER',
        value: raw.includes('.') ? Number(raw) : Number.parseInt(raw, 10),
        position: start,
      })
      continue
    }

    if (/[A-Za-z_$]/.test(char)) {
      const start = index
      index += 1
      while (index < expression.length) {
        const current = expression[index]
        if (!/[A-Za-z0-9_$]/.test(current)) {
          break
        }
        index += 1
      }
      tokens.push({
        kind: 'IDENT',
        value: expression.slice(start, index),
        position: start,
      })
      continue
    }

    const matched = operators.find((operator) =>
      expression.startsWith(operator, index),
    )
    if (matched) {
      tokens.push({ kind: 'OP', value: matched, position: index })
      index += matched.length
      continue
    }
    if (singleOperators.has(char)) {
      tokens.push({ kind: 'OP', value: char, position: index })
      index += 1
      continue
    }
    throw new ExpressionError(
      `unsupported token at position ${index} in Template expression`,
    )
  }

  tokens.push({ kind: 'EOF', value: null, position: expression.length })
  return tokens
}

class ExpressionParser {
  expression: string
  tokens: Token[]
  index: number

  constructor(expression: string) {
    this.expression = expression
    this.tokens = tokenize(expression)
    this.index = 0
  }

  current(): Token {
    return this.tokens[this.index]
  }

  accept(value: string): boolean {
    if (this.current().value !== value) {
      return false
    }
    this.index += 1
    return true
  }

  expect(value: string): void {
    if (!this.accept(value)) {
      throw new ExpressionError(
        `expected ${JSON.stringify(value)} at position ${this.current().position} in Template expression`,
      )
    }
  }

  parse(): AstNode {
    const node = this.parseTernary()
    if (this.current().kind !== 'EOF') {
      throw new ExpressionError(
        `unexpected token at position ${this.current().position} in Template expression`,
      )
    }
    return node
  }

  parseTernary(): AstNode {
    const condition = this.parseOr()
    if (!this.accept('?')) {
      return condition
    }
    const whenTrue = this.parseTernary()
    this.expect(':')
    const whenFalse = this.parseTernary()
    return ['ternary', condition, whenTrue, whenFalse]
  }

  parseOr(): AstNode {
    let node = this.parseAnd()
    while (this.accept('||')) {
      node = ['binary', '||', node, this.parseAnd()]
    }
    return node
  }

  parseAnd(): AstNode {
    let node = this.parseEquality()
    while (this.accept('&&')) {
      node = ['binary', '&&', node, this.parseEquality()]
    }
    return node
  }

  parseEquality(): AstNode {
    let node = this.parseRelational()
    while (['===', '!==', '==', '!='].includes(String(this.current().value))) {
      const operator = String(this.current().value)
      this.index += 1
      node = ['binary', operator, node, this.parseRelational()]
    }
    return node
  }

  parseRelational(): AstNode {
    let node = this.parseAdditive()
    while (['<', '<=', '>', '>='].includes(String(this.current().value))) {
      const operator = String(this.current().value)
      this.index += 1
      node = ['binary', operator, node, this.parseAdditive()]
    }
    return node
  }

  parseAdditive(): AstNode {
    let node = this.parseMultiplicative()
    while (['+', '-'].includes(String(this.current().value))) {
      const operator = String(this.current().value)
      this.index += 1
      node = ['binary', operator, node, this.parseMultiplicative()]
    }
    return node
  }

  parseMultiplicative(): AstNode {
    let node = this.parseUnary()
    while (['*', '/', '%'].includes(String(this.current().value))) {
      const operator = String(this.current().value)
      this.index += 1
      node = ['binary', operator, node, this.parseUnary()]
    }
    return node
  }

  parseUnary(): AstNode {
    if (['!', '+', '-'].includes(String(this.current().value))) {
      const operator = String(this.current().value)
      this.index += 1
      return ['unary', operator, this.parseUnary()]
    }
    return this.parsePrimary()
  }

  parsePrimary(): AstNode {
    const token = this.current()
    if (token.kind === 'STRING' || token.kind === 'NUMBER') {
      this.index += 1
      return ['literal', token.value]
    }
    if (token.kind === 'IDENT') {
      this.index += 1
      const identifier = String(token.value)
      if (['true', 'false', 'null', 'undefined'].includes(identifier)) {
        const values: Record<string, unknown> = {
          true: true,
          false: false,
          null: null,
          undefined: null,
        }
        return ['literal', values[identifier]]
      }
      if (this.accept('(')) {
        const argumentsList: AstNode[] = []
        if (!this.accept(')')) {
          for (;;) {
            argumentsList.push(this.parseTernary())
            if (this.accept(')')) {
              break
            }
            this.expect(',')
          }
        }
        return ['call', identifier, argumentsList]
      }
      const pathParts = [identifier]
      while (this.accept('.')) {
        const member = this.current()
        if (member.kind !== 'IDENT') {
          throw new ExpressionError(
            `expected member name at position ${member.position}`,
          )
        }
        pathParts.push(String(member.value))
        this.index += 1
      }
      return ['path', pathParts]
    }
    if (this.accept('(')) {
      const node = this.parseTernary()
      this.expect(')')
      return node
    }
    throw new ExpressionError(
      `expected expression value at position ${token.position}`,
    )
  }
}

function evaluateAst(node: AstNode, resolver: ValueResolver): unknown {
  const kind = node[0]
  if (kind === 'literal') {
    return node[1]
  }
  if (kind === 'path') {
    return resolver.lookup(node[1])
  }
  if (kind === 'call') {
    const name = node[1]
    const argumentsList = node[2].map((argument) => evaluateAst(argument, resolver))
    if (name === 'random' && argumentsList.length === 1) {
      return randomString(argumentsList[0])
    }
    if (name === 'base64' && argumentsList.length === 1) {
      return Buffer.from(jsString(argumentsList[0]), 'utf8').toString('base64')
    }
    throw new ExpressionError(
      `unsupported Template function ${JSON.stringify(name)}; only random() and base64() are allowed`,
    )
  }
  if (kind === 'unary') {
    const operator = node[1]
    const value = evaluateAst(node[2], resolver)
    if (operator === '!') {
      return !jsTruthy(value)
    }
    if (operator === '+') {
      return Number(value)
    }
    if (operator === '-') {
      return -Number(value)
    }
  }
  if (kind === 'ternary') {
    const branch = jsTruthy(evaluateAst(node[1], resolver)) ? node[2] : node[3]
    return evaluateAst(branch, resolver)
  }
  if (kind === 'binary') {
    const operator = node[1]
    const left = evaluateAst(node[2], resolver)
    if (operator === '&&') {
      return jsTruthy(left) ? evaluateAst(node[3], resolver) : left
    }
    if (operator === '||') {
      return jsTruthy(left) ? left : evaluateAst(node[3], resolver)
    }
    const right = evaluateAst(node[3], resolver)
    if (operator === '===' || operator === '==') {
      return strictEqual(left, right)
    }
    if (operator === '!==' || operator === '!=') {
      return !strictEqual(left, right)
    }
    if (operator === '+') {
      if (typeof left === 'string' || typeof right === 'string') {
        return jsString(left) + jsString(right)
      }
      return Number(left) + Number(right)
    }
    if (operator === '-') {
      return Number(left) - Number(right)
    }
    if (operator === '*') {
      return Number(left) * Number(right)
    }
    if (operator === '/') {
      return Number(left) / Number(right)
    }
    if (operator === '%') {
      return Number(left) % Number(right)
    }
    if (operator === '<') {
      return (left as number | string) < (right as number | string)
    }
    if (operator === '<=') {
      return (left as number | string) <= (right as number | string)
    }
    if (operator === '>') {
      return (left as number | string) > (right as number | string)
    }
    if (operator === '>=') {
      return (left as number | string) >= (right as number | string)
    }
  }
  throw new ExpressionError('unsupported Template expression operation')
}

function parseExpression(expression: string): AstNode {
  return new ExpressionParser(expression).parse()
}

function evaluateExpression(expression: string, resolver: ValueResolver): unknown {
  try {
    const randomHex = RANDOM_HEX_EXPRESSION_RE.exec(expression.trim())
    if (randomHex && randomHex[0] === expression.trim()) {
      return randomString(randomHex[1])
        .toLowerCase()
        .replace(/[^0-9a-f]/g, 'a')
    }
    return evaluateAst(parseExpression(expression), resolver)
  } catch (error) {
    if (error instanceof GateSetupError) {
      throw error
    }
    throw new ExpressionError('Template expression evaluation failed')
  }
}

function scalarText(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (value === true) {
    return 'true'
  }
  if (value === false) {
    return 'false'
  }
  if (value === null || value === undefined) {
    return 'null'
  }
  if (typeof value === 'number') {
    return String(value)
  }
  return JSON.stringify(value)
}

function quoteContext(text: string, position: number): string | null {
  let quote: string | null = null
  let index = 0
  while (index < position) {
    const char = text[index]
    if (quote === '"') {
      if (char === '\\') {
        index += 2
        continue
      }
      if (char === '"') {
        quote = null
      }
    } else if (quote === "'") {
      if (char === "'" && index + 1 < position && text[index + 1] === "'") {
        index += 2
        continue
      }
      if (char === "'") {
        quote = null
      }
    } else if (char === "'" || char === '"') {
      quote = char
    }
    index += 1
  }
  return quote
}

function expressionIsEntireScalar(line: string, start: number, end: number): boolean {
  const prefix = line.slice(0, start)
  const suffix = line.slice(end)
  if (suffix.trim()) {
    return false
  }
  const strippedPrefix = prefix.replace(/\s+$/, '')
  if (!strippedPrefix) {
    return true
  }
  if (strippedPrefix.endsWith(':')) {
    return true
  }
  return /^\s*-\s*$/.test(prefix)
}

function renderInline(text: string, resolver: ValueResolver): unknown {
  const matches = [...text.matchAll(EXPRESSION_RE)]
  if (matches.length === 0) {
    return text
  }
  if (
    matches.length === 1 &&
    matches[0].index === 0 &&
    matches[0][0].length === text.length
  ) {
    return evaluateExpression(matches[0][1], resolver)
  }

  const pieces: string[] = []
  let cursor = 0
  for (const match of matches) {
    const start = match.index ?? 0
    pieces.push(text.slice(cursor, start))
    pieces.push(jsString(evaluateExpression(match[1], resolver)))
    cursor = start + match[0].length
  }
  pieces.push(text.slice(cursor))
  return pieces.join('')
}

class ValueResolver {
  raw: { defaults: Record<string, unknown>; inputs: Record<string, unknown> }
  systems: Record<string, string>
  cache: Map<string, unknown>
  resolving: Set<string>

  constructor(
    rawDefaults: Record<string, unknown>,
    rawInputs: Record<string, unknown>,
    systems: Record<string, string>,
  ) {
    this.raw = {
      defaults: { ...rawDefaults },
      inputs: { ...rawInputs },
    }
    this.systems = { ...systems }
    this.cache = new Map()
    this.resolving = new Set()
  }

  lookup(pathParts: string[]): unknown {
    if (pathParts.length === 1 && pathParts[0] in this.systems) {
      return this.systems[pathParts[0]]
    }
    if (pathParts.length < 2 || !(pathParts[0] in this.raw)) {
      throw new ExpressionError(
        `unknown Template variable ${pathParts.join('.')}`,
      )
    }
    let value: unknown = this.resolveRoot(pathParts[0], pathParts[1])
    for (const member of pathParts.slice(2)) {
      if (!isMapping(value) || !(member in value)) {
        throw new ExpressionError(
          `unknown Template variable ${pathParts.join('.')}`,
        )
      }
      value = value[member]
    }
    return value
  }

  resolveRoot(namespace: string, key: string): unknown {
    const cacheKey = `${namespace}\0${key}`
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)
    }
    const root = this.raw[namespace as 'defaults' | 'inputs']
    if (!(key in root)) {
      throw new ExpressionError(`unknown Template variable ${namespace}.${key}`)
    }
    if (this.resolving.has(cacheKey)) {
      throw new ExpressionError(`cyclic Template variable ${namespace}.${key}`)
    }
    this.resolving.add(cacheKey)
    const rawValue = root[key]
    const value =
      typeof rawValue === 'string' ? renderInline(rawValue, this) : rawValue
    this.resolving.delete(cacheKey)
    this.cache.set(cacheKey, value)
    return value
  }
}

function parseControlLine(
  line: string,
): [string, string | null] | null {
  const stripped = line.trim()
  if (!(stripped.startsWith('${{') && stripped.endsWith('}}'))) {
    return null
  }
  const inner = stripped.slice(3, -2).trim()
  for (const name of ['if', 'elif'] as const) {
    const prefix = `${name}(`
    if (inner.startsWith(prefix) && inner.endsWith(')')) {
      return [name, inner.slice(prefix.length, -1).trim()]
    }
  }
  if (inner === 'else()') {
    return ['else', null]
  }
  if (inner === 'endif()') {
    return ['endif', null]
  }
  return null
}

function renderLine(line: string, resolver: ValueResolver): string {
  const matches = [...line.matchAll(EXPRESSION_RE)]
  if (matches.length === 0) {
    return line
  }
  const pieces: string[] = []
  let cursor = 0
  for (const match of matches) {
    const start = match.index ?? 0
    const end = start + match[0].length
    pieces.push(line.slice(cursor, start))
    const value = evaluateExpression(match[1], resolver)
    const context = quoteContext(line, start)
    let replacement: string
    if (
      matches.length === 1 &&
      context === null &&
      expressionIsEntireScalar(line, start, end)
    ) {
      replacement = scalarText(value)
    } else if (context === '"') {
      replacement = JSON.stringify(jsString(value)).slice(1, -1)
    } else if (context === "'") {
      replacement = jsString(value).replaceAll("'", "''")
    } else {
      replacement = jsString(value)
    }
    pieces.push(replacement)
    cursor = end
  }
  pieces.push(line.slice(cursor))
  return pieces.join('')
}

function splitLinesKeepEnds(source: string): string[] {
  if (source.length === 0) {
    return []
  }
  const lines: string[] = []
  let start = 0
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (char === '\r') {
      if (index + 1 < source.length && source[index + 1] === '\n') {
        lines.push(source.slice(start, index + 2))
        start = index + 2
        index += 1
      } else {
        lines.push(source.slice(start, index + 1))
        start = index + 1
      }
    } else if (char === '\n') {
      lines.push(source.slice(start, index + 1))
      start = index + 1
    }
  }
  if (start < source.length) {
    lines.push(source.slice(start))
  }
  return lines
}

function splitLines(source: string): string[] {
  if (source.length === 0) {
    return []
  }
  return source.split(/\r\n|\n|\r/)
}

function lstrip(text: string): string {
  return text.replace(/^\s+/, '')
}

function renderTemplate(source: string, resolver: ValueResolver): string {
  const output: string[] = []
  const stack: ConditionalFrame[] = []
  const lines = splitLinesKeepEnds(source)

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const line = lines[lineNumber]
    const control = parseControlLine(line)
    if (control) {
      const [operation, expression] = control
      if (operation === 'if') {
        const parentActive = stack.every((frame) => frame.active)
        const condition = jsTruthy(
          evaluateExpression(expression ?? '', resolver),
        )
        stack.push({
          parentActive,
          active: parentActive && condition,
          matched: condition,
          sawElse: false,
        })
      } else if (operation === 'elif') {
        if (stack.length === 0) {
          throw new GateSetupError(
            `elif() without if() on Template line ${lineNumber + 1}`,
          )
        }
        const frame = stack[stack.length - 1]
        if (frame.sawElse) {
          throw new GateSetupError(
            `elif() after else() on Template line ${lineNumber + 1}`,
          )
        }
        const condition = jsTruthy(
          evaluateExpression(expression ?? '', resolver),
        )
        frame.active = frame.parentActive && !frame.matched && condition
        frame.matched = frame.matched || condition
      } else if (operation === 'else') {
        if (stack.length === 0) {
          throw new GateSetupError(
            `else() without if() on Template line ${lineNumber + 1}`,
          )
        }
        const frame = stack[stack.length - 1]
        if (frame.sawElse) {
          throw new GateSetupError(
            `duplicate else() on Template line ${lineNumber + 1}`,
          )
        }
        frame.active = frame.parentActive && !frame.matched
        frame.matched = true
        frame.sawElse = true
      } else if (operation === 'endif') {
        if (stack.length === 0) {
          throw new GateSetupError(
            `endif() without if() on Template line ${lineNumber + 1}`,
          )
        }
        stack.pop()
      }
      continue
    }

    if (stack.every((frame) => frame.active)) {
      output.push(lstrip(line).startsWith('#') ? line : renderLine(line, resolver))
    }
  }

  if (stack.length > 0) {
    throw new GateSetupError('unterminated if() block in Template')
  }
  const rendered = output.join('')
  const unresolvedLines = splitLines(rendered).filter(
    (line) => !lstrip(line).startsWith('#') && line.includes('${{'),
  )
  if (unresolvedLines.length > 0) {
    throw new GateSetupError(
      'unresolved Template expression remains after rendering',
    )
  }
  return rendered
}

function firstYamlDocument(source: string): string {
  const parts: string[][] = [[]]
  for (const line of splitLinesKeepEnds(source)) {
    if (DOCUMENT_SEPARATOR_RE.test(line)) {
      parts.push([])
    } else {
      parts[parts.length - 1].push(line)
    }
  }
  for (const lines of parts) {
    const meaningful = lines.filter(
      (line) => line.trim() && !lstrip(line).startsWith('#'),
    )
    if (meaningful.length > 0) {
      return lines.join('')
    }
  }
  return ''
}

function extractTemplateContract(
  source: string,
): [Record<string, unknown>, Record<string, unknown>, string] {
  let document: unknown
  try {
    document = parseYaml(firstYamlDocument(source))
  } catch (error) {
    const name =
      error instanceof Error ? error.constructor.name : 'Error'
    throw new GateSetupError(
      `cannot parse the Sealos Template metadata document: ${name}`,
    )
  }
  if (!isMapping(document) || document.kind !== 'Template') {
    throw new GateSetupError('the first YAML document must be kind Template')
  }
  const spec = document.spec
  if (!isMapping(spec)) {
    throw new GateSetupError('Template spec must be an object')
  }
  const defaults = (spec.defaults as unknown) ?? {}
  const inputs = (spec.inputs as unknown) ?? {}
  if (!isMapping(defaults) || !isMapping(inputs)) {
    throw new GateSetupError(
      'Template spec.defaults and spec.inputs must be objects',
    )
  }
  const metadata = document.metadata
  const name = isMapping(metadata) ? metadata.name : undefined
  if (typeof name !== 'string' || !name) {
    throw new GateSetupError('Template metadata.name is required')
  }
  return [defaults, inputs, name]
}

function normalizeDnsLabel(
  value: string,
  fallback = 'validation-app',
): string {
  let normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
  normalized = (normalized || fallback).slice(0, 54).replace(/-+$/, '') || fallback
  return normalized
}

function validateTargetValue(
  label: string,
  value: string,
  subdomain = false,
): void {
  if (!value) {
    throw new GateSetupError(`${label} is required for target rendering`)
  }
  const pattern = subdomain ? DNS_SUBDOMAIN_RE : DNS_LABEL_RE
  const limit = subdomain ? 253 : 63
  if (value.length > limit || !pattern.test(value)) {
    throw new GateSetupError(`${label} is not a valid DNS value`)
  }
}

function defaultValue(spec: unknown): unknown {
  if (isMapping(spec)) {
    return spec.value
  }
  return spec
}

function inputDefault(spec: unknown): unknown {
  if (isMapping(spec) && 'default' in spec) {
    return spec.default
  }
  return null
}

function inputType(spec: unknown): string {
  if (isMapping(spec) && typeof spec.type === 'string') {
    return spec.type.toLowerCase()
  }
  return 'string'
}

function syntheticInput(name: string, spec: unknown): string {
  const lowered = name.toLowerCase()
  const kind = inputType(spec)
  if (kind === 'boolean') {
    return 'false'
  }
  if (kind === 'number' || kind === 'integer') {
    return '1'
  }
  if (lowered.includes('email')) {
    return 'validation@example.invalid'
  }
  if (lowered.includes('url') || lowered.includes('uri')) {
    return 'https://validation.example.invalid'
  }
  if (lowered.includes('domain') || lowered.includes('host')) {
    return 'validation.example.invalid'
  }
  if (lowered.includes('uuid')) {
    return '00000000-0000-4000-8000-000000000001'
  }
  if (lowered.includes('storage') || lowered.endsWith('_size')) {
    return '1Gi'
  }
  if (SENSITIVE_NAME_RE.test(name)) {
    return 'Validation9@SafeToken'
  }
  if (isMapping(spec)) {
    const options = spec.options
    if (Array.isArray(options)) {
      for (const option of options) {
        if (
          typeof option === 'string' ||
          typeof option === 'number' ||
          typeof option === 'boolean'
        ) {
          return jsString(option)
        }
      }
    }
  }
  return 'validation'
}

function isAstNode(value: unknown): value is AstNode {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === 'string'
  )
}

function* astInputPaths(node: AstNode): Generator<string> {
  if (node[0] === 'path' && node[1].length >= 2 && node[1][0] === 'inputs') {
    yield node[1][1]
  }
  for (const value of node.slice(1)) {
    if (isAstNode(value)) {
      yield* astInputPaths(value)
    } else if (Array.isArray(value)) {
      for (const child of value) {
        if (isAstNode(child)) {
          yield* astInputPaths(child)
        }
      }
    }
  }
}

function* astComparisonLiterals(
  node: AstNode,
): Generator<[string, unknown]> {
  if (
    node[0] === 'binary' &&
    ['===', '!==', '==', '!='].includes(node[1])
  ) {
    const left = node[2]
    const right = node[3]
    if (
      left[0] === 'path' &&
      left[1].length >= 2 &&
      left[1][0] === 'inputs' &&
      right[0] === 'literal'
    ) {
      yield [left[1][1], right[1]]
    }
    if (
      right[0] === 'path' &&
      right[1].length >= 2 &&
      right[1][0] === 'inputs' &&
      left[0] === 'literal'
    ) {
      yield [right[1][1], left[1]]
    }
  }
  for (const value of node.slice(1)) {
    if (isAstNode(value)) {
      yield* astComparisonLiterals(value)
    } else if (Array.isArray(value)) {
      for (const child of value) {
        if (isAstNode(child)) {
          yield* astComparisonLiterals(child)
        }
      }
    }
  }
}

function conditionalExpressions(source: string): string[] {
  const expressions: string[] = []
  for (const line of splitLines(source)) {
    const control = parseControlLine(line)
    if (control && (control[0] === 'if' || control[0] === 'elif') && control[1] !== null) {
      expressions.push(control[1])
    }
  }
  return expressions
}

function uniqueValues(values: Iterable<unknown>): unknown[] {
  const result: unknown[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const marker = stableJson(value)
    if (!seen.has(marker)) {
      seen.add(marker)
      result.push(value)
    }
  }
  return result
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, current) => {
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      const sorted: Record<string, unknown> = {}
      for (const key of Object.keys(current).sort()) {
        sorted[key] = (current as Record<string, unknown>)[key]
      }
      return sorted
    }
    if (
      typeof current === 'bigint' ||
      typeof current === 'function' ||
      typeof current === 'symbol' ||
      current === undefined
    ) {
      return String(current)
    }
    return current
  })
}

function cartesianProduct(arrays: unknown[][]): unknown[][] {
  return arrays.reduce<unknown[][]>(
    (acc, current) => acc.flatMap((prefix) => current.map((item) => [...prefix, item])),
    [[]],
  )
}

function buildInputScenarios(
  source: string,
  inputs: Record<string, unknown>,
  maxScenarios: number,
): Record<string, unknown>[] {
  const baseline: Record<string, unknown> = {}
  for (const [name, spec] of Object.entries(inputs)) {
    const key = String(name)
    const declared = inputDefault(spec)
    if (SENSITIVE_NAME_RE.test(key) || declared === null || declared === undefined) {
      baseline[key] = syntheticInput(key, spec)
    } else {
      baseline[key] = declared
    }
  }

  const candidates: Record<string, unknown[]> = {}
  const parsedConditions = conditionalExpressions(source).map((item) =>
    parseExpression(item),
  )
  const referenced = new Set<string>()
  const compared: Record<string, unknown[]> = {}
  for (const node of parsedConditions) {
    for (const key of astInputPaths(node)) {
      referenced.add(key)
    }
    for (const [key, value] of astComparisonLiterals(node)) {
      if (!compared[key]) {
        compared[key] = []
      }
      compared[key].push(value)
    }
  }

  for (const key of [...referenced].sort()) {
    if (!(key in inputs)) {
      throw new GateSetupError(
        `conditional expression references undeclared input ${key}`,
      )
    }
    const values: unknown[] = [baseline[key]]
    values.push(...(compared[key] ?? []))
    if (inputType(inputs[key]) === 'boolean') {
      values.push('false', 'true')
    } else {
      values.push('', syntheticInput(key, inputs[key]))
    }
    candidates[key] = uniqueValues(values)
  }

  if (Object.keys(candidates).length === 0) {
    return [baseline]
  }

  let scenarioCount = 1
  for (const values of Object.values(candidates)) {
    scenarioCount *= values.length
  }
  if (scenarioCount > maxScenarios) {
    throw new GateSetupError(
      `conditional input coverage requires ${scenarioCount} scenarios, above the safe limit ${maxScenarios}`,
    )
  }

  const keys = Object.keys(candidates)
  const scenarios: Record<string, unknown>[] = []
  for (const values of cartesianProduct(keys.map((key) => candidates[key]))) {
    const scenario = { ...baseline }
    keys.forEach((key, index) => {
      scenario[key] = values[index]
    })
    scenarios.push(scenario)
  }
  return scenarios
}

function splitRenderedDocuments(source: string): string[] {
  const documents: string[] = []
  let current: string[] = []
  for (const line of splitLinesKeepEnds(source)) {
    if (DOCUMENT_SEPARATOR_RE.test(line)) {
      if (current.join('').trim()) {
        documents.push(current.join(''))
      }
      current = []
    } else {
      current.push(line)
    }
  }
  if (current.join('').trim()) {
    documents.push(current.join(''))
  }
  return documents
}

function collectRuntimeDocuments(
  source: string,
  defaults: Record<string, unknown>,
  scenarios: Record<string, unknown>[],
  systems: Record<string, string>,
  templateName: string,
): RuntimeDocument[] {
  const base = normalizeDnsLabel(templateName).slice(0, 40).replace(/-+$/, '')
  let suffix = ''
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  for (let index = 0; index < 8; index += 1) {
    suffix += alphabet[randomInt(alphabet.length)]
  }
  const rawDefaults: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(defaults)) {
    rawDefaults[String(key)] = defaultValue(value)
  }
  rawDefaults.app_name = `${base}-${suffix}`
  rawDefaults.app_host = `${base}-${suffix}`

  const documents: RuntimeDocument[] = []
  const seen = new Set<string>()
  for (let scenarioIndex = 0; scenarioIndex < scenarios.length; scenarioIndex += 1) {
    const scenario = scenarios[scenarioIndex]
    const resolver = new ValueResolver(rawDefaults, scenario, systems)
    const rendered = renderTemplate(source, resolver)
    for (let content of splitRenderedDocuments(rendered)) {
      let document: unknown
      try {
        document = parseYaml(content)
      } catch (error) {
        const name =
          error instanceof Error ? error.constructor.name : 'Error'
        throw new GateSetupError(
          `validation-only render is invalid YAML in scenario ${scenarioIndex + 1}: ${name}`,
        )
      }
      if (document === null || document === undefined) {
        continue
      }
      if (!isMapping(document)) {
        throw new GateSetupError('each rendered YAML document must be an object')
      }
      if (document.kind === 'Template') {
        continue
      }
      const apiVersion = document.apiVersion
      const kind = document.kind
      const metadata = document.metadata
      let name = isMapping(metadata) ? metadata.name : undefined
      const declaredNamespace = isMapping(metadata)
        ? metadata.namespace
        : undefined
      if (
        !(typeof apiVersion === 'string' && apiVersion) ||
        !(typeof kind === 'string' && kind)
      ) {
        throw new GateSetupError(
          'rendered runtime documents require apiVersion and kind',
        )
      }
      if (typeof name !== 'string' || !name) {
        if (kind === 'List') {
          name = 'rendered-list'
        } else {
          throw new GateSetupError(
            'rendered runtime documents require metadata.name',
          )
        }
      }
      if (
        declaredNamespace !== undefined &&
        declaredNamespace !== null &&
        declaredNamespace !== systems.SEALOS_NAMESPACE
      ) {
        throw new GateSetupError(
          'rendered runtime document targets a namespace outside the current sandbox',
        )
      }
      if (!content.endsWith('\n')) {
        content += '\n'
      }
      const digest = createHash('sha256').update(content, 'utf8').digest('hex')
      if (seen.has(digest)) {
        continue
      }
      seen.add(digest)
      documents.push({
        scenario: scenarioIndex + 1,
        kind: String(kind),
        name: String(name),
        content,
        digest,
      })
    }
  }
  if (documents.length === 0) {
    throw new GateSetupError('Template produced no runtime documents')
  }
  return documents
}

function privateWrite(filePath: string, content: string): void {
  const descriptor = openSync(filePath, 'w', 0o600)
  try {
    writeSync(descriptor, content, undefined, 'utf8')
  } finally {
    closeSync(descriptor)
    if (existsSync(filePath)) {
      chmodSync(filePath, 0o600)
    }
  }
}

function writeSchemaRepairAuthorization(
  filePath: string | null,
  templateDigest: string,
  failures: Record<string, unknown>[],
): void {
  if (filePath === null) {
    return
  }
  const repairs = failures
    .filter(
      (failure) =>
        failure.category === 'schema' &&
        failure.repairable === true &&
        Array.isArray(failure.field_paths) &&
        failure.field_paths.length > 0,
    )
    .map((failure) => ({
      category: 'schema',
      repairable: true,
      kind: failure.kind,
      name: failure.name,
      field_paths: [
        ...new Set(
          (failure.field_paths as unknown[])
            .filter((fieldPath): fieldPath is string => typeof fieldPath === 'string' && Boolean(fieldPath))
            .map(String),
        ),
      ].sort(),
    }))
  if (repairs.length === 0) {
    return
  }

  let sourceDigest = templateDigest
  let existingRepairs: Record<string, unknown>[] = []
  if (existsSync(filePath)) {
    try {
      const existing = JSON.parse(readFileSync(filePath, 'utf8')) as unknown
      if (
        isMapping(existing) &&
        existing.version === '1.0' &&
        typeof existing.template_sha256 === 'string' &&
        Array.isArray(existing.repairs)
      ) {
        sourceDigest = String(existing.template_sha256)
        existingRepairs = existing.repairs.filter((repair): repair is Record<string, unknown> =>
          isMapping(repair),
        )
      }
    } catch {
      // Ignore unreadable or invalid existing authorization files.
    }
  }

  const combined = new Map<string, Record<string, unknown>>()
  for (const repair of [...existingRepairs, ...repairs]) {
    const marker = JSON.stringify(repair, (_key, value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const sorted: Record<string, unknown> = {}
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
          sorted[key] = (value as Record<string, unknown>)[key]
        }
        return sorted
      }
      return value
    })
    combined.set(marker, repair)
  }
  const payload = {
    version: '1.0',
    template_sha256: sourceDigest,
    repairs: [...combined.keys()].sort().map((key) => combined.get(key)),
  }
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  privateWrite(filePath, `${JSON.stringify(payload, null, 2)}\n`)
}

function appendPrivateLog(filePath: string | null, content: string): void {
  if (filePath === null) {
    return
  }
  const descriptor = openSync(filePath, 'a', 0o600)
  try {
    writeSync(descriptor, content.endsWith('\n') ? content : `${content}\n`, undefined, 'utf8')
  } finally {
    closeSync(descriptor)
    chmodSync(filePath, 0o600)
  }
}

function warningCategories(stderr: string): string[] {
  const categories = new Set<string>()
  for (const line of splitLines(stderr)) {
    if (!line.replace(/^\s+/, '').toLowerCase().startsWith('warning')) {
      continue
    }
    const lowered = line.toLowerCase()
    if (lowered.includes('podsecurity') || lowered.includes('pod security')) {
      categories.add('pod-security')
    } else if (lowered.includes('deprecated')) {
      categories.add('deprecated-api')
    } else {
      categories.add('server-warning')
    }
  }
  return [...categories].sort()
}

function classifyFailure(
  stderr: string,
): [string, string[], string] {
  const lowered = stderr.toLowerCase()
  const fieldPaths = [
    ...new Set(
      [...stderr.matchAll(/unknown field ["']([^"']+)["']/gi)].map(
        (match) => match[1],
      ),
    ),
  ].sort()
  if (
    fieldPaths.length > 0 ||
    lowered.includes('strict decoding error') ||
    lowered.includes('validationerror')
  ) {
    return ['schema', fieldPaths, 'target API schema rejected the document']
  }
  if (
    lowered.includes('no matches for kind') ||
    lowered.includes('the server could not find the requested resource')
  ) {
    return ['api-capability', [], 'required API or CRD is unavailable']
  }
  if (
    lowered.includes('admission webhook') ||
    lowered.includes('denied the request')
  ) {
    return ['admission', [], 'target admission policy rejected the document']
  }
  if (
    lowered.includes('forbidden') ||
    lowered.includes('unauthorized') ||
    /\b(?:bind|escalate)\b/.test(lowered)
  ) {
    return ['authorization', [], 'target identity is not authorized for dry-run']
  }
  if (
    lowered.includes('unable to connect') ||
    lowered.includes('connection refused') ||
    lowered.includes('i/o timeout') ||
    lowered.includes('context deadline exceeded')
  ) {
    return ['cluster', [], 'target API server is unavailable']
  }
  return ['server', [], 'target API server rejected the document']
}

function runServerDryRun(
  documents: RuntimeDocument[],
  kubectl: string,
  context: string,
  namespace: string,
  privateLog: string | null,
  timeout: number,
): [Record<string, unknown>[], Record<string, unknown>[]] {
  const warnings: Record<string, unknown>[] = []
  const failures: Record<string, unknown>[] = []
  const temporary = mkdtempSync(path.join(tmpdir(), 'sealos-server-dry-run-'))
  chmodSync(temporary, 0o700)
  try {
    for (let index = 0; index < documents.length; index += 1) {
      const document = documents[index]
      const safeKind = normalizeDnsLabel(document.kind, 'resource')
      const safeName = normalizeDnsLabel(document.name, 'resource')
      const filePath = path.join(
        temporary,
        `${String(index).padStart(3, '0')}-${safeKind}-${safeName}.yaml`,
      )
      privateWrite(filePath, document.content)
      const command = [
        kubectl,
        '--context',
        context,
        'apply',
        '--dry-run=server',
        '--validate=strict',
        '-o',
        'name',
        '-n',
        namespace,
        '-f',
        filePath,
      ]
      const result = spawnSync(command[0], command.slice(1), {
        encoding: 'utf8',
        timeout: timeout * 1000,
      })
      if (result.error && (result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
        appendPrivateLog(
          privateLog,
          `[server-dry-run] scenario=${document.scenario} ${document.kind}/${document.name} timed out`,
        )
        failures.push({
          scenario: document.scenario,
          kind: document.kind,
          name: document.name,
          category: 'cluster',
          field_paths: [],
          detail: 'target API server dry-run timed out',
          repairable: false,
        })
        continue
      }
      const stderr = result.stderr ?? ''
      const documentWarnings = warningCategories(stderr)
      for (const category of documentWarnings) {
        warnings.push({
          scenario: document.scenario,
          kind: document.kind,
          name: document.name,
          category,
        })
      }
      if ((result.status ?? 1) !== 0) {
        const [category, paths, detail] = classifyFailure(stderr)
        if (category === 'authorization') {
          warnings.push({
            scenario: document.scenario,
            kind: document.kind,
            name: document.name,
            category,
            detail,
            repairable: false,
          })
          appendPrivateLog(
            privateLog,
            `[server-dry-run] scenario=${document.scenario} ${document.kind}/${document.name} status=warning category=authorization warnings=${documentWarnings.join(',') || 'none'}`,
          )
          continue
        }
        appendPrivateLog(
          privateLog,
          `[server-dry-run] scenario=${document.scenario} ${document.kind}/${document.name} status=failed category=${category} field_paths=${paths.join(',') || 'none'} warnings=${documentWarnings.join(',') || 'none'}`,
        )
        failures.push({
          scenario: document.scenario,
          kind: document.kind,
          name: document.name,
          category,
          field_paths: paths,
          detail,
          repairable: category === 'schema',
        })
      } else {
        appendPrivateLog(
          privateLog,
          `[server-dry-run] scenario=${document.scenario} ${document.kind}/${document.name} status=passed warnings=${documentWarnings.join(',') || 'none'}`,
        )
      }
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
  return [warnings, failures]
}

function readTemplate(filePath: string): [string, string] {
  try {
    const content = readFileSync(filePath, 'utf8')
    return [
      content,
      createHash('sha256').update(content, 'utf8').digest('hex'),
    ]
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    throw new GateSetupError(
      `cannot read Template: ${err.strerror ?? err.message}`,
    )
  }
}

function resolveExecutable(command: string): string | null {
  try {
    if (command.includes('/') || command.includes('\\') || path.isAbsolute(command)) {
      accessSync(command, constants.X_OK)
      return command
    }
  } catch {
    if (command.includes('/') || command.includes('\\') || path.isAbsolute(command)) {
      return null
    }
  }
  const pathEnv = process.env.PATH ?? ''
  for (const directory of pathEnv.split(path.delimiter)) {
    if (!directory) {
      continue
    }
    const candidate = path.join(directory, command)
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // Keep searching PATH.
    }
  }
  return null
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    template: '',
    namespace: '',
    context: '',
    serviceAccount: '',
    cloudDomain: '',
    certSecretName: '',
    kubectl: 'kubectl',
    privateLog: null,
    repairAuthorization: null,
    maxScenarios: 64,
    timeout: 60,
  }
  const required = new Set([
    '--template',
    '--namespace',
    '--context',
    '--service-account',
    '--cloud-domain',
    '--cert-secret-name',
  ])
  const seen = new Set<string>()
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = argv[index + 1]
    const take = (): string => {
      if (value === undefined || value.startsWith('--')) {
        throw new GateSetupError(`missing value for ${flag}`)
      }
      index += 1
      return value
    }
    switch (flag) {
      case '--template':
        args.template = take()
        seen.add(flag)
        break
      case '--namespace':
        args.namespace = take()
        seen.add(flag)
        break
      case '--context':
        args.context = take()
        seen.add(flag)
        break
      case '--service-account':
        args.serviceAccount = take()
        seen.add(flag)
        break
      case '--cloud-domain':
        args.cloudDomain = take()
        seen.add(flag)
        break
      case '--cert-secret-name':
        args.certSecretName = take()
        seen.add(flag)
        break
      case '--kubectl':
        args.kubectl = take()
        break
      case '--private-log':
        args.privateLog = take()
        break
      case '--repair-authorization':
        args.repairAuthorization = take()
        break
      case '--max-scenarios':
        args.maxScenarios = Number.parseInt(take(), 10)
        break
      case '--timeout':
        args.timeout = Number.parseInt(take(), 10)
        break
      default:
        throw new GateSetupError(`unrecognized argument: ${flag}`)
    }
  }
  for (const flag of required) {
    if (!seen.has(flag)) {
      throw new GateSetupError(`the following arguments are required: ${flag}`)
    }
  }
  return args
}

function main(argv: string[] = process.argv.slice(2)): number {
  const args = parseArgs(argv)
  const result: Record<string, unknown> = {
    version: '1.0',
    status: 'setup-error',
    template_sha256: null,
    context: args.context,
    namespace: args.namespace,
    scenarios: 0,
    documents_checked: 0,
    warnings: [],
    failures: [],
  }
  try {
    if (Number.isNaN(args.maxScenarios) || args.maxScenarios < 1) {
      throw new GateSetupError('--max-scenarios must be positive')
    }
    if (Number.isNaN(args.timeout) || args.timeout < 1) {
      throw new GateSetupError('--timeout must be positive')
    }
    validateTargetValue('namespace', args.namespace)
    validateTargetValue('service account', args.serviceAccount, true)
    validateTargetValue('certificate Secret name', args.certSecretName, true)
    validateTargetValue('cloud domain', args.cloudDomain, true)
    const kubectl = resolveExecutable(args.kubectl)
    if (kubectl === null) {
      throw new GateSetupError('kubectl is unavailable')
    }

    const [source, templateDigest] = readTemplate(args.template)
    result.template_sha256 = templateDigest
    const [defaults, inputs, templateName] = extractTemplateContract(source)
    const scenarios = buildInputScenarios(source, inputs, args.maxScenarios)
    const systems = {
      SEALOS_NAMESPACE: args.namespace,
      SEALOS_CLOUD_DOMAIN: args.cloudDomain,
      SEALOS_CERT_SECRET_NAME: args.certSecretName,
      SEALOS_SERVICE_ACCOUNT: args.serviceAccount,
    }
    const documents = collectRuntimeDocuments(
      source,
      defaults,
      scenarios,
      systems,
      templateName,
    )
    result.scenarios = scenarios.length
    result.documents_checked = documents.length
    const [warnings, failures] = runServerDryRun(
      documents,
      kubectl,
      args.context,
      args.namespace,
      args.privateLog,
      args.timeout,
    )
    writeSchemaRepairAuthorization(
      args.repairAuthorization,
      templateDigest,
      failures,
    )
    result.warnings = warnings
    result.failures = failures
    const [, finalDigest] = readTemplate(args.template)
    if (finalDigest !== templateDigest) {
      throw new GateSetupError(
        'delivery Template changed while server-side dry-run was running',
      )
    }
    result.status = failures.length > 0 ? 'failed' : 'passed'
    console.log(JSON.stringify(result, null, 2))
    return failures.length > 0 ? 1 : 0
  } catch (error) {
    if (error instanceof GateSetupError) {
      result.failures = [
        {
          category: 'setup',
          detail: error.message,
          field_paths: [],
          repairable: false,
        },
      ]
      console.log(JSON.stringify(result, null, 2))
      return 2
    }
    throw error
  }
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])

if (isDirectRun) {
  try {
    process.exitCode = main()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(
      JSON.stringify(
        {
          version: '1.0',
          status: 'setup-error',
          template_sha256: null,
          context: null,
          namespace: null,
          scenarios: 0,
          documents_checked: 0,
          warnings: [],
          failures: [
            {
              category: 'setup',
              detail: message,
              field_paths: [],
              repairable: false,
            },
          ],
        },
        null,
        2,
      ),
    )
    process.exitCode = 2
  }
}
