import { NonNullablePropertyAccess, PropertyAccess } from '../shared/parsed'
import { expr } from './expr'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { maybe } from './lib/conditions'
import { contextualFailure } from './lib/errors'
import { exact } from './lib/matchers'
import { mappedCases } from './lib/switches'
import { map } from './lib/transform'
import { withLatelyDeclared } from './lib/utils'
import { identifier } from './tokens'

export const nonNullablePropertyAccess: Parser<NonNullablePropertyAccess> = mappedCases<NonNullablePropertyAccess>()(
  'type',
  {
    refIndex: map(
      combine(
        exact('['),
        withLatelyDeclared(() => expr),
        exact(']')
      ),
      ([_, index, __]) => ({ type: 'refIndex', index })
    ),
    refStructMember: map(combine(exact('.'), identifier), ([_, member]) => ({ type: 'refStructMember', member })),
  }
)

export const propertyAccess: Parser<PropertyAccess> = map(
  combine(
    maybe(exact('?')),
    contextualFailure(
      nonNullablePropertyAccess,
      (ctx) => !ctx.combinationData!.soFar.previousInfos!.phantomSuccess,
      'Expected a property index, key or member name after optional chaining operator (?.)'
    )
  ),
  ([{ parsed: nullable }, { parsed: access }]) => ({ nullable: nullable !== null, access })
)
