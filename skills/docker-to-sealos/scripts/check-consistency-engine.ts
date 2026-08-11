/**
 * Rule-engine execution layer for consistency checks.
 */

import path from 'node:path'
import { minimatch } from './check-consistency-minimatch.ts'
import type {
  RegistryConfig,
  Rule,
  ScanContext,
  Violation,
} from './check-consistency-models.ts'

export class RuleEngine {
  readonly config: RegistryConfig
  readonly registeredRules: Record<string, Rule>
  readonly skillRoot: string

  constructor(options: {
    config: RegistryConfig
    registeredRules: Record<string, Rule>
    skillRoot: string
  }) {
    this.config = options.config
    this.registeredRules = { ...options.registeredRules }
    this.skillRoot = options.skillRoot
  }

  resolveRules(onlyRules: readonly string[] | null | undefined): string[] {
    const selectedRules = onlyRules ? [...onlyRules] : [...this.config.orderedRuleIds]
    const unknown = [...new Set(selectedRules)]
      .filter((id) => !(id in this.registeredRules))
      .sort()
    if (unknown.length > 0) {
      throw new Error(`unknown rule id(s): ${unknown.join(', ')}`)
    }
    return selectedRules
  }

  run(options: {
    context: ScanContext
    parseViolations: readonly Violation[]
    selectedRules: readonly string[]
  }): Violation[] {
    const violations: Violation[] = [...options.parseViolations]
    for (const ruleId of options.selectedRules) {
      const rule = this.registeredRules[ruleId]
      const defaultMeta = this.config.rules[ruleId]
      for (const item of rule.check(options.context)) {
        const meta = this.config.rules[item.ruleId] ?? defaultMeta
        if (!this.inRuleScope(item, meta.includePaths)) continue
        violations.push({ ...item, severity: meta.severity })
      }
    }

    violations.sort((a, b) => {
      const pathCmp = a.path.localeCompare(b.path)
      if (pathCmp !== 0) return pathCmp
      if (a.line !== b.line) return a.line - b.line
      const ruleCmp = a.ruleId.localeCompare(b.ruleId)
      if (ruleCmp !== 0) return ruleCmp
      return a.message.localeCompare(b.message)
    })
    return violations
  }

  private inRuleScope(violation: Violation, includePaths: readonly string[]): boolean {
    if (includePaths.length === 0) return true
    const relativePath = this.asRelativePath(violation.path)
    return includePaths.some((pattern) => minimatch(relativePath, pattern))
  }

  private asRelativePath(filePath: string): string {
    const resolved = path.resolve(filePath)
    const root = path.resolve(this.skillRoot)
    if (resolved === root || resolved.startsWith(root + path.sep)) {
      return path.relative(root, resolved).split(path.sep).join('/')
    }
    return filePath.split(path.sep).join('/')
  }
}
