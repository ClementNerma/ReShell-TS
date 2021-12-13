import { ParserErr } from './lib/base'

export type Settings = {
  loggers: Loggers
  formatters?: Formatters
}

export type Loggers = {
  debug: (text: string) => void
  info: (text: string) => void
  warn: (text: string) => void
  error: (text: string, severity: Severity) => void
  fail: (text: string) => never
}

export enum Severity {
  Low,
  Medium,
  High,
}

export type Formatters = {
  parsingError?: ParsingErrorFormatters
}

export type ParsingErrorFormatters = {
  noErrorMessageFallback?: (err: ParserErr) => string
  wrapper?: (error: string) => string
  header?: (header: string) => string
  lineNumber?: (line: number) => string
  colNumber?: (col: number) => string
  paddingChar?: (char: string) => string
  locationPointer?: (char: string) => string
  failedLine?: (line: string) => string
  errorMessage?: (message: string) => string
  tip?: (tip: string) => string
}
