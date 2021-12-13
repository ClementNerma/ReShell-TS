import { Parser } from '../lib/base'
import { combine } from '../lib/combinations'
import { failIfElse, maybe } from '../lib/conditions'
import { not } from '../lib/consumeless'
import { failure } from '../lib/errors'
import { maybe_s, s } from '../lib/littles'
import { takeWhile } from '../lib/loops'
import { or } from '../lib/switches'
import { map } from '../lib/transform'
import { flattenMaybeToken, withLatelyDeclared } from '../lib/utils'
import { cmdArg } from './cmdarg'
import { CmdCall, CmdRedir } from './data'
import { rawPath } from './literals'
import { cmdRedirOp } from './stmtend'
import { identifier, keyword } from './tokens'

export const cmdCall: (callEndDetector: Parser<void>) => Parser<CmdCall> = (callEndDetector) =>
  map(
    combine(
      or([
        map(
          combine(failure(not(keyword), 'Cannot use reserved keyword alone'), identifier, callEndDetector),
          ([_, name, __]) => ({
            name,
            args: [],
          })
        ),
        map(
          combine(
            identifier,
            takeWhile(
              failIfElse(
                callEndDetector,
                failure(
                  withLatelyDeclared(() => cmdArg),
                  'Invalid argument provided'
                )
              ),
              { inter: s }
            ),
            { inter: s }
          ),
          ([name, { parsed: args }]) => ({ name, args })
        ),
      ]),
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
      ),
      { inter: maybe_s }
    ),
    ([{ parsed: nameAndArgs }, redir]) => ({ ...nameAndArgs, redir: flattenMaybeToken(redir) })
  )
