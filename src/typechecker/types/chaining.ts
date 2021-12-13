import { ExprElementContent, FnCallArg, FnDeclArg, PropertyAccess, ValueChaining, ValueType } from '../../shared/ast'
import { CodeSection, Token } from '../../shared/parsed'
import { matchUnion } from '../../shared/utils'
import { ensureCoverage, err, ScopeMethod, success, Typechecker, TypecheckerResult } from '../base'
import { developTypeAliases, developTypeAliasesAndNullables } from './aliases'
import { isTypeCompatible } from './compat'
import { resolveExprType } from './expr'
import { validateAndRegisterFnCall } from './fn'
import { rebuildType } from './rebuilder'

export const resolveValueChainings: Typechecker<
  { left: Token<ExprElementContent>; leftType: ValueType; chainings: Token<ValueChaining>[] },
  ValueType
> = ({ left, leftType, chainings }, ctx) => {
  let previousIterType = leftType
  let upToPreviousChaining: CodeSection = left.at
  const previousChainings: Token<ValueChaining>[] = []

  for (const chaining of chainings) {
    const resolved: TypecheckerResult<ValueType> = matchUnion(chaining.parsed, 'type', {
      propertyAccess: ({ nullable, access }) =>
        resolvePropAccessType(
          {
            leftType: previousIterType,
            leftAt: upToPreviousChaining,
            at: chaining.at,
            propAccess: access,
            nullable,
          },
          ctx
        ),

      method: ({ nullable, call }) => {
        const developed = developTypeAliasesAndNullables(previousIterType, ctx)
        if (!developed.ok) return developed

        if (nullable && developed.data.type !== 'nullable') {
          return err(chaining.at, {
            message: 'cannot apply nullable chaining operator (?.) on non-nullable type',
            complements: [
              ['found', rebuildType(previousIterType)],
              ['developed', rebuildType(developed.data)],
            ],
          })
        }

        let inner = previousIterType

        if (nullable) {
          while (inner.type === 'nullable') {
            inner = inner.inner
          }
        }

        let method: ScopeMethod | null = null
        const candidates: ScopeMethod[] = []

        for (let s = ctx.scopes.length - 1; s >= 0; s--) {
          const maybe = ctx.scopes[s].methods.find((method) => {
            if (method.name.parsed !== call.name.parsed) return false

            const compat = isTypeCompatible(
              {
                at: call.name.at,
                candidate: inner,
                typeExpectation: { type: method.forTypeWithoutGenerics, from: null },
              },
              ctx
            )

            if (!compat.ok) {
              candidates.push(method)
            }

            return compat.ok
          })

          if (maybe) {
            method = maybe
            break
          }
        }

        if (!method) {
          return err(
            call.name.at,
            candidates.length === 0
              ? 'no method with this name was found in scope'
              : {
                  message: 'method was not found for the provided value type',
                  complements: candidates
                    .map<[string, string]>((method) => [
                      'exists for',
                      (nullable ? '?' : '') + rebuildType(method.forTypeWithoutGenerics),
                    ])
                    .concat([['applied on', rebuildType(developed.data)]])
                    .reverse(),
                }
          )
        }

        const selfArg: Token<FnDeclArg> = {
          at: method.infos.selfArg.at,
          matched: method.infos.selfArg.matched,
          parsed: {
            flag: null,
            name: method.infos.selfArg,
            optional: false,
            type: method.infos.forType,
            defaultValue: null,
          },
        }

        const selfValue: Token<FnCallArg> = {
          at: upToPreviousChaining,
          matched: -1,
          parsed: {
            type: 'expr',
            expr: {
              at: upToPreviousChaining,
              matched: -1,
              parsed: {
                from: {
                  at: upToPreviousChaining,
                  matched: -1,
                  parsed: {
                    content: left,
                    chainings: previousChainings.slice(),
                  },
                },
                doubleOps: [],
              },
            },
          },
        }

        const resolved = validateAndRegisterFnCall(
          {
            at: call.at,
            nameAt: call.name.at,
            fnType: {
              ...method.fnType,
              generics: method.fnType.generics.concat(method.infos.generics),
              args: [selfArg].concat(method.fnType.args),
            },
            suppliedGenerics: call.generics,
            args: [selfValue].concat(call.args),
            firstArgType: inner,
            usingNullableChaining: nullable,
          },
          { ...ctx, typeExpectation: null }
        )

        if (!resolved.ok) return resolved

        return success(nullable ? { type: 'nullable', inner: resolved.data } : resolved.data)
      },

      earlyReturn: () => {
        if (!ctx.fnExpectation) {
          return err(chaining.at, 'early returns are only allowed in functions')
        }

        if (!ctx.fnExpectation.returnType) {
          return err(chaining.at, 'early return is not permitted as the current function does not have a return type')
        }

        const developed = developTypeAliases(ctx.fnExpectation.returnType.type, ctx)
        if (!developed.ok) return developed

        /*if (previousIterType.type === 'nullable') {
          if (developed.data.type !== 'nullable') {
            return err(
              chaining.at,
              'trying to return a nullable value but this function does not have a nullable return type'
            )
          }

          return success(developed.data.inner)
        } else*/ if (previousIterType.type === 'failable') {
          if (developed.data.type !== 'failable') {
            return err(
              chaining.at,
              'trying to return a failable value but this function does not have a failable return type'
            )
          }

          const compat = isTypeCompatible(
            {
              at: upToPreviousChaining,
              candidate: previousIterType.failureType.parsed,
              typeExpectation: {
                from: ctx.fnExpectation.returnType.from,
                type: developed.data.failureType.parsed,
              },
            },
            { ...ctx, typeExpectationNature: 'because of return operator failure type' }
          )

          if (!compat.ok) return compat

          return success(previousIterType.successType.parsed)
        } else {
          // return err(chaining.at, 'the early return operator is only applyable on nullable and failable value types')
          return err(chaining.at, 'the early return operator is only applyable failable value types')
        }
      },
    })

    if (!resolved.ok) return resolved

    previousIterType = resolved.data
    upToPreviousChaining = { start: left.at.start, next: chaining.at.next }
    previousChainings.push(chaining)
  }

  return success(previousIterType)
}

