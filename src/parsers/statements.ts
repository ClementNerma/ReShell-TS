import { ChainedStatement, ElIfBlock, Statement, StatementChain, Token } from '../shared/parsed'
import { cmdCall } from './cmdcall'
import {
  matchContinuationKeyword,
  matchStatementClose,
  withContinuationKeyword,
  withStatementClosingChar,
} from './context'
import { expr } from './expr'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { extract, failIfMatches, failIfMatchesElse, flatten, maybe, maybeFlatten } from './lib/conditions'
import { failure } from './lib/errors'
import { maybe_s, maybe_s_nl, s } from './lib/littles'
import { takeWhile } from './lib/loops'
import { bol, eol, exact } from './lib/matchers'
import { mappedCases, or } from './lib/switches'
import { map } from './lib/transform'
import { flattenMaybeToken, mapToken, withLatelyDeclared } from './lib/utils'
import { doubleArithOp } from './operators'
import { nonNullablePropertyAccess } from './propaccess'
import { endOfCmdCallStatement, endOfStatementChain, statementChainOp } from './stmtend'
import { identifier, keyword } from './tokens'
import { fnDecl, valueType } from './types'

export const statement: Parser<Statement> = mappedCases<Statement>()(
  'type',
  {
    return: map(combine(exact('return'), maybeFlatten(map(combine(s, expr), ([_, expr]) => expr))), ([_, expr]) => ({
      expr,
    })),

    variableDecl: map(
      combine(
        map(
          combine(
            combine(exact('let'), s),
            maybe(combine(exact('mut'), s)),
            failIfMatches(keyword, 'Cannot use reserved keyword as a variable name'),
            failure(identifier, 'Expected an identifier')
          ),
          ([_, mutable, __, varname]) => ({ mutable, varname })
        ),
        maybeFlatten(
          map(
            combine(combine(maybe_s, exact(':'), maybe_s), failure(valueType, 'Expected a type annotation')),
            ([_, type]) => type
          )
        ),
        combine(maybe_s, exact('=', 'Expected an assignment'), maybe_s),
        failure(expr, 'Expected an expression')
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
        combine(maybe_s_nl, exact('{', 'Expected an opening brace ({) for the "if"\'s body'), maybe_s_nl),
        withStatementClosingChar(
          '}',
          withContinuationKeyword(
            ['elif', 'else'],
            withLatelyDeclared(() => blockBody)
          )
        ),
        combine(maybe_s_nl, exact('}', "Expected a closing brace (}) to close the block's content")),
        extract(
          takeWhile<ElIfBlock>(
            map(
              combine(
                combine(maybe_s_nl, exact('elif'), s),
                failure(expr, 'Expected a condition for the "elif" statement'),
                combine(maybe_s_nl, exact('{', 'Expected an opening brace ({) for the "elif" body'), maybe_s_nl),
                withStatementClosingChar(
                  '}',
                  withContinuationKeyword(
                    ['else', 'elif'],
                    withLatelyDeclared(() => blockBody)
                  )
                ),
                combine(maybe_s_nl, exact('}', "Expected a closing brace (}) to close the block's content"))
              ),
              ([_, cond, __, { parsed: body }]) => ({ cond, body })
            ),
            { inter: maybe_s_nl }
          )
        ),
        maybe(
          map(
            combine(
              combine(maybe_s_nl, exact('else'), s),
              combine(maybe_s_nl, exact('{', 'Expected an opening brace ({) for the "else" body'), maybe_s_nl),
              withStatementClosingChar(
                '}',
                withLatelyDeclared(() => blockBody)
              ),
              combine(maybe_s_nl, exact('}', "Expected a closing brace (}) to close the block's content"))
            ),
            ([_, __, { parsed: body }]) => body
          )
        )
      ),
      ([_, cond, __, { parsed: body }, ___, { parsed: elif }, { parsed: els }]) => ({ cond, body, elif, els })
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
        map(
          combine(
            combine(maybe_s_nl, exact('{', "Expected an opening brace ({) for the loop's body"), maybe_s_nl),
            withStatementClosingChar(
              '}',
              withLatelyDeclared(() => blockBody)
            ),
            combine(maybe_s_nl, exact('}', "Expected a closing brace (}) to close the block's content"))
          ),
          ([_, { parsed: body }, __]) => body
        )
      ),
      ([_, loopvar, __, subject, { parsed: body }]) => ({ loopvar, subject, body })
    ),

    whileLoop: map(
      combine(
        combine(exact('while'), s),
        failure(expr, 'Expected a loop condition'),
        map(
          combine(
            combine(maybe_s_nl, exact('{', "Expected an opening brace ({) for the loop's body"), maybe_s_nl),
            withStatementClosingChar(
              '}',
              withLatelyDeclared(() => blockBody)
            ),
            combine(maybe_s_nl, exact('}', "Expected a closing brace (}) to close the block's content"))
          ),
          ([_, { parsed: body }]) => body
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
            combine(maybe_s_nl, exact('{', "Expected an opening brace ({) for the try's body"), maybe_s_nl),
            withStatementClosingChar(
              '}',
              withContinuationKeyword(
                ['catch'],
                withLatelyDeclared(() => blockBody)
              )
            ),
            combine(maybe_s_nl, exact('}', "Expected a closing brace (}) to close the block's content"))
          ),
          ([_, { parsed: body }, __]) => body
        ),
        map(
          combine(
            combine(maybe_s_nl, exact('catch', 'Expected a "catch" clause'), s),
            failure(identifier, 'Expected an identifier for the "catch" clause')
          ),
          ([_, catchVarname]) => catchVarname
        ),
        map(
          combine(
            combine(maybe_s_nl, exact('{', 'Expected an opening brace ({) for the "catch" clause\'s body'), maybe_s_nl),
            withStatementClosingChar(
              '}',
              withLatelyDeclared(() => blockBody)
            ),
            combine(maybe_s_nl, exact('}', "Expected a closing brace (}) to close the block's content"))
          ),
          ([_, { parsed: body }, __]) => body
        )
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
        failIfMatches(keyword, 'Cannot use reserved keyword as a type name'),
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
        combine(maybe_s_nl, exact('{', "Expected an opening brace ({) for the function's body"), maybe_s_nl),
        withStatementClosingChar(
          '}',
          withLatelyDeclared(() => blockBody)
        ),
        combine(maybe_s_nl, exact('}', "Expected a closing brace (}) to end the function's body"))
      ),
      ([
        {
          parsed: { name, fnType },
        },
        _,
        { parsed: body },
        __,
      ]) => ({ name, fnType, body })
    ),

    throw: map(combine(exact('throw'), s, failure(expr, 'Expected a value to throw')), ([_, __, expr]) => ({
      expr,
    })),

    assignment: map(
      combine(
        identifier,
        maybe_s_nl,
        takeWhile(nonNullablePropertyAccess),
        maybe_s_nl,
        combine(maybe(doubleArithOp), maybe_s_nl, exact('='), maybe_s_nl),
        failure(expr, 'Expected an expression to assign')
      ),
      ([
        varname,
        _,
        { parsed: propAccess },
        __,
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
  'Failed to parse statement'
)

export const statementChainFree: Parser<StatementChain> = map(
  combine(
    maybe_s,
    statement,
    maybe_s,
    takeWhile(
      failIfMatchesElse(
        or([endOfStatementChain, matchContinuationKeyword]),
        map(
          combine(
            maybe_s,
            failure(statementChainOp, 'Expected end of statement'),
            maybe_s_nl,
            failure(statement, 'Expected another statement')
          ),
          ([_, op, __, chainedStatement]): ChainedStatement => ({ op, chainedStatement })
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

export const blockBody: Parser<Token<StatementChain>[]> = takeWhile(
  or([
    map(combine(maybe_s, eol()), () => ({ type: 'empty' })),
    failIfMatchesElse(
      matchStatementClose,
      withLatelyDeclared(() => statementChainFree)
    ),
  ])
)
