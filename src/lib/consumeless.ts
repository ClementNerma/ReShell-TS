import { err, ErrorMapping, neutralError, Parser, ParserErr, ParserResult, ParserSucess, withErr } from './base'
import { NotOptions } from './errors'

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

export function not<T>(parser: Parser<T>, options?: NotOptions): Parser<void> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    return parsed.ok || parsed.precedence === options?.precedencePassthrough
      ? err(start, context, options?.error)
      : neutralError(start)
  }
}

export function lookahead<T>(parser: Parser<T>, error?: ErrorMapping): Parser<void> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    return parsed.ok ? neutralError(start) : withErr(parsed, context, error)
  }
}
