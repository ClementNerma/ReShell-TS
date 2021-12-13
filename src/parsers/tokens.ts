import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { failIfMatches } from './lib/conditions'
import { buildUnicodeRegexMatcher, unicodeAlphanumericUnderscore } from './lib/littles'
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
  'try',
  'catch',
  'type',
  'wait',
  'on',
  'throw',
  'async',
  'let',
  'void',
  'bool',
  'number',
  'float',
  'int',
  'path',
  'list',
  'map',
  'struct',
  'unknown',
])

export const identifier: Parser<string> = map(
  combine(failIfMatches(keyword, 'cannot use a reserved keyword as an identifier'), unicodeAlphanumericUnderscore),
  ([_, { parsed: keyword }]) => keyword
)

export const cmdName: Parser<string> = buildUnicodeRegexMatcher((l, d) => `(${l}|${d}|[_\\-])+`)

export const cmdAction: Parser<string> = buildUnicodeRegexMatcher((l, d) => `(${l}|${d}|[_\\-])+`)
