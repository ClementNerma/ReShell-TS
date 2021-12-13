import {
  ClosureArg,
  ClosureBody,
  ComputedPathSegment,
  ComputedStringSegment,
  FnCallArg,
  InlineChainedCmdCall,
  InlineCmdCallCapture,
  Value
} from '../shared/ast'
import { cmdFlag } from './cmdarg'
import { cmdCall } from './cmdcall'
import { withStatementClosingChar } from './context'
import { expr } from './expr'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { extract, failIfMatches, failIfMatchesAndCond, failIfMatchesElse } from './lib/conditions'
import { lookahead, not } from './lib/consumeless'
import { failure } from './lib/errors'
import { buildUnicodeRegexMatcher, maybe_s, maybe_s_nl, unicodeAlphanumericUnderscore } from './lib/littles'
import { takeWhile, takeWhile1 } from './lib/loops'
import { exact, match, oneOfMap } from './lib/matchers'
import { mappedCases, mappedCasesComposed, or } from './lib/switches'
import { map, toOneProp } from './lib/transform'
import { withLatelyDeclared } from './lib/utils'
import { literalValue, rawString } from './literals'
import { blockBody } from './statements'
import { endOfInlineCmdCall, statementChainOp } from './stmtend'
import { identifier, keyword } from './tokens'

