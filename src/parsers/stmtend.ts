import { Parser } from '../lib/base'
import { combine } from '../lib/combinations'
import { lookahead } from '../lib/consumeless'
import { maybe_s, maybe_s_nl } from '../lib/littles'
import { eol, oneOfMap } from '../lib/matchers'
import { or } from '../lib/switches'
import { matchStatementClose } from './context'
import { StatementChainOp } from './data'

export const statementChainOp: Parser<StatementChainOp> = oneOfMap([
  [';', StatementChainOp.Then],
  ['&&', StatementChainOp.And],
  ['||', StatementChainOp.Or],
  ['|', StatementChainOp.Pipe],
])

export const endOfInner: Parser<void> = lookahead(
  combine(maybe_s_nl, or<unknown>([statementChainOp, matchStatementClose]))
)

export const endOfStatement: Parser<void> = lookahead(or<unknown>([combine(maybe_s, eol()), endOfInner]))
