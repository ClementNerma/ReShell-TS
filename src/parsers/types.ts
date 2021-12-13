import { FnArg, FnType, NonNullableValueType, Token, ValueType } from '../shared/parsed'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { extract, maybe, maybeFlatten } from './lib/conditions'
import { never } from './lib/consumeless'
import { contextualFailure, failure } from './lib/errors'
import { maybe_s, maybe_s_nl, s } from './lib/littles'
import { takeWhile, takeWhile1 } from './lib/loops'
import { exact, word } from './lib/matchers'
import { addComplementsIf, matches } from './lib/raw'
import { mappedCases, OrErrorStrategy } from './lib/switches'
import { map } from './lib/transform'
import { flattenMaybeToken, getErrorInput, withLatelyDeclared } from './lib/utils'
import { literalValue } from './literals'
import { identifier, keyword } from './tokens'
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
      ([_, __, { parsed: itemsType }, ___]) => ({
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
      ([_, __, { parsed: itemsType }, ___]) => ({
        itemsType,
      })
    ),

    struct: map(
      combine(
        exact('{'),
        extract(
          takeWhile1(
            map(
              combine(
                failure(identifier, 'Expected a member name'),
                exact(':', 'Expected a semicolon (:) type separator'),
                failure(
                  withLatelyDeclared(() => valueType),
                  'Expected a type annotation for this member'
                ),
                { inter: maybe_s_nl }
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
        exact('}', "Expected a closing brace (}) after the list of the struct's members"),
        { inter: maybe_s_nl }
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
      matches(input, keyword, null)
        ? 'Cannot used reserved keyword as a type'
        : addComplementsIf('Invalid type', startsWithLetter(input), [
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

const _fnRightPartParser: (requireName: boolean) => Parser<FnType> = (requireName) =>
  map(
    combine(
      map(combine(exact('fn'), requireName ? identifier : maybe(identifier), { inter: s }), ([_, name]) => name),
      exact('(', "Expected an open paren '('"),
      extract(
        takeWhile(
          map(
            combine(
              // maybe(map(combine(exact('mut'), s), ([_, mut]) => !!mut)),
              contextualFailure(identifier, (ctx) => !ctx.loopData!.firstIter, 'Expected an argument name'),
              maybe(exact('?')),
              exact(':', "Expected a semicolon (:) separator for the argument's type"),
              failure(valueType, 'Expected a type for the argument'),
              maybe(
                map(
                  combine(
                    exact('='),
                    failure(
                      withLatelyDeclared(() => literalValue),
                      (err) => ({
                        message: 'Expected a literal value',
                        complements: [
                          [
                            'Tip',
                            getErrorInput(err).startsWith('"')
                              ? "Literal strings must be single-quoted (')"
                              : 'Lists, maps and structures are not literal values',
                          ],
                        ],
                      })
                    ),
                    { inter: maybe_s_nl }
                  ),
                  ([_, { parsed: defaultValue }]) => defaultValue
                )
              ),
              { inter: maybe_s_nl }
            ),
            ([name, { parsed: optional }, _, { parsed: type }, { parsed: defaultValue }]): FnArg => ({
              name,
              optional: !!optional,
              type,
              defaultValue,
            })
          ),
          {
            inter: combine(maybe_s_nl, exact(','), maybe_s_nl),
            interMatchingMakesExpectation: true,
          }
        )
      ),
      exact(')', "Expected a closing paren ')'"),
      maybeFlatten(
        map(
          combine(exact('->'), failure(valueType, 'Expected a return type'), { inter: maybe_s_nl }),
          ([_, returnType]) => returnType
        )
      ),
      maybeFlatten(
        map(
          combine(maybe_s, exact('throws'), s, failure(valueType, 'Expected a failure type')),
          ([_, __, ___, failureType]) => failureType
        )
      ),
      { inter: maybe_s_nl }
    ),
    ([{ parsed: named }, _, { parsed: args }, __, { parsed: returnType }, { parsed: failureType }]) => ({
      named: flattenMaybeToken(named),
      args,
      returnType,
      failureType,
    })
  )

export const fnType: Parser<FnType> = _fnRightPartParser(false)
export const fnDecl: Parser<{ name: Token<string>; fnType: FnType }> = map(_fnRightPartParser(true), (fnType) => ({
  name: fnType.named!,
  fnType,
}))
