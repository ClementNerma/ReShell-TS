import { CodeLoc } from '../../shared/parsed'
import { StrView } from '../../shared/strview'
import { err, ErrInputData, Parser, ParserErr, ParsingContext, withErr, WithErrData } from './base'
import { map } from './transform'

export type OrErrorFn<R> = (input: StrView, context: ParsingContext, start: CodeLoc) => R

export enum OrErrorStrategy {
  DoNothing,
  Const,
  Fn,
  FallbackConst,
  FallbackFn,
}

export type OrErrorStrategyData =
  | string // FallbackConst
  | [OrErrorStrategy.DoNothing]
  | [OrErrorStrategy.Const, ErrInputData]
  | [OrErrorStrategy.Fn, OrErrorFn<ErrInputData>]
  | [OrErrorStrategy.FallbackConst, WithErrData]
  | [OrErrorStrategy.FallbackFn, OrErrorFn<WithErrData>]

export function or<T>(parsers: Parser<T>[], error?: OrErrorStrategyData): Parser<T> {
  return (start, input, context) => {
    let mostRelevant: ParserErr | undefined = undefined

    for (const parser of parsers) {
      const parsed = parser(start, input, context)
      if (parsed.ok) return parsed

      if (parsed.precedence) {
        mostRelevant = parsed
        break
      }
    }

    if (typeof error === 'string') {
      return withErr(mostRelevant ?? err(start, start, context), error)
    }

    if (!error) {
      return mostRelevant ?? err(start, start, context)
    }

    switch (error[0]) {
      case OrErrorStrategy.DoNothing:
        return mostRelevant ?? err(start, start, context)

      case OrErrorStrategy.Const:
        return mostRelevant ?? err(start, start, context, error[1])

      case OrErrorStrategy.Fn:
        return mostRelevant ?? err(start, start, context, error[1](input, context, start))

      case OrErrorStrategy.FallbackConst:
        return withErr(mostRelevant ?? err(start, start, context), error[1])

      case OrErrorStrategy.FallbackFn:
        return withErr(mostRelevant ?? err(start, start, context), error[1](input, context, start))
    }
  }
}

export function mappedCasesComposed<S extends object>(): <DN extends keyof S, E extends S>(
  discriminant: DN,
  firstResolver: Parser<E>,
  cases: Exclude<S, E>[DN] extends string
    ? {
        [disc in Exclude<S, E>[DN]]: Parser<Omit<Extract<S, { [key in DN]: disc }>, DN>>
      }
    : never,
  error?: OrErrorStrategyData
) => Parser<S> {
  return (discriminant, firstResolver, cases, error) =>
    or<S>([firstResolver, mappedCases<any>()(discriminant, cases)], error)
}

export function mappedCases<S extends object>(): <DN extends keyof S>(
  discriminant: DN,
  cases: S[DN] extends string
    ? {
        [disc in S[DN]]: Parser<Omit<Extract<S, { [key in DN]: disc }>, DN>>
      }
    : never,
  error?: OrErrorStrategyData
) => Parser<S> {
  return (discriminant, cases, error) =>
    or<S>(
      Object.entries(cases).map(([caseName, parser]) =>
        map(parser as Parser<S>, (data) => ({ ...data, [discriminant]: caseName }))
      ),
      error
    )
}
