import { ErrorMapping, Parser, Token, withErr } from './base'

export function map<T, U>(
  parser: Parser<T>,
  mapper: (value: T, parsed: Token<T>) => U,
  error?: ErrorMapping
): Parser<U> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    return parsed.ok
      ? { ...parsed, data: { ...parsed.data, parsed: mapper(parsed.data.parsed, parsed.data) } }
      : withErr(parsed, context, error)
  }
}

export function mapFull<T, U>(
  parser: Parser<T>,
  mapper: (value: T, parsed: Token<T>) => Token<U>,
  error?: ErrorMapping
): Parser<U> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    return parsed.ok ? { ok: true, data: mapper(parsed.data.parsed, parsed.data) } : withErr(parsed, context, error)
  }
}

export function silence<T>(parser: Parser<T>): Parser<void> {
  return map(parser, (_) => {})
}

export function unify(parser: Parser<unknown>): Parser<string> {
  return map(parser, (_, parsed) => parsed.matched)
}

export function toOneProp<P extends string, T>(parser: Parser<T>, prop: P): Parser<{ [prop in P]: Token<T> }> {
  return map(parser, (_, value) => ({ [prop]: value } as { [prop in P]: Token<T> }))
}
