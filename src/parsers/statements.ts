import { Parser } from '../lib/base'
import { combine } from '../lib/combinations'
import { failIfElse, flatten, maybe, maybeFlatten } from '../lib/conditions'
import { failure } from '../lib/errors'
import { maybe_s, maybe_s_nl, s } from '../lib/littles'
import { takeWhile } from '../lib/loops'
import { bol, eol, exact } from '../lib/matchers'
import { mappedCases, or } from '../lib/switches'
import { map } from '../lib/transform'
import { flattenMaybeToken, mapToken } from '../lib/utils'
import { cmdCall } from './cmdcall'
import { ChainedStatement, Statement, StatementChain } from './data'
import { doubleArithOp, expr } from './expr'
import { propertyAccess } from './propaccess'
import { endOfCmdCallStatement, endOfStatementChain, statementChainOp } from './stmtend'
import { identifier } from './tokens'
import { fnDecl, valueType } from './types'

export const statement: Parser<Statement> = mappedCases<Statement>()(
  'type',
  {
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
          ([_, mutable, varname]) => ({ mutable, varname })
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

      ([mv, vartype, _, expr]) => ({
        mutable: mapToken(mv.parsed.mutable, (str) => !!str),
        varname: mv.parsed.varname,
        vartype: flattenMaybeToken(vartype),
        expr,
      })
    ),

    assignment: map(
      combine(
        identifier,
        takeWhile(propertyAccess),
        combine(maybe(doubleArithOp), exact('=', 'Syntax error: expected an assignment')),
        failure(expr, 'Syntax error: expected an expression'),
        { inter: maybe_s }
      ),
      ([
        varname,
        { parsed: propAccess },
        {
          parsed: [prefixOp],
        },
        expr,
      ]) => ({
        varname,
        propAccess,
        prefixOp: flattenMaybeToken(prefixOp),
        expr,
      })
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

    cmdCall: cmdCall(endOfCmdCallStatement),
  },
  'Syntax error: expected statement'
)

export const statementChainFree: Parser<StatementChain> = map(
  combine(
    statement,
    takeWhile(
      failIfElse(
        endOfStatementChain,
        map(
          combine(
            failure(statementChainOp, 'Syntax error: expected end of statement'),
            maybe_s_nl,
            failure(statement, 'Syntax error: expected another statement')
          ),
          ([op, _, chainedStatement]): ChainedStatement => ({ op, chainedStatement })
        )
      ),
      { inter: maybe_s }
    ),
    endOfStatementChain,
    { inter: maybe_s }
  ),
  ([start, { parsed: sequence }]): StatementChain => ({
    type: 'chain',
    start,
    sequence,
  })
)

export const statementChain: Parser<StatementChain> = or<StatementChain>([
  map(combine(bol('Internal error: statement chain must start at BOL'), maybe_s, eol()), (_, __) => ({
    type: 'empty',
  })),
  flatten(map(combine(bol(), statementChainFree), ([, chain]) => chain)),
])
