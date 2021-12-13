import { addCols, addLoc, err, ErrInputData, Parser, phantomSuccess, success } from './base'
import { unicodeAlphanumericUnderscore } from './littles'
import { matches } from './raw'

export function exact<S extends string>(candidate: S, error?: ErrInputData): Parser<S> {
  return (start, input, context) => {
    return input.startsWith(candidate)
      ? success(start, addCols(start, candidate.length), candidate, candidate)
      : err(start, start, context, error)
  }
}

export function oneOfWords<S extends string>(candidates: S[], error?: ErrInputData): Parser<S> {
  return (start, input, context) => {
    const match = candidates.find((c) => input.startsWith(c))

    if (match === undefined) return err(start, start, context, error)

    return matches(input.offset(match.length), unicodeAlphanumericUnderscore, null)
      ? err(start, start, context, error)
      : success(start, addCols(start, match.length), match, match)
  }
}

export function word<S extends string>(candidate: S, error?: ErrInputData): Parser<S> {
  return (start, input, context) => {
    if (!input.startsWith(candidate)) return err(start, start, context, error)

    return matches(input.offset(candidate.length), unicodeAlphanumericUnderscore, null)
      ? err(start, start, context, error)
      : success(start, addCols(start, candidate.length), candidate, candidate)
  }
}

export function char(regex: RegExp, error?: ErrInputData): Parser<string> {
  return (start, input, context) =>
    input.matchFirstChar(regex)
      ? success(start, addCols(start, 1), input.firstChar(), input.firstChar())
      : err(start, start, context, error)
}

export function match(regex: RegExp, error?: ErrInputData): Parser<string> {
  return (start, input, context) => {
    const match = input.matchShort(regex) // TODO
    if (!match || match.index !== 0) return err(start, start, context, error)

    const parsed = match[0]
    const matched = match[0]

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

export function regex<T>(regex: RegExp, mapper: (match: RegExpMatchArray) => T, error?: ErrInputData): Parser<T> {
  return (start, input, context) => {
    const match = input.matchShort(regex) // TODO
    return match && match.index === 0
      ? success(start, addCols(start, match[0].length), mapper(match), match[0])
      : err(start, start, context, error)
  }
}

export function regexRaw(regex: RegExp, error?: ErrInputData): Parser<RegExpMatchArray> {
  return (start, input, context) => {
    const match = input.matchShort(regex) // TODO
    return match && match.index === 0
      ? success(start, addCols(start, match[0].length), match, match[0])
      : err(start, start, context, error)
  }
}

export function oneOf(candidates: string[], error?: ErrInputData): Parser<string> {
  return (start, input, context) => {
    for (const candidate of candidates) {
      if (input.startsWith(candidate)) {
        return success(start, addCols(start, candidate.length), candidate, candidate)
      }
    }

    return err(start, start, context, error)
  }
}

export function oneOfMap<T>(candidates: [string, T][], error?: ErrInputData): Parser<T> {
  return (start, input, context) => {
    for (const [candidate, parsed] of candidates) {
      if (input.startsWith(candidate)) {
        return success(start, addCols(start, candidate.length), parsed, candidate)
      }
    }

    return err(start, start, context, error)
  }
}

export function bol(error?: ErrInputData): Parser<void> {
  return (start, _, context) => (start.col === 0 ? phantomSuccess(start) : err(start, start, context, error))
}

export function eol(error?: ErrInputData): Parser<string> {
  return (start, input, context) =>
    input.empty()
      ? success(start, start, '', '')
      : input.startsWithChar('\n')
      ? success(start, addLoc(start, { line: 1, col: 0 }), '\n', '\n')
      : err(start, start, context, error)
}

export function bos(error?: ErrInputData): Parser<void> {
  return (start, _, context) =>
    start.col === 0 && start.line === 0 ? phantomSuccess(start) : err(start, start, context, error)
}

export function eos(error?: ErrInputData): Parser<void> {
  return (start, input, context) => (input.empty() ? phantomSuccess(start) : err(start, start, context, error))
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
    return parsed.ok
      ? err(before ? start : parsed.data.at.next, before ? start : parsed.data.at.next, context, error)
      : { ...parsed, precedence: false }
  }
}
