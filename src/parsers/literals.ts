import { Parser, Token } from '../lib/base'
import { combine } from '../lib/combinations'
import { extract, failIfElse } from '../lib/conditions'
import { failure } from '../lib/errors'
import { maybe_s_nl, unicodeAlphanumericUnderscore } from '../lib/littles'
import { takeForever, takeWhile, takeWhile1N, takeWhileMN } from '../lib/loops'
import { exact, match, oneOfMap, regex } from '../lib/matchers'
import { mappedCases, or } from '../lib/switches'
import { map, toOneProp, unify } from '../lib/transform'
import { mapToken, withLatelyDeclared } from '../lib/utils'
import { matchStatementClose, withStatementClose } from './context'
import { ComputedStringSegment, LiteralString, LiteralValue } from './data'
import { expr } from './expr'
import { statementChainFree } from './statements'
import { identifier } from './tokens'
import { fnType } from './types'

export const literalPath: Parser<Token<string>[]> = takeWhileMN(
  unify(takeWhile1N(or([unicodeAlphanumericUnderscore, exact('.'), match(/\\./)]))),
  {
    inter: exact('/'),
    minimum: 2,
  }
)

export const literalString: Parser<LiteralString> = or<LiteralString>([
  map(combine(exact('r"'), match(/([^\\"\n]|\\[^\n])*/), exact('"')), ([_, content, __]) => ({
    type: 'raw',
    content,
  })),
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
              exact('}', 'Expected a closing brace (}) to close the inner expression')
            ),
            ([_, expr, __]) => ({ type: 'expr', expr })
          ),
        ])
      ),
      exact('"')
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

  list: map(
    combine(
      exact('['),
      takeWhile(
        withLatelyDeclared(() => expr),
        { inter: combine(maybe_s_nl, exact(','), maybe_s_nl) }
      ),
      exact(']'),
      {
        inter: maybe_s_nl,
      }
    ),
    ([_, items, __]) => ({ items })
  ),

  map: map(
    combine(
      exact('{'),
      extract(
        takeWhile(
          combine(
            identifier,
            exact(':'),
            withLatelyDeclared(() => expr),
            { inter: maybe_s_nl }
          ),
          {
            inter: combine(maybe_s_nl, exact(','), maybe_s_nl),
          }
        )
      ),
      exact('}'),
      {
        inter: maybe_s_nl,
      }
    ),
    ([_, entries, __]) => ({
      entries: mapToken(entries, (_, { parsed }) => parsed.map((entry) => [entry[0], entry[2]])),
    })
  ),

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
