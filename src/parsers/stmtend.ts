import { Parser } from '../lib/base'
import { combine } from '../lib/combinations'
import { lookahead } from '../lib/consumeless'
import { maybe_s, maybe_s_nl } from '../lib/littles'
import { eol, oneOfMap } from '../lib/matchers'
import { or } from '../lib/switches'
import { silence } from '../lib/transform'
import { matchStatementClose } from './context'
import { CmdRedirOp, StatementChainOp } from './data'

export const statementChainOp: Parser<StatementChainOp> = oneOfMap([
  [';', StatementChainOp.Then],
  ['&&', StatementChainOp.And],
  ['||', StatementChainOp.Or],
  ['|', StatementChainOp.Pipe],
])

export const cmdRedirOp: Parser<CmdRedirOp> = oneOfMap([
  ['err>>', CmdRedirOp.AppendStderr],
  ['both>>', CmdRedirOp.AppendStdoutStderr],
  ['err>', CmdRedirOp.Stderr],
  ['both>', CmdRedirOp.StdoutStderr],
  ['>>', CmdRedirOp.AppendStdout],
  ['>', CmdRedirOp.Stdout],
  ['<', CmdRedirOp.Input],
])

export const endOfInlineCmdCall: Parser<void> = lookahead(
  combine(maybe_s_nl, or<unknown>([statementChainOp, cmdRedirOp, matchStatementClose]))
)

export const endOfCmdCallStatement: Parser<void> = or([lookahead(combine(maybe_s, eol())), endOfInlineCmdCall])

export const endOfStatementChain: Parser<void> = silence(combine(maybe_s, or([matchStatementClose, eol()])))
