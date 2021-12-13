import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { fail, lookahead } from './lib/consumeless'
import { withRuntimeTypedCtx, withTypedCtx } from './lib/context'
import { maybe_s_nl } from './lib/littles'
import { exact } from './lib/matchers'
import { or } from './lib/switches'

export type StatementClosingChar = '}' | ']' | ')'

type CtxAction<T> = ($custom: CustomContext) => Parser<T>

export type CustomContext = {
  statementClose: StatementClosingChar | null
  continuationKeywords: string[]
}

export const initContext: () => CustomContext = () => ({
  statementClose: null,
  continuationKeywords: [],
})

export const withStatementClosingChar = <T>(statementClose: StatementClosingChar, parser: Parser<T>): Parser<T> =>
  withTypedCtx<T, CustomContext>(($custom) => ({ ...$custom, statementClose }), parser)

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
    action($custom.statementClose)

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
