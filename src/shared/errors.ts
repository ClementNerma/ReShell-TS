import { CodeLoc, CodeSection } from './parsed'
import { computeCodeSectionEnd } from './utils'

export type FormatableError = { error: FormatableExtract; also: FormatableExtract[] }

export type FormatableExtract = {
  start: CodeLoc
  next: CodeLoc
  message: string
  complements?: [string, string][]
}

export type FormatableExtractsInput = string | { message: string; complements?: [string, string][] }

export const formattableExtract = (at: CodeSection, input: FormatableExtractsInput): FormatableExtract => {
  // Fallback message provided
  return typeof input === 'string'
    ? {
        start: at.start,
        next: at.next,
        message: input,
      }
    : input.complements
    ? {
        start: at.start,
        next: at.next,
        message: input.message,
        complements: input.complements,
      }
    : {
        start: at.start,
        next: at.next,
        message: input.message,
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
    .map(({ start, next, message, complements }) => {
      const { line, col } = start

      const end = computeCodeSectionEnd({ start, next }, source)

      const addLines = end.line - line
      const addLinesPadding = addLines ? '  ' : ''

      const maxLineLen = (line + 1 + addLines).toString().length
      const linePad = ' '.repeat(maxLineLen)

      const padLineNb = (line: number) => (line + 1).toString().padStart(maxLineLen, ' ')

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
          upToError.push('...')

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
        upToError.push(
          `${paddingGutter}${' '.repeat(componentsAlignmentCol)} ${format(
            'complement',
            `${format('complementName', name)} : ${text}`
          )}`
        )
      }

      return upToError.join('\n')
    })
    .join('\n\n')

  return f?.wrapper?.(text) ?? text
}
