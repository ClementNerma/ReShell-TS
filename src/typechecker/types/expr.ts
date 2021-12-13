import { matchUnion } from '../../parsers/utils'
import { Expr, ExprElement, SingleLogicOp, ValueType } from '../../shared/parsed'
import { ensureCoverage, err, success, Typechecker, TypecheckerResult } from '../base'
import { Scope } from '../scope/first-pass'
import { resolveValueType } from './value'

export type ExprTypeResolverContext = { scopes: Scope[]; expectedType: ValueType | null }

export const resolveExprType: Typechecker<Expr, ExprTypeResolverContext, ValueType> = (expr, context) => {
  const from = resolveExprElementType(expr.parsed.from, context)
  if (!from.ok) return from

  for (const action of expr.parsed.sequence) {
    throw new Error('// TODO: Expr sequence')
  }

  return from
}

export const resolveExprElementType: Typechecker<ExprElement, ExprTypeResolverContext, ValueType> = (element, ctx) =>
  matchUnion(element.parsed)<TypecheckerResult<ValueType>>('type', {
    paren: ({ inner }) => resolveExprType(inner, ctx),

    singleOp: ({ op, right }) => {
      const rightType = resolveExprElementType(right, ctx)
      if (!rightType.ok) return rightType

      const opType = op.parsed.op.parsed

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
    },

    ternary: () => {
      // TODO: check that <cond> is a bool, check that all <then> / <elif> / <else> have the same value
      throw new Error('// TODO: ternary expressions')
    },

    try: () => {
      // TODO: check that the <try> and <catch> body have the same type
      throw new Error('// TODO: inline try/catch expressions')
    },

    assertion: () => {
      throw new Error('// TODO: type assertions')
    },

    value: ({ content }) => resolveValueType(content, ctx),
  })

// if (!result.ok) return result
//
// if (!ctx.expectedType) {
//   return result.data.inner.type === 'implicit'
//     ? err(
//         {
//           message: 'Cannot determine the type of this expression',
//           complements: [
//             ['Tip', 'Using an empty ' + rebuildType(result.data, true) + ' requires an explicit type annotation'],
//           ],
//         },
//         element.start
//       )
//     : result
// }
//
// return result
