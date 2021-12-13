import { err, ErrInputData, Parser, ParsingContext, phantomSuccess, withErr, WithErrData } from './base'

export function failure<T>(parser: Parser<T>, error: WithErrData): Parser<T> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    return parsed.ok
      ? parsed
      : parsed.precedence
      ? withErr(parsed, error)
      : withErr({ ...parsed, start, next: start }, error)
  }
}

export function contextualFailure<T>(
  parser: Parser<T>,
  cond: (context: ParsingContext) => boolean,
  error: WithErrData
): Parser<T> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    return parsed.ok ? parsed : cond(context) ? withErr(parsed, error) : parsed
  }
}

export function contextualFailIf(
  parser: Parser<unknown>,
  cond: (context: ParsingContext) => boolean,
  error: ErrInputData
): Parser<void> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    return parsed.ok
      ? cond(context)
        ? err(start, start, context, error)
        : phantomSuccess(start)
      : phantomSuccess(start)
  }
}

export function failureMaybe<T>(parser: Parser<T>, error: WithErrData | undefined): Parser<T> {
  return error === undefined
    ? parser
    : (start, input, context) => {
        const parsed = parser(start, input, context)
        return parsed.ok ? parsed : withErr(parsed, error)
      }
}
