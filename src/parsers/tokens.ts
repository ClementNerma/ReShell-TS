import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { failIfMatches, notStartingWith } from './lib/conditions'
import { buildUnicodeRegexMatcher, unicodeAlphanumericUnderscore, unicodeDigit } from './lib/littles'
import { oneOfWords } from './lib/matchers'
import { map } from './lib/transform'

export const keyword: Parser<string> = oneOfWords([
  'if',
  'else',
  'elif',
  'fn',
  'return',
  'for',
  'while',
  'wait',
  'on',
  'throw',
  'async',
  'let',
  'void',
  'struct',
  'enum',
  '_',
])

export const identifier: Parser<string> = map(
  combine(
    failIfMatches(keyword, 'cannot use a reserved keyword as an identifier'),
    failIfMatches(unicodeDigit),
    unicodeAlphanumericUnderscore
  ),
  ([_, __, { parsed: keyword }]) => keyword
)

export const cmdName: Parser<string> = buildUnicodeRegexMatcher((l, d) => `(${l}|${d}|[_\\-])+`)

export const cmdAction: Parser<string> = notStartingWith(
  unicodeDigit,
  buildUnicodeRegexMatcher((l, d) => `(${l}|${d}|[_\\-])+`)
)
