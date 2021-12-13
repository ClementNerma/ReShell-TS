export type ParserResult<T> = ParserSucess<T> | ParserErr

export type ParserSucess<T> = {
  ok: true
  data: Token<T>
}

export type Token<T> = { parsed: T; matched: string; neutralError: boolean; start: ParserLoc; next: ParserLoc }

export type ParserErr = {
  ok: false
  stack: ParserErrStackEntry[]
  precedence: boolean
  loc: ParserLoc
  context: ParsingContext
}

export type ParserErrStackEntry = {
  loc: ParserLoc
  context: ParsingContext
  error: FormatableExtract
  also: FormatableExtract[]
}

export type FormatableExtract = {
  loc: ParserLoc
  length?: number
  message: string
  complements: [string, string][]
}

export type ParserLoc = {
  line: number
  col: number
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
    start: Readonly<ParserLoc>
    matched: ReadonlyArray<string>
    parsed: ReadonlyArray<unknown>
    previous: Token<unknown> | null
  }>
}>

export type Parser<T> = (start: ParserLoc, input: string, ctx: ParsingContext) => ParserResult<T>

export function success<T>(
  start: ParserLoc,
  next: ParserLoc,
  parsed: T,
  matched: string,
  neutralError?: boolean
): Extract<ParserResult<T>, { ok: true }> {
  return {
    ok: true,
    data: { matched, parsed, neutralError: neutralError ?? false, start, next },
  }
}

export function neutralError(start: ParserLoc): Extract<ParserResult<void>, { ok: true }>
export function neutralError<T>(start: ParserLoc, neutralValue: T): Extract<ParserResult<T>, { ok: true }>
export function neutralError<T>(start: ParserLoc, neutralValue?: T): Extract<ParserResult<T>, { ok: true }> {
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

export type FormatableExtractsInput =
  | string
  | { length?: number; message: string; complements?: [string, string][] | null }

export const buildFormatableExtract = (loc: ParserLoc, input: FormatableExtractsInput): FormatableExtract => {
  // Fallback message provided
  return typeof input === 'string'
    ? {
        loc,
        message: input,
        complements: [],
      }
    : {
        loc,
        length: input.length,
        message: input.message,
        complements: input.complements ?? [],
      }
}

export type ErrInputData = null | FormatableExtractsInput | ParserErr['stack']

export function err(
  loc: ParserLoc,
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
          : [{ loc, context, error: buildFormatableExtract(loc, errData), also: also ?? [] }],
        precedence: precedence ?? true,
        loc,
        context,
      }
}

export function addLoc(start: ParserLoc, add: ParserLoc): ParserLoc {
  return {
    line: start.line + add.line,
    col: add.line ? add.col : start.col + add.col,
  }
}

export function addCols(start: ParserLoc, cols: number): ParserLoc {
  return { line: start.line, col: start.col + cols }
}

export function sliceInput(input: string, started: ParserLoc, ended: ParserLoc): string {
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
        ? { loc, context, error: buildFormatableExtract(loc, data.error), also: data.also }
        : { loc, context, error: buildFormatableExtract(loc, data), also: [] }
    )

    error.precedence = true
  }

  return error
}
