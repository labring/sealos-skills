/**
 * Context builder layer for consistency checks.
 */

import { buildContext } from './check-consistency-parser.ts'
import type { ScanContext, Violation } from './check-consistency-models.ts'

export class ContextBuilder {
  readonly skillPath: string
  readonly referencesDir: string
  readonly includePaths: readonly string[]

  constructor(options: {
    skillPath: string
    referencesDir: string
    includePaths: readonly string[]
  }) {
    this.skillPath = options.skillPath
    this.referencesDir = options.referencesDir
    this.includePaths = options.includePaths
  }

  build(): [ScanContext, Violation[]] {
    return buildContext(this.skillPath, this.referencesDir, this.includePaths)
  }
}
