import { Program } from '../shared/ast'
import { Token } from '../shared/parsed'
import { Typechecker } from './base'
import { blockChecker, StatementChainMetadata } from './block'

export const programChecker: Typechecker<Token<Program>, StatementChainMetadata> = (program, ctx) =>
  blockChecker(program.parsed, ctx)
