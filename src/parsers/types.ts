import { ValueType } from '../shared/ast'
import { completeGenericsDefinition, CustomContext } from './context'
import { fnType } from './fn'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { extract, failable } from './lib/conditions'
import { never } from './lib/consumeless'
import { failure } from './lib/errors'
import { maybe_s_nl } from './lib/littles'
import { takeWhile1 } from './lib/loops'
import { exact, word } from './lib/matchers'
import { mappedCases, OrErrorStrategy } from './lib/switches'
import { map, toOneProp } from './lib/transform'
import { selfRef, withLatelyDeclared } from './lib/utils'
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

      enum: map(
        combine(
          combine(exact('enum'), maybe_s_nl, exact('{', 'expected an opening brace'), maybe_s_nl),
          takeWhile1(identifier, {
            inter: combine(maybe_s_nl, exact(','), maybe_s_nl),
            interExpect: 'expected another variant name',
          }),
          maybe_s_nl,
          exact('}', 'expected a closing brace (})')
        ),
        ([_, { parsed: variants }]) => ({ variants })
      ),

      fn: map(
        withLatelyDeclared(() => fnType),
        (fnType) => ({ fnType })
      ),

      nullable: map(
        combine(exact('?'), failure(valueType, 'expected a type after nullable (?) operator')),
        ([_, { parsed: inner }]) => ({ inner })
      ),

      failable: map(
        combine(
          exact('failable<'),
          maybe_s_nl,
          valueType,
          maybe_s_nl,
          exact(',', 'expected a comma (,) to separate the success and failure types'),
          maybe_s_nl,
          valueType,
          maybe_s_nl,
          exact('>', 'expected a closing (>) symbol after the failure type')
        ),
        ([_, __, successType, ___, ____, _____, failureType]) => ({ successType, failureType })
      ),

      unknown: map(exact('unknown'), () => ({})),

      aliasRef: toOneProp('typeAliasName', identifier),

      generic: failable(
        combine(exact(':'), failure(identifier, 'expected a generic identifier after (:) symbol')),
        (_, { parsed: [__, name] }, context) => completeGenericsDefinition(name, context.$custom as CustomContext)
      ),

      // Internal types
      void: never(),
    },

    [OrErrorStrategy.Const, 'invalid type']
  )
)
