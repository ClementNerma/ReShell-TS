import { ValueType } from '../shared/ast'
import { fnType } from './fn'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { extract } from './lib/conditions'
import { never } from './lib/consumeless'
import { failure } from './lib/errors'
import { maybe_s_nl } from './lib/littles'
import { takeWhile1 } from './lib/loops'
import { exact, word } from './lib/matchers'
import { mappedCases, OrErrorStrategy } from './lib/switches'
import { map } from './lib/transform'
import { selfRef, withLatelyDeclared } from './lib/utils'
import { startsWithLetter } from './predicates'
import { identifier } from './tokens'

export const valueType: Parser<ValueType> = selfRef((valueType) =>
  mappedCases<ValueType>()(
    'type',
    {
      bool: map(word('bool'), (_) => ({})),
      number: map(word('number'), (_) => ({})),
      string: map(word('string'), (_) => ({})),
      path: map(word('path'), (_) => ({})),

      list: map(
        combine(
          exact('['),
          maybe_s_nl,
          withLatelyDeclared(() => valueType),
          maybe_s_nl,
          exact(']')
        ),
        ([_, __, { parsed: itemsType }, ___]) => ({
          itemsType,
        })
      ),

      map: map(
        combine(
          combine(exact('map['), maybe_s_nl),
          withLatelyDeclared(() => valueType),
          combine(maybe_s_nl, exact(']'))
        ),
        ([_, { parsed: itemsType }]) => ({
          itemsType,
        })
      ),

      struct: map(
        combine(
          combine(exact('{'), maybe_s_nl),
          extract(
            takeWhile1(
              map(
                combine(
                  failure(identifier, 'expected a member name'),
                  combine(maybe_s_nl, exact(':', 'expected a semicolon (:) after the member name'), maybe_s_nl),
                  failure(
                    withLatelyDeclared(() => valueType),
                    'expected a type annotation for this member'
                  )
                ),
                ([{ parsed: name }, _, { parsed: type }]) => ({ name, type })
              ),
              {
                inter: combine(maybe_s_nl, exact(','), maybe_s_nl),
                interExpect: 'expected another struct member',
                noMatchError: 'please provide at least one member in the struct',
              }
            )
          ),
          combine(maybe_s_nl, exact('}', 'expected a closing brace (})'))
        ),
        ([_, { parsed: members }, __]) => ({ members })
      ),

      fn: map(
        withLatelyDeclared(() => fnType),
        (fnType) => ({ fnType })
      ),

      aliasRef: map(combine(exact('@'), failure(identifier, 'expected a type alias name')), ([_, typeAliasName]) => ({
        typeAliasName,
      })),

      nullable: map(
        combine(exact('?'), failure(valueType, 'expected a type after nullable (?) operator')),
        ([_, { parsed: inner }]) => ({ inner })
      ),

      unknown: map(exact('unknown'), () => ({})),

      generic: map(
        combine(exact(':'), failure(identifier, 'expected a generic identifier after (:) symbol')),
        ([_, name]) => ({ name })
      ),

      // Internal types
      void: never(),
    },

    [
      OrErrorStrategy.FallbackFn,
      (input, _, __, ___) => ({
        message: 'invalid type',
        complements: startsWithLetter(input) ? [['tip', 'type aliases must be prefixed by a "@" symbol']] : undefined,
      }),
    ]
  )
)
