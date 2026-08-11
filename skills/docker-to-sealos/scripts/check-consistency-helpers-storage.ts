/**
 * Storage-oriented helper utilities for consistency rules.
 */

import { STORAGE_UNIT_TO_BYTES } from './check-consistency-models.ts'

export function containsKey(node: unknown, key: string): boolean {
  if (node != null && typeof node === 'object' && !Array.isArray(node)) {
    const obj = node as Record<string, unknown>
    if (Object.prototype.hasOwnProperty.call(obj, key)) return true
    return Object.values(obj).some((value) => containsKey(value, key))
  }
  if (Array.isArray(node)) {
    return node.some((item) => containsKey(item, key))
  }
  return false
}

export function parseStorageBytes(rawValue: string): number | null {
  const text = rawValue.trim()
  const match = /^([0-9]+(?:\.[0-9]+)?)\s*([A-Za-z]*)$/.exec(text)
  if (!match) return null

  const number = Number.parseFloat(match[1])
  const unit = match[2].toLowerCase()
  const factor = STORAGE_UNIT_TO_BYTES[unit]
  if (factor == null) return null

  return Math.trunc(number * factor)
}

export function hasVariableExpression(rawValue: string): boolean {
  const text = rawValue.trim()
  return text.includes('${{') || /\$\([^)]+\)/.test(text)
}

export function* iterPvcStorageValues(data: unknown): Generator<string> {
  if (data != null && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>
    if (obj.kind === 'PersistentVolumeClaim') {
      const spec = obj.spec
      if (spec != null && typeof spec === 'object' && !Array.isArray(spec)) {
        const resources = (spec as Record<string, unknown>).resources
        if (resources != null && typeof resources === 'object' && !Array.isArray(resources)) {
          const requests = (resources as Record<string, unknown>).requests
          if (requests != null && typeof requests === 'object' && !Array.isArray(requests)) {
            const storage = (requests as Record<string, unknown>).storage
            if (storage != null) yield String(storage)
          }
        }
      }
    }

    for (const [key, value] of Object.entries(obj)) {
      if (key === 'volumeClaimTemplates' && Array.isArray(value)) {
        for (const item of value) {
          if (item == null || typeof item !== 'object' || Array.isArray(item)) continue
          const spec = (item as Record<string, unknown>).spec
          if (spec == null || typeof spec !== 'object' || Array.isArray(spec)) continue
          const resources = (spec as Record<string, unknown>).resources
          if (resources == null || typeof resources !== 'object' || Array.isArray(resources)) continue
          const requests = (resources as Record<string, unknown>).requests
          if (requests == null || typeof requests !== 'object' || Array.isArray(requests)) continue
          const storage = (requests as Record<string, unknown>).storage
          if (storage != null) yield String(storage)
        }
      } else {
        yield* iterPvcStorageValues(value)
      }
    }
  } else if (Array.isArray(data)) {
    for (const item of data) {
      yield* iterPvcStorageValues(item)
    }
  }
}
