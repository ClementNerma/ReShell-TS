import { err, ErrInputData, Parser, ParserErr, ParserLoc, ParsingContext, withErr, WithErrData } from './base'
import { map } from './transform'

export type OrErrorFn<R> = (input: string, errors: Array<ParserErr>, context: ParsingContext, start: ParserLoc) => R

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
    const errors: Array<ParserErr> = []

    for (const parser of parsers) {
      const parsed = parser(start, input, context)
      if (parsed.ok) return parsed

      errors.push(parsed)
      if (parsed.precedence) break
    }

    const mostRelevant = errors[errors.length - 1]?.precedence ? errors[errors.length - 1] : undefined

    if (typeof error === 'string') {
      return withErr(mostRelevant ?? err(start, context), context, error)
    }

    if (!error) {
      return mostRelevant ?? err(start, context)
    }

    switch (error[0]) {
      case OrErrorStrategy.DoNothing:
        return mostRelevant ?? err(start, context)

      case OrErrorStrategy.Const:
        return err(start, context, error[1])

      case OrErrorStrategy.Fn:
        return err(start, context, error[1](input, errors, context, start))

      case OrErrorStrategy.FallbackConst:
        return withErr(mostRelevant ?? err(start, context), context, error[1])

      case OrErrorStrategy.FallbackFn:
        return withErr(mostRelevant ?? err(start, context), context, error[1](input, errors, context, start))
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
  return (discriminant, firstResolver, cases, error) => or<S>([firstResolver, mappedCases<any>()(discriminant, cases)])
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
