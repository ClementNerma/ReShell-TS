import { Parser } from '../lib/base'
import { combine } from '../lib/combinations'
import { failIfElse, flatten, maybe, maybeFlatten } from '../lib/conditions'
import { not } from '../lib/consumeless'
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
import { identifier, keyword } from './tokens'
import { fnDecl, valueType } from './types'

export const statement: Parser<Statement> = mappedCases<Statement>()(
  'type',
  {
    return: map(combine(exact('return'), maybeFlatten(map(combine(s, expr), ([_, expr]) => expr))), ([_, expr]) => ({
      expr,
    })),

    elseBlock: map(exact('else'), (_) => ({})),

    tryBlock: map(exact('try'), (_) => ({})),

    blockEnd: map(exact('end'), (_) => ({})),

    variableDecl: map(
      combine(
        map(
          combine(
            exact('let'),
            maybe(exact('mut')),
            failure(not(keyword), 'Cannot use reserved keyword as a variable name'),
            failure(identifier, 'Expected an identifier'),
            {
              inter: s,
            }
          ),
          ([_, mutable, __, varname]) => ({ mutable, varname })
        ),
        maybeFlatten(
          map(
            combine(exact(':'), failure(valueType, 'Expected a type annotation'), { inter: maybe_s }),
            ([_, type]) => type
          )
        ),
        exact('=', 'Expected an assignment'),
        failure(expr, 'Expected an expression'),
        { inter: maybe_s }
      ),

      ([mv, vartype, _, expr]) => ({
        mutable: mapToken(mv.parsed.mutable, (str) => !!str),
        varname: mv.parsed.varname,
        vartype: flattenMaybeToken(vartype),
        expr,
      })
    ),

    ifBlock: map(combine(exact('if'), failure(expr, 'Expected a condition'), { inter: s }), ([_, cond]) => ({
      cond,
    })),

    forLoop: map(
      combine(
        exact('for'),
        failure(identifier, 'Expected an identifier'),
        exact('in', 'Expected "in" keyword'),
        failure(expr, 'Expected an expression to iterate on'),
        { inter: s }
      ),
      ([_, loopvar, __, subject]) => ({ loopvar, subject })
    ),

    whileLoop: map(combine(exact('while'), failure(expr, 'Expected a loop condition'), { inter: s }), ([_, cond]) => ({
      cond,
    })),

    elifBlock: map(combine(exact('elif'), failure(expr, 'Expected a condition'), { inter: s }), ([_, cond]) => ({
      cond,
    })),

    typeAlias: map(
      combine(
        exact('type'),
        s,
        failure(not(keyword), 'Cannot use reserved keyword as a type name'),
        failure(identifier, 'Expected a name for the type alias'),
        maybe_s,
        failure(exact('='), 'Expected an assignment (=) operator'),
        maybe_s_nl,
        failure(valueType, 'Expected a type')
      ),
      ([_, __, ___, typename, ____, _____, ______, content]) => ({ typename, content })
    ),

    fnOpen: map(fnDecl, (fn) => fn),

    catchBlock: map(
      combine(exact('catch'), failure(identifier, 'Expected an identifier for the "catch" clause'), { inter: s }),
      ([_, varname]) => ({ varname })
    ),

    throw: map(combine(exact('throw'), failure(expr, 'Expected a value to throw'), { inter: s }), ([_, expr]) => ({
      expr,
    })),

    assignment: map(
      combine(
        identifier,
        takeWhile(propertyAccess),
        combine(maybe(doubleArithOp), exact('=')),
        failure(expr, 'Expected an expression'),
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

    cmdCall: cmdCall(endOfCmdCallStatement),
  },
  'Expected a statement'
)

export const statementChainFree: Parser<StatementChain> = map(
  combine(
    maybe_s,
    statement,
    maybe_s,
    takeWhile(
      failIfElse(
        endOfStatementChain,
        map(
          combine(
            failure(statementChainOp, 'Expected end of statement'),
            maybe_s_nl,
            failure(statement, 'Expected another statement')
          ),
          ([op, _, chainedStatement]): ChainedStatement => ({ op, chainedStatement })
        )
      ),
      { inter: maybe_s }
    ),
    endOfStatementChain
  ),
  ([_, start, __, { parsed: sequence }]): StatementChain => ({
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
