import { FnDeclArg, FnType, ValueType } from '../shared/ast'
import { CodeSection, Token } from '../shared/parsed'
import { addGenericsDefinition, CustomContext } from './context'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { extract, failIfMatches, maybe, useSeparatorIf } from './lib/conditions'
import { not, notFollowedBy, nothing } from './lib/consumeless'
import { feedContext } from './lib/context'
import { contextualFailure, failure } from './lib/errors'
import { maybe_s, maybe_s_nl, s, s_nl, unicodeSingleLetter } from './lib/littles'
import { takeWhile, takeWhile1 } from './lib/loops'
import { exact, word } from './lib/matchers'
import { or } from './lib/switches'
import { map } from './lib/transform'
import { withLatelyDeclared } from './lib/utils'
import { literalValue } from './literals'
import { identifier } from './tokens'
import { valueType } from './types'

export const fnDeclArg: Parser<FnDeclArg> = map(
  combine(
    or<Pick<FnDeclArg, 'flag' | 'name'>>([
      map(
        combine(
          exact('-'),
          notFollowedBy(exact('-')),
          not(word('self'), 'the "self" identifier reserved for methods'),
          failure(unicodeSingleLetter, 'expected a flag name'),
          notFollowedBy(unicodeSingleLetter, {
            message: 'expected a single-letter flag name',
            complements: [['tip', 'to specify a multi-letters flag name, use a double dash "--"']],
          })
        ),
        ([flag, _, __, name]) => ({ flag, name })
      ),
      map(
        combine(
          exact('--'),
          not(word('self'), 'the "self" identifier reserved for methods'),
          failure(identifier, 'expected a flag name')
        ),
        ([flag, _, name]) => ({ flag, name })
      ),
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
        ([_, defaultValue]) => defaultValue
      )
    )
  ),
  ([
    {
      parsed: { name, flag },
    },
    { parsed: optional },
    type,
    { parsed: defaultValue },
  ]): FnDeclArg => ({
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

const fn: <T, O>(
  headParser: Parser<T>,
  firstArgRawParser: Parser<O>
) => Parser<{ head: Token<T>; firstArg: Token<O>; genericsDef: Map<string, CodeSection>; fnType: FnType }> = (
  headParser,
  firstArgRawParser
) =>
  map(
    combine(
      headParser,
      maybe_s,
      feedContext(
        maybe(fnGenerics),
        (context: CustomContext, generics) => addGenericsDefinition(context, generics ?? []),
        combine(
          combine(
            maybe_s,
            contextualFailure(
              exact('('),
              (ctx) => (ctx.$custom as CustomContext).genericsDefinitions.length > 0,
              "expected an opening parenthesis '(' for the function's type"
            ),
            maybe_s_nl
          ),
          firstArgRawParser,
          useSeparatorIf(
            takeWhile(fnDeclArg, {
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
      head,
      _,
      {
        parsed: [
          { parsed: generics },
          {
            parsed: [
              __,
              firstArg,
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
      head,
      genericsDef,
      firstArg,
      fnType: {
        args,
        generics: generics ?? [],
        restArg: restArg !== null ? restArg.parsed : null,
        returnType,
        method: null,
      },
    })
  )

export const fnType: Parser<FnType> = map(fn(exact('fn'), nothing()), ({ fnType }) => fnType)

export const fnDecl: Parser<{ name: Token<string>; fnType: FnType; genericsDef: Map<string, CodeSection> }> = map(
  fn(
    map(combine(exact('fn'), s, identifier), ([_, __, name]) => name),
    nothing()
  ),
  (parsed) => ({ name: parsed.head.parsed, fnType: parsed.fnType, genericsDef: parsed.genericsDef })
)

export const methodDecl: Parser<{
  name: Token<string>
  forType: Token<ValueType>
  fnType: FnType
  genericsDef: Map<string, CodeSection>
}> = map(
  combine(
    exact('@method('),
    maybe_s,
    failure(
      withLatelyDeclared(() => valueType),
      'expected a type definition on which this method can be applied'
    ),
    maybe_s,
    exact(')', 'expected a closing parenthesis ")" after the method\'s applicable type'),
    failure(s_nl, 'expected a space or newline after closing parenthesis'),
    fn(
      map(combine(exact('fn'), s, identifier), ([_, __, name]) => name),
      map(
        combine(exact('self', 'methods must take a first argument named "self"'), maybe_s, exact(','), maybe_s),
        ([self]) => self
      )
    )
  ),
  ([_, __, forType, ___, ____, _____, { parsed }]) => ({
    name: parsed.head.parsed,
    forType,
    fnType: { ...parsed.fnType, method: { forType, selfArg: parsed.firstArg.parsed } },
    genericsDef: parsed.genericsDef,
  })
)
