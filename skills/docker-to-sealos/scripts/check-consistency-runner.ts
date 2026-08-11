/**
 * Orchestrates registry-aware consistency checks.
 */

import { ContextBuilder } from './check-consistency-context.ts'
import { RuleEngine } from './check-consistency-engine.ts'
import type { Violation } from './check-consistency-models.ts'
import { validateRegistry } from './check-consistency-registry.ts'
import { REGISTERED_RULES } from './check-consistency-rule-registry.ts'
import path from 'node:path'

export function runChecks(options: {
  skillPath: string
  referencesDir: string
  registryPath: string
  onlyRules?: readonly string[] | null
  additionalIncludePaths?: readonly string[] | null
}): Violation[] {
  const config = validateRegistry(options.registryPath, Object.keys(REGISTERED_RULES))
  const includePaths = [...config.includePaths]
  if (options.additionalIncludePaths) {
    includePaths.push(...options.additionalIncludePaths)
  }

  const builder = new ContextBuilder({
    skillPath: options.skillPath,
    referencesDir: options.referencesDir,
    includePaths,
  })
  const [context, parseViolations] = builder.build()

  const engine = new RuleEngine({
    config,
    registeredRules: REGISTERED_RULES,
    skillRoot: path.dirname(options.skillPath),
  })
  const selectedRules = engine.resolveRules(options.onlyRules)
  return engine.run({
    context,
    parseViolations,
    selectedRules,
  })
}
