import { CmdCall, CmdRedir } from '../shared/ast'
import { cmdArg } from './cmdarg'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { failIfMatches, failIfMatchesElse, maybe } from './lib/conditions'
import { failure } from './lib/errors'
import { maybe_s, s } from './lib/littles'
import { takeWhile } from './lib/loops'
import { or } from './lib/switches'
import { map } from './lib/transform'
import { flattenMaybeToken, withLatelyDeclared } from './lib/utils'
import { rawPath } from './literals'
import { cmdRedirOp } from './stmtend'
import { identifier, keyword } from './tokens'

export const cmdCall: (callEndDetector: Parser<void>) => Parser<CmdCall> = (callEndDetector) =>
  map(
    combine(
      or([
        map(
          combine(failIfMatches(keyword, 'Cannot use reserved keyword alone'), identifier, callEndDetector),
          ([_, name, __]) => ({
            name,
            args: [],
          })
        ),
        map(
          combine(
            identifier,
            s,
            takeWhile(
              failIfMatchesElse(
                callEndDetector,
                failure(
                  withLatelyDeclared(() => cmdArg),
                  'Invalid argument provided'
                )
              ),
              { inter: s }
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
              'Expected a valid path after redirection operator'
            )
          ),
          ([op, _, path]): CmdRedir => ({ op, path })
        )
      )
    ),
    ([{ parsed: nameAndArgs }, _, redir]) => ({ ...nameAndArgs, redir: flattenMaybeToken(redir) })
  )
