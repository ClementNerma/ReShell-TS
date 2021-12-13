import { CmdArg, CmdCall, CmdCallSub, CmdRedir } from '../shared/ast'
import { cmdArg } from './cmdarg'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { failIfMatches, failIfMatchesElse, filterNullables, maybe, notFollowedBy } from './lib/conditions'
import { failure } from './lib/errors'
import { maybe_s, maybe_s_nl, s } from './lib/littles'
import { takeWhile } from './lib/loops'
import { eol, exact } from './lib/matchers'
import { or } from './lib/switches'
import { map, silence } from './lib/transform'
import { flattenMaybeToken, withLatelyDeclared } from './lib/utils'
import { rawPath } from './literals'
import { cmdRedirOp } from './stmtend'
import { cmdName, identifier, keyword } from './tokens'

export const cmdCall: (callEndDetector: Parser<void>) => Parser<CmdCall> = (callEndDetector) =>
  map(
    combine(
      cmdCallSub(callEndDetector),
      maybe_s,
      maybe(
        map(
          combine(
            notFollowedBy(exact('|'), exact('|')),
            maybe_s_nl,
            takeWhile(cmdCallSub(callEndDetector), {
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

export const cmdCallSub: (callEndDetector: Parser<void>) => Parser<CmdCallSub> = (callEndDetector) =>
  map(
    combine(
      maybe(combine(exact('unaliased'), s)),
      or([
        map(
          combine(
            failIfMatches(keyword, 'cannot use reserved keyword here'),
            cmdName,
            or([callEndDetector, silence(exact('|'))])
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
                  or([callEndDetector, silence(exact('|'))]),
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
