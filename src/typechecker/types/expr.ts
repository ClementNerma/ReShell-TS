import { Expr, ExprElement, ExprElementContent, ExprOrNever, ExprOrTypeAssertion, ValueType } from '../../shared/ast'
import { Token } from '../../shared/parsed'
import { matchStr, matchUnion } from '../../shared/utils'
import { ensureCoverage, err, Scope, success, Typechecker, TypecheckerContext } from '../base'
import { getTypedEntityInScope } from '../scope/search'
import { isTypeCompatible } from './compat'
import { resolveDoubleOpSequenceType } from './double-op'
import { resolvePropAccessType } from './propaccess'
import { rebuildType } from './rebuilder'
import { typeValidator } from './validator'
import { resolveValueType } from './value'

export const resolveExprType: Typechecker<Token<Expr>, ValueType> = (expr, ctx) => {
  const fromType = resolveExprElementType(expr.parsed.from, {
    ...ctx,
    // Required to prevent "2 + 4 == 8" from creating an expectation for "2" to be a "bool"
    typeExpectation: expr.parsed.doubleOps.length > 0 ? null : ctx.typeExpectation,
  })

  if (!fromType.ok) return fromType

  return resolveDoubleOpSequenceType(
    {
      baseElement: expr.parsed.from,
      baseElementType: fromType.data,
      seq: expr.parsed.doubleOps,
    },
    ctx
  )
}

export const resolveExprOrNeverType: Typechecker<Token<ExprOrNever>, ValueType> = (exprOrNever, ctx) =>
  matchUnion(exprOrNever.parsed, 'type', {
    expr: ({ content }) => resolveExprType(content, ctx),

    panic: () =>
      ctx.typeExpectation
        ? success(ctx.typeExpectation.type)
        : err(exprOrNever.at, 'cannot determine the type of this expression'),

    return: ({ expr }) => {
      if (!ctx.fnExpectation) {
        return err(exprOrNever.at, 'cannot return a value outside of a function')
      }

      if (!ctx.typeExpectation) {
        return err(exprOrNever.at, 'cannot determine the type of this expression')
      }

      if (!ctx.fnExpectation.returnType) {
        return expr ? err(expr.at, 'unexpected value (no return value expected)') : success(ctx.typeExpectation.type)
      }

      if (!expr) {
        return err(exprOrNever.at, 'missing return value')
      }

      const check = resolveExprType(expr, { ...ctx, typeExpectation: ctx.fnExpectation.returnType })
      return check.ok ? success(ctx.typeExpectation.type) : check
    },

    throw: ({ expr }) => {
      if (!ctx.fnExpectation) {
        return err(exprOrNever.at, 'cannot throw a value outside of a function')
      }

      if (!ctx.typeExpectation) {
        return err(exprOrNever.at, 'cannot determine the type of this expression')
      }

      if (!ctx.fnExpectation.failureType) {
        return expr ? err(expr.at, 'unexpected value (no return value expected)') : success(ctx.typeExpectation.type)
      }

      if (!expr) {
        return err(exprOrNever.at, 'missing return value')
      }

      const check = resolveExprType(expr, { ...ctx, typeExpectation: ctx.fnExpectation.failureType })
      return check.ok ? success(ctx.typeExpectation.type) : check
    },
  })

export const resolveExprOrTypeAssertionType: Typechecker<
  Token<ExprOrTypeAssertion>,
  { type: 'expr'; resolved: ValueType } | { type: 'assertion'; assertionScope: Scope; inverted: boolean }
