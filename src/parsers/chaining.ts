import { PropertyAccess, ValueChaining } from '../shared/ast'
import { expr } from './expr'
import { fnCall } from './fncall'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { maybe } from './lib/conditions'
import { followedBy } from './lib/consumeless'
import { maybe_s_nl } from './lib/littles'
import { exact, oneOf } from './lib/matchers'
import { mappedCases, or } from './lib/switches'
import { map } from './lib/transform'
import { withLatelyDeclared } from './lib/utils'
import { identifier } from './tokens'

export const valueChaining: Parser<ValueChaining> = mappedCases<ValueChaining>()('type', {
  method: map(
    combine(maybe_s_nl, maybe(exact('?')), exact('.'), followedBy(combine(identifier, oneOf(['::', '(']))), fnCall),
    ([_, { parsed: nullable }, __, ___, { parsed: call }]) => ({ nullable: nullable !== null, call })
  ),

  propertyAccess: or([
    map(
      withLatelyDeclared(() => propertyAccess),
      (access) => ({ nullable: false, access })
    ),
    map(
      mappedCases<PropertyAccess>()('type', {
        refIndex: map(
          combine(
            exact('?.['),
            withLatelyDeclared(() => expr),
            exact(']')
          ),
          ([_, index, __]) => ({ index })
        ),
        refStructMember: map(combine(exact('?.'), identifier), ([_, member]) => ({ member })),
      }),
      (access) => ({ nullable: true, access })
    ),
  ]),
})

export const propertyAccess: Parser<PropertyAccess> = mappedCases<PropertyAccess>()('type', {
  refIndex: map(
    combine(
      exact('['),
      withLatelyDeclared(() => expr),
      exact(']')
    ),
    ([_, index, __]) => ({ index })
  ),
  refStructMember: map(combine(exact('.'), identifier), ([_, member]) => ({ member })),
})
