import {
  err,
  ErrFnData,
  neutralError,
  Parser,
  ParserErr,
  ParserResult,
  ParserSucess,
  ParsingContext,
  sliceInput,
  Token,
} from './base'

export function ifThen<T>(cond: Parser<unknown>, then: Parser<T>): Parser<T | null> {
  return (start, input, context) => {
    const parsed = cond(start, input, { ...context, failureWillBeNeutral: true })
    if (!parsed.ok) return neutralError(start, null)

    return then(start, input, context)
  }
}

// Doc: harder to use
export function ifThenElse<T>(cond: Parser<unknown>, then: Parser<T>, els: Parser<T>): Parser<T> {
  return (start, input, context) => {
    const parsed = cond(start, input, { ...context, failureWillBeNeutral: true })
    return parsed.ok ? then(start, input, context) : els(start, input, context)
  }
}

export function failIf(failIf: Parser<unknown>, error?: ErrFnData): Parser<unknown> {
  return (start, input, context) => {
    const parsed = failIf(start, input, { ...context, failureWillBeNeutral: true })
    return parsed.ok ? err(start, context, error) : neutralError(start)
  }
}

export function failIfElse<T>(failIf: Parser<unknown>, els: Parser<T>): Parser<T> {
  return (start, input, context) => {
    const parsed = failIf(start, input, context)
    return parsed.ok ? err(start, context) : els(start, input, context)
  }
}

export function notFollowedBy<T>(parser: Parser<T>, notFollowedBy: Parser<unknown>, error?: ErrFnData): Parser<T> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    if (!parsed.ok) return parsed

    const not = notFollowedBy(parsed.data.next, sliceInput(input, start, parsed.data.next), context)
    return not.ok ? err(start, context, error) : parsed
  }
}

export function maybe<T>(parser: Parser<T>): Parser<T | null> {
  return (start, input, context) => {
    const parsed = parser(start, input, { ...context, failureWillBeNeutral: true })
    return parsed.ok || parsed.precedence ? parsed : neutralError(start, null)
  }
}

export function maybeFlatten<T>(parser: Parser<Token<T>>): Parser<T | null> {
  return (start, input, context) => {
    const parsed = parser(start, input, { ...context, failureWillBeNeutral: true })
    return parsed.ok
      ? { ...parsed, data: { ...parsed.data, parsed: parsed.data.parsed.parsed } }
      : parsed.precedence
      ? parsed
      : neutralError(start, null)
  }
}

export function flatten<T>(parser: Parser<Token<T>>): Parser<T> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    return parsed.ok ? { ...parsed, data: { ...parsed.data, parsed: parsed.data.parsed.parsed } } : parsed
  }
}

export function extract<T>(parser: Parser<Token<T>[]>): Parser<T[]> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    return parsed.ok
      ? { ...parsed, data: { ...parsed.data, parsed: parsed.data.parsed.map((item) => item.parsed) } }
      : parsed
  }
}

export function then<T>(
  parser: Parser<T>,
  then: (parsed: ParserSucess<T>, context: ParsingContext) => ParserResult<T>
): Parser<T> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    return parsed.ok ? then(parsed, context) : parsed
  }
}

export function thenErr<T>(parser: Parser<T>, thenErr: (parsed: ParserErr) => ParserResult<T>): Parser<T> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    return parsed.ok ? parsed : thenErr(parsed)
  }
}
