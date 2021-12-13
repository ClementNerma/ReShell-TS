import {
  err,
  ErrFnData,
  ErrorMapping,
  neutralError,
  Parser,
  ParserErr,
  ParserResult,
  ParserSucess,
  sliceInput,
  withErr,
} from './base'

export function inspectOk<T>(parser: Parser<T>, inspector: (result: ParserSucess<T>) => void): Parser<T> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    if (parsed.ok) inspector(parsed)
    return parsed
  }
}

export function inspectErr<T>(parser: Parser<T>, inspector: (result: ParserErr) => void): Parser<T> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    if (!parsed.ok) inspector(parsed)
    return parsed
  }
}

export function nothing(): Parser<void> {
  return (start, _, __) => neutralError(start)
}

export function fail<T>(error?: string): Parser<T> {
  return (start, _, context) => err(start, context, error)
}

export function inspect<T>(parser: Parser<T>, inspector: (result: ParserResult<T>) => void): Parser<T> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    inspector(parsed)
    return parsed
  }
}

export function lookahead<T>(parser: Parser<T>, error?: ErrorMapping): Parser<void> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    return parsed.ok ? neutralError(start) : withErr(parsed, context, error)
  }
}

export type LookaheadOptions = {
  error?: ErrFnData
  precedencePassthrough?: boolean
}

export function not<T>(parser: Parser<T>, options?: LookaheadOptions): Parser<void> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    return parsed.ok || parsed.precedence === options?.precedencePassthrough
      ? err(start, context, options?.error)
      : neutralError(start)
  }
}

export function notFollowedBy<T>(parser: Parser<T>, by: Parser<T>, options?: LookaheadOptions): Parser<T> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    if (!parsed.ok) return parsed

    const following = lookahead(parser)(parsed.data.next, sliceInput(input, start, parsed.data.next), context)
    return following.ok || following.precedence === options?.precedencePassthrough
      ? err(start, context, options?.error)
      : parsed
  }
}

export function followedBy<T>(parser: Parser<T>, error?: ErrFnData): Parser<T> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    if (!parsed.ok) return parsed

    const following = lookahead(parser)(parsed.data.next, sliceInput(input, start, parsed.data.next), context)
    return following.ok ? parsed : err(start, context, error)
  }
}