const resolvePropAccessType: Typechecker<
  { leftType: ValueType; leftAt: CodeSection; at: CodeSection; propAccess: PropertyAccess; nullable: boolean },
  ValueType
> = ({ leftType, leftAt, at, propAccess, nullable }, ctx) => {
  let outType: ValueType

  const developed = developTypeAliasesAndNullables(leftType, ctx)
  if (!developed.ok) return developed
  leftType = developed.data

  switch (propAccess.type) {
    case 'refIndex': {
      if (leftType.type === 'list') {
        const check = resolveExprType(propAccess.index, {
          ...ctx,
          typeExpectation: { from: null, type: { type: 'int' } },
        })

        if (!check.ok) return check

        outType = leftType.itemsType
      } else if (leftType.type === 'nullable' && leftType.inner.type === 'list') {
        if (!nullable) {
          return err(leftAt, {
            message: 'cannot access index of a nullable list',
            complements: [['tip', 'you can use nullable indexes with `?[index]`']],
            also: [{ at, message: 'expectation caused by this access' }],
          })
        }

        const check = resolveExprType(propAccess.index, {
          ...ctx,
          typeExpectation: { from: null, type: { type: 'int' } },
        })

        if (!check.ok) return check

        outType = { type: 'nullable', inner: leftType.inner.itemsType }
      } else if (leftType.type === 'map') {
        const check = resolveExprType(propAccess.index, {
          ...ctx,
          typeExpectation: { from: null, type: { type: 'string' } },
        })

        if (!check.ok) return check

        outType = leftType.itemsType
      } else if (leftType.type === 'nullable' && leftType.inner.type === 'map') {
        if (!nullable) {
          return err(leftAt, {
            message: 'cannot access index of a nullable map',
            complements: [['tip', 'you can use nullable indexes with `?[index]`']],
            also: [{ at, message: 'expectation caused by this access' }],
          })
        }

        const check = resolveExprType(propAccess.index, {
          ...ctx,
          typeExpectation: { from: null, type: { type: 'string' } },
        })

        if (!check.ok) return check

        outType = { type: 'nullable', inner: leftType.inner.itemsType }
      } else {
        return err(leftAt, {
          message: `expected list due to index access, found \`${rebuildType(leftType, { noDepth: true })}\``,
          complements: [
            ['expected', 'list'],
            ['found   ', rebuildType(leftType)],
          ],
          also: [{ at, message: 'expectation caused by this access' }],
        })
      }

      break
    }

    case 'refStructMember': {
      let structType: Extract<ValueType, { type: 'struct' }>

      if (leftType.type === 'struct') {
        structType = leftType
      } else if (leftType.type === 'nullable' && leftType.inner.type === 'struct') {
        if (!nullable) {
          return err(leftAt, {
            message: 'cannot access member of a nullable struct',
            complements: [['tip', 'you can use nullable indexes with `?.member`']],
          })
        }

        structType = leftType.inner
      } else {
        return err(leftAt, {
          message: `expected struct due to member access, found \`${rebuildType(leftType, {
            noDepth: true,
          })}\``,
          complements: [
            ['expected', 'struct'],
            ['found   ', rebuildType(leftType)],
          ],
          also: [{ at, message: 'expectation caused by this access' }],
        })
      }

      const expectedMember = propAccess.member
      const resolvedMember = structType.members.find(({ name }) => name === expectedMember.parsed)

      if (!resolvedMember) {
        return err(expectedMember.at, {
          message: `member \`${expectedMember.parsed}\` was not found in this struct`,
          // also: [{ at: leftAt, message: 'originates in this expression' }],
        })
      }

      outType = nullable ? { type: 'nullable', inner: resolvedMember.type } : resolvedMember.type
      break
    }

    default:
      return ensureCoverage(propAccess)
  }

  return success(outType)
}
