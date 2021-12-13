import { CondOrTypeAssertion, Expr, ExprElement, ExprElementContent, ExprOrNever, ValueType } from '../../shared/ast'
import { Token } from '../../shared/parsed'
import { matchStr, matchUnion } from '../../shared/utils'
import { ensureCoverage, err, Scope, success, Typechecker, TypecheckerResult } from '../base'
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
  })

export const resolveCondOrTypeAssertionType: Typechecker<
  Token<CondOrTypeAssertion>,
  | { type: 'expr'; resolved: ValueType }
  | { type: 'assertion'; normalAssertionScope: Scope; oppositeAssertionScope: Scope; inverted: boolean }
> = (expr, ctx) => {
  switch (expr.parsed.type) {
    case 'expr': {
      const resolved = resolveExprType(expr.parsed.inner, {
        ...ctx,
        typeExpectation: { type: { type: 'bool' }, from: null },
      })

      return resolved.ok ? success({ type: 'expr', resolved: resolved.data }) : resolved
    }

    case 'assertion': {
      const subject = getTypedEntityInScope(expr.parsed.varname, 'var', ctx)
      if (!subject.ok) return subject

      const subjectType = subject.data.varType

      const assertionType: TypecheckerResult<{ normal: ValueType | null; inverted: ValueType | null }> = matchUnion(
        expr.parsed.minimum.parsed,
        'against',
        {
          null: () =>
            subjectType.type === 'nullable'
              ? success({ normal: null, inverted: subjectType.inner })
              : subjectType.type === 'unknown'
              ? success({ normal: null, inverted: null })
              : err(
                  expr.at,
                  `"null" type assertions are only allowed for nullable and \`unknown\` values, found \`${rebuildType(
                    subjectType,
                    true
                  )}\``
                ),

          ok: () => {
            if (subjectType.type !== 'failable') {
              return err(
                expr.at,
                `"ok" type assertions are only allowed for failable types, found \`${rebuildType(subjectType, true)}\``
              )
            }

            return success({ normal: subjectType.successType.parsed, inverted: subjectType.failureType.parsed })
          },

          err: () => {
            if (subjectType.type !== 'failable') {
              return err(
                expr.at,
                `"err" type assertions are only allowed for failable types, found \`${rebuildType(subjectType, true)}\``
              )
            }

            return success({ normal: subjectType.failureType.parsed, inverted: subjectType.successType.parsed })
          },

          custom: ({ type }) => {
            if (subjectType.type !== 'unknown') {
              return err(
                expr.at,
                `type assertions are only allowed for variables of type \`unknown\`, found \`${rebuildType(
                  subjectType,
                  true
                )}\``
              )
            }

            const validated = typeValidator(type.parsed, ctx)
            if (!validated.ok) return validated

            return success({ normal: type.parsed, inverted: null })
          },
        }
      )

      if (!assertionType.ok) return assertionType

      const normal = expr.parsed.inverted ? assertionType.data.inverted : assertionType.data.normal
      const opposite = expr.parsed.inverted ? assertionType.data.normal : assertionType.data.inverted

      return success({
        type: 'assertion',
        normalAssertionScope: normal
          ? new Map([[expr.parsed.varname.parsed, { type: 'var', at: expr.at, mutable: false, varType: normal }]])
          : new Map(),
        oppositeAssertionScope: opposite
          ? new Map([[expr.parsed.varname.parsed, { type: 'var', at: expr.at, mutable: false, varType: opposite }]])
          : new Map(),
        inverted: expr.parsed.inverted,
      })
    }

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
      const condType = resolveCondOrTypeAssertionType(cond, ctx)
      if (!condType.ok) return condType

      const thenType = resolveExprOrNeverType(
        then,
        condType.data.type === 'assertion'
          ? { ...ctx, scopes: ctx.scopes.concat([condType.data.normalAssertionScope]) }
          : ctx
      )

      if (!thenType.ok) return thenType

      for (const { cond, expr } of elif) {
        const condType = resolveCondOrTypeAssertionType(cond, ctx)
        if (!condType.ok) return condType

        const elifType = resolveExprOrNeverType(expr, {
          ...ctx,
          scopes:
            condType.data.type === 'assertion' ? ctx.scopes.concat([condType.data.normalAssertionScope]) : ctx.scopes,
          typeExpectation: { type: thenType.data, from: then.at },
        })

        if (!elifType.ok) return elifType
      }

      const elseType = resolveExprOrNeverType(els, {
        ...ctx,
        scopes:
          condType.data.type === 'assertion' ? ctx.scopes.concat([condType.data.oppositeAssertionScope]) : ctx.scopes,
        typeExpectation: { type: thenType.data, from: then.at },
      })

      if (!elseType.ok) return elseType

      return success(ctx.typeExpectation?.type ?? thenType.data)
    },

    value: ({ content }) => resolveValueType(content, ctx),

    // Internal
    synth: ({ inner }) => resolveExprType(inner, ctx),
  })
