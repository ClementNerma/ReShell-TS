import { Program } from '../parsers/data'
import { success, Typechecker } from './base'
import { completeScope } from './scope/complete'
import { scopeFirstPass } from './scope/first-pass'

// Global architecture: each file corresponds to a section of the AST and has its own:
// * Typechecker
// * Context (if any)
// * Output type
// * Error type

export const programChecker: Typechecker<Program, void, void> = (input) => {
  const fp = scopeFirstPass(input.parsed)
  if (!fp.ok) return fp

  const cp = completeScope(input.parsed, fp.data)
  if (!cp.ok) return cp

  return success(void 0)
}
