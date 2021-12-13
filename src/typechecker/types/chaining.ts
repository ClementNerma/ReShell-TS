import { PropertyAccess, ValueChaining, ValueType } from '../../shared/ast'
import { CodeSection, Token } from '../../shared/parsed'
import { matchUnion } from '../../shared/utils'
import { ensureCoverage, err, ScopeMethod, success, Typechecker, TypecheckerResult } from '../base'
import { developTypeAliasesAndNullables } from './aliases'
import { isTypeCompatible } from './compat'
import { resolveExprType } from './expr'
import { resolveRawFnCallType } from './fn'
import { rebuildType } from './rebuilder'

export const resolveValueChainings: Typechecker<
  { leftAt: CodeSection; leftType: ValueType; chainings: Token<ValueChaining>[] },
  ValueType
> = ({ leftAt, leftType, chainings }, ctx) => {
  let previousIterType = leftType
  let upToPreviousChaining: CodeSection = leftAt

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

        let method: ScopeMethod | null = null
        const candidates: ScopeMethod[] = []

        for (let s = ctx.scopes.length - 1; s >= 0; s--) {
          const maybe = ctx.scopes[s].methods.find((method) => {
            if (method.name.parsed !== call.name.parsed) return false

            const compat = isTypeCompatible(
              {
                at: call.name.at,
                candidate: previousIterType,
                typeExpectation: { type: method.forType.parsed, from: null },
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
          return err(call.name.at, {
            message: 'method was not found for the provided value type',
            also: [
              {
                at: upToPreviousChaining,
                message: 'method not found for this expression',
                complements: candidates
                  .map<[string, string]>((candidate) => ['exists for', rebuildType(candidate.forType.parsed)])
                  .concat([['type      ', rebuildType(developed.data)]])
                  .reverse(),
              },
            ],
          })
        }

        const resolved = resolveRawFnCallType({ call, fnType: method.fnType }, ctx)
        if (!resolved.ok) return resolved

        return success(nullable ? { type: 'nullable', inner: resolved.data } : resolved.data)
      },
    })

    if (!resolved.ok) return resolved

    previousIterType = resolved.data
    upToPreviousChaining = { start: leftAt.start, next: chaining.at.next }
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
          typeExpectation: { from: null, type: { type: 'number' } },
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
          typeExpectation: { from: null, type: { type: 'number' } },
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
