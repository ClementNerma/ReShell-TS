import { ErrorMapping, Parser, ParsingContext, withErr } from './base'

export type NotOptions = {
  error?: string
  precedencePassthrough?: boolean
}

export function failure<T>(parser: Parser<T>, error: ErrorMapping): Parser<T> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    return parsed.ok ? parsed : withErr(parsed, context, error)
  }
}

export function contextualFailure<T>(
  parser: Parser<T>,
  cond: (context: ParsingContext) => boolean,
  error: ErrorMapping
): Parser<T> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    return parsed.ok ? parsed : cond(context) ? withErr(parsed, context, error) : parsed
  }
}

export function failureMaybe<T>(parser: Parser<T>, error: ErrorMapping | undefined): Parser<T> {
  return error === undefined
    ? parser
    : (start, input, context) => {
        const parsed = parser(start, input, context)
        return parsed.ok ? parsed : withErr(parsed, context, error)
      }
}
