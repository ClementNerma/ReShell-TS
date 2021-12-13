import { Diagnostic, diagnostic, DiagnosticInput, DiagnosticLevel } from '../../shared/diagnostics'
import { SourceFilesServer } from '../../shared/files-server'
import { CodeLoc, Token } from '../../shared/parsed'
import { StrView } from '../../shared/strview'

export type ParserResult<T> = ParserSucess<T> | ParserErr

export type ParserSucess<T> = {
  ok: true
  data: Token<T>
}

export type ParserErr = {
  ok: false
  history: Diagnostic[]
  precedence: boolean
  start: CodeLoc
  next: CodeLoc
  context: ParsingContext
}

export type ParsingContext = Readonly<{
  sourceServer: SourceFilesServer
  currentFilePath: string
  currentFileContent: StrView
  $custom: unknown
  self: () => ParsingContext
}>

export type Parser<T> = (start: CodeLoc, input: StrView, ctx: ParsingContext) => ParserResult<T>

export function success<T>(
  start: CodeLoc,
  next: CodeLoc,
  parsed: T,
  matched: number
): Extract<ParserResult<T>, { ok: true }> {
  return {
    ok: true,
    data: { matched, parsed, at: { start, next } },
  }
}

export function phantomSuccess(start: CodeLoc, phantomValue?: void): Extract<ParserResult<void>, { ok: true }>
export function phantomSuccess<T>(start: CodeLoc, phantomValue: T): Extract<ParserResult<T>, { ok: true }>
export function phantomSuccess<T>(start: CodeLoc, phantomValue: T): Extract<ParserResult<T>, { ok: true }> {
  return {
    ok: true,
    data: {
      matched: 0,
      parsed: phantomValue,
      at: { start, next: start },
    },
  }
}

export type ErrInputData = null | DiagnosticInput | ParserErr['history']

export function err(
  start: CodeLoc,
  next: CodeLoc,
  context: ParsingContext,
  errData?: ErrInputData,
  precedence?: boolean
): ParserErr {
  return {
    ok: false,
    history:
      errData === undefined || errData === null
        ? []
        : Array.isArray(errData)
        ? errData
        : [diagnostic({ start, next }, errData, DiagnosticLevel.Error)],
    precedence: precedence ?? (errData !== undefined && errData !== null),
    start,
    next,
    context,
  }
}

export function addLoc(start: CodeLoc, add: CodeLoc): CodeLoc {
  return {
    file: start.file,
    line: start.line + add.line,
    col: add.line ? add.col : start.col + add.col,
  }
}

export function addCols(start: CodeLoc, cols: number): CodeLoc {
  return { file: start.file, line: start.line, col: start.col + cols }
}

export function parseSource<T>(sourceServer: SourceFilesServer, parser: Parser<T>, $custom: unknown): ParserResult<T> {
  const context: ParsingContext = {
    sourceServer,
    currentFilePath: sourceServer.entrypointPath,
    currentFileContent: sourceServer.entrypoint(),
    $custom,
    self: () => context,
  }
  return parser(
    { file: { type: 'entrypoint', path: sourceServer.entrypointPath }, line: 0, col: 0 },
    sourceServer.entrypoint(),
    context
  )
}

export function parseFile<T>(
  sourceServer: SourceFilesServer,
  filePath: string,
  content: StrView,
  parser: Parser<T>,
  $custom: unknown
): ParserResult<T> {
  const context: ParsingContext = {
    sourceServer,
    currentFilePath: filePath,
    currentFileContent: content,
    $custom,
    self: () => context,
  }

  return parser({ file: { type: 'file', path: filePath }, line: 0, col: 0 }, content, context)
}

export type WithErrData = undefined | DiagnosticInput | ((err: ParserErr) => DiagnosticInput)

export function withErr(error: ParserErr, mapping: WithErrData): ParserErr {
  if (mapping !== undefined) {
    const errData = typeof mapping === 'function' ? mapping(error) : mapping
    error.history.push(diagnostic({ start: error.start, next: error.next }, errData, DiagnosticLevel.Error))
    error.precedence = true
  }

  return error
}
