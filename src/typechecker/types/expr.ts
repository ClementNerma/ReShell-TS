import { CodeSection, Expr, ExprElement, ExprElementContent, Token, ValueType } from '../../shared/parsed'
import { matchStr, matchUnion } from '../../shared/utils'
import { ensureCoverage, err, success, Typechecker } from '../base'
import { isTypeCompatible } from './compat'
import { resolveDoubleOpType } from './double-op'
import { rebuildType } from './rebuilder'
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

  let previousIterType = resolved.data
  let upToPrevPropAccessSection: CodeSection = element.at

  for (const propAccess of element.parsed.propAccess) {
    switch (propAccess.parsed.access.type) {
      case 'refIndex':
        if (previousIterType.inner.type !== 'list') {
          return err(upToPrevPropAccessSection, {
            message: `expected list due to index access, found \`${rebuildType(previousIterType, true)}\``,
            complements: [
              ['Expected', 'list'],
              ['Found   ', rebuildType(previousIterType)],
            ],
            also: [{ at: propAccess.at, message: 'expectation caused by this access' }],
          })
        }

        if (previousIterType.nullable && !propAccess.parsed.nullable) {
          return err(upToPrevPropAccessSection, {
            message: 'cannot access index of a nullable list',
            complements: [['Tip', 'You can use nullable indexes with `?[index]`']],
            also: [{ at: propAccess.at, message: 'expectation caused by this access' }],
          })
        }

        previousIterType = { ...previousIterType.inner.itemsType, nullable: propAccess.parsed.nullable }
        break

      case 'refStructMember':
        if (previousIterType.inner.type !== 'struct') {
          return err(upToPrevPropAccessSection, {
            message: `expected struct due to member access, found \`${rebuildType(previousIterType, true)}\``,
            complements: [
              ['Expected', 'struct'],
              ['Found   ', rebuildType(previousIterType)],
            ],
            also: [{ at: propAccess.at, message: 'expectation caused by this access' }],
          })
        }

        if (previousIterType.nullable && !propAccess.parsed.nullable) {
          return err(upToPrevPropAccessSection, {
            message: 'cannot access member of a nullable struct',
            complements: [['Tip', 'You can use nullable indexes with `?.member`']],
          })
        }

        const memberName = propAccess.parsed.access.member.parsed
        const resolvedMember = previousIterType.inner.members.find(({ name }) => name === memberName)

        if (!resolvedMember) {
          return err(upToPrevPropAccessSection, {
            message: `member \`${memberName}\` is missing`,
            also: [{ at: propAccess.at, message: 'expectation caused by this access' }],
          })
        }

        previousIterType = { ...resolvedMember.type, nullable: propAccess.parsed.nullable }
        break

      default:
        return ensureCoverage(propAccess.parsed.access)
    }

    upToPrevPropAccessSection = { start: upToPrevPropAccessSection.start, next: propAccess.at.next }
  }

  if (ctx.typeExpectation) {
    const compat = isTypeCompatible({ at: upToPrevPropAccessSection, candidate: previousIterType }, ctx)
    if (!compat.ok) return compat
  }

  return success(previousIterType)
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
  })
