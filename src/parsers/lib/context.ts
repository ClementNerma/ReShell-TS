import { Parser, ParsingContext } from './base'

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
