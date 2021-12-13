import { PropertyAccess, ValueType } from '../../shared/ast'
import { CodeSection, Token } from '../../shared/parsed'
import { ensureCoverage, err, success, Typechecker } from '../base'
import { getTypedEntityInScope } from '../scope/search'
import { resolveExprType } from './expr'
import { rebuildType } from './rebuilder'

export const resolvePropAccessType: Typechecker<
  { leftType: ValueType; leftAt: CodeSection; propAccesses: Token<PropertyAccess>[]; noNullabilityTip?: boolean },
  ValueType
> = ({ leftType, leftAt, propAccesses, noNullabilityTip }, ctx) => {
  let previousIterType = leftType
  let upToPrevPropAccessSection: CodeSection = leftAt

  for (const propAccess of propAccesses) {
    while (true) {
      if (previousIterType.type === 'aliasRef') {
        const alias = getTypedEntityInScope(previousIterType.typeAliasName, 'typeAlias', ctx)

        if (!alias.ok) {
          return err(
            leftAt,
            'internal error: candidate type alias reference not found in scope while checking for type compatibility'
          )
        }

        previousIterType = alias.data.content
      } else if (previousIterType.type === 'nullable' && previousIterType.inner.type === 'aliasRef') {
        const alias = getTypedEntityInScope(previousIterType.inner.typeAliasName, 'typeAlias', ctx)

        if (!alias.ok) {
          return err(
            leftAt,
            'internal error: candidate type alias reference not found in scope while checking for type compatibility'
          )
        }

        previousIterType = { type: 'nullable', inner: alias.data.content }
      } else {
        break
      }
    }

    switch (propAccess.parsed.access.type) {
      case 'refIndex':
        if (previousIterType.type === 'list') {
          const check = resolveExprType(propAccess.parsed.access.index, {
            ...ctx,
            typeExpectation: { from: null, type: { type: 'number' } },
          })

          if (!check.ok) return check

          previousIterType = previousIterType.itemsType
        } else if (previousIterType.type === 'nullable' && previousIterType.inner.type === 'list') {
          if (!propAccess.parsed.nullable) {
            return err(upToPrevPropAccessSection, {
              message: 'cannot access index of a nullable list',
              complements: noNullabilityTip ? [] : [['tip', 'you can use nullable indexes with `?[index]`']],
              also: [{ at: propAccess.at, message: 'expectation caused by this access' }],
            })
          }

          const check = resolveExprType(propAccess.parsed.access.index, {
            ...ctx,
            typeExpectation: { from: null, type: { type: 'number' } },
          })

          if (!check.ok) return check

          previousIterType = { type: 'nullable', inner: previousIterType.inner.itemsType }
        } else if (previousIterType.type === 'map') {
          const check = resolveExprType(propAccess.parsed.access.index, {
            ...ctx,
            typeExpectation: { from: null, type: { type: 'string' } },
          })

          if (!check.ok) return check

          previousIterType = previousIterType.itemsType
        } else if (previousIterType.type === 'nullable' && previousIterType.inner.type === 'map') {
          if (!propAccess.parsed.nullable) {
            return err(upToPrevPropAccessSection, {
              message: 'cannot access index of a nullable map',
              complements: noNullabilityTip ? [] : [['tip', 'you can use nullable indexes with `?[index]`']],
              also: [{ at: propAccess.at, message: 'expectation caused by this access' }],
            })
          }

          const check = resolveExprType(propAccess.parsed.access.index, {
            ...ctx,
            typeExpectation: { from: null, type: { type: 'string' } },
          })

          if (!check.ok) return check

          previousIterType = { type: 'nullable', inner: previousIterType.inner.itemsType }
        } else {
          return err(upToPrevPropAccessSection, {
            message: `expected list due to index access, found \`${rebuildType(previousIterType, true)}\``,
            complements: noNullabilityTip
              ? []
              : [
                  ['expected', 'list'],
                  ['found   ', rebuildType(previousIterType)],
                ],
            also: [{ at: propAccess.at, message: 'expectation caused by this access' }],
          })
        }

        break

      case 'refStructMember':
        let structType: Extract<ValueType, { type: 'struct' }>

        if (previousIterType.type === 'struct') {
          structType = previousIterType
        } else if (previousIterType.type === 'nullable' && previousIterType.inner.type === 'struct') {
          if (!propAccess.parsed.nullable) {
            return err(upToPrevPropAccessSection, {
              message: 'cannot access member of a nullable struct',
              complements: noNullabilityTip ? [] : [['tip', 'you can use nullable indexes with `?.member`']],
            })
          }

          structType = previousIterType.inner
        } else {
          return err(upToPrevPropAccessSection, {
            message: `expected struct due to member access, found \`${rebuildType(previousIterType, true)}\``,
            complements: [
              ['expected', 'struct'],
              ['found   ', rebuildType(previousIterType)],
            ],
            also: [{ at: propAccess.at, message: 'expectation caused by this access' }],
          })
        }

        const expectedMember = propAccess.parsed.access.member
        const resolvedMember = structType.members.find(({ name }) => name === expectedMember.parsed)

        if (!resolvedMember) {
          return err(expectedMember.at, {
            message: `member \`${expectedMember.parsed}\` was not found in this struct`,
            // also: [{ at: upToPrevPropAccessSection, message: 'originates in this expression' }],
          })
        }

        previousIterType = propAccess.parsed.nullable
          ? { type: 'nullable', inner: resolvedMember.type }
          : resolvedMember.type
        break

      default:
        return ensureCoverage(propAccess.parsed.access)
    }

    upToPrevPropAccessSection = { start: upToPrevPropAccessSection.start, next: propAccess.at.next }
  }

  return success(previousIterType)
}
