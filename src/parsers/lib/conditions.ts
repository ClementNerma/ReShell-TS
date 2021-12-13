import { CodeLoc, Token } from '../../shared/parsed'
import { StrView } from '../../shared/strview'
import { err, ErrInputData, Parser, ParserErr, ParserResult, ParsingContext, phantomSuccess, success } from './base'

export function ifThen<T>(cond: Parser<unknown>, then: Parser<T>): Parser<T | null> {
  return (start, input, context) => {
    const parsed = cond(start, input, context)
    if (!parsed.ok) return phantomSuccess(start, null)

    return then(start, input, context)
  }
}

// Doc: harder to use
export function ifThenElse<T>(cond: Parser<unknown>, then: Parser<T>, els: Parser<T>): Parser<T> {
  return (start, input, context) => {
    const parsed = cond(start, input, context)
    return parsed.ok ? then(start, input, context) : els(start, input, context)
  }
}

export function failIf(
  cond: (input: StrView, context: ParsingContext, start: CodeLoc) => boolean,
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

export function useSeparatorIf<T, U>(
  parser: Parser<Token<T>[]>,
  separator: Parser<unknown>,
  then: Parser<U>
  // sepButNoThen: WithErrData
): Parser<[Token<Token<T>[]>, Token<U> | null]> {
  return (start, input, context): ParserResult<[Token<Token<T>[]>, Token<U> | null]> => {
    const parsed = parser(start, input, context)
    if (!parsed.ok) return parsed

    const sep =
      parsed.data.parsed.length > 0
        ? separator(parsed.data.at.next, input.offset(parsed.data.matched.length), context)
        : phantomSuccess(parsed.data.at.next)

    if (!sep.ok) return success(start, parsed.data.at.next, [parsed.data, null], parsed.data.matched)

    const next = then(sep.data.at.next, input.offset(parsed.data.matched.length + sep.data.matched.length), context)

    if (!next.ok) {
      return next.precedence ? next : success(start, parsed.data.at.next, [parsed.data, null], parsed.data.matched)
      // : parsed.data.parsed.length === 0
      // ? success(start, parsed.data.at.next, [parsed.data, null], parsed.data.matched)
      // : withErr(next, sepButNoThen)
    }

    return next.data.parsed !== null
      ? success(
          start,
          next.data.at.next,
          [parsed.data, next.data],
          parsed.data.matched + sep.data.matched + next.data.matched
        )
      : success(start, parsed.data.at.next, [parsed.data, next.data], parsed.data.matched)
  }
}

export function notFollowedBy<T>(parser: Parser<T>, notFollowedBy: Parser<unknown>, error?: ErrInputData): Parser<T> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    if (!parsed.ok) return parsed

    const not = notFollowedBy(parsed.data.at.next, input.offset(parsed.data.matched.length), context)
    return not.ok ? err(start, parsed.data.at.next, context, error) : parsed
  }
}

export function maybe<T>(parser: Parser<T>): Parser<T | null> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    return parsed.ok || parsed.precedence ? parsed : phantomSuccess(start, null)
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

export function filterNullables<T>(parser: Parser<Token<T | null>[]>): Parser<Token<T>[]> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    if (!parsed.ok) return parsed

    // NOTE: unsafe typecast here with type predicate
    const results: Token<T>[] = parsed.data.parsed.filter((entry): entry is Token<T> => entry.parsed !== null)
    return success(start, parsed.data.at.next, results, parsed.data.matched)
  }
}

export function then<T, U>(
  parser: Parser<T>,
  then: (parsed: T, token: Token<T>, context: ParsingContext) => ParserResult<U>
): Parser<U> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    return parsed.ok ? then(parsed.data.parsed, parsed.data, context) : parsed
  }
}

export function thenErr<T>(parser: Parser<T>, thenErr: (parsed: ParserErr) => ParserResult<T>): Parser<T> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    return parsed.ok ? parsed : thenErr(parsed)
  }
}
