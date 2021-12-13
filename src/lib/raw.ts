import { Parser, ParserErrStackEntryMessage, ParsingContext } from './base'

export function matches<C>(input: string, parser: Parser<unknown>, $custom: C) {
  const context: ParsingContext = { source: { ref: input }, $custom, self: () => context }
  return parser({ line: 0, col: 0 }, input, context).ok
}

export function matcher<C>(parser: Parser<unknown>, $custom: C): (input: string) => boolean {
  return (input) => matches(input, parser, $custom)
}

export function addTipIf(message: string, cond: boolean, tip: string): string | ParserErrStackEntryMessage {
  return cond ? { message, tip } : message
}