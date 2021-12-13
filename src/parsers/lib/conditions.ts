import { CodeLoc, Token } from '../../shared/parsed'
import {
  err,
  ErrInputData,
  Parser,
  ParserErr,
  ParserResult,
  ParserSucess,
  ParsingContext,
  phantomSuccess,
  sliceInput,
} from './base'

export function ifThen<T>(cond: Parser<unknown>, then: Parser<T>): Parser<T | null> {
  return (start, input, context) => {
    const parsed = cond(start, input, { ...context, failureWillBePhantomSuccess: true })
    if (!parsed.ok) return phantomSuccess(start, null)

    return then(start, input, context)
  }
}

// Doc: harder to use
export function ifThenElse<T>(cond: Parser<unknown>, then: Parser<T>, els: Parser<T>): Parser<T> {
  return (start, input, context) => {
    const parsed = cond(start, input, { ...context, failureWillBePhantomSuccess: true })
    return parsed.ok ? then(start, input, context) : els(start, input, context)
  }
}

export function failIf(
  cond: (input: string, context: ParsingContext, start: CodeLoc) => boolean,
  error?: ErrInputData
): Parser<void> {
  return (start, input, context) =>
    cond(input, context, start) ? err(start, start, context, error) : phantomSuccess(start, void 0)
}

export function failIfMatches(parser: Parser<unknown>, error?: ErrInputData): Parser<void> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    return parsed.ok ? err(start, parsed.data.at.next, context, error) : phantomSuccess(start, void 0)
  }
}

export function failIfMatchesWith<T>(parser: Parser<T>, error: (token: Token<T>) => ErrInputData): Parser<void> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    return parsed.ok ? err(start, parsed.data.at.next, context, error(parsed.data)) : phantomSuccess(start, void 0)
  }
}

export function failIfMatchesElse<T>(parser: Parser<unknown>, els: Parser<T>): Parser<T> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    return parsed.ok ? err(start, parsed.data.at.next, context) : els(start, input, context)
  }
}

export function failIfMatchesAndCond<T>(
  parser: Parser<T>,
  cond: (value: T, token: Token<T>) => boolean,
  error?: ErrInputData
): Parser<T> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    if (!parsed.ok) return parsed
    return cond(parsed.data.parsed, parsed.data) ? err(start, parsed.data.at.next, context, error) : parsed
  }
}

export function notFollowedBy<T>(parser: Parser<T>, notFollowedBy: Parser<unknown>, error?: ErrInputData): Parser<T> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    if (!parsed.ok) return parsed

    const not = notFollowedBy(parsed.data.at.next, sliceInput(input, start, parsed.data.at.next), context)
    return not.ok ? err(start, parsed.data.at.next, context, error) : parsed
  }
}

export function maybe<T>(parser: Parser<T>): Parser<T | null> {
  return (start, input, context) => {
    const parsed = parser(start, input, { ...context, failureWillBePhantomSuccess: true })
    return parsed.ok || parsed.precedence ? parsed : phantomSuccess(start, null)
  }
}

export function maybeFlatten<T>(parser: Parser<Token<T>>): Parser<T | null> {
  return (start, input, context) => {
    const parsed = parser(start, input, { ...context, failureWillBePhantomSuccess: true })
    return parsed.ok
      ? { ...parsed, data: { ...parsed.data, parsed: parsed.data.parsed.parsed } }
      : parsed.precedence
      ? parsed
      : phantomSuccess(start, null)
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

export function then<T, U>(
  parser: Parser<T>,
  then: (parsed: ParserSucess<T>, context: ParsingContext) => ParserResult<U>
): Parser<U> {
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
