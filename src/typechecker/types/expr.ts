import { CodeSection, Expr, ExprElement, ExprElementContent, Token, ValueType } from '../../shared/parsed'
import { matchStr, matchUnion } from '../../shared/utils'
import { success, Typechecker } from '../base'
import { isTypeCompatible } from './compat'
import { resolveDoubleOpType } from './double-op'
import { resolvePropAccessType } from './propaccess'
import { resolveValueType } from './value'

export const resolveExprType: Typechecker<Token<Expr>, ValueType> = (expr, ctx) => {
  const fromType = resolveExprElementType(expr.parsed.from, ctx)
  if (!fromType.ok) return fromType

  let leftExprAt: CodeSection = expr.parsed.from.at
  let leftExprType = fromType.data

  for (const { parsed: op } of expr.parsed.doubleOps) {
    const newLeftExprType = resolveDoubleOpType({ leftExprAt, leftExprType, op }, ctx)
    if (!newLeftExprType.ok) return newLeftExprType

    leftExprAt = op.right.at
    leftExprType = newLeftExprType.data
  }

  return success(leftExprType)
}

export const resolveExprElementType: Typechecker<Token<ExprElement>, ValueType> = (element, ctx) => {
  if (element.parsed.propAccess.length === 0) {
    return resolveExprElementContentType(element.parsed.content, ctx)
  }

  const resolved = resolveExprElementContentType(element.parsed.content, { scopes: ctx.scopes, typeExpectation: null })
  if (!resolved.ok) return resolved

  const withPropAccesses = resolvePropAccessType(
    {
      leftAt: element.parsed.content.at,
      leftType: resolved.data,
      propAccesses: element.parsed.propAccess,
    },
    ctx
  )

  if (!withPropAccesses.ok) return withPropAccesses

  if (ctx.typeExpectation) {
    const compat = isTypeCompatible({ at: element.at, candidate: withPropAccesses.data }, ctx)
    if (!compat.ok) return compat
  }

  return success(withPropAccesses.data)
}

export const resolveExprElementContentType: Typechecker<Token<ExprElementContent>, ValueType> = (element, ctx) =>
  matchUnion(element.parsed, 'type', {
    paren: ({ inner }) => resolveExprType(inner, ctx),

    singleOp: ({ op, right }) =>
      matchStr(op.parsed.op.parsed, {
        Not: () =>
          resolveExprElementContentType(right, {
            ...ctx,
            typeExpectation: {
              type: { nullable: false, inner: { type: 'bool' } },
              from: null,
            },
          }),
      }),

    ternary: ({ cond, then, elif, els }) => {
      const condType = resolveExprType(cond, {
        scopes: ctx.scopes,
        typeExpectation: {
          type: { nullable: false, inner: { type: 'bool' } },
          from: null,
        },
      })

      if (!condType.ok) return condType

      const thenType = resolveExprType(then, ctx)
      if (!thenType.ok) return thenType

      for (const { cond, expr } of elif) {
        const condType = resolveExprType(cond, {
          scopes: ctx.scopes,
          typeExpectation: {
            type: { nullable: false, inner: { type: 'bool' } },
            from: then.at,
          },
        })

        if (!condType.ok) return condType

        const elifType = resolveExprType(expr, {
          scopes: ctx.scopes,
          typeExpectation: { type: thenType.data, from: then.at },
        })
        if (!elifType.ok) return elifType
      }

      const elseType = resolveExprType(els, {
        scopes: ctx.scopes,
        typeExpectation: { type: thenType.data, from: then.at },
      })
      if (!elseType.ok) return elseType

      return success(ctx.typeExpectation?.type ?? thenType.data)
    },

    try: () => {
      // TODO: check that the <try> and <catch> body have the same type
      throw new Error('// TODO: inline try/catch expressions')
    },

    assertion: () => {
      throw new Error('// TODO: type assertions')
    },

    value: ({ content }) => resolveValueType(content, ctx),

    // Internal
    rebuilt: ({ inner }) => resolveExprType(inner, ctx),
  })
