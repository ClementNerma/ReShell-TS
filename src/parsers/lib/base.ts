import { FormatableExtract, FormatableExtractsInput, formattableExtract } from '../../shared/errors'
import { CodeLoc, Token } from '../../shared/parsed'

export type ParserResult<T> = ParserSucess<T> | ParserErr

export type ParserSucess<T> = {
  ok: true
  data: Token<T>
  infos: ParserSuccessInfos
}

export type ParserSuccessInfos = { neutralError: boolean; skipInter: boolean | null }

export type ParserErr = {
  ok: false
  stack: ParserErrStackEntry[]
  precedence: boolean
  start: CodeLoc
  next: CodeLoc
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
  soFar: Readonly<{
    start: Readonly<CodeLoc>
    matched: ReadonlyArray<string>
    parsed: ReadonlyArray<unknown>
    previous: Token<unknown> | null
    previousInfos: ParserSuccessInfos | null
  }>
}>

export type Parser<T> = (start: CodeLoc, input: string, ctx: ParsingContext) => ParserResult<T>

export function success<T>(
  start: CodeLoc,
  next: CodeLoc,
  parsed: T,
  matched: string,
  infos?: Partial<ParserSuccessInfos>
): Extract<ParserResult<T>, { ok: true }> {
  return {
    ok: true,
    data: { matched, parsed, at: { start, next } },
    infos: {
      neutralError: infos?.neutralError ?? false,
      skipInter: infos?.skipInter ?? null,
    },
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
      at: { start, next: start },
    },
    infos: {
      neutralError: true,
      skipInter: true,
    },
  }
}

export type ErrInputData = null | FormatableExtractsInput | ParserErr['stack']

export function err(
  start: CodeLoc,
  next: CodeLoc,
  context: ParsingContext,
  errData?: ErrInputData,
  also?: FormatableExtract[],
  precedence?: boolean
): ParserErr {
  return {
    ok: false,
    stack:
      errData === undefined || errData === null
        ? []
        : Array.isArray(errData)
        ? errData
        : [{ context, error: formattableExtract({ start, next }, errData), also: also ?? [] }],
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

    error.stack.push(
      typeof data === 'object' && 'also' in data
        ? { context, error: formattableExtract({ start: error.start, next: error.next }, data.error), also: data.also }
        : { context, error: formattableExtract({ start: error.start, next: error.next }, data), also: [] }
    )

    error.precedence = true
  }

  return error
}
