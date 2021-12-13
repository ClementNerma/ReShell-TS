import { Parser, ParserErr, sliceInput, Token } from './base'

export function selfRef<T>(producer: (self: Parser<T>) => Parser<T>): Parser<T> {
  const parser = producer((start, input, context) => parser(start, input, context))
  return parser
}

export function withLatelyDeclared<T>(parser: () => Parser<T>): Parser<T> {
  return (start, input, context) => parser()(start, input, context)
}

function _logUsageHandler(originalFn: Function, parser: Parser<unknown>, alias: string | undefined): Parser<unknown> {
  const parserName = `{${alias ?? originalFn.name ?? '?'}}`
  const trimStr = (str: string) => (str.length < 80 ? str : str.substr(0, 80) + '...').replace(/\n/g, '\\n')

  return (start, input, context) => {
    console.log(`${parserName} Called at line ${start.line} col ${start.col} | ${trimStr(input)}`)

    const result = parser(start, input, context)

    console.log(
      result.ok
        ? `${parserName} Succeeded (${result.data.neutralError ? 'neutral error' : 'ok'}) at line ${
            result.data.next.line
          } col ${result.data.next.col} | ${trimStr(result.data.matched)}`
        : `${parserName} FAILED (${result.precedence ? 'Pr' : '--'}) | ${trimStr(JSON.stringify(result.stack))}`
    )

    return result
  }
}

export function logUsage<F extends Function>(fn: F & ((...args: any[]) => Parser<any>)): F
export function logUsage<F extends Function>(alias: string, fn: F & ((...args: any[]) => Parser<any>)): F
export function logUsage<F extends Function>(
  fnOrAlias: string | (F & ((...args: any[]) => Parser<any>)),
  fn?: F & ((...args: any[]) => Parser<any>)
): F {
  return ((...args: any[]): Parser<any> =>
    typeof fnOrAlias === 'string'
      ? _logUsageHandler(fn!, fn!(...args), fnOrAlias)
      : _logUsageHandler(fnOrAlias, fnOrAlias(...args), undefined)) as any as F
}

export function logUsageD<F extends Function>(alias: string, fn: F & Parser<any>): F {
  return _logUsageHandler(fn, fn, alias) as any as F
}

export function withNormalizedNewlines<T>(parser: Parser<T>): Parser<T> {
  return (start, input, context) => parser(start, input.replace(/\r\n|\r/g, '\n'), context)
}

export function mapToken<T, U>(token: Token<T>, mapper: (value: T, token: Token<T>) => U): Token<U> {
  return { ...token, parsed: mapper(token.parsed, token) }
}

export function flattenMaybeToken<T>(token: Token<T | null>): Token<T> | null {
  return token.parsed !== null ? { ...token, parsed: token.parsed } : null
}

export function getErrorInput(err: ParserErr): string {
  return sliceInput(err.context.source.ref, { line: 0, col: 0 }, err.loc)
}

export type ErrorParsingFormatters = {
  noErrorMessageFallback?: (text: string) => string
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

export function formatErr(err: ParserErr, f?: ErrorParsingFormatters): string {
  const format = (formatterName: keyof ErrorParsingFormatters, text: string) => {
    const formatter = f?.[formatterName]
    return formatter ? formatter(text) : text
  }

  if (err.stack.length === 0) {
    return format('noErrorMessageFallback', '<no error provided>')
  }

  const farest = err.stack[0]

  const text = [farest.error]
    .concat(farest.also)
    .map(({ loc, length, message, complements }) => {
      const { line, col } = loc

      const lineLen = line.toString().length
      const linePad = ' '.repeat(lineLen)

      const header = `--> At ${format('location', `${line + 1}:${col + 1}`)}:`

      const failedLine = err.context.source.ref.split(/\n/)[line]

      const locPtr = format('locationPointer', '^'.repeat(length ?? 1))

      const paddingGutter = format('gutter', linePad + ' |')

      const complementsText = complements
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
