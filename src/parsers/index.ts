import { AST } from '../shared/ast'
import { Parser } from './lib/base'
import { program } from './program'

export const langParser: Parser<AST> = program
