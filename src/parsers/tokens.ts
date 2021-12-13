import { Parser } from './lib/base'
import { unicodeAlphanumericUnderscore } from './lib/littles'
import { oneOfWords } from './lib/matchers'

export const identifier: Parser<string> = unicodeAlphanumericUnderscore

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
])
