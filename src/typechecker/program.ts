import { Program } from '../parsers/data'
import { scopeFirstPass } from './scope'
import { success, Typechecker } from './types'

// Global architecture: each file corresponds to a section of the AST and has its own:
// * Typechecker
// * Context (if any)
// * Output type
// * Error type

export const programChecker: Typechecker<Program, void, void, string> = (input) => {
  const fp = scopeFirstPass(input.parsed)
  return fp.ok ? success(void 0) : fp
}
