import {
  ChainedCmdCallOp,
  ChainedSingleCmdCall,
  CmdArg,
  CmdCall,
  CmdCallSub,
  CmdRedir,
  CmdRedirOp,
  InlineCmdCall,
  InlineCmdCallCapture,
  SingleCmdCall,
} from '../shared/ast'
import { cmdArg } from './cmdarg'
import { withStatementClosingChar } from './context'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { extract, failIfMatches, failIfMatchesElse, filterNullables, maybe, notFollowedBy } from './lib/conditions'
import { failure } from './lib/errors'
import { maybe_s, maybe_s_nl, s } from './lib/littles'
import { takeWhile } from './lib/loops'
import { eol, exact, oneOfMap } from './lib/matchers'
import { or } from './lib/switches'
import { map, silence } from './lib/transform'
import { flattenMaybeToken, withLatelyDeclared } from './lib/utils'
import { rawPath } from './literals'
import { cmdName, identifier, keyword, stmtEnd } from './tokens'

const chainedCmdCallOp: Parser<ChainedCmdCallOp> = oneOfMap([
  ['&&', 'And'],
  ['||', 'Or'],
])

const cmdRedirOp: Parser<CmdRedirOp> = oneOfMap([
  ['err>>', 'AppendStderr'],
  ['both>>', 'AppendStdoutStderr'],
  ['err>', 'Stderr'],
  ['both>', 'StdoutStderr'],
  ['>>', 'AppendStdout'],
  ['>', 'Stdout'],
  ['<', 'Input'],
])

export const cmdCallSub: Parser<CmdCallSub> = map(
  combine(
    maybe(combine(exact('unaliased'), s)),
    or([
      map(
        combine(
          failIfMatches(keyword, 'cannot use reserved keyword here'),
          cmdName,
          or([stmtEnd, silence(exact('|'))])
        ),
        ([_, name]) => ({
          name,
          args: [],
        })
      ),
      map(
        combine(
          identifier,
          s,
          filterNullables(
            takeWhile<CmdArg | null>(
              failIfMatchesElse(
                or([stmtEnd, silence(chainedCmdCallOp), silence(exact('|'))]),
                failure(
                  or([map(combine(exact('\\'), maybe_s, eol()), () => null), withLatelyDeclared(() => cmdArg)]),
                  'invalid argument provided'
                )
              ),
              { inter: s, interExpect: false }
            )
          )
        ),
        ([name, _, { parsed: args }]) => ({ name, args })
      ),
    ])
  ),
  ([
    { parsed: unaliased },
    {
      parsed: { name, args },
    },
  ]) => ({
    unaliased: unaliased !== null,
    name,
    args,
  })
)

export const singleCmdCall: Parser<SingleCmdCall> = map(
  combine(
    cmdCallSub,
    maybe_s,
    maybe(
      map(
        combine(
          notFollowedBy(exact('|'), exact('|')),
          maybe_s_nl,
          takeWhile(cmdCallSub, {
            inter: combine(maybe_s, notFollowedBy(exact('|'), exact('|')), maybe_s_nl),
            interExpect: 'expected a command to pipe the previous one into',
          })
        ),
        ([_, __, { parsed: pipes }]) => pipes
      )
    ),
    maybe_s,
    maybe(
      map(
        combine(
          cmdRedirOp,
          maybe_s,
          failure(
            withLatelyDeclared(() => rawPath),
            'expected a valid path after redirection operator'
          )
        ),
        ([op, _, path]): CmdRedir => ({ op, path })
      )
    )
  ),
  ([base, _, { parsed: pipes }, __, redir]) => ({
    base,
    pipes: pipes ?? [],
    redir: flattenMaybeToken(redir),
  })
)

export const cmdCall: Parser<CmdCall> = map(
  combine(
    singleCmdCall,
    maybe_s,
    extract(
      takeWhile<ChainedSingleCmdCall>(
        map(combine(chainedCmdCallOp, maybe_s_nl, singleCmdCall), ([{ parsed: op }, _, call]) => ({
          op,
          call,
        }))
      )
    )
  ),
  ([base, _, { parsed: chain }]) => ({ base, chain })
)

export const inlineCmdCall: Parser<InlineCmdCall> = map(
  combine(
    oneOfMap<InlineCmdCallCapture>([
      ['$*(', 'Both'],
      ['$!(', 'Stderr'],
      ['$(', 'Stdout'],
    ]),
    maybe_s_nl,
    failure(
      withStatementClosingChar(
        ')',
        withLatelyDeclared(() => cmdCall)
      ),
      'expected inline command call'
    ),
    combine(maybe_s_nl, exact(')', "expected closing paren ')' after inline command call"))
  ),
  ([capture, _, content]) => ({ content, capture })
)
