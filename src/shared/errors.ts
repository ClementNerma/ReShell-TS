import { CodeSection } from './parsed'
import { computeCodeSectionEnd } from './utils'

export type FormatableError = { error: FormatableExtract; also: FormatableExtract[] }

export type FormatableExtract = {
  at: CodeSection
  message: string
  complements?: [string, string][]
}

export type FormatableErrInput =
  | string
  | { message: string; complements?: [string, string][]; also?: FormatableExtract[] }

export const formattableErr = (at: CodeSection, input: FormatableErrInput): FormatableError => {
  const stringInput = typeof input === 'string'

  const error: FormatableExtract = { at, message: stringInput ? input : input.message }

  if (!stringInput && input.complements) {
    error.complements = input.complements
  }

  return { error, also: stringInput || !input.also ? [] : input.also }
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
    .map(({ at, message, complements }) => {
      const { line, col } = at.start

      const end = computeCodeSectionEnd(at, source)

      const addLines = end.line - line
      const addLinesPadding = addLines ? '  ' : ''

      const maxLineLen = (line + 1 + addLines).toString().length
      const linePad = ' '.repeat(maxLineLen)

      const padLineNb = (line: number) => (line + 1).toString().padEnd(maxLineLen, ' ')

      const header = `--> At ${format('location', `${line + 1}:${col + 1}`)}:`

      const sourceLines = source.split(/\n/)
      const failedLine = sourceLines[line]

      const rawLocPtr =
        addLines === 0
          ? ' '.repeat(col) + '^'.repeat(end.col - col + 1)
          : '_'.repeat(col + 1) + '^' /*.repeat(failedLine.substr(failedLine.length - col + 1).length)*/

      const locPtr = format('locationPointer', rawLocPtr)

      const paddingGutter = format('gutter', linePad + ' | ')

      const upToError: string[] = [
        `${format('gutter', linePad)}${addLinesPadding}${format('header', header)}`,
        `${paddingGutter}`,
        `${format('gutter', padLineNb(line) + ' | ')}${addLinesPadding}${format('failedLine', failedLine)}`,
        `${paddingGutter}${addLines ? ' ' : addLinesPadding}${locPtr} ${
          addLines ? '' : format('errorMessage', message)
        }`,
      ]

      let componentsAlignmentCol = addLinesPadding.length + rawLocPtr.length

      if (addLines) {
        for (let l = line + 1; l < line + (addLines <= 5 ? addLines : 3); l++) {
          upToError.push(`${format('gutter', padLineNb(l) + ' | ')}${format('locationPointer', '|')} ${sourceLines[l]}`)
        }

        if (addLines > 5) {
          upToError.push('...  ' + format('locationPointer', '|'))

          for (let l = line + addLines - 2; l < line + addLines; l++) {
            upToError.push(
              `${format('gutter', padLineNb(l) + ' | ')}${format('locationPointer', '|')} ${sourceLines[l]}`
            )
          }
        }

        upToError.push(
          `${format('gutter', padLineNb(end.line) + ' |')} ${format('locationPointer', '|')} ${sourceLines[end.line]}`
        )

        const rawLocPtr = '|_' + '_'.repeat(end.col) + '^'
        componentsAlignmentCol = rawLocPtr.length

        upToError.push(`${paddingGutter}${format('locationPointer', rawLocPtr)} ${format('errorMessage', message)}`)
      }

      for (const [name, text] of complements ?? []) {
        upToError.push(`${linePad}${format('complement', `-> ${format('complementName', name)} : ${text}`)}`)
      }

      return upToError.join('\n')
    })
    .join('\n\n')

  return f?.wrapper?.(text) ?? text
}
