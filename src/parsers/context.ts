import { Parser } from '../lib/base'
import { combine } from '../lib/combinations'
import { fail, lookahead } from '../lib/consumeless'
import { withRuntimeTypedCtx, withTypedCtx } from '../lib/context'
import { maybe_s_nl } from '../lib/littles'
import { exact } from '../lib/matchers'
import { or } from '../lib/switches'

export type StatementClosingChar = '}' | ']' | ')'

type CtxMapper = ($custom: CustomContext) => CustomContext
type CtxAction<T> = ($custom: CustomContext) => Parser<T>

export type CustomContext = {
  statementClose: StatementClosingChar[]
  continuationKeywords: string[]
}

export const initContext: () => CustomContext = () => ({
  statementClose: [],
  continuationKeywords: [],
})

export const withStatementClose = <T>(char: StatementClosingChar, parser: Parser<T>): Parser<T> =>
  withTypedCtx<T, CustomContext>(
    ($custom) => ({
      ...$custom,
      statementClose: $custom.statementClose.concat([char]),
    }),
    parser
  )

export const withContinuationKeyword = <T>(continuationKeywords: string[], parser: Parser<T>): Parser<T> =>
  withTypedCtx<T, CustomContext>(
    ($custom) => ({
      ...$custom,
      continuationKeywords,
    }),
    parser
  )

export const getStatementClose: <T>(action: (char: string | null) => Parser<T>) => CtxAction<T> =
  (action) => ($custom) =>
    action($custom.statementClose[$custom.statementClose.length - 1] ?? null)

export const getContinuationKeyword: <T>(action: (words: string[]) => Parser<T>) => CtxAction<T> =
  (action) => ($custom) =>
    action($custom.continuationKeywords)

export const matchStatementClose = withRuntimeTypedCtx(
  getStatementClose((char) => (char ? lookahead(combine(maybe_s_nl, exact(char))) : fail()))
)

export const matchContinuationKeyword = withRuntimeTypedCtx(
  getContinuationKeyword((keywords) =>
    keywords.length > 0 ? lookahead(combine(maybe_s_nl, or(keywords.map((keyword) => exact(keyword))))) : fail()
  )
)
