import { Formatters } from '../settings'
import { Parser, ParserErr, Token } from './base'

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
        ? `${parserName} Succeeded at line ${result.data.next.line} col ${result.data.next.col} | ${trimStr(
            result.data.matched
          )}`
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

export function formatErr(err: ParserErr, formatters?: Formatters): string {
  const f = formatters?.parsingError

  if (err.stack.length === 0) {
    return f?.noErrorMessageFallback?.(err) ?? '<no error provided>'
  }

  const farest = err.stack[0]

  const { line, col } = farest.loc

  const lineLen = line.toString().length
  const linePad = ' '.repeat(lineLen)

  const header = `--> At line ${line + 1}, column ${col + 1}`
  const failedLine = err.context.source.ref.split(/\n/)[line]

  const text =
    `${linePad} ${f?.header?.(header) ?? header}\n` +
    `${linePad} |\n` +
    `${line + 1} | ${f?.failedLine?.(failedLine) ?? failedLine}\n` +
    `${linePad} | ${' '.repeat(col)}${f?.locationPointer?.('^') ?? '^'} ${
      f?.errorMessage?.(farest.message) ?? farest.message
    }` +
    (farest.tip ? `\n${linePad} | ${' '.repeat(col)}  ${f?.tip?.(`Tip: ${farest.tip}`) ?? `Tip: ${farest.tip}`}` : '')

  return f?.wrapper?.(text) ?? text
}

export function withNormalizedNewlines<T>(parser: Parser<T>): Parser<T> {
  return (start, input, context) => parser(start, input.replace(/\r\n|\r/g, '\n'), context)
}

export function mapToken<T, U>(token: Token<T>, mapper: (value: T, token: Token<T>) => U): Token<U> {
  return { ...token, parsed: mapper(token.parsed, token) }
}

export function flattenMaybeToken<T>(token: Token<T | null>): Token<T> | null {
  return token.parsed ? { ...token, parsed: token.parsed } : null
}
