import { Executor, success } from '../lib/engine/exec'
import { Program } from '../parsers/data'
import { ExecContext, ExecError, Executed } from './context'

export const programExec: Executor<Program, ExecError, Executed, ExecContext> = (input, context) => {
  console.log('TODO!')
  return success(void 0)
}
