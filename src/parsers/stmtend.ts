import { ChainedCmdCallOp, CmdRedirOp, StatementChainOp } from '../shared/ast'
import { matchStatementClose } from './context'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { lookahead } from './lib/consumeless'
import { maybe_s, maybe_s_nl } from './lib/littles'
import { eol, oneOfMap } from './lib/matchers'
import { or } from './lib/switches'
import { silence } from './lib/transform'

export const chainedCmdCallOp: Parser<ChainedCmdCallOp> = oneOfMap([
  ['&&', 'And'],
  ['||', 'Or'],
])

export const cmdRedirOp: Parser<CmdRedirOp> = oneOfMap([
  ['err>>', 'AppendStderr'],
  ['both>>', 'AppendStdoutStderr'],
  ['err>', 'Stderr'],
  ['both>', 'StdoutStderr'],
  ['>>', 'AppendStdout'],
  ['>', 'Stdout'],
  ['<', 'Input'],
])

export const statementChainOp: Parser<StatementChainOp> = oneOfMap([[';', 'Then']])

export const endOfInlineCmdCall: Parser<void> = lookahead(
  combine(maybe_s_nl, or<unknown>([statementChainOp, cmdRedirOp, /*chainedCmdCallOp,*/ matchStatementClose]))
)

export const endOfCmdCallStatement: Parser<void> = or([lookahead(combine(maybe_s, eol())), endOfInlineCmdCall])

export const endOfStatementChain: Parser<void> = silence(combine(maybe_s, or([matchStatementClose, eol()])))
