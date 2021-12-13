import { CmdArg, CmdCall, CmdRedir } from '../shared/ast'
import { cmdArg } from './cmdarg'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { failIfMatches, failIfMatchesElse, filterNullables, maybe } from './lib/conditions'
import { failure } from './lib/errors'
import { maybe_s, s } from './lib/littles'
import { takeWhile } from './lib/loops'
import { eol, exact } from './lib/matchers'
import { or } from './lib/switches'
import { map } from './lib/transform'
import { flattenMaybeToken, withLatelyDeclared } from './lib/utils'
import { rawPath } from './literals'
import { cmdRedirOp } from './stmtend'
import { cmdName, identifier, keyword } from './tokens'

export const cmdCall: (callEndDetector: Parser<void>) => Parser<CmdCall> = (callEndDetector) =>
  map(
    combine(
      maybe(combine(exact('unaliased'), s)),
      or([
        map(
          combine(failIfMatches(keyword, 'cannot use reserved keyword here'), cmdName, callEndDetector),
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
                  callEndDetector,
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
      ]),
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
    ([
      { parsed: unaliased },
      {
        parsed: { name, args },
      },
      _,
      redir,
    ]) => ({ unaliased: unaliased !== null, name, args, redir: flattenMaybeToken(redir) })
  )
