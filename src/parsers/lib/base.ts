import { FormatableErrInput, FormatableError, formattableErr } from '../../shared/errors'
import { CodeLoc, Token } from '../../shared/parsed'
import { StrView } from './strview'

export type ParserResult<T> = ParserSucess<T> | ParserErr

export type ParserSucess<T> = {
  ok: true
  data: Token<T>
}

export type ParserErr = {
  ok: false
  stack: ParserErrStackEntry[]
  precedence: boolean
  start: CodeLoc
  next: CodeLoc
  context: ParsingContext
}

export type ParserErrStackEntry = { context: ParsingContext; content: FormatableError }

export type ParsingContext = Readonly<{
  source: StrView
  failureWillBePhantomSuccess?: boolean
  $custom: unknown
  self: () => ParsingContext
}>

export type Parser<T> = (start: CodeLoc, input: StrView, ctx: ParsingContext) => ParserResult<T>

export function success<T>(
  start: CodeLoc,
  next: CodeLoc,
  parsed: T,
  matched: string
): Extract<ParserResult<T>, { ok: true }> {
  return {
    ok: true,
    data: { matched, parsed, at: { start, next } },
  }
}

export function phantomSuccess(start: CodeLoc): Extract<ParserResult<void>, { ok: true }>
export function phantomSuccess<T>(start: CodeLoc, phantomValue: T): Extract<ParserResult<T>, { ok: true }>
export function phantomSuccess<T>(start: CodeLoc, phantomValue?: T): Extract<ParserResult<T>, { ok: true }> {
  return {
    ok: true,
    data: {
      matched: '',
      parsed: phantomValue!,
      at: { start, next: start },
    },
  }
}

export type ErrInputData = null | FormatableErrInput | ParserErr['stack']

export function err(
  start: CodeLoc,
  next: CodeLoc,
  context: ParsingContext,
  errData?: ErrInputData,
  precedence?: boolean
): ParserErr {
  return {
    ok: false,
    stack:
      errData === undefined || errData === null
        ? []
        : Array.isArray(errData)
        ? errData
        : [{ context, content: formattableErr({ start, next }, errData) }],
    precedence: precedence ?? (errData !== undefined && errData !== null),
    start,
    next,
    context,
  }
}

export function addLoc(start: CodeLoc, add: CodeLoc): CodeLoc {
  return {
    line: start.line + add.line,
    col: add.line ? add.col : start.col + add.col,
  }
}

export function addCols(start: CodeLoc, cols: number): CodeLoc {
  return { line: start.line, col: start.col + cols }
}

export function parseSource<T>(source: StrView, parser: Parser<T>, $custom: unknown): ParserResult<T> {
  const context: ParsingContext = { source, $custom, self: () => context }
  return parser({ line: 0, col: 0 }, source, context)
}

export type WithErrData = undefined | FormatableErrInput | ((err: ParserErr) => FormatableErrInput)

export function withErr(error: ParserErr, context: ParsingContext, mapping: WithErrData): ParserErr {
  if (mapping !== undefined) {
    const errData = typeof mapping === 'function' ? mapping(error) : mapping

    error.stack.push({ context, content: formattableErr({ start: error.start, next: error.next }, errData) })

    error.precedence = true
  }

  return error
}
