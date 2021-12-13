import { Parser } from '../lib/base'
import { unicodeAlphanumericUnderscore } from '../lib/littles'

export const identifier: Parser<string> = unicodeAlphanumericUnderscore
