import { Expr, ExprElement, SingleLogicOp, Token, ValueType } from '../../shared/parsed'
import { matchUnion } from '../../shared/utils'
import { ensureCoverage, err, success, Typechecker, TypecheckerResult } from '../base'
import { resolveValueType } from './value'

export const resolveExprType: Typechecker<Token<Expr>, ValueType> = (expr, context) => {
  const from = resolveExprElementType(expr.parsed.from, context)
  if (!from.ok) return from

  for (const action of expr.parsed.sequence) {
    throw new Error('// TODO: Expr sequence')
  }

  return from
}

export const resolveExprElementType: Typechecker<Token<ExprElement>, ValueType> = (element, ctx) =>
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

    ternary: ({ cond, then, elif, els }) => {
      const condType = resolveExprType(cond, {
        scopes: ctx.scopes,
        expectedType: { nullable: false, inner: { type: 'bool' } },
      })

      if (!condType.ok) return condType

      const thenType = resolveExprType(then, ctx)
      if (!thenType.ok) return thenType

      for (const { cond, expr } of elif) {
        const condType = resolveExprType(cond, {
          scopes: ctx.scopes,
          expectedType: { nullable: false, inner: { type: 'bool' } },
        })

        if (!condType.ok) return condType

        const elifType = resolveExprType(expr, { scopes: ctx.scopes, expectedType: thenType.data })
        if (!elifType.ok) return elifType
      }

      const elseType = resolveExprType(els, { scopes: ctx.scopes, expectedType: thenType.data })
      if (!elseType.ok) return elseType

      return success(ctx.expectedType ?? thenType.data)
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
