import { Program } from '../shared/ast'
import { Token } from '../shared/parsed'
import { Typechecker } from './base'
import { statementChainChecker } from './statement'

export const programChecker: Typechecker<Token<Program>, void> = (program, ctx) =>
  statementChainChecker(program.parsed, ctx)
