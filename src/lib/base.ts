export type ParserResult<T> = ParserSucess<T> | ParserErr

export type ParserSucess<T> = {
  ok: true
  data: Token<T>
}

export type Token<T> = { parsed: T; matched: string; neutralError?: boolean; start: ParserLoc; next: ParserLoc }

export type ParserErr = {
  ok: false
  stack: ParserErrStackEntry[]
  precedence: boolean
  loc: ParserLoc
  context: ParsingContext
}

export type ParserErrStackEntry = ParserErrStackEntryMessage & { loc: ParserLoc; context: ParsingContext }

export type ParserErrStackEntryMessage = { message: string; tip?: string }

export type ParserLoc = {
  line: number
  col: number
}

export type ParsingContext = Readonly<{
  source: { ref: string }
  failureWillBeNeutral?: boolean
  loopData?: LoopContext
  $custom: unknown
  self: () => ParsingContext
}>

export type LoopContext = Readonly<{
  iter: number
  soFar: Readonly<{
    start: Readonly<ParserLoc>
    matched: ReadonlyArray<string>
    parsed: ReadonlyArray<unknown>
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
    data: { matched, parsed, neutralError, start, next },
  }
}

export type ErrFnData = string | ParserErrStackEntryMessage | ParserErr['stack']

export function err(loc: ParserLoc, context: ParsingContext, errData?: ErrFnData, precedence?: boolean): ParserErr {
  return errData === undefined
    ? { ok: false, stack: [], precedence: !!precedence, loc, context }
    : // Fallback message provided
    typeof errData === 'string'
    ? { ok: false, stack: [{ message: errData, loc, context }], precedence: precedence ?? true, loc, context }
    : // Message and optional tip provided
    'message' in errData
    ? { ok: false, stack: [{ ...errData, loc, context }], precedence: precedence ?? true, loc, context }
    : // Stack provided
      { ok: false, stack: errData, precedence: !!precedence, loc, context }
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

export type ErrorMapping =
  | string
  | ParserErrStackEntryMessage
  | ((err: ParserErr) => string | ParserErrStackEntryMessage)
  | undefined

export function withErr(error: ParserErr, context: ParsingContext, mapping: ErrorMapping): ParserErr {
  if (mapping !== undefined) {
    const data = typeof mapping === 'function' ? mapping(error) : mapping
    error.stack.push(
      typeof data === 'string' ? { message: data, loc: error.loc, context } : { ...data, loc: error.loc, context }
    )
    error.precedence = true
  }

  return error
}
