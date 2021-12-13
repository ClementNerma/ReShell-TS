import { AST } from '../shared/ast'
import { Token } from '../shared/parsed'
import { success, Typechecker, TypecheckerContext } from './base'
import { programChecker } from './program'

export type TypecheckerOutput = Pick<TypecheckerContext, 'typeAliases' | 'callbackTypes'>

export const langTypechecker: Typechecker<Token<AST>, TypecheckerOutput> = (ast, ctx) => {
  const check = programChecker(ast.parsed, ctx)
  if (!check.ok) return check

  return success({ typeAliases: ctx.typeAliases, callbackTypes: ctx.callbackTypes })
}
