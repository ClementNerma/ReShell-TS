import { Parser, Token } from '../lib/base'
import { combine } from '../lib/combinations'
import { extract, maybe, maybeFlatten } from '../lib/conditions'
import { contextualFailure, failure } from '../lib/errors'
import { maybe_s_nl, s } from '../lib/littles'
import { takeWhile, takeWhile1N } from '../lib/loops'
import { exact, word } from '../lib/matchers'
import { addTipIf } from '../lib/raw'
import { mappedCases, OrErrorStrategy } from '../lib/switches'
import { map } from '../lib/transform'
import { flattenMaybeToken, mapToken, withLatelyDeclared } from '../lib/utils'
import { FnArg, FnType, NonNullableValueType, ValueType } from './data'
import { literalValue } from './literals'
import { identifier } from './tokens'
import { startsWithLetter } from './utils'

export const nonNullableValueType: Parser<NonNullableValueType> = mappedCases<NonNullableValueType>()(
  'type',
  {
    bool: map(word('bool'), (_) => ({})),
    number: map(word('number'), (_) => ({})),
    string: map(word('string'), (_) => ({})),
    path: map(word('path'), (_) => ({})),

    list: map(
      combine(
        exact('list'),
        exact('['),
        withLatelyDeclared(() => valueType),
        exact(']'),
        { inter: maybe_s_nl }
      ),
      ([_, __, itemsType, ___]) => ({
        itemsType,
      })
    ),

    map: map(
      combine(
        exact('map'),
        exact('['),
        withLatelyDeclared(() => valueType),
        exact(']'),
        { inter: maybe_s_nl }
      ),
      ([_, __, itemsType, ___]) => ({
        itemsType,
      })
    ),

    struct: map(
      combine(
        exact('{'),
        extract(
          takeWhile1N(
            map(
              combine(
                failure(identifier, 'Syntax error: expected a member name'),
                exact(':', 'Syntax error: expected a semicolon (:) type separator'),
                failure(
                  withLatelyDeclared(() => valueType),
                  'Syntax error: expected a type annotation for this member'
                ),
                { inter: maybe_s_nl }
              ),
              ([name, _, type]): [Token<string>, Token<ValueType>] => [name, type]
            ),
            {
              inter: combine(maybe_s_nl, exact(','), maybe_s_nl),
              interMatchingMakesExpectation: true,
              noMatchError: 'Please provide at least one member in the struct',
            }
          )
        ),
        exact('}', "Syntax error: expected a closing brace (}) after the list of the struct's members"),
        { inter: maybe_s_nl }
      ),
      ([_, members, __]) => ({ members })
    ),

    fn: map(
      withLatelyDeclared(() => fnType),
      (fnType) => ({ fnType })
    ),

    aliasRef: map(
      combine(exact('@'), failure(identifier, 'Syntax error: expected a type alias name')),
      ([_, typeAliasName]) => ({ typeAliasName })
    ),

    unknown: map(exact('unknown'), () => ({})),
  },

  [
    OrErrorStrategy.FallbackFn,
    (input, _, __, ___) =>
      addTipIf('Syntax error: invalid type', startsWithLetter(input), 'Type aliases must be prefixed by a "@" symbol'),
  ]
)

export const valueType: Parser<ValueType> = map(
  combine(maybe(exact('?')), nonNullableValueType),
  ([nullable, { parsed: inner }]) => ({
    nullable: nullable.parsed !== null,
    inner,
  })
)

const _fnRightPartParser: (requireName: boolean) => Parser<FnType> = (requireName) =>
  map(
    combine(
      map(
        combine(exact('fn'), requireName ? identifier : maybe(identifier), { inter: s }),
        ([_, { parsed: name }]) => name
      ),
      exact('(', "Syntax error: expected an open paren '('"),
      takeWhile(
        map(
          combine(
            // maybe(map(combine(exact('mut'), s), ([_, mut]) => !!mut)),
            contextualFailure(identifier, (ctx) => ctx.loopData?.iter !== 0, 'Syntax error: expected an argument name'),
            maybe(exact('?')),
            exact(':', "Syntax error: expected a semicolon (:) separator for the argument's type"),
            failure(valueType, 'Syntax error: expected a type for the argument'),
            maybeFlatten(
              map(
                combine(exact('='), failure(literalValue, 'Syntax error: expected a default value'), {
                  inter: maybe_s_nl,
                }),
                ([_, defaultValue]) => defaultValue
              )
            ),
            { inter: maybe_s_nl }
          ),
          ([/* mutable, */ name, optional, _, type, defaultValue]): FnArg => ({
            // mutable: false,
            name,
            optional: mapToken(optional, (str) => !!str),
            type,
            defaultValue: flattenMaybeToken(defaultValue),
          })
        ),
        {
          inter: combine(maybe_s_nl, exact(','), maybe_s_nl),
          interMatchingMakesExpectation: true,
        }
      ),
      exact(')', "Syntax error: expected a closing paren ')'"),
      maybeFlatten(
        map(
          combine(exact('->'), failure(valueType, 'Syntax error: expected a return type'), { inter: maybe_s_nl }),
          ([_, returnType]) => returnType
        )
      ),
      { inter: maybe_s_nl }
    ),
    ([named, _, { parsed: args }, __, returnType]) => ({
      named: flattenMaybeToken(named),
      args,
      returnType: flattenMaybeToken(returnType),
    })
  )

export const fnType: Parser<FnType> = _fnRightPartParser(false)
export const fnDecl: Parser<{ name: Token<string>; fnType: FnType }> = map(_fnRightPartParser(true), (fnType) => ({
  name: fnType.named!,
  fnType,
}))
