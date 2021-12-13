import { Program } from '../parsers/data'
import { Typechecker } from './base'
import { statementChainChecker } from './statement'

// Global architecture: each file corresponds to a section of the AST and has its own:
// * Typechecker
// * Context (if any)
// * Output type
// * Error type

export const programChecker: Typechecker<Program, void, void> = (input) => statementChainChecker(input.parsed, [])
