import { Parser } from './lib/base'
import { buildUnicodeRegexMatcher, unicodeAlphanumericUnderscore } from './lib/littles'
import { oneOfWords } from './lib/matchers'

export const identifier: Parser<string> = unicodeAlphanumericUnderscore

export const cmdName: Parser<string> = buildUnicodeRegexMatcher((l, d) => `(${l}|${d}|[_\\-])+`)

export const cmdAction: Parser<string> = buildUnicodeRegexMatcher((l, d) => `(${l}|${d}|[_\\-])+`)

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