> = (expr, ctx) => {
  switch (expr.parsed.type) {
    case 'expr':
      const resolved = resolveExprType(expr.parsed.inner, ctx)
      return resolved.ok ? success({ type: 'expr', resolved: resolved.data }) : resolved

    case 'assertion':
    case 'invertedAssertion':
      const subject = getTypedEntityInScope(expr.parsed.varname, 'var', ctx)
      if (!subject.ok) return subject

      const subjectType = subject.data.varType

      let assertionType: ValueType

      if (expr.parsed.minimum) {
        if (subjectType.type !== 'unknown') {
          return err(
            expr.at,
            `type assertions are only allowed for variables of type \`unknown\`, found \`${rebuildType(
              subjectType,
              true
            )}\``
          )
        }

        const validated = typeValidator(expr.parsed.minimum.parsed, ctx)
        if (!validated.ok) return validated

        assertionType = expr.parsed.minimum.parsed
      } else {
        if (subjectType.type !== 'nullable') {
          return err(
            expr.at,
            `"not null" type assertion only works for nullable values, but found \`${rebuildType(subjectType, true)}\``
          )
        }

        assertionType = subjectType.inner
      }

      const assertionScope: Scope = new Map([
        [
          expr.parsed.varname.parsed,
          {
            type: 'var',
            at: expr.at,
            mutable: subject.data.mutable,
            varType: assertionType,
          },
        ],
      ])

      return success({ type: 'assertion', assertionScope, inverted: expr.parsed.type === 'invertedAssertion' })

    default:
      return ensureCoverage(expr.parsed)
  }
}

export const resolveExprElementType: Typechecker<Token<ExprElement>, ValueType> = (element, ctx) => {
  if (element.parsed.propAccess.length === 0) {
    return resolveExprElementContentType(element.parsed.content, ctx)
  }

  const resolved = resolveExprElementContentType(element.parsed.content, { ...ctx, typeExpectation: null })
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
    const compat = isTypeCompatible(
      { at: element.at, candidate: withPropAccesses.data, typeExpectation: ctx.typeExpectation },
      ctx
    )
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
            typeExpectation: { type: { type: 'bool' }, from: null },
          }),
      }),

    ternary: ({ cond, then, elif, els }) => {
      const condType = resolveExprOrTypeAssertionType(cond, {
        ...ctx,
        typeExpectation: { type: { type: 'bool' }, from: null },
      })

      if (!condType.ok) return condType

      const thenType = resolveExprOrNeverType(
        then,
        condType.data.type === 'assertion' ? { ...ctx, scopes: ctx.scopes.concat([condType.data.assertionScope]) } : ctx
      )

      if (!thenType.ok) return thenType

      for (const { cond, expr } of elif) {
        const condType = resolveExprOrTypeAssertionType(cond, {
          ...ctx,
          typeExpectation: { type: { type: 'bool' }, from: then.at },
        })

        if (!condType.ok) return condType

        const elifType = resolveExprOrNeverType(expr, {
          ...ctx,
          scopes: condType.data.type === 'assertion' ? ctx.scopes.concat([condType.data.assertionScope]) : ctx.scopes,
          typeExpectation: { type: thenType.data, from: then.at },
        })

        if (!elifType.ok) return elifType
      }

      const elseType = resolveExprOrNeverType(els, {
        ...ctx,
        typeExpectation: { type: thenType.data, from: then.at },
      })

      if (!elseType.ok) return elseType

      return success(ctx.typeExpectation?.type ?? thenType.data)
    },

    try: ({ trying, catchVarname, catchExpr }) => {
      const wrapper: TypecheckerContext['expectedFailureWriter'] = { ref: null }

      const tryingType = resolveExprType(trying, { ...ctx, expectedFailureWriter: wrapper })
      if (!tryingType.ok) return tryingType

      if (wrapper.ref === null) {
        return err(catchVarname.at, {
          message: "failed to determine the catch clause's variable type",
          complements: [['tip', "you must use a failable function call inside the try's body"]],
        })
      }

      return resolveExprOrNeverType(catchExpr, {
        ...ctx,
        scopes: ctx.scopes.concat([
          new Map([
            [catchVarname.parsed, { type: 'var', at: catchVarname.at, mutable: false, varType: wrapper.ref.content }],
          ]),
        ]),
        typeExpectation: {
          from: trying.at,
          type: tryingType.data,
        },
      })
    },

    value: ({ content }) => resolveValueType(content, ctx),

    // Internal
    synth: ({ inner }) => resolveExprType(inner, ctx),
  })
