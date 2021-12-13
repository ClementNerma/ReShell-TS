import { NonNullableValueType, ValueType } from '../shared/ast'
import { fnType } from './fn'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { extract, maybe } from './lib/conditions'
import { never } from './lib/consumeless'
import { failure } from './lib/errors'
import { maybe_s_nl } from './lib/littles'
import { takeWhile1 } from './lib/loops'
import { exact, word } from './lib/matchers'
import { mappedCases, OrErrorStrategy } from './lib/switches'
import { map } from './lib/transform'
import { addComplementsIf, withLatelyDeclared } from './lib/utils'
import { startsWithLetter } from './predicates'
import { identifier } from './tokens'

export const nonNullableValueType: Parser<NonNullableValueType> = mappedCases<NonNullableValueType>()(
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
                failure(identifier, 'Expected a member name'),
                combine(maybe_s_nl, exact(':', 'Expected a semicolon (:) type separator'), maybe_s_nl),
                failure(
                  withLatelyDeclared(() => valueType),
                  'Expected a type annotation for this member'
                )
              ),
              ([{ parsed: name }, _, { parsed: type }]) => ({ name, type })
            ),
            {
              inter: combine(maybe_s_nl, exact(','), maybe_s_nl),
              interMatchingMakesExpectation: true,
              noMatchError: 'Please provide at least one member in the struct',
            }
          )
        ),
        combine(maybe_s_nl, exact('}', "Expected a closing brace (}) after the list of the struct's members"))
      ),
      ([_, { parsed: members }, __]) => ({ members })
    ),

    fn: map(
      withLatelyDeclared(() => fnType),
      (fnType) => ({ fnType })
    ),

    aliasRef: map(combine(exact('@'), failure(identifier, 'Expected a type alias name')), ([_, typeAliasName]) => ({
      typeAliasName,
    })),

    unknown: map(exact('unknown'), () => ({})),

    // Internal types
    void: never(),
  },

  [
    OrErrorStrategy.FallbackFn,
    (input, _, __, ___) =>
      addComplementsIf('Invalid type', startsWithLetter(input), [
        ['Tip', 'Type aliases must be prefixed by a "@" symbol'],
      ]),
  ]
)

export const valueType: Parser<ValueType> = map(
  combine(maybe(exact('?')), nonNullableValueType),
  ([nullable, { parsed: inner }]) => ({
    nullable: nullable.parsed !== null,
    inner,
  })
)
