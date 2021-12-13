import { PropertyAccess, ValueType } from '../../shared/ast'
import { CodeSection, Token } from '../../shared/parsed'
import { ensureCoverage, err, success, Typechecker } from '../base'
import { getTypeAliasInScope } from '../scope/search'
import { rebuildType } from './rebuilder'

export const resolvePropAccessType: Typechecker<
  { leftType: ValueType; leftAt: CodeSection; propAccesses: Token<PropertyAccess>[]; noNullabilityTip?: boolean },
  ValueType
> = ({ leftType, leftAt, propAccesses, noNullabilityTip }, ctx) => {
  let previousIterType = leftType
  let upToPrevPropAccessSection: CodeSection = leftAt

  for (const propAccess of propAccesses) {
    if (previousIterType.inner.type === 'aliasRef') {
      const alias = getTypeAliasInScope(previousIterType.inner.typeAliasName, ctx)

      if (!alias.ok) {
        return err(
          leftAt,
          'Internal error: candidate type alias reference not found in scope while checking for type compatibility'
        )
      }

      previousIterType = {
        nullable: previousIterType.nullable || alias.data.content.nullable,
        inner: alias.data.content.inner,
      }
    }

    switch (propAccess.parsed.access.type) {
      case 'refIndex':
        if (previousIterType.inner.type !== 'list') {
          return err(upToPrevPropAccessSection, {
            message: `expected list due to index access, found \`${rebuildType(previousIterType, true)}\``,
            complements: noNullabilityTip
              ? []
              : [
                  ['Expected', 'list'],
                  ['Found   ', rebuildType(previousIterType)],
                ],
            also: [{ at: propAccess.at, message: 'expectation caused by this access' }],
          })
        }

        if (previousIterType.nullable && !propAccess.parsed.nullable) {
          return err(upToPrevPropAccessSection, {
            message: 'cannot access index of a nullable list',
            complements: noNullabilityTip ? [] : [['Tip', 'You can use nullable indexes with `?[index]`']],
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
            complements: noNullabilityTip ? [] : [['Tip', 'You can use nullable indexes with `?.member`']],
          })
        }

        const expectedMember = propAccess.parsed.access.member
        const resolvedMember = previousIterType.inner.members.find(({ name }) => name === expectedMember.parsed)

        if (!resolvedMember) {
          return err(expectedMember.at, {
            message: `member \`${expectedMember.parsed}\` was not found in this struct`,
            // also: [{ at: upToPrevPropAccessSection, message: 'originates in this expression' }],
          })
        }

        previousIterType = { ...resolvedMember.type, nullable: propAccess.parsed.nullable }
        break

      default:
        return ensureCoverage(propAccess.parsed.access)
    }

    upToPrevPropAccessSection = { start: upToPrevPropAccessSection.start, next: propAccess.at.next }
  }

  return success(previousIterType)
}
