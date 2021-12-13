import { CodeLoc } from '../../shared/parsed'
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
  withErr,
  WithErrData,
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
  return (start, _, __) => phantomSuccess(start)
}

export function fail<T>(error?: ErrInputData): Parser<T> {
  return (start, _, context) => err(start, start, context, error)
}

export function failWith<T>(error: (input: string, context: ParsingContext, loc: CodeLoc) => ErrInputData): Parser<T> {
  return (start, input, context) => err(start, start, context, error(input, context, start))
}

export function never<T>(error?: ErrInputData): Parser<T> {
  return (start, _, context) => err(start, start, context, error)
}

export function inspect<T>(parser: Parser<T>, inspector: (result: ParserResult<T>) => void): Parser<T> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    inspector(parsed)
    return parsed
  }
}

export function lookahead<T>(parser: Parser<T>, error?: WithErrData): Parser<void> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    return parsed.ok ? phantomSuccess(start) : withErr(parsed, context, error)
  }
}

export type LookaheadOptions = {
  error?: ErrInputData
  precedencePassthrough?: boolean
}

export function not<T>(parser: Parser<T>, options?: LookaheadOptions): Parser<void> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    return parsed.ok || parsed.precedence === options?.precedencePassthrough
      ? err(start, start, context, options?.error)
      : phantomSuccess(start)
  }
}

export function notFollowedBy<T>(parser: Parser<T>, by: Parser<T>, options?: LookaheadOptions): Parser<T> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    if (!parsed.ok) return parsed

    const following = lookahead(parser)(parsed.data.at.next, sliceInput(input, start, parsed.data.at.next), context)
    return following.ok || following.precedence === options?.precedencePassthrough
      ? err(start, start, context, options?.error)
      : parsed
  }
}

export function followedBy<T>(parser: Parser<T>, error?: ErrInputData): Parser<T> {
  return (start, input, context) => {
    const parsed = parser(start, input, context)
    if (!parsed.ok) return parsed

    const following = lookahead(parser)(parsed.data.at.next, sliceInput(input, start, parsed.data.at.next), context)
    return following.ok ? parsed : err(start, start, context, error)
  }
}