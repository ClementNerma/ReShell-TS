import { FnArg, FnType } from '../shared/ast'
import { CodeSection, Token } from '../shared/parsed'
import { addGenericsDefinition, CustomContext } from './context'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { extract, failIfMatches, maybe, useSeparatorIf } from './lib/conditions'
import { always, notFollowedBy } from './lib/consumeless'
import { feedContext } from './lib/context'
import { failure } from './lib/errors'
import { maybe_s, maybe_s_nl, s, unicodeSingleLetter } from './lib/littles'
import { takeWhile, takeWhile1 } from './lib/loops'
import { exact } from './lib/matchers'
import { or } from './lib/switches'
import { map } from './lib/transform'
import { withLatelyDeclared } from './lib/utils'
import { literalValue } from './literals'
import { identifier } from './tokens'
import { valueType } from './types'

export const fnArg: Parser<FnArg> = map(
  combine(
    or<Pick<FnArg, 'flag' | 'name'>>([
      map(
        combine(
          exact('-'),
          notFollowedBy(exact('-')),
          failure(unicodeSingleLetter, 'expected a flag name'),
          notFollowedBy(unicodeSingleLetter, {
            error: {
              message: 'expected a single-letter flag name',
              complements: [['tip', 'to specify a multi-letters flag name, use a double dash "--"']],
            },
          })
        ),
        ([flag, __, name]) => ({ flag, name })
      ),
      map(combine(exact('--'), failure(identifier, 'expected a flag name')), ([flag, name]) => ({ flag, name })),
      map(identifier, (_, name) => ({ flag: null, name })),
    ]),
    map(
      combine(
        maybe_s,
        maybe(exact('?')),
        exact(':', "expected a semicolon (:) separator for the argument's type"),
        maybe_s
      ),
      ([_, optional, __, ___]) => !!optional.parsed
    ),
    withLatelyDeclared(() => valueType),
    maybe(
      map(
        combine(
          combine(maybe_s_nl, exact('='), maybe_s_nl),
          failure(
            withLatelyDeclared(() => literalValue),
            'expected a literal value'
          )
        ),
        ([_, { parsed: defaultValue }]) => defaultValue
      )
    )
  ),
  ([
    {
      parsed: { name, flag },
    },
    { parsed: optional },
    { parsed: type },
    { parsed: defaultValue },
  ]): FnArg => ({
    name,
    flag,
    optional,
    type,
    defaultValue,
  })
)

const fnGenerics: Parser<Token<string>[]> = map(
  combine(
    exact('<'),
    maybe_s_nl,
    extract(
      takeWhile1(
        map(combine(exact(':'), failure(identifier, 'expected an identifier for the generic')), ([_, name]) => name),
        {
          inter: combine(maybe_s_nl, exact(','), maybe_s_nl),
          interExpect: 'expected another generic',
          noMatchError: 'please provide at least one generic',
        }
      )
    ),
    maybe_s_nl,
    exact('>', 'expected a closing (>) symbol after the list of generics')
  ),
  ([_, __, { parsed: generics }]) => generics
)

const fn: <T>(nameParser: Parser<T>) => Parser<FnType & { name: Token<T>; genericsDef: Map<string, CodeSection> }> = (
  nameParser
) =>
  map(
    combine(
      map(combine(exact('fn'), nameParser), ([_, name]) => name),
      maybe_s,
      feedContext(
        maybe(fnGenerics),
        (context: CustomContext, generics) => addGenericsDefinition(context, generics ?? []),
        combine(
          combine(maybe_s, exact('(', "expected an opening parenthesis '('"), maybe_s_nl),
          useSeparatorIf(
            takeWhile(fnArg, {
              inter: combine(maybe_s_nl, exact(','), maybe_s_nl, failIfMatches(exact('...'))),
              interExpect: 'expected an argument name',
            }),
            combine(maybe_s_nl, exact(','), maybe_s_nl),
            map(
              combine(exact('...'), failure(identifier, 'expected a rest argument identifier')),
              ([_, restArg]) => restArg
            )
          ),
          combine(maybe_s_nl, exact(')', "expected a closing paren ')' after arguments list")),
          maybe(
            map(
              combine(
                maybe_s,
                exact('->'),
                maybe_s,
                failure(
                  withLatelyDeclared(() => valueType),
                  'expected a return type'
                )
              ),
              ([_, __, ___, returnType]) => returnType
            )
          )
        ),
        (context) => ({ genericsDef: context.genericsDefinitions[context.genericsDefinitions.length - 1] })
      )
    ),
    ([
      { parsed: name },
      _,
      {
        parsed: [
          { parsed: generics },
          {
            parsed: [
              __,
              {
                parsed: [{ parsed: args }, restArg],
              },
              ___,
              { parsed: returnType },
            ],
          },
          { genericsDef },
        ],
      },
    ]) => ({
      name,
      args,
      generics: generics ?? [],
      restArg: restArg !== null ? restArg.parsed : null,
      returnType,
      genericsDef,
    })
  )

export const fnType: Parser<FnType> = fn(always(null))
export const fnDecl: Parser<{ name: Token<string>; fnType: FnType; genericsDef: Map<string, CodeSection> }> = map(
  fn(map(combine(s, identifier), ([_, name]) => name)),
  (fnType) => ({
    name: fnType.name.parsed,
    fnType: { generics: fnType.generics, args: fnType.args, restArg: fnType.restArg, returnType: fnType.returnType },
    genericsDef: fnType.genericsDef,
  })
)
