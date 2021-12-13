import { Parser, Token } from '../lib/base'
import { combine } from '../lib/combinations'
import { failIfElse } from '../lib/conditions'
import { failure } from '../lib/errors'
import { maybe_s_nl, unicodeAlphanumericUnderscore } from '../lib/littles'
import { takeForever, takeWhile, takeWhile1N, takeWhileMN } from '../lib/loops'
import { exact, match, oneOfMap, regex } from '../lib/matchers'
import { mappedCases, or } from '../lib/switches'
import { map, toOneProp, unify } from '../lib/transform'
import { withLatelyDeclared } from '../lib/utils'
import { matchStatementClose, withStatementClose } from './context'
import { ComputedStringSegment, LiteralString, LiteralValue } from './data'
import { expr } from './expr'
import { statementChainFree } from './statements'
import { fnType } from './types'

export const literalPath: Parser<Token<string>[]> = takeWhileMN(
  unify(takeWhile1N(or([unicodeAlphanumericUnderscore, exact('.'), match(/\\./)]))),
  {
    inter: exact('/'),
    minimum: 2,
  }
)

export const literalString: Parser<LiteralString> = or<LiteralString>([
  map(
    combine(
      exact('r"'),
      match(/([^\\"\n]|\\[^\n])*/),
      exact('"', 'Syntax error: opened string has not been closed with a quote (")')
    ),
    ([_, content, __]) => ({
      type: 'raw',
      content,
    })
  ),
  map(
    combine(
      exact('"'),
      takeWhile(
        or<ComputedStringSegment>([
          map(match(/([^\\"\$\n]|\\[^\n])+/), (_, content) => ({ type: 'literal', content })),
          map(
            combine(
              exact('${'),
              failure(
                withLatelyDeclared(() => expr),
                'Failed to parse the inner expression'
              ),
              exact('}', 'Syntax error: expected a closing brace (}) to close the inner expression'),
              { inter: maybe_s_nl }
            ),
            ([_, expr, __]) => ({ type: 'expr', expr })
          ),
        ])
      ),
      exact('"', 'Syntax error: opened string has not been closed with a quote (")')
    ),
    ([_, segments, __]) => ({
      type: 'computed',
      segments: segments.parsed,
    })
  ),
])

export const literalValue: Parser<LiteralValue> = mappedCases<LiteralValue>()('type', {
  bool: map(
    oneOfMap([
      ['true', true],
      ['false', false],
    ]),
    (_, value) => ({ value })
  ),

  number: map(
    regex(/\d+(\.\d+)?/, (num) => parseFloat(num[0])),
    (_, value) => ({ value })
  ),

  string: toOneProp(literalString, 'value'),

  path: toOneProp(literalPath, 'segments'),

  closure: map(
    combine(
      fnType,
      exact('{', "Syntax error: expected an opening brace ({) for the closure's content"),
      withStatementClose(
        '}',
        takeForever(
          failIfElse(
            matchStatementClose,
            withLatelyDeclared(() => statementChainFree)
          )
        )
      ),
      exact('}', "Syntax error: expected a closing brace (}) after the closure's content"),
      { inter: maybe_s_nl }
    ),
    ([fnType, __, body, ___]) => ({ fnType: fnType.parsed, body: body.parsed })
  ),
})
