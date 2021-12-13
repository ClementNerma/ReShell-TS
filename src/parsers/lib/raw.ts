import { FormatableErrInput } from '../../shared/errors'
import { Parser, ParsingContext } from './base'
import { StrView } from './strview'

export function matches<C>(source: StrView, parser: Parser<unknown>, $custom: C) {
  const context: ParsingContext = { source, $custom, self: () => context }
  return parser({ line: 0, col: 0 }, source, context).ok
}

export function matcher<C>(parser: Parser<unknown>, $custom: C): (source: StrView) => boolean {
  return (source) => matches(source, parser, $custom)
}

export function addComplementsIf(
  message: string,
  cond: boolean,
  complements: [string, string][]
): string | FormatableErrInput {
  return cond ? { message, complements } : message
}
