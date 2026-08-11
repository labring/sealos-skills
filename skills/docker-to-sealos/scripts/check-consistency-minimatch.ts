/**
 * Minimal shell-glob matcher compatible with Python fnmatch.fnmatch for rule scopes.
 */

export function minimatch(name: string, pattern: string): boolean {
  // Translate fnmatch pattern to RegExp, same spirit as Python fnmatch.translate
  let regex = ''
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === '*') {
      regex += '.*'
    } else if (ch === '?') {
      regex += '.'
    } else if (ch === '[') {
      let j = i + 1
      if (j < pattern.length && pattern[j] === '!') j++
      if (j < pattern.length && pattern[j] === ']') j++
      while (j < pattern.length && pattern[j] !== ']') j++
      if (j >= pattern.length) {
        regex += '\\['
      } else {
        let stuff = pattern.slice(i + 1, j).replace(/\\/g, '\\\\')
        if (stuff[0] === '!') stuff = `^${stuff.slice(1)}`
        else if (stuff[0] === '^') stuff = `\\${stuff}`
        regex += `[${stuff}]`
        i = j
      }
    } else {
      regex += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^(?:${regex})$`).test(name)
}
