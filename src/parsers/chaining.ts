import { PropertyAccess, ValueChaining } from '../shared/ast'
import { expr } from './expr'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { exact } from './lib/matchers'
import { mappedCases, or } from './lib/switches'
import { map } from './lib/transform'
import { withLatelyDeclared } from './lib/utils'
import { identifier } from './tokens'

export const valueChaining: Parser<ValueChaining> = mappedCases<ValueChaining>()('type', {
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
