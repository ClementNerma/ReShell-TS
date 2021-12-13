import { addCols, addLoc, err, Parser, success } from './base'
import { unicodeAlphanumericUnderscore } from './littles'
import { matches } from './raw'

export function exact<S extends string>(candidate: S, error?: string): Parser<S> {
  return (start, input, context) => {
    return input.startsWith(candidate)
      ? success(start, addCols(start, candidate.length), candidate, candidate)
      : err(start, context, error)
  }
}

export function word<S extends string>(candidate: S, error?: string): Parser<S> {
  return (start, input, context) => {
    if (!input.startsWith(candidate)) return err(start, context, error)

    const end = addCols(start, candidate.length)

    return matches(input.substr(candidate.length), unicodeAlphanumericUnderscore, null)
      ? err(start, context, error)
      : success(start, end, candidate, candidate)
  }
}

export function char<C>(regex: RegExp, error?: string): Parser<void> {
  return (start, input, context) =>
    input.charAt(0).match(regex)
      ? success(start, addCols(start, 1), void 0, input.charAt(0))
      : err(start, context, error)
}

export function match<C>(regex: RegExp, error?: string): Parser<string> {
  return (start, input, context) => {
    const match = input.match(regex)
    if (!match || match.index !== 0) return err(start, context, error)

    const parsed = match[0]
    const matched = input.substr(0, parsed.length)

    if (!parsed.includes('\n')) {
      return success(start, addCols(start, parsed.length), parsed, matched)
    }

    const matchedLines = parsed.split(/\n/)

    return success(
      start,
      addLoc(start, { line: matchedLines.length - 1, col: matchedLines[matchedLines.length - 1].length }),
      parsed,
      matched
    )
  }
}

export function regex<T>(
  regex: RegExp,
  mapper: (match: RegExpMatchArray) => T,
  error?: string,
  precedence?: boolean
): Parser<T> {
  return (start, input, context) => {
    const match = input.match(regex)
    return match && match.index === 0
      ? success(start, addCols(start, match[0].length), mapper(match), input.substr(0, match[0].length))
      : err(start, context, error)
  }
}

export function regexRaw<C>(regex: RegExp, error?: string): Parser<RegExpMatchArray> {
  return (start, input, context) => {
    const match = input.match(regex)
    return match && match.index === 0
      ? success(start, addCols(start, match[0].length), match, input.substr(0, match[0].length))
      : err(start, context, error)
  }
}

export function oneOf<C>(candidates: string[], error?: string): Parser<string> {
  return (start, input, context) => {
    for (const candidate of candidates) {
      if (input.startsWith(candidate)) {
        return success(start, addCols(start, candidate.length), candidate, candidate)
      }
    }

    return err(start, context, error)
  }
}

export function oneOfMap<T>(candidates: [string, T][], error?: string): Parser<T> {
  return (start, input, context) => {
    for (const [candidate, parsed] of candidates) {
      if (input.startsWith(candidate)) {
        return success(start, addCols(start, candidate.length), parsed, candidate)
      }
    }

    return err(start, context, error)
  }
}

export function bol<C>(error?: string): Parser<void> {
  return (start, _, context) => (start.col === 0 ? success(start, start, void 0, '') : err(start, context, error))
}

export function eol<C>(error?: string): Parser<void> {
  return (start, input, context) =>
    input.length === 0
      ? success(start, start, void 0, '')
      : input.charAt(0) === '\n'
      ? success(start, addLoc(start, { line: 1, col: 0 }), void 0, '\n')
      : err(start, context, error)
}

export function bos<C>(error?: string): Parser<void> {
  return (start, _, context) =>
    start.col === 0 && start.line === 0 ? success(start, start, void 0, '') : err(start, context, error)
}

export function eos<C>(error?: string): Parser<void> {
  return (start, input, context) =>
    input.length === 0 ? success(start, start, void 0, '') : err(start, context, error)
}

/**
 * Ensure a parser don't match
 * If the parser matches, fail with precedence
 * Otherwise, fail without precedence (even if one was set by the returned error)
 * @param parser
 * @param error
 * @param pos Indicate where the error should be located (before or after the parser's match)
 * @returns
 */
export function failWithPrecedenceIf<T>(parser: Parser<T>, error: string, pos: 'before' | 'after'): Parser<any> {
  const before = pos === 'before'

  return (start, input, context) => {
    const parsed = parser(start, input, context)
    return parsed.ok ? err(before ? start : parsed.data.next, context, error) : { ...parsed, precedence: false }
  }
}