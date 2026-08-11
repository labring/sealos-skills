/**
 * Rule registry composition for consistency checks.
 */

import type { Rule } from './check-consistency-models.ts'
import { APP_RULES } from './check-consistency-rules-app.ts'
import { SECURITY_RULES } from './check-consistency-rules-security.ts'
import { STORAGE_RULES } from './check-consistency-rules-storage.ts'

function mergeRuleSets(...ruleSets: Array<Record<string, Rule>>): Record<string, Rule> {
  const merged: Record<string, Rule> = {}
  for (const ruleSet of ruleSets) {
    for (const [ruleId, rule] of Object.entries(ruleSet)) {
      if (merged[ruleId]) {
        throw new Error(`duplicate rule id: ${ruleId}`)
      }
      merged[ruleId] = rule
    }
  }
  return merged
}

export const REGISTERED_RULES: Record<string, Rule> = mergeRuleSets(
  APP_RULES,
  STORAGE_RULES,
  SECURITY_RULES,
)
