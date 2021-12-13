import { Program } from '../shared/ast'
import { Token } from '../shared/parsed'
import { Typechecker } from './base'
import { statementChainChecker, StatementChainMetadata } from './statement'

export const programChecker: Typechecker<Token<Program>, StatementChainMetadata> = (program, ctx) =>
  statementChainChecker(program.parsed, ctx)
