import { Parser, Token } from '../lib/base'
import { combine } from '../lib/combinations'
import { failIfElse, flatten, maybe, maybeFlatten } from '../lib/conditions'
import { not } from '../lib/consumeless'
import { failure } from '../lib/errors'
import { maybe_s, maybe_s_nl, s } from '../lib/littles'
import { takeForever, takeWhile } from '../lib/loops'
import { bol, eol, exact } from '../lib/matchers'
import { mappedCases, or } from '../lib/switches'
import { map } from '../lib/transform'
import { flattenMaybeToken, mapToken, withLatelyDeclared } from '../lib/utils'
import { cmdCall } from './cmdcall'
import { matchContinuationKeyword, matchStatementClose, withContinuationKeyword, withStatementClose } from './context'
import { ChainedStatement, Statement, StatementChain } from './data'
import { doubleArithOp, expr } from './expr'
import { propertyAccess } from './propaccess'
import { endOfCmdCallStatement, endOfStatementChain, statementChainOp } from './stmtend'
import { identifier, keyword } from './tokens'
import { fnDecl, valueType } from './types'

export const statement: Parser<Statement> = mappedCases<Statement>()('type', {
  return: map(combine(exact('return'), maybeFlatten(map(combine(s, expr), ([_, expr]) => expr))), ([_, expr]) => ({
    expr,
  })),

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

  ifBlock: map(
    combine(
      combine(exact('if'), s),
      failure(expr, 'Expected a condition'),
      map(
        combine(
          exact('{', 'Expected an opening brace ({) for the "if"\'s body'),
          withStatementClose(
            '}',
            withContinuationKeyword(
              ['else', 'elif'],
              withLatelyDeclared(() => blockBody)
            )
          ),
          exact('}', "Expected a closing brace (}) to close the block's content"),
          { inter: maybe_s_nl }
        ),
        ([_, { parsed: body }, __]) => body
      ),
      takeWhile(
        map(
          combine(
            exact('elif'),
            failure(expr, 'Expected a condition for the "elif" statement'),
            map(
              combine(
                exact('{', 'Expected an opening brace ({) for the "elif" body'),
                withStatementClose(
                  '}',
                  withContinuationKeyword(
                    ['else', 'elif'],
                    withLatelyDeclared(() => blockBody)
                  )
                ),
                exact('}', "Expected a closing brace (}) to close the block's content"),
                { inter: maybe_s_nl }
              ),
              ([_, { parsed: body }, __]) => body
            ),
            { inter: maybe_s_nl }
          ),
          ([_, cond, { parsed: body }]) => ({ cond, body })
        ),
        { inter: maybe_s_nl }
      ),
      maybe(
        map(
          combine(
            exact('else'),
            map(
              combine(
                exact('{', 'Expected an opening brace ({) for the "else" body'),
                withStatementClose(
                  '}',
                  withLatelyDeclared(() => blockBody)
                ),
                exact('}', "Expected a closing brace (}) to close the block's content"),
                { inter: maybe_s_nl }
              ),
              ([_, { parsed: body }, __]) => body
            ),
            { inter: maybe_s_nl }
          ),
          ([_, { parsed: body }]) => body
        )
      ),
      { inter: maybe_s_nl }
    ),
    ([_, cond, { parsed: body }, { parsed: elif }, { parsed: els }]) => ({ cond, body, elif, els })
  ),

  forLoop: map(
    combine(
      combine(exact('for'), s),
      failure(identifier, 'Expected an identifier'),
      combine(
        failure(s, 'Expected a space after the loop identifier'),
        exact('in', 'Expected "in" keyword'),
        failure(s, 'Expected a space after the "in" keyword')
      ),
      failure(expr, 'Expected an expression to iterate on'),
      maybe_s_nl,
      map(
        combine(
          exact('{', "Expected an opening brace ({) for the loop's body"),
          withStatementClose(
            '}',
            withLatelyDeclared(() => blockBody)
          ),
          exact('}', "Expected a closing brace (}) to close the block's content"),
          { inter: maybe_s_nl }
        ),
        ([_, { parsed: body }, __]) => body
      )
    ),
    ([_, loopvar, __, subject, ___, { parsed: body }]) => ({ loopvar, subject, body })
  ),

  whileLoop: map(
    combine(
      combine(exact('while'), s),
      failure(expr, 'Expected a loop condition'),
      map(
        combine(
          maybe_s_nl,
          exact('{', "Expected an opening brace ({) for the loop's body"),
          withStatementClose(
            '}',
            withLatelyDeclared(() => blockBody)
          ),
          exact('}', "Expected a closing brace (}) to close the block's content"),
          { inter: maybe_s_nl }
        ),
        ([_, __, { parsed: body }, ___]) => body
      )
    ),
    ([_, cond, { parsed: body }]) => ({
      cond,
      body,
    })
  ),

  tryBlock: map(
    combine(
      exact('try'),
      map(
        combine(
          exact('{', "Expected an opening brace ({) for the try's body"),
          withStatementClose(
            '}',
            withContinuationKeyword(
              ['catch'],
              withLatelyDeclared(() => blockBody)
            )
          ),
          exact('}', "Expected a closing brace (}) to close the block's content"),
          { inter: maybe_s_nl }
        ),
        ([_, { parsed: body }, __]) => body
      ),
      map(
        combine(
          exact('catch', 'Expected a "catch" clause'),
          failure(identifier, 'Expected an identifier for the "catch" clause'),
          { inter: s }
        ),
        ([_, catchVarname]) => catchVarname
      ),
      map(
        combine(
          exact('{', 'Expected an opening brace ({) for the "catch" clause\'s body'),
          withStatementClose(
            '}',
            withLatelyDeclared(() => blockBody)
          ),
          exact('}', "Expected a closing brace (}) to close the block's content"),
          { inter: maybe_s_nl }
        ),
        ([_, { parsed: body }, __]) => body
      ),
      { inter: maybe_s_nl }
    ),
    ([_, { parsed: body }, { parsed: catchVarname }, { parsed: catchBody }]) => ({
      body,
      catchVarname,
      catchBody,
    })
  ),

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

  fnDecl: map(
    combine(
      fnDecl,
      exact('{', "Expected an opening brace ({) for the function's body"),
      withStatementClose(
        '}',
        withLatelyDeclared(() => blockBody)
      ),
      exact('}', "Expected a closing brace (}) to end the function's body"),
      { inter: maybe_s_nl }
    ),
    ([{ parsed: nameFnType }, _, { parsed: body }, __]) => ({ ...nameFnType, body })
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
})

export const statementChainFree: Parser<StatementChain> = map(
  combine(
    maybe_s,
    statement,
    maybe_s,
    takeWhile(
      failIfElse(
        or([endOfStatementChain, matchContinuationKeyword]),
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

export const blockBody: Parser<Token<StatementChain>[]> = takeForever(
  or([
    failIfElse(
      matchStatementClose,
      withLatelyDeclared(() => statementChainFree)
    ),
    map(combine(maybe_s, eol()), () => ({ type: 'empty' })),
  ])
)
