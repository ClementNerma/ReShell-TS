import { SourceFilesServer } from './files-server'
import { CodeSection } from './parsed'
import { StrView } from './strview'
import { computeCodeSectionEnd, matchUnion } from './utils'

export type Diagnostic = { error: DiagnosticExtract; also: DiagnosticExtract[]; level: DiagnosticLevel }

export enum DiagnosticLevel {
  Error,
  Warning,
  Notice,
}

export type DiagnosticExtract = {
  at: CodeSection
  message: string
  complements?: [string, string][]
}

export type DiagnosticInput = string | { message: string; complements?: [string, string][]; also?: DiagnosticExtract[] }

export const diagnostic = (at: CodeSection, input: DiagnosticInput, level: DiagnosticLevel): Diagnostic => {
  const stringInput = typeof input === 'string'

  const error: DiagnosticExtract = { at, message: stringInput ? input : input.message }

  if (!stringInput && input.complements) {
    error.complements = input.complements
  }

  return { error, also: stringInput || !input.also ? [] : input.also, level }
}

export type DiagnosticFormatters = {
  wrapper?: (error: string) => string
  header?: (header: string) => string
  filePath?: (filePath: string) => string
  location?: (col: string) => string
  gutter?: (text: string) => string
  paddingChar?: (char: string) => string
  locationPointer?: (char: string) => string
  failedLine?: (line: string) => string
  message?: (message: string) => string
  complementName?: (name: string) => string
  complement?: (fullText: string) => string
}

export function formatErr(
  diag: Diagnostic,
  sourceServer: SourceFilesServer,
  f?: (level: DiagnosticLevel) => DiagnosticFormatters
): string {
  const formatters = f?.(diag.level)

  const format = (formatterName: keyof DiagnosticFormatters, text: string) => {
    const formatter = formatters?.[formatterName]
    return formatter ? formatter(text) : text
  }

  const formatFaultyLine = (line: string) => line.replace(/\t/g, '    ')

  const addTabsPadding = (line: string, col: number) => {
    const count = line.substr(0, col).match(/\t/g)
    return count === null ? col : col + count.length * 3 /* 4 - 1 for the already counted col. */
  }

  const text = [diag.error]
    .concat(diag.also.filter((also) => also.at.start.file.type !== 'internal'))
    .map(({ at, message, complements }) => {
      const sourceFile: string = matchUnion(at.start.file, 'type', {
        entrypoint: () => sourceServer.entrypointPath,
        file: ({ path }) => path,
        internal: ({ path }) => path,
      })

      const { line, col } = at.start

      const header = format(
        'header',
        `--> At ${format('filePath', sourceFile)}${format('location', `:${line + 1}:${col + 1}`)}:`
      )

      if (at.start.file.type === 'internal') {
        return `${header}\n<internal file>`
      }

      const fileContent: StrView | false = matchUnion(at.start.file, 'type', {
        entrypoint: () => sourceServer.entrypoint(),
        file: ({ path }) => sourceServer.read(path),
      })

      if (fileContent === false) return `${header}\n<file not found in source server>`

      const end = computeCodeSectionEnd(at, fileContent)

      const addLines = end.line - line
      const addLinesPadding = addLines ? '  ' : ''

      const maxLineLen = (line + 1 + addLines).toString().length
      const linePad = ' '.repeat(maxLineLen)

      const padLineNb = (line: number) => (line + 1).toString().padEnd(maxLineLen, ' ')

      const sourceLines = fileContent.toFullStringSlow().split(/\n/)
      const failedLine = sourceLines[line]

      const rawLocPtr =
        addLines === 0
          ? ' '.repeat(addTabsPadding(failedLine, col)) + '^'.repeat(end.col - col + 1)
          : '_'.repeat(addTabsPadding(failedLine, col) + 1) +
            '^' /*.repeat(failedLine.substr(failedLine.length - col + 1).length)*/

      const locPtr = format('locationPointer', rawLocPtr)

      const paddingGutter = format('gutter', linePad + ' | ')

      const upToError: string[] = [
        `${format('gutter', linePad)}${addLinesPadding}${header}`,
        `${paddingGutter}`,
        `${format('gutter', padLineNb(line) + ' | ')}${addLinesPadding}${format(
          'failedLine',
          formatFaultyLine(failedLine)
        )}`,
        `${paddingGutter}${addLines ? ' ' : addLinesPadding}${locPtr} ${addLines ? '' : format('message', message)}`,
      ]

      if (addLines) {
        for (let l = line + 1; l < line + (addLines <= 5 ? addLines : 3); l++) {
          upToError.push(`${format('gutter', padLineNb(l) + ' | ')}${format('locationPointer', '|')} ${sourceLines[l]}`)
        }

        if (addLines > 5) {
          upToError.push('...  ' + format('locationPointer', '|'))

          for (let l = line + addLines - 2; l < line + addLines; l++) {
            upToError.push(
              `${format('gutter', padLineNb(l) + ' | ')}${format('locationPointer', '|')} ${formatFaultyLine(
                sourceLines[l]
              )}`
            )
          }
        }

        upToError.push(
          `${format('gutter', padLineNb(end.line) + ' |')} ${format('locationPointer', '|')} ${formatFaultyLine(
            sourceLines[end.line]
          )}`
        )

        const rawLocPtr = '|_' + '_'.repeat(addTabsPadding(sourceLines[end.line], end.col)) + '^'
        upToError.push(`${paddingGutter}${format('locationPointer', rawLocPtr)} ${format('message', message)}`)
      }

      for (const [name, text] of complements ?? []) {
        upToError.push(`${linePad}${format('complement', `-> ${format('complementName', name)} : ${text}`)}`)
      }

      return upToError.join('\n')
    })
    .join('\n\n')

  return formatters?.wrapper?.(text) ?? text
}
