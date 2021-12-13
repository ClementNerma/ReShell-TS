import { FnCall, FnCallArg, ValueType } from '../shared/ast'
import { withStatementClosingChar } from './context'
import { expr } from './expr'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { failIfMatchesElse, maybe } from './lib/conditions'
import { not } from './lib/consumeless'
import { failure } from './lib/errors'
import { maybe_s, maybe_s_nl } from './lib/littles'
import { takeWhile, takeWhile1 } from './lib/loops'
import { exact, oneOf } from './lib/matchers'
import { mappedCases, or } from './lib/switches'
import { map, toOneProp } from './lib/transform'
import { withLatelyDeclared } from './lib/utils'
import { identifier, keyword, stmtEnd } from './tokens'
import { valueType } from './types'

export const fnCall: Parser<FnCall> = map(
  combine(
    failure(not(keyword), 'cannot use reserved keyword alone'),
    identifier,
    maybe(
      map(
        combine(
          exact('::<'),
          takeWhile1<ValueType | null>(or([map(exact('_'), () => null), valueType]), {
            inter: combine(maybe_s_nl, exact(','), maybe_s_nl),
            interExpect: 'expected another generic',
          }),
          exact('>', 'expecting a closing (>) symbol after the generics')
        ),
        ([_, generics]) => generics
      )
    ),
    combine(maybe_s, exact('('), maybe_s_nl),
    withStatementClosingChar(
      ')',
      takeWhile(
        failIfMatchesElse(
          stmtEnd,
          failure(
            mappedCases<FnCallArg>()('type', {
              flag: map(
                combine(
                  oneOf(['--', '-']),
                  failure(identifier, 'expected a flag identifier'),
                  maybe(
                    map(
                      combine(
                        exact('='),
                        maybe_s_nl,
                        failure(
                          withLatelyDeclared(() => expr),
                          'expected an expression after the flag separator (:) symbol'
                        )
                      ),
                      ([_, __, directValue]) => directValue
                    )
                  )
                ),
                ([prefixSym, name, { parsed: directValue }]) => ({ prefixSym, name, directValue })
              ),
              expr: toOneProp(
                'expr',
                withLatelyDeclared(() => expr)
              ),
            }),
            'invalid argument provided'
          )
        ),
        { inter: combine(maybe_s_nl, exact(','), maybe_s_nl), interExpect: 'expected another argument' }
      )
    ),
    combine(maybe_s_nl, exact(')', 'expected a closing parenthesis to end the list of arguments'))
  ),
  ([_, name, { parsed: generics }, __, { parsed: args }], { at }) => ({ at, name, generics, args })
)
