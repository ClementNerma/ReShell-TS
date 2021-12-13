import { NonNullablePropertyAccess, PropertyAccess } from '../shared/ast'
import { expr } from './expr'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { failure } from './lib/errors'
import { exact } from './lib/matchers'
import { mappedCases, or } from './lib/switches'
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

export const propertyAccess: Parser<PropertyAccess> = or<PropertyAccess>([
  map(nonNullablePropertyAccess, (access) => ({ nullable: false, access })),
  map(
    combine(
      exact('?'),
      failure(
        nonNullablePropertyAccess,
        'Expected a property index, key or member name after optional chaining operator (?.)'
      )
    ),
    ([_, { parsed: access }]) => ({ nullable: true, access })
  ),
])
