import { Expr, ExprElement, SingleLogicOp, ValueType } from '../parsers/data'
import { ensureCoverage, err, success, Typechecker } from './base'
import { Scope } from './scope/complete'
import { valueType } from './value-type'

export type ScopedExprType = ValueType

export const resolveExprType: Typechecker<Expr, Scope[], ScopedExprType> = (expr, scopes) => {
  const from = resolveExprElementType(expr.parsed.from, scopes)
  if (!from.ok) return from

  for (const action of expr.parsed.sequence) {
    throw new Error('// TODO: Expr sequence')
  }

  return from
}

export const resolveExprElementType: Typechecker<ExprElement, Scope[], ScopedExprType> = (element, scopes) => {
  switch (element.parsed.type) {
    case 'assertion':
      throw new Error('// TODO: type assertions')

    case 'paren':
      return resolveExprType(element.parsed.inner, scopes)

    case 'singleOp':
      const rightType = resolveExprElementType(element.parsed.right, scopes)
      if (!rightType.ok) return rightType

      const opType = element.parsed.op.parsed.op.parsed

      switch (opType) {
        case SingleLogicOp.Not:
          if (rightType.data.nullable) return err('Cannot apply negative operator to nullable value', element.start)
          if (rightType.data.inner.type !== 'bool')
            return err(
              `Cannot apply negative operator on non-boolean values (found type category: ${rightType.data.inner.type})`,
              element.start
            )

          return success({ nullable: false, inner: { type: 'bool' } })

        default:
          return ensureCoverage(opType)
      }

    case 'ternary':
      // TODO: check that <cond> is a bool, check that all <then> / <elif> / <else> have the same value
      throw new Error('// TODO: ternary expressions')

    case 'try':
      // TODO: check that the <try> and <catch> body have the same type
      throw new Error('// TODO: inline try/catch expressions')

    case 'value':
      return valueType(element.parsed.content, scopes)
  }
}
