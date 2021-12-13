import { Parser } from '../lib/base'
import { unicodeAlphanumericUnderscore } from '../lib/littles'
import { oneOfWords } from '../lib/matchers'

export const identifier: Parser<string> = unicodeAlphanumericUnderscore

export const keyword: Parser<string> = oneOfWords([
  'if',
  'else',
  'elif',
  'fn',
  'end',
  'return',
  'for',
  'while',
  'try',
  'catch',
  'type',
  'wait',
  'async',
])
