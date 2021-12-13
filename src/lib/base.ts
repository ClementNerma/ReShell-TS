import { buildFormatableExtract, FormatableExtract, FormatableExtractsInput } from '../shared/errors'
import { CodeLoc, Token } from '../shared/parsed'

export type ParserResult<T> = ParserSucess<T> | ParserErr

export type ParserSucess<T> = {
  ok: true
  data: Token<T>
}

export type ParserErr = {
  ok: false
  stack: ParserErrStackEntry[]
  precedence: boolean
  loc: CodeLoc
  context: ParsingContext
}

export type ParserErrStackEntry = {
  context: ParsingContext
  error: FormatableExtract
  also: FormatableExtract[]
}

export type ParsingContext = Readonly<{
  source: { ref: string }
  failureWillBeNeutral?: boolean
  loopData?: LoopContext
  combinationData?: LoopContext
  $custom: unknown
  self: () => ParsingContext
}>

export type LoopContext = Readonly<{
  firstIter: boolean
  iter: number
  lastWasNeutralError: boolean
  soFar: Readonly<{
    start: Readonly<CodeLoc>
    matched: ReadonlyArray<string>
    parsed: ReadonlyArray<unknown>
    previous: Token<unknown> | null
  }>
}>

export type Parser<T> = (start: CodeLoc, input: string, ctx: ParsingContext) => ParserResult<T>

export function success<T>(
  start: CodeLoc,
  next: CodeLoc,
  parsed: T,
  matched: string,
  neutralError?: boolean
): Extract<ParserResult<T>, { ok: true }> {
  return {
    ok: true,
    data: { matched, parsed, neutralError: neutralError ?? false, start, next },
  }
}

export function neutralError(start: CodeLoc): Extract<ParserResult<void>, { ok: true }>
export function neutralError<T>(start: CodeLoc, neutralValue: T): Extract<ParserResult<T>, { ok: true }>
export function neutralError<T>(start: CodeLoc, neutralValue?: T): Extract<ParserResult<T>, { ok: true }> {
  return {
    ok: true,
    data: {
      matched: '',
      parsed: neutralValue!,
      neutralError: true,
      start,
      next: start,
    },
  }
}

export type ErrInputData = null | FormatableExtractsInput | ParserErr['stack']

export function err(
  loc: CodeLoc,
  context: ParsingContext,
  errData?: ErrInputData,
  also?: FormatableExtract[],
  precedence?: boolean
): ParserErr {
  return errData === undefined || errData === null
    ? { ok: false, stack: [], precedence: precedence ?? false, loc, context }
    : {
        ok: false,
        stack: Array.isArray(errData)
          ? errData
          : [{ context, error: buildFormatableExtract(loc, errData), also: also ?? [] }],
        precedence: precedence ?? true,
        loc,
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

export function sliceInput(input: string, started: CodeLoc, ended: CodeLoc): string {
  return ended.line === started.line
    ? input.substr(ended.col - started.col)
    : input
        .split('\n')
        .slice(ended.line - started.line)
        .join('\n')
        .substr(ended.col)
}

export function parseSource<T>(source: string, parser: Parser<T>, $custom: unknown): ParserResult<T> {
  const context: ParsingContext = { source: { ref: source }, $custom, self: () => context }
  return parser({ line: 0, col: 0 }, source, context)
}

export type WithErrData =
  | undefined
  | FormatableExtractsInput
  | { error: FormatableExtractsInput; also: FormatableExtract[] }
  | ((err: ParserErr) => FormatableExtractsInput | { error: FormatableExtractsInput; also: FormatableExtract[] })

export function withErr(error: ParserErr, context: ParsingContext, mapping: WithErrData): ParserErr {
  if (mapping !== undefined) {
    const data = typeof mapping === 'function' ? mapping(error) : mapping

    const loc = error.loc

    error.stack.push(
      typeof data === 'object' && 'also' in data
        ? { context, error: buildFormatableExtract(loc, data.error), also: data.also }
        : { context, error: buildFormatableExtract(loc, data), also: [] }
    )

    error.precedence = true
  }

  return error
}
