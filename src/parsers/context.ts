import { Parser } from '../lib/base'
import { combine } from '../lib/combinations'
import { fail, lookahead } from '../lib/consumeless'
import { withRuntimeTypedCtx, withTypedCtx } from '../lib/context'
import { maybe_s_nl } from '../lib/littles'
import { exact } from '../lib/matchers'

export type StatementClosingChar = '}' | ']' | ')'

type CtxMapper = ($custom: CustomContext) => CustomContext
type CtxAction<T> = ($custom: CustomContext) => Parser<T>

export type CustomContext = {
  statementClose: StatementClosingChar[]
}

export const initContext: () => CustomContext = () => ({
  statementClose: [],
})

export const withStatementClose = <T>(char: StatementClosingChar, parser: Parser<T>): Parser<T> =>
  withTypedCtx<T, CustomContext>(
    ($custom) => ({
      ...$custom,
      statementClose: $custom.statementClose.concat([char]),
    }),
    parser
  )

export const getStatementClose: <T>(action: (char: string | null) => Parser<T>) => CtxAction<T> =
  (action) => ($custom) =>
    action($custom.statementClose[$custom.statementClose.length - 1] ?? null)

export const matchStatementClose = withRuntimeTypedCtx(
  getStatementClose((char) => (char ? lookahead(combine(maybe_s_nl, exact(char))) : fail()))
)
