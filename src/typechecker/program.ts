import { Program } from '../shared/ast'
import { Typechecker } from './base'
import { blockChecker, StatementChainMetadata } from './block'

export const programChecker: Typechecker<Program, StatementChainMetadata> = (program, ctx) => blockChecker(program, ctx)
