import { Executor, success } from '../lib/engine/exec'
import { Program } from '../parsers/data'

// Global architecture: each file corresponds to a section of the AST and has its own:
// * Executor
// * Context (if any)
// * Output type
// * Error type

export type ProgramError = void

export const programExec: Executor<Program, void, void, ProgramError> = (input, context) => {
  console.log('TODO!')
  return success(void 0)
}
