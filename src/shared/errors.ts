import { CodeLoc } from './parsed'

export type FormatableError = { error: FormatableExtract; also: FormatableExtract[] }

export type FormatableExtract = {
  loc: CodeLoc
  length?: number
  message: string
  complements?: [string, string][]
}

export type FormatableExtractsInput =
  | string
  | { length?: number; message: string; complements?: [string, string][] | null }

export const buildFormatableExtract = (loc: CodeLoc, input: FormatableExtractsInput): FormatableExtract => {
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

export type ErrorParsingFormatters = {
  wrapper?: (error: string) => string
  header?: (header: string) => string
  location?: (col: string) => string
  gutter?: (text: string) => string
  paddingChar?: (char: string) => string
  locationPointer?: (char: string) => string
  failedLine?: (line: string) => string
  errorMessage?: (message: string) => string
  complementName?: (name: string) => string
  complement?: (fullText: string) => string
}

export function formatErr(err: FormatableError, source: string, f?: ErrorParsingFormatters): string {
  const format = (formatterName: keyof ErrorParsingFormatters, text: string) => {
    const formatter = f?.[formatterName]
    return formatter ? formatter(text) : text
  }

  const text = [err.error]
    .concat(err.also)
    .map(({ loc, length, message, complements }) => {
      const { line, col } = loc

      const lineLen = (line + 1).toString().length
      const linePad = ' '.repeat(lineLen)

      const header = `--> At ${format('location', `${line + 1}:${col + 1}`)}:`

      const failedLine = source.split(/\n/)[line]

      const locPtr = format('locationPointer', '^'.repeat(length ?? 1))

      const paddingGutter = format('gutter', linePad + ' |')

      const complementsText = (complements ?? [])
        .map(
          ([name, text]) =>
            `\n${paddingGutter} ${' '.repeat(col)}  ${format(
              'complement',
              `${format('complementName', name)}: ${text}`
            )}`
        )
        .join('')

      return (
        `${format('gutter', linePad)} ${format('header', header)}\n` +
        `${paddingGutter}\n` +
        `${format('gutter', (line + 1).toString() + ' |')} ${format('failedLine', failedLine)}\n` +
        `${paddingGutter} ${' '.repeat(col)}${locPtr} ${format('errorMessage', message)}` +
        complementsText
      )
    })
    .join('\n\n')

  return f?.wrapper?.(text) ?? text
}
