import { Expr, ExprElement, ExprElementContent, ExprOrTypeAssertion, Token, ValueType } from '../../shared/parsed'
import { matchStr, matchUnion } from '../../shared/utils'
import { ensureCoverage, err, Scope, success, Typechecker } from '../base'
import { getVariableInScope } from '../scope/search'
import { isTypeCompatible } from './compat'
import { resolveDoubleOpSequenceType } from './double-op'
import { resolvePropAccessType } from './propaccess'
import { rebuildType } from './rebuilder'
import { typeValidator } from './validator'
import { resolveValueType } from './value'

export const resolveExprType: Typechecker<Token<Expr>, ValueType> = (expr, ctx) => {
  const fromType = resolveExprElementType(expr.parsed.from, {
    scopes: ctx.scopes,
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

export const resolveExprOrTypeAssertionType: Typechecker<
  Token<ExprOrTypeAssertion>,
  { type: 'expr'; resolved: ValueType } | { type: 'assertion'; assertionScope: Scope }
> = (expr, ctx) => {
  switch (expr.parsed.type) {
    case 'expr':
      const resolved = resolveExprType(expr.parsed.inner, ctx)
      return resolved.ok ? success({ type: 'expr', resolved: resolved.data }) : resolved

    case 'assertion':
      const subject = getVariableInScope(expr.parsed.varname, ctx)
      if (!subject.ok) return subject

      if (subject.data.content.type.inner.type !== 'unknown') {
        return err(
          expr.parsed.minimum.at,
          `Type assertions are only allowed for variables of type \`unknown\`, found \`${rebuildType(
            subject.data.content.type,
            true
          )}\``
        )
      }

      const assertionType = typeValidator(expr.parsed.minimum.parsed, ctx)
      if (!assertionType.ok) return assertionType

      const assertionScope: Scope = {
        functions: new Map(),
        typeAliases: new Map(),
        variables: new Map(),
      }

      assertionScope.variables.set(expr.parsed.varname.parsed, {
        at: expr.at,
        content: {
          mutable: subject.data.content.mutable,
          type: expr.parsed.minimum.parsed,
        },
      })

      return success({ type: 'assertion', assertionScope })

    default:
      return ensureCoverage(expr.parsed)
  }
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
      const condType = resolveExprOrTypeAssertionType(cond, {
        scopes: ctx.scopes,
        typeExpectation: {
          type: { nullable: false, inner: { type: 'bool' } },
          from: null,
        },
      })

      if (!condType.ok) return condType

      const thenType = resolveExprType(
        then,
        condType.data.type === 'assertion'
          ? { scopes: ctx.scopes.concat([condType.data.assertionScope]), typeExpectation: ctx.typeExpectation }
          : ctx
      )

      if (!thenType.ok) return thenType

      for (const { cond, expr } of elif) {
        const condType = resolveExprOrTypeAssertionType(cond, {
          scopes: ctx.scopes,
          typeExpectation: {
            type: { nullable: false, inner: { type: 'bool' } },
            from: then.at,
          },
        })

        if (!condType.ok) return condType

        const elifType = resolveExprType(expr, {
          scopes: condType.data.type === 'assertion' ? ctx.scopes.concat([condType.data.assertionScope]) : ctx.scopes,
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

    value: ({ content }) => resolveValueType(content, ctx),

    // Internal
    synth: ({ inner }) => resolveExprType(inner, ctx),
  })
