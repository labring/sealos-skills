/**
 * Rules registry loading and validation.
 */

import fs from 'node:fs'
import { parse as parseYaml } from 'yaml'
import {
  ALLOWED_SEVERITIES,
  DEFAULT_SEVERITY,
  type RegistryConfig,
  type RegistryRuleConfig,
} from './check-consistency-models.ts'

function parseGlobalIncludePaths(data: Record<string, unknown>): string[] {
  let includePaths: string[] = []
  const scope = data.scope
  if (scope != null && typeof scope === 'object' && !Array.isArray(scope)) {
    const include = (scope as Record<string, unknown>).include
    if (include != null) {
      if (!Array.isArray(include) || !include.every((x) => typeof x === 'string')) {
        throw new Error('scope.include must be a list of strings')
      }
      includePaths = [...include]
    }
  }
  return includePaths
}

function parseRuleScope(ruleEntry: Record<string, unknown>): string[] {
  const scope = ruleEntry.scope
  if (scope == null) return []
  if (typeof scope !== 'object' || Array.isArray(scope)) {
    throw new Error(`rule scope must be an object: ${JSON.stringify(ruleEntry)}`)
  }
  const includePaths = (scope as Record<string, unknown>).include_paths
  if (includePaths == null) return []
  if (!Array.isArray(includePaths) || !includePaths.every((x) => typeof x === 'string')) {
    throw new Error(
      `rule scope.include_paths must be a list of strings: ${JSON.stringify(ruleEntry)}`,
    )
  }
  return [...includePaths]
}

function parseRuleConfig(item: Record<string, unknown>): RegistryRuleConfig {
  const ruleId = item.id
  const description = item.description
  if (typeof ruleId !== 'string' || typeof description !== 'string') {
    throw new Error(`invalid rule entry in registry: ${JSON.stringify(item)}`)
  }

  const severity = item.severity ?? DEFAULT_SEVERITY
  if (typeof severity !== 'string' || !ALLOWED_SEVERITIES.has(severity)) {
    const allowed = [...ALLOWED_SEVERITIES].sort().join(', ')
    throw new Error(`invalid severity for ${ruleId}: ${JSON.stringify(severity)} (allowed: ${allowed})`)
  }

  return {
    ruleId,
    description,
    severity,
    includePaths: parseRuleScope(item),
  }
}

export function loadRegistryConfig(registryPath: string): RegistryConfig {
  const data = parseYaml(fs.readFileSync(registryPath, 'utf8'))
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`invalid rules registry format: ${registryPath}`)
  }

  const rules = (data as Record<string, unknown>).rules
  if (!Array.isArray(rules)) {
    throw new Error(`invalid rules list in registry: ${registryPath}`)
  }

  const orderedRuleIds: string[] = []
  const parsedRules: Record<string, RegistryRuleConfig> = {}
  for (const item of rules) {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`invalid rule entry in registry: ${JSON.stringify(item)}`)
    }
    const parsedRule = parseRuleConfig(item as Record<string, unknown>)
    if (parsedRules[parsedRule.ruleId]) {
      throw new Error(`duplicate rule id in registry: ${parsedRule.ruleId}`)
    }
    orderedRuleIds.push(parsedRule.ruleId)
    parsedRules[parsedRule.ruleId] = parsedRule
  }

  return {
    includePaths: parseGlobalIncludePaths(data as Record<string, unknown>),
    rules: parsedRules,
    orderedRuleIds,
  }
}

export function validateRegistry(
  registryPath: string,
  implementedRuleIds: Iterable<string>,
): RegistryConfig {
  const config = loadRegistryConfig(registryPath)
  const registryIds = new Set(config.orderedRuleIds)
  const implementedIds = new Set(implementedRuleIds)

  const missingImpl = [...registryIds].filter((id) => !implementedIds.has(id)).sort()
  const missingRegistry = [...implementedIds].filter((id) => !registryIds.has(id)).sort()

  if (missingImpl.length > 0 || missingRegistry.length > 0) {
    const parts: string[] = []
    if (missingImpl.length > 0) {
      parts.push(`rules declared but not implemented: ${missingImpl.join(', ')}`)
    }
    if (missingRegistry.length > 0) {
      parts.push(`rules implemented but not declared: ${missingRegistry.join(', ')}`)
    }
    throw new Error(parts.join('; '))
  }

  return config
}
