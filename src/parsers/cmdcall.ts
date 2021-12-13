import { Parser } from '../lib/base'
import { combine } from '../lib/combinations'
import { ifThenElse, maybe } from '../lib/conditions'
import { fail } from '../lib/consumeless'
import { failure } from '../lib/errors'
import { maybe_s, s } from '../lib/littles'
import { takeWhile } from '../lib/loops'
import { or } from '../lib/switches'
import { map } from '../lib/transform'
import { flattenMaybeToken, withLatelyDeclared } from '../lib/utils'
import { cmdArg } from './cmdarg'
import { CmdArg, CmdCall, CmdRedir } from './data'
import { literalPath } from './literals'
import { cmdRedirOp } from './stmtend'
import { identifier } from './tokens'

export const cmdCall: (callEndDetector: Parser<void>) => Parser<CmdCall> = (callEndDetector) =>
  map(
    combine(
      or([
        map(combine(identifier, callEndDetector), ([name, _]) => ({
          name,
          args: [],
        })),
        map(
          combine(
            identifier,
            takeWhile(
              ifThenElse<CmdArg>(
                callEndDetector,
                fail(),
                failure(
                  withLatelyDeclared(() => cmdArg),
                  'Syntax error: invalid argument provided'
                )
              ),
              {
                inter: s,
              }
            ),
            {
              inter: s,
            }
          ),
          ([name, args]) => ({
            name,
            args: args.parsed ?? [],
          })
        ),
      ]),
      maybe(
        map(
          combine(
            cmdRedirOp,
            maybe_s,
            failure(
              withLatelyDeclared(() => literalPath),
              'Syntax error: expected a valid path after redirection operator'
            )
          ),
          ([op, _, path]): CmdRedir => ({ op, path })
        )
      ),
      { inter: maybe_s }
    ),
    ([nameAndArgs, redir]) => ({ ...nameAndArgs.parsed, redir: flattenMaybeToken(redir) })
  )
