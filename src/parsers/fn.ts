import { FnArg, FnType } from '../shared/ast'
import { Token } from '../shared/parsed'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { failIfMatches, maybe } from './lib/conditions'
import { always, notFollowedBy } from './lib/consumeless'
import { failure } from './lib/errors'
import { maybe_s, maybe_s_nl, s, unicodeSingleLetter } from './lib/littles'
import { takeWhile } from './lib/loops'
import { exact } from './lib/matchers'
import { or } from './lib/switches'
import { map } from './lib/transform'
import { getErrorInput, withLatelyDeclared } from './lib/utils'
import { literalValue } from './literals'
import { identifier } from './tokens'
import { valueType } from './types'

const fnArg: Parser<FnArg> = map(
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
      map(combine(exact('--'), failure(identifier, 'expected a flag name')), ([flag, name]) => ({
        flag,
        name,
      })),
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
    failure(
      withLatelyDeclared(() => valueType),
      'expected a type for the argument'
    ),
    maybe(
      map(
        combine(
          combine(maybe_s_nl, exact('='), maybe_s_nl),
          failure(
            withLatelyDeclared(() => literalValue),
            (err) => ({
              message: 'expected a literal value',
              complements: [
                [
                  'tip',
                  getErrorInput(err).startsWith('"')
                    ? "literal strings must be single-quoted (')"
                    : 'lists, maps and structures are not literal values',
                ],
              ],
            })
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

const fn: (requireName: boolean) => Parser<FnType & { name: Token<string> | null }> = (requireName) =>
  map(
    combine(
      map(
        combine(exact('fn'), requireName ? map(combine(s, identifier), ([_, name]) => name) : always(null)),
        ([_, { parsed: name }]) => name
      ),
      combine(maybe_s, exact('(', "expected an opening parenthesis '('"), maybe_s_nl),
      takeWhile(fnArg, {
        inter: combine(maybe_s_nl, exact(','), maybe_s_nl, failIfMatches(exact('...'))),
        interExpect: 'expected an argument name',
      }),
      maybe(
        map(
          combine(
            maybe_s_nl,
            exact(','),
            maybe_s_nl,
            exact('...'),
            failure(identifier, 'expected a rest argument identifier')
          ),
          ([_, __, ___, ____, restArg]) => restArg
        )
      ),
      combine(maybe_s_nl, exact(')', "expected a closing paren ')'")),
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
      ),
      maybe(
        map(
          combine(
            maybe_s,
            exact('throws'),
            s,
            failure(
              withLatelyDeclared(() => valueType),
              'expected a failure type'
            )
          ),
          ([_, __, ___, failureType]) => failureType
        )
      )
    ),
    ([
      { parsed: name },
      _,
      { parsed: args },
      { parsed: restArg },
      __,
      { parsed: returnType },
      { parsed: failureType },
    ]) => ({
      name,
      args,
      restArg,
      returnType,
      failureType,
    })
  )

export const fnType: Parser<FnType> = fn(false)
export const fnDecl: Parser<{ name: Token<string>; fnType: FnType }> = map(fn(true), (fnType) => ({
  name: fnType.name!,
  fnType,
}))
