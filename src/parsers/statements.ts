import { Parser } from '../lib/base'
import { combine } from '../lib/combinations'
import { flatten, ifThen, ifThenElse, maybe, maybeFlatten } from '../lib/conditions'
import { fail, lookahead, not } from '../lib/consumeless'
import { failure } from '../lib/errors'
import { maybe_s, maybe_s_nl, s } from '../lib/littles'
import { takeWhile } from '../lib/loops'
import { bol, eol, exact, match } from '../lib/matchers'
import { mappedCases, or } from '../lib/switches'
import { map } from '../lib/transform'
import { flattenMaybeToken, mapToken, selfRef } from '../lib/utils'
import { cmdArg } from './cmdarg'
import { matchStatementClose } from './context'
import { CmdArg, CmdRedir, Statement, StatementChain } from './data'
import { expr } from './expr'
import { literalPath } from './literals'
import { cmdRedirOp, endOfCmdCall, statementChainOp } from './stmtend'
import { identifier } from './tokens'
import { fnDecl, valueType } from './types'

export const statement: Parser<Statement> = mappedCases<Statement>()(
  'type',
  {
    comment: map(combine(exact('#'), match(/[^\n]*/), { inter: maybe_s }), ([_, content]) => ({ content })),

    return: map(combine(exact('return'), maybeFlatten(map(combine(s, expr), ([_, expr]) => expr))), ([_, expr]) => ({
      expr,
    })),

    elseBlock: map(exact('else'), (_) => ({})),

    blockEnd: map(exact('end'), (_) => ({})),

    variableDecl: map(
      combine(
        map(
          combine(exact('let'), maybe(exact('mut')), failure(identifier, 'Syntax error: expected an identifier'), {
            inter: s,
          }),
          ([_, mut, varname]) => [mut, varname] as const
        ),
        maybeFlatten(
          map(
            combine(exact(':'), failure(valueType, 'Expected a type annotation'), { inter: maybe_s }),
            ([_, type]) => type
          )
        ),
        exact('=', 'Syntax error: expected an assignment'),
        failure(expr, 'Syntax error: expected an expression'),
        { inter: maybe_s }
      ),

      ([mutAndVarname, vartype, _, expr]) => {
        return {
          mutable: mapToken(mutAndVarname.parsed[0], (str) => !!str),
          varname: mutAndVarname.parsed[1],
          vartype: flattenMaybeToken(vartype),
          expr,
        }
      }
    ),

    ifBlock: map(
      combine(exact('if'), failure(expr, 'Syntax error: expected a condition'), { inter: s }),
      ([_, cond]) => ({
        cond,
      })
    ),

    forLoop: map(
      combine(
        exact('for'),
        failure(identifier, 'Syntax error: expected an identifier'),
        exact('in', 'Syntax error: expected "in" keyword'),
        failure(expr, 'Syntax error: expected an expression to iterate on'),
        { inter: s }
      ),
      ([_, loopvar, __, subject]) => ({ loopvar, subject })
    ),

    whileLoop: map(
      combine(exact('while'), failure(expr, 'Syntax error: expected a loop condition'), { inter: s }),
      ([_, cond]) => ({ cond })
    ),

    elifBlock: map(
      combine(exact('elif'), failure(expr, 'Syntax error: expected a condition'), { inter: s }),
      ([_, cond]) => ({ cond })
    ),

    typeAlias: map(
      combine(
        exact('type'),
        s,
        failure(identifier, 'Syntax error: expected a name for the type alias'),
        maybe_s,
        failure(exact('='), 'Syntax error: expected an assignment (=) operator'),
        maybe_s_nl,
        failure(valueType, 'Syntax error: expected a type')
      ),
      ([_, __, typename, ___, ____, _____, content]) => ({ typename, content })
    ),

    fnOpen: map(fnDecl, (fn) => fn),

    cmdCall: map(
      combine(
        or([
          map(combine(identifier, lookahead(endOfCmdCall)), ([name, _]) => ({ name, args: [] })),
          map(
            combine(
              identifier,
              takeWhile(
                ifThenElse<CmdArg>(endOfCmdCall, fail(), failure(cmdArg, 'Syntax error: invalid argument provided')),
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
              failure(literalPath, 'Syntax error: expected a valid path after redirection operator')
            ),
            ([op, _, path]): CmdRedir => ({ op, path })
          )
        ),
        { inter: maybe_s }
      ),
      ([nameAndArgs, redir]) => ({
        ...nameAndArgs.parsed,
        redir: flattenMaybeToken(redir),
      })
    ),
  },
  'Syntax error: expected statement'
)

export const statementChainFree: Parser<StatementChain> = selfRef((statementChainFree) =>
  map(
    combine(
      statement,
      ifThen(
        not(lookahead(or([matchStatementClose, eol()]))),
        combine(
          failure(statementChainOp, 'Syntax error: expected end of statement'),
          maybe_s_nl,
          failure(statementChainFree, 'Syntax error: expected another statement')
        )
      ),
      or([matchStatementClose, eol()]),
      {
        inter: maybe_s,
      }
    ),
    ([stmt, chain]): StatementChain =>
      !chain.parsed
        ? { type: 'single', stmt }
        : { type: 'chain', left: stmt, op: chain.parsed[0], right: chain.parsed[2] }
  )
)

export const statementChain: Parser<StatementChain> = or<StatementChain>([
  map(combine(bol('Internal error: statement chain must start at BOL'), maybe_s, eol()), (_, __) => ({
    type: 'empty',
  })),
  flatten(map(combine(bol(), statementChainFree), ([, chain]) => chain)),
])
