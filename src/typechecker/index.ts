import { AST } from '../shared/ast'
import { ObjectsTypingMap } from '../shared/otm'
import { Token } from '../shared/parsed'
import { success, Typechecker } from './base'
import { programChecker } from './program'

export const langTypechecker: Typechecker<Token<AST>, ObjectsTypingMap> = (ast, ctx) => {
  const check = programChecker(ast.parsed, ctx)
  if (!check.ok) return check

  return success(ctx.objectsTypingMap)
}
