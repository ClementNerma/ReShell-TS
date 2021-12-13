import { Token } from '../../shared/parsed'
import { Parser, ParserErr } from './base'

export function selfRef<T>(producer: (self: Parser<T>) => Parser<T>): Parser<T> {
  const parser = producer((start, input, ctx) => parser(start, input, ctx))
  return parser
}

export function withLatelyDeclared<T>(parser: () => Parser<T>): Parser<T> {
  return (start, input, ctx) => parser()(start, input, ctx)
}

function _logUsageHandler(originalFn: Function, parser: Parser<unknown>, alias: string | undefined): Parser<unknown> {
  const parserName = `{${alias ?? originalFn.name ?? '?'}}`
  const trimStr = (str: string) => (str.length < 80 ? str : str.substr(0, 80) + '...').replace(/\n/g, '\\n')

  return (start, input, ctx) => {
    console.log(`${parserName} Called at line ${start.line} col ${start.col} | ${trimStr(input.littleView())}`)

    const result = parser(start, input, ctx)

    console.log(
      result.ok
        ? `${parserName} Succeeded${result.infos.phantomSuccess ? ' (phantom) ' : ' '}${
            result.infos.skipInter ? '(skipInter) ' : ''
          }at line ${result.data.at.next.line} col ${result.data.at.next.col} | ${trimStr(result.data.matched)}`
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
export function getErrorInput(err: ParserErr): string {
  return err.next.line === err.start.line
    ? err.context.source.toFullStringSlow().substr(err.next.col - err.start.col)
    : err.context.source
        .toFullStringSlow()
        .split('\n')
        .slice(err.next.line - err.start.line)
        .join('\n')
        .substr(err.next.col)
}
