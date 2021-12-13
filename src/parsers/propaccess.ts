import { Parser } from '../lib/base'
import { combine } from '../lib/combinations'
import { maybe } from '../lib/conditions'
import { contextualFailure } from '../lib/errors'
import { exact } from '../lib/matchers'
import { mappedCases } from '../lib/switches'
import { map } from '../lib/transform'
import { withLatelyDeclared } from '../lib/utils'
import { NonNullablePropertyAccess, PropertyAccess } from './data'
import { expr } from './expr'
import { identifier } from './tokens'

export const nonNullablePropertyAccess: Parser<NonNullablePropertyAccess> = mappedCases<NonNullablePropertyAccess>()(
  'type',
  {
    refIndexOrKey: map(
      combine(
        exact('['),
        withLatelyDeclared(() => expr),
        exact(']')
      ),
      ([_, indexOrKey, __]) => ({ type: 'refIndexOrKey', indexOrKey })
    ),
    refStructMember: map(combine(exact('.'), identifier), ([_, member]) => ({ type: 'refStructMember', member })),
  }
)

export const propertyAccess: Parser<PropertyAccess> = map(
  combine(
    maybe(exact('?')),
    contextualFailure(
      nonNullablePropertyAccess,
      (ctx) => !ctx.combinationData!.lastWasNeutralError,
      'Expected a property index, key or member name after optional chaining operator (?.)'
    )
  ),
  ([{ parsed: nullable }, { parsed: access }]) => ({ nullable: nullable !== null, access })
)