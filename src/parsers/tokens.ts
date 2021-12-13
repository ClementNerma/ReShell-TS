import { Parser } from '../lib/base'
import { combine } from '../lib/combinations'
import { not } from '../lib/consumeless'
import { digit, unicodeAlphanumericUnderscore } from '../lib/littles'
import { map } from '../lib/transform'

export const identifier: Parser<string> = map(
  combine(not(digit, { error: 'Identifier cannot start with a digit' }), unicodeAlphanumericUnderscore),
  ([_, ident]) => ident.parsed
)
