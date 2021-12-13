import { PropertyAccess, ValueChaining, ValueType } from '../../shared/ast'
import { CodeLoc, CodeSection, Token } from '../../shared/parsed'
import { matchUnion } from '../../shared/utils'
import { ensureCoverage, err, success, Typechecker, TypecheckerResult } from '../base'
import { developTypeAliases } from './aliases'
import { resolveExprType } from './expr'
import { rebuildType } from './rebuilder'

export const resolveValueChainings: Typechecker<
  { leftType: ValueType; leftAt: CodeSection; chainings: Token<ValueChaining>[] },
  ValueType
> = ({ leftType, leftAt, chainings }, ctx) => {
  let previousIterType = leftType
  let upToPreviousChaining: CodeLoc = leftAt.next

  for (const chaining of chainings) {
    const resolved: TypecheckerResult<ValueType> = matchUnion(chaining.parsed, 'type', {
      propertyAccess: ({ nullable, access }) =>
        resolvePropAccessType(
          {
            leftType: previousIterType,
            leftAt: { start: leftAt.start, next: upToPreviousChaining },
            at: chaining.at,
            propAccess: access,
            nullable,
          },
          ctx
        ),
    })

    if (!resolved.ok) return resolved

    previousIterType = resolved.data
    upToPreviousChaining = chaining.at.next
  }

  return success(previousIterType)
}

const resolvePropAccessType: Typechecker<
  { leftType: ValueType; leftAt: CodeSection; at: CodeSection; propAccess: PropertyAccess; nullable: boolean },
  ValueType
> = ({ leftType, leftAt, at, propAccess, nullable }, ctx) => {
  let outType: ValueType

  do {
    const developed = developTypeAliases(leftType, ctx)
    if (!developed.ok) return developed
    leftType = developed.data
  } while (leftType.type === 'nullable' && leftType.inner.type === 'aliasRef')

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
