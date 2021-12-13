import { Program } from '../shared/ast'
import { Runner } from './base'
import { runBlock } from './block'

export const runProgram: Runner<Program> = (program, ctx) => runBlock(program, ctx)
