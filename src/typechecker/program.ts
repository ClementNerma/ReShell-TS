import { Program } from '../parsers/data'
import { Executor, success } from './types'

// Global architecture: each file corresponds to a section of the AST and has its own:
// * Executor
// * Context (if any)
// * Output type
// * Error type

export type ProgramError = void

export const programChecker: Executor<Program, void, void, ProgramError> = (input, context) => {
  console.log('TODO!')
  return success(void 0)
}
