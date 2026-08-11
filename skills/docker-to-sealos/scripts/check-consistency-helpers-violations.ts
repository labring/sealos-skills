/**
 * Violation construction helpers for consistency rules.
 */

import type { ScanContext, Violation, YamlDocument } from './check-consistency-models.ts'
import { findLine } from './check-consistency-parser.ts'
import { isManagedAppWorkloadDocument } from './check-consistency-helpers-workload.ts'

export function addDocViolation(
  violations: Violation[],
  options: {
    ruleId: string
    doc: YamlDocument
    pattern: string
    message: string
    defaultPattern?: string | null
  },
): void {
  const defaultLine =
    options.defaultPattern != null ? findLine(options.doc, options.defaultPattern) : null
  const line = findLine(options.doc, options.pattern, defaultLine)
  violations.push({
    ruleId: options.ruleId,
    path: options.doc.path,
    line,
    message: options.message,
  })
}

export function checkManagedWorkloadSetting(
  context: ScanContext,
  options: {
    ruleId: string
    valueExtractor: (data: Record<string, unknown>) => unknown
    expected: unknown
    valuePattern: string
    fallbackPattern: string
    missingMessage: string
    mismatchMessage: string
  },
): Violation[] {
  const violations: Violation[] = []
  for (const doc of context.yamlDocuments) {
    if (doc.skipChecks || !isManagedAppWorkloadDocument(doc)) continue
    if (doc.data == null || typeof doc.data !== 'object' || Array.isArray(doc.data)) continue

    const value = options.valueExtractor(doc.data as Record<string, unknown>)
    if (value === options.expected) continue

    addDocViolation(violations, {
      ruleId: options.ruleId,
      doc,
      pattern: options.valuePattern,
      defaultPattern: options.fallbackPattern,
      message: value != null ? options.mismatchMessage : options.missingMessage,
    })
  }
  return violations
}