export const value: Parser<Value> = mappedCasesComposed<Value>()('type', literalValue, {
  computedString: map(
    combine(
      exact('"'),
      takeWhile(
        or<ComputedStringSegment>([
          map(match(/([^\\"\$\n]|\\[^\n])+/), (_, content) => ({ type: 'literal', content })),
          map(
            combine(
              combine(
                exact('$'),
                exact('{', {
                  message: 'expecting an expression',
                  complements: [
                    ['tip', 'if you want to write an expression, write "${" to open it and "}" to close it'],
                    ['tip', 'if you want to write the "$" symbol alone, you can escape it with a backslash "\\"'],
                  ],
                }),
                maybe_s_nl
              ),
              failure(
                withLatelyDeclared(() => expr),
                'failed to parse the inner expression'
              ),
              combine(maybe_s_nl, exact('}', 'expected a closing brace (}) to close the inner expression'))
            ),
            ([_, expr]) => ({ type: 'expr', expr })
          ),
        ])
      ),
      exact('"', 'opened string has not been closed with a quote (")')
    ),
    ([_, { parsed: segments }, __]) => ({ segments })
  ),

  computedPath: map(
    failIfMatchesAndCond(
      takeWhile1(
        or<ComputedPathSegment>([
          map(exact('/'), () => ({ type: 'separator' })),
          map(
            buildUnicodeRegexMatcher((l, d) => `(${l}|${d}|\\.|\\\\.)+`),
            (_, content) => ({ type: 'literal', content })
          ),
          map(
            combine(
              combine(exact('${'), maybe_s_nl),
              failure(
                withLatelyDeclared(() => expr),
                'failed to parse the inner expression'
              ),
              combine(maybe_s_nl, exact('}', 'expected a closing brace (}) to close the inner path expression'))
            ),
            ([_, expr, __]) => ({ type: 'expr', expr })
          ),
        ])
      ),
      (segments) => !segments.find(({ parsed: segment }) => segment.type === 'separator')
    ),
    (segments) => ({ segments })
  ),

  list: or([
    map(combine(exact('['), maybe_s_nl, exact(']')), (_) => ({ items: [] })),

    map(
      combine(
        combine(exact('['), maybe_s_nl),
        takeWhile(
          withLatelyDeclared(() => expr),
          { inter: combine(maybe_s_nl, exact(','), maybe_s_nl), interExpect: 'expected another list item' }
        ),
        combine(maybe_s_nl, exact(']', "expected a closing bracket (]) to end the list's content"))
      ),
      ([_, { parsed: items }, __]) => ({ items })
    ),
  ]),

  map: map(
    combine(
      combine(exact('map:('), maybe_s_nl),
      extract(
        takeWhile(
          map(
            combine(
              failIfMatches(lookahead(unicodeAlphanumericUnderscore), {
                message: "expected either an identifier or the end of the map's content",
                complements: [['tip', 'key names in map values must be written between quotes']],
              }),
              rawString,
              combine(maybe_s, exact(':'), maybe_s_nl),
              withLatelyDeclared(() => expr)
            ),
            ([_, key, __, value]) => ({ key, value })
          ),
          {
            inter: combine(maybe_s_nl, exact(','), maybe_s_nl),
            interExpect: 'expected either a key name, or a closing parenthesis ")" to close the map',
          }
        )
      ),
      combine(maybe_s_nl, exact(')', 'expected a key name'))
    ),
    ([_, { parsed: entries }, __]) => ({ entries })
  ),

  struct: map(
    combine(
      combine(exact('{'), maybe_s_nl),
      extract(
        takeWhile(
          map(
            combine(
              identifier,
              combine(maybe_s, exact(':'), maybe_s_nl),
              withLatelyDeclared(() => expr)
            ),
            ([name, _, value]) => ({ name, value })
          ),
          {
            inter: combine(maybe_s_nl, exact(','), maybe_s_nl),
            interExpect: 'expected either a member name, or a closing brace (}) to close the structure',
          }
        )
      ),
      combine(maybe_s_nl, exact('}', 'expected a closing brace (}) to close the structure'))
    ),
    ([_, { parsed: members }, __]) => ({ members })
  ),

  // closure: map(
  //   combine(
  //     withLatelyDeclared(() => fnType),
  //     combine(maybe_s_nl, exact('{', 'expected an opening brace ({)'), maybe_s_nl),
  //     withStatementClosingChar(
  //       '}',
  //       withLatelyDeclared(() => blockBody)
  //     ),
  //     combine(maybe_s_nl, exact('}', "expected a closing brace (}) after the closure's content"))
  //   ),
  //   ([{ parsed: fnType }, __, body, ___]) => ({ fnType, body })
  // ),

  callback: map(
    combine(
      combine(exact('fn'), maybe_s, exact('('), maybe_s_nl),
      takeWhile(
        mappedCases<ClosureArg>()('type', {
          flag: withLatelyDeclared(() => cmdFlag),
          variable: map(identifier, (_, name) => ({ name })),
        }),
        { inter: combine(maybe_s_nl, exact(','), maybe_s_nl), interExpect: 'expected another argument name' }
      ),
      combine(
        maybe_s_nl,
        exact(')', "expected a closing parenthesis ')' after the arguments list"),
        maybe_s_nl,
        exact('=>', 'expected a body arrow (=>)'),
        maybe_s_nl
      ),
      mappedCases<ClosureBody>()('type', {
        block: map(
          combine(
            exact('{'),
            maybe_s_nl,
            withStatementClosingChar(
              '}',
              withLatelyDeclared(() => blockBody)
            ),
            maybe_s_nl,
            exact('}')
          ),
          ([_, __, body]) => ({ body })
        ),
        expr: map(
          withLatelyDeclared(() => expr),
          (_, body) => ({ body })
        ),
      })
    ),
    ([_, { parsed: args }, __, body]) => ({ args, body })
  ),

  fnCall: map(
    combine(
      failure(not(keyword), 'cannot use reserved keyword alone'),
      identifier,
      combine(maybe_s, exact('('), maybe_s_nl),
      withStatementClosingChar(
        ')',
        takeWhile(
          failIfMatchesElse(
            endOfInlineCmdCall,
            failure(
              mappedCases<FnCallArg>()('type', {
                flag: withLatelyDeclared(() => cmdFlag),
                expr: toOneProp(
                  withLatelyDeclared(() => expr),
                  'expr'
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
    ([_, name, __, { parsed: args }]) => ({ name, args })
  ),

  inlineCmdCallSequence: map(
    combine(
      oneOfMap<InlineCmdCallCapture>([
        ['$*(', 'Both'],
        ['$!(', 'Stderr'],
        ['$(', 'Stdout'],
      ]),
      maybe_s_nl,
      failure(
        withStatementClosingChar(
          ')',
          withLatelyDeclared(() => cmdCall(endOfInlineCmdCall))
        ),
        'expected inline command call'
      ),
      takeWhile<InlineChainedCmdCall>(
        map(
          combine(
            maybe_s,
            statementChainOp,
            maybe_s_nl,
            failure(
              withLatelyDeclared(() => cmdCall(endOfInlineCmdCall)),
              'expected inline command call after chaining operator'
            )
          ),
          ([_, op, __, chainedCmdCall]) => ({ op, chainedCmdCall })
        ),
        { inter: maybe_s, interExpect: false }
      ),
      combine(maybe_s_nl, exact(')', "expected closing paren ')' after inline command call"))
    ),
    ([capture, _, start, { parsed: sequence }]) => ({ start, sequence, capture })
  ),

  // FIX: TypeScript compiler produced an error because of the produced union being too complex
  // with "toOneProp(identifier, 'varname')"
  reference: map(identifier, (_, varname) => ({ varname })),
})
