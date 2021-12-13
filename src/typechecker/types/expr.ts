import { formattableExtract } from '../../shared/errors'
import { CodeSection, Expr, ExprElement, Token, ValueType } from '../../shared/parsed'
import { matchStr, matchUnion } from '../../shared/utils'
import { err, success, Typechecker, TypecheckerResult } from '../base'
import { rebuildType } from './rebuilder'
import { resolveValueType } from './value'

export const resolveExprType: Typechecker<Token<Expr>, ValueType> = (expr, context) => {
  const from = resolveExprElementType(expr.parsed.from, context)
  if (!from.ok) return from

  let leftExpr: CodeSection = expr
  let leftExprType = from.data

  for (const { parsed: action } of expr.parsed.sequence) {
    switch (action.type) {
      case 'doubleOp':
        const op = action.op.parsed

        let checkRightOperandType: ValueType | null
        let producedType: ValueType | ((rightType: ValueType) => ValueType)

        switch (op.type) {
          case 'arith':
            switch (op.op.parsed) {
              case 'Add':
                if (
                  leftExprType.nullable ||
                  (leftExprType.inner.type !== 'number' && leftExprType.inner.type !== 'string')
                ) {
                  return errCannotApplyOperator(op.op, 'number | string', leftExprType, leftExpr)
                }

                checkRightOperandType = leftExprType
                producedType = leftExprType
                break

              case 'Sub':
              case 'Mul':
              case 'Div':
              case 'Rem':
                if (leftExprType.nullable || leftExprType.inner.type !== 'number') {
                  return errCannotApplyOperator(op.op, 'number', leftExprType, leftExpr)
                }

                checkRightOperandType = leftExprType
                producedType = leftExprType
                break

              case 'Null':
                if (!leftExprType.nullable) {
                  return err(
                    {
                      message: 'This operator can only be applied on nullable values',
                      also: [formattableExtract(leftExpr, 'This expression is not nullable')],
                    },
                    action.op
                  )
                }

                checkRightOperandType = null
                producedType = (rightExprType) => ({ nullable: true, inner: rightExprType.inner })
                break
            }

            break

          case 'logic':
            switch (op.op.parsed) {
              case 'And':
              case 'Or':
              case 'Xor':
              case 'Eq':
              case 'NotEq':
                if (leftExprType.nullable || leftExprType.inner.type !== 'bool') {
                  return errCannotApplyOperator(op.op, 'bool', leftExprType, leftExpr)
                }

                checkRightOperandType = leftExprType
                producedType = leftExprType
                break

              case 'GreaterThan':
              case 'GreaterThanOrEqualTo':
              case 'LessThan':
              case 'LessThanOrEqualTo':
                if (leftExprType.nullable || leftExprType.inner.type !== 'number') {
                  return errCannotApplyOperator(op.op, 'number', leftExprType, leftExpr)
                }

                checkRightOperandType = leftExprType
                producedType = { nullable: false, inner: { type: 'bool' } }
                break
            }

            break
        }

        const rightExpr = action.right

        const rightExprType = resolveExprElementType(rightExpr, {
          scopes: context.scopes,
          expectedType: checkRightOperandType,
        })

        if (!rightExprType.ok) return rightExprType

        leftExpr = {
          start: leftExpr.start,
          end: rightExpr.end,
        }

        leftExprType = typeof producedType === 'function' ? producedType(rightExprType.data) : rightExprType.data

        break

      case 'propAccess':
        throw new Error('// TODO: property access')
    }
  }

  return from
}

export const resolveExprElementType: Typechecker<Token<ExprElement>, ValueType> = (element, ctx) =>
  matchUnion(element.parsed)<TypecheckerResult<ValueType>>('type', {
    paren: ({ inner }) => resolveExprType(inner, ctx),

    singleOp: ({ op, right }) =>
      matchStr(op.parsed.op.parsed)({
        Not: () =>
          resolveExprElementType(right, { ...ctx, expectedType: { nullable: false, inner: { type: 'bool' } } }),
      }),

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

export const errCannotApplyOperator = (
  operator: Token<string>,
  expectedType: string,
  foundType: ValueType,
  leftExpr: CodeSection
) => {
  return err(
    {
      message: `cannot apply operator \`${operator.parsed}\` on type \`${rebuildType(foundType, true)}\``,
      complements: [
        ['Expected', expectedType],
        ['Found   ', rebuildType(foundType)],
      ],
    },
    leftExpr
  )
}
