import { AST } from '../shared/ast'
import { Token } from '../shared/parsed'
import { PrecompData } from '../shared/precomp'
import { success, Typechecker } from './base'
import { programChecker } from './program'

export type TypecheckerOutput = PrecompData

export const langTypechecker: Typechecker<Token<AST>, TypecheckerOutput> = (ast, ctx) => {
  const check = programChecker(ast.parsed, ctx)
  if (!check.ok) return check

  return success({ typeAliases: ctx.typeAliases, callbackTypes: ctx.callbackTypes, fnCalls: ctx.fnCalls })
}
