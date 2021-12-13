import { Program, Token } from '../shared/parsed'
import { TypecheckerResult } from './base'
import { statementChainChecker } from './statement'

export const typecheckProgram = (program: Token<Program>): TypecheckerResult<void> =>
  statementChainChecker(program.parsed, {
    scopes: [],
    expectedType: null,
  })
