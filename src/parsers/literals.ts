import { LiteralValue } from '../shared/ast'
import { Token } from '../shared/parsed'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { failIfMatches, notFollowedBy } from './lib/conditions'
import { lookahead } from './lib/consumeless'
import { digit, unicodeAlphanumericUnderscore } from './lib/littles'
import { takeWhile1, takeWhileN } from './lib/loops'
import { exact, match, oneOfMap, regex } from './lib/matchers'
import { mappedCases, or } from './lib/switches'
import { map, toOneProp, unify } from './lib/transform'

export const rawPath: Parser<Token<string>[]> = takeWhileN(
  unify(takeWhile1(or([unicodeAlphanumericUnderscore, exact('.'), match(/\\./)]))),
  { inter: exact('/'), minimum: 2 }
)

export const rawString: Parser<string> = map(
  combine(
    exact('"'),
    match(/([^\\"\$\n]|\\[^\n])+/),
    failIfMatches(lookahead(exact('$'))),
    exact('"', 'Opened string has not been closed with a quote (")')
  ),
  ([_, { parsed: content }]) => content
)

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
        regex(/(-)?0x([0-9a-fA-F]+)/, ([_, neg, num]) => parseInt(num, 16) * (neg ? -1 : 1)),
        regex(/(-)?0b([0-1]+)/, ([_, neg, num]) => parseInt(num, 2) * (neg ? -1 : 1)),
        regex(/(-)?0o([0-7]+)/, ([_, neg, num]) => parseInt(num, 8) * (neg ? -1 : 1)),
        regex(/(-)?0*(\d+(\.\d+)?)/, ([neg, _, num]) => parseFloat(num) * (neg ? -1 : 1)),
      ]),
      digit,
      'Unexpected token in number'
    ),
    'value'
  ),

  string: toOneProp(rawString, 'value'),

  path: toOneProp(rawPath, 'segments'),
})
