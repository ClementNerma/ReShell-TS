import { FnDeclArg, FnType, MethodInfos } from '../shared/ast'
import { CodeSection, Token } from '../shared/parsed'
import { addGenericsDefinition, CustomContext } from './context'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { extract, failIfMatches, maybe, useSeparatorIf } from './lib/conditions'
import { not, notFollowedBy } from './lib/consumeless'
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

type _WithFnGenerics<T> = { generics: Token<string>[]; genericsDef: Map<string, CodeSection>; data: Token<T> }

const _withFnGenerics: <T>(parser: Parser<T>) => Parser<_WithFnGenerics<T>> = (parser) =>
  map(
    feedContext(
      maybe(fnGenerics),
      (context: CustomContext, generics) => addGenericsDefinition(context, generics ?? []),
      parser,
      (context) => ({ genericsDef: context.genericsDefinitions[context.genericsDefinitions.length - 1] })
    ),
    ([{ parsed: generics }, data, { genericsDef }]) => ({ generics: generics ?? [], genericsDef, data })
  )

const _fnGenericsArgsRetType: Parser<{ genericsDef: Map<string, CodeSection>; fnType: FnType }> = map(
  _withFnGenerics(
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
    )
  ),
  ({
    genericsDef,
    generics,
    data: {
      parsed: [
        _,
        {
          parsed: [{ parsed: args }, restArg],
        },
        ___,
        { parsed: returnType },
      ],
    },
  }) => ({
    genericsDef,
    fnType: {
      args,
      generics,
      restArg: restArg !== null ? restArg.parsed : null,
      returnType,
      method: null,
    },
  })
)

export const fnType: Parser<FnType> = map(
  combine(exact('fn'), _fnGenericsArgsRetType),
  ([_, { parsed: fn }]) => fn.fnType
)

export const fnDecl: Parser<{ name: Token<string>; fnType: FnType; genericsDef: Map<string, CodeSection> }> = map(
  combine(exact('fn'), s, identifier, _fnGenericsArgsRetType),
  ([_, __, name, { parsed: fn }]) => ({ name, fnType: fn.fnType, genericsDef: fn.genericsDef })
)

export const methodDecl: Parser<{
  name: Token<string>
  method: MethodInfos
  genericsDef: Map<string, CodeSection>
  fnType: FnType
}> = map(
  combine(
    exact('@method'),
    _withFnGenerics(
      combine(
        combine(maybe_s, exact('(', 'expected an opening parenthesis'), maybe_s),
        failure(identifier, 'expected an identifier for the "self" reference'),
        combine(maybe_s, exact(':', 'expected a separator ":" symbol after the "self" reference name'), maybe_s),
        failure(
          withLatelyDeclared(() => valueType),
          'expected a type definition on which this method can be applied'
        ),
        combine(
          maybe_s,
          exact(')', 'expected a closing parenthesis ")" after the method\'s applicable type'),
          failure(s_nl, 'expected a space or newline after closing parenthesis'),
          exact('fn', 'expected a "fn" keyword'),
          failure(s, 'expected a space after the "fn" keyword')
        ),
        failure(identifier, 'expected a function identifier'),
        maybe_s,
        failure(_fnGenericsArgsRetType, 'expected a function declaration')
      )
    )
  ),
  ([
    _,
    {
      parsed: {
        generics,
        genericsDef,
        data: {
          parsed: [__, selfArg, ___, forType, ____, name, _____, { parsed: fn }],
        },
      },
    },
  ]) => ({
    name,
    method: { forType, selfArg, generics },
    fnType: { ...fn.fnType, method: { forType, selfArg, generics } },
    // TODO: to optimize
    genericsDef: new Map([...fn.genericsDef.entries()].concat([...genericsDef.entries()])),
  })
)
