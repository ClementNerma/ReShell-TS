import { Parser, Token } from '../lib/base'
import { combine } from '../lib/combinations'
import { failIfElse, notFollowedBy } from '../lib/conditions'
import { failure } from '../lib/errors'
import { digit, maybe_s_nl, unicodeAlphanumericUnderscore } from '../lib/littles'
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

export const literalString: Parser<LiteralString> = mappedCases<LiteralString>()('type', {
  raw: map(
    combine(
      exact('r"'),
      match(/([^\\"\n]|\\[^\n])*/),
      exact('"', 'Opened string has not been closed with a quote (")')
    ),
    ([_, content, __]) => ({ content })
  ),

  computed: map(
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
              exact('}', 'Expected a closing brace (}) to close the inner expression'),
              { inter: maybe_s_nl }
            ),
            ([_, expr, __]) => ({ type: 'expr', expr })
          ),
        ])
      ),
      exact('"', 'Opened string has not been closed with a quote (")')
    ),
    ([_, { parsed: segments }, __]) => ({ segments })
  ),
})

export const literalValue: Parser<LiteralValue> = mappedCases<LiteralValue>()('type', {
  null: map(exact('null'), () => ({})),

  bool: map(
    oneOfMap([
      ['true', true],
      ['false', false],
    ]),
    (_, value) => ({ value })
  ),

  number: toOneProp(
    notFollowedBy(
      or([
        regex(/0x([0-9a-fA-F]+)/, ([_, num]) => parseInt(num, 16)),
        regex(/0b([0-1]+)/, ([_, num]) => parseInt(num, 2)),
        regex(/0o([0-7]+)/, ([_, num]) => parseInt(num, 8)),
        regex(/0*(\d+(\.\d+)?)/, ([_, num]) => parseFloat(num)),
      ]),
      digit,
      'Unexpected token in number'
    ),
    'value'
  ),

  string: toOneProp(literalString, 'value'),

  path: toOneProp(literalPath, 'segments'),

  closure: map(
    combine(
      fnType,
      exact('{', "Expected an opening brace ({) for the closure's content"),
      withStatementClose(
        '}',
        takeForever(
          failIfElse(
            matchStatementClose,
            withLatelyDeclared(() => statementChainFree)
          )
        )
      ),
      exact('}', "Expected a closing brace (}) after the closure's content"),
      { inter: maybe_s_nl }
    ),
    ([{ parsed: fnType }, __, { parsed: body }, ___]) => ({ fnType, body })
  ),
})
