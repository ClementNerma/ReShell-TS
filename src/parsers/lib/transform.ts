import { Token } from '../../shared/parsed'
import { Parser, ParserErr, ParsingContext, withErr, WithErrData } from './base'

export function map<T, U>(
  parser: Parser<T>,
  mapper: (value: T, parsed: Token<T>, context: ParsingContext) => U,
  error?: WithErrData
): Parser<U> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)

    return parsed.ok
      ? {
          ok: parsed.ok,
          data: {
            at: parsed.data.at,
            matched: parsed.data.matched,
            parsed: mapper(parsed.data.parsed, parsed.data, context),
          },
        }
      : withErr(parsed, error)
  }
}

export function mapErr<T>(
  parser: Parser<T>,
  mapper: (err: ParserErr, context: ParsingContext) => ParserErr
): Parser<T> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    return parsed.ok ? parsed : mapper(parsed, context)
  }
}

export function silence<T>(parser: Parser<T>): Parser<void> {
  return map(parser, (_) => {})
}

export function unify(parser: Parser<unknown>): Parser<string> {
  return map(parser, (_, parsed) => parsed.matched)
}

export function toOneProp<P extends string, T>(prop: P, parser: Parser<T>): Parser<{ [prop in P]: Token<T> }> {
  return map(parser, (_, value) => ({ [prop]: value } as { [prop in P]: Token<T> }))
}

export function suppressErrorPrecedence<T>(parser: Parser<T>): Parser<T> {
  return mapErr(parser, (err) => ({ ...err, precedence: false }))
}
