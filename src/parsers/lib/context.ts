import { Token } from '../../shared/parsed'
import { Parser, ParsingContext, success } from './base'

// TODO: Show in the doc that the functions below are unsafe (can throw type errors at runtime)

export function withTypedCtxData<T, C>(data: C): (parser: Parser<T>) => Parser<T> {
  return (parser) => (start, input, context) => parser(start, input, { ...context, $custom: data })
}

export type ContextMapper<C> = ($custom: C, context: ParsingContext) => C

export function withTypedCtx<T, C>(mapper: ContextMapper<C>, parser: Parser<T>): Parser<T> {
  return (start, input, context) => parser(start, input, { ...context, $custom: mapper(context.$custom as C, context) })
}

export type ContextRuntimeMapper<C, T> = ($custom: C, context: ParsingContext) => Parser<T>

export function withRuntimeTypedCtx<T, C>(mapper: ContextRuntimeMapper<C, T>): Parser<T> {
  return (start, input, context) =>
    mapper(context.$custom as C, context)(start, input, { ...context, $custom: mapper(context.$custom as C, context) })
}

export function feedContext<A, B, C, D>(
  parserForContextFeeding: Parser<A>,
  feeder: ($custom: C, result: A, token: Token<A>) => C,
  parserWithFeededContext: Parser<B>,
  add: ($custom: C, result: B, token: Token<B>) => D
): Parser<[Token<A>, Token<B>, D]> {
  return (start, input, context) => {
    const first = parserForContextFeeding(start, input, context)
    if (!first.ok) return first

    const feeded = feeder(context.$custom as C, first.data.parsed, first.data)

    const second = parserWithFeededContext(first.data.at.next, input.offset(first.data.matched.length), {
      ...context,
      $custom: feeded,
    })

    if (!second.ok) return second

    return success(
      start,
      second.data.at.next,
      [first.data, second.data, add(feeded, second.data.parsed, second.data)],
      first.data.matched + second.data.matched
    )
  }
}
