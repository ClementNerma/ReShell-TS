import { Diagnostic } from '../../shared/diagnostics'
import { SourceFilesServer } from '../../shared/files-server'
import { CodeSection, Token } from '../../shared/parsed'
import { StrView } from '../../shared/strview'
import { computeCodeSectionEnd, matchUnion } from '../../shared/utils'
import { Parser } from './base'

export function selfRef<T>(producer: (self: Parser<T>) => Parser<T>): Parser<T> {
  const parser = producer((start, input, ctx) => parser(start, input, ctx))
  return parser
}

export function withLatelyDeclared<T>(parser: () => Parser<T>): Parser<T> {
  return (start, input, ctx) => parser()(start, input, ctx)
}

function _sumUpDiagnostics(diags: Diagnostic[]): string {
  return diags
    .map((diag) => {
      const file: string = matchUnion(diag.error.at.start.file, 'type', {
        entrypoint: () => '<entrypoint>',
        internal: ({ path }) => `<internal:${path}>`,
        file: ({ path }) => `file:${path}`,
      })

      return `${file} [${diag.error.at.start.line}:${diag.error.at.start.col} => ${diag.error.at.next.line}:${diag.error.at.next.col}] "${diag.error.message}"`
    })
    .join(' >> ')
}

// eslint-disable-next-line @typescript-eslint/ban-types
function _logUsageHandler(originalFn: Function, parser: Parser<unknown>, alias: string | undefined): Parser<unknown> {
  const parserName = `${alias ?? (originalFn.name || '?')}`
  const trimStr = (str: string) => (str.length < 80 ? str : str.substr(0, 80) + '...').replace(/\n/g, '\\n')

  let call = 0

  return (start, input, ctx) => {
    call++
    const parserNameWithCall = `{${parserName}:${call}}`

    console.log(`${parserNameWithCall} Called at line ${start.line} col ${start.col} | ${trimStr(input.littleView())}`)

    const result = parser(start, input, ctx)

    if (result.ok) {
      const extract = getCodeExtract(result.data.at, ctx.sourceServer)

      console.debug(
        `${parserNameWithCall} Succeeded at line ${result.data.at.next.line} col ${result.data.at.next.col} ` +
          (extract !== false ? `| ${trimStr(extract)}` : ` (failed to get code extract)`)
      )
    } else {
      console.debug(
        `${parserNameWithCall} FAILED (${result.precedence ? 'Pr' : '--'}) | (${result.history.length}) ${trimStr(
          _sumUpDiagnostics(result.history)
        )}`
      )
    }

    return result
  }
}

// eslint-disable-next-line @typescript-eslint/ban-types, @typescript-eslint/no-explicit-any
export function logUsage<F extends Function>(fn: F & ((...args: any[]) => Parser<any>)): F
// eslint-disable-next-line @typescript-eslint/ban-types, @typescript-eslint/no-explicit-any
export function logUsage<F extends Function>(alias: string, fn: F & ((...args: any[]) => Parser<any>)): F
// eslint-disable-next-line @typescript-eslint/ban-types, @typescript-eslint/no-explicit-any
export function logUsage<F extends Function>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fnOrAlias: string | (F & ((...args: any[]) => Parser<any>)),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn?: F & ((...args: any[]) => Parser<any>)
): F {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((...args: any[]): Parser<any> =>
    typeof fnOrAlias === 'string'
      ? // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-non-null-assertion
        _logUsageHandler(fn!, fn!(...args), fnOrAlias)
      : // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
        _logUsageHandler(fnOrAlias, fnOrAlias(...args), undefined)) as any as F
}

// eslint-disable-next-line @typescript-eslint/ban-types, @typescript-eslint/no-explicit-any
export function logUsageD<F extends Function>(alias: string, fn: F & Parser<any>): F {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return _logUsageHandler(fn, fn, alias) as any as F
}

export function withNormalizedNewlines<T>(parser: Parser<T>): Parser<T> {
  return (start, input, ctx) =>
    parser(
      start,
      input.withSlowMapper((str) => str.replace(/\r\n|\r/g, '\n')),
      ctx
    )
}

export function mapToken<T, U>(token: Token<T>, mapper: (value: T, token: Token<T>) => U): Token<U> {
  return { ...token, parsed: mapper(token.parsed, token) }
}

export function flattenMaybeToken<T>(token: Token<T | null>): Token<T> | null {
  return token.parsed !== null ? { ...token, parsed: token.parsed } : null
}

// TODO: SLOW
export function getCodeExtract(section: CodeSection, filesServer: SourceFilesServer): string | false {
  const file: StrView | false = matchUnion(section.start.file, 'type', {
    entrypoint: () => filesServer.entrypoint(),
    internal: () => false,
    file: ({ path }) => filesServer.read(path),
  })

  if (file === false) return file

  const source = file.toFullStringSlow().split('\n')
  const end = computeCodeSectionEnd(section, file)

  if (end.line === section.start.line) {
    return source[section.start.line].substr(section.start.col, end.col - section.start.col + 1)
  }

  const firstLine = source[section.start.line].substr(section.start.col)
  const lastLine = source[end.line].substr(0, end.col)

  if (end.line === section.start.line + 1) {
    return firstLine + '\n' + lastLine
  }

  return (
    firstLine +
    '\n' +
    source.slice(section.start.line + 1, end.line - section.start.line - 1).join('\n') +
    '\n' +
    lastLine
  )
}
