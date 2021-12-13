import { FormatableErrInput } from '../../shared/errors'
import { Parser, ParsingContext } from './base'

export function matches<C>(input: string, parser: Parser<unknown>, $custom: C) {
  const context: ParsingContext = { source: { ref: input }, $custom, self: () => context }
  return parser({ line: 0, col: 0 }, input, context).ok
}

export function matcher<C>(parser: Parser<unknown>, $custom: C): (input: string) => boolean {
  return (input) => matches(input, parser, $custom)
}

export function addComplementsIf(
  message: string,
  cond: boolean,
  complements: [string, string][]
): string | FormatableErrInput {
  return cond ? { message, complements } : message
}
