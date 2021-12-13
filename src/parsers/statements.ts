import { ChainedStatement, ElIfBlock, ForLoopSubject, Statement, StatementChain } from '../shared/ast'
import { Token } from '../shared/parsed'
import { cmdCall } from './cmdcall'
import { cmdDeclSubCommand } from './cmddecl'
import {
  matchContinuationKeyword,
  matchStatementClose,
  withContinuationKeyword,
  withStatementClosingChar,
} from './context'
import { expr, exprOrTypeAssertion } from './expr'
import { fnDecl } from './fn'
import { err, parseFile, Parser, success } from './lib/base'
import { combine } from './lib/combinations'
import { extract, failIfMatches, failIfMatchesElse, maybe, then } from './lib/conditions'
import { lookahead } from './lib/consumeless'
import { failure } from './lib/errors'
import { maybe_s, maybe_s_nl, s } from './lib/littles'
import { takeWhile, takeWhile1 } from './lib/loops'
import { bol, eol, exact } from './lib/matchers'
import { mappedCases, or } from './lib/switches'
import { map, suppressErrorPrecedence, toOneProp } from './lib/transform'
import { flattenMaybeToken, mapToken, withLatelyDeclared } from './lib/utils'
import { rawString } from './literals'
import { enumMatchingBlock } from './matching'
import { doubleOpForAssignment } from './operators'
import { program } from './program'
import { nonNullablePropertyAccess } from './propaccess'
import { endOfCmdCallStatement, endOfStatementChain, statementChainOp } from './stmtend'
import { identifier } from './tokens'
import { valueType } from './types'

export const statement: Parser<Statement> = mappedCases<Statement>()(
  'type',
  {
    variableDecl: map(
      combine(
        map(
          combine(
            combine(exact('let'), s),
            maybe(combine(exact('mut'), s)),
            failure(identifier, 'expected an identifier')
          ),
          ([_, mutable, varname]) => ({ mutable, varname })
        ),
        maybe(
          map(
            combine(combine(maybe_s, exact(':'), maybe_s), failure(valueType, 'expected a type annotation')),
            ([_, type]) => type
          )
        ),
        combine(maybe_s, exact('=', 'expected an assignment symbol (=)'), maybe_s),
        failure(expr, 'expected an expression')
      ),

      ([mv, { parsed: vartype }, _, expr]) => ({
        mutable: mapToken(mv.parsed.mutable, (str) => !!str),
        varname: mv.parsed.varname,
        vartype,
        expr,
      })
    ),

    ifBlock: map(
      combine(
        combine(exact('if'), s),
        failure(exprOrTypeAssertion, 'expected a condition'),
        combine(maybe_s_nl, exact('{', 'expected an opening brace ({)'), maybe_s_nl),
        withStatementClosingChar(
          '}',
          withContinuationKeyword(
            ['elif', 'else'],
            withLatelyDeclared(() => blockBody)
          )
        ),
        combine(maybe_s_nl, exact('}', 'expected a closing brace (})')),
        extract(
          takeWhile<ElIfBlock>(
            map(
              combine(
                combine(maybe_s_nl, exact('elif'), s),
                failure(exprOrTypeAssertion, 'expected a condition'),
                combine(maybe_s_nl, exact('{', 'expected an opening brace ({)'), maybe_s_nl),
                withStatementClosingChar(
                  '}',
                  withContinuationKeyword(
                    ['else', 'elif'],
                    withLatelyDeclared(() => blockBody)
                  )
                ),
                combine(maybe_s_nl, exact('}', 'expected a closing brace (})'))
              ),
              ([_, cond, __, { parsed: body }]) => ({ cond, body })
            ),
            { inter: maybe_s_nl, interExpect: false }
          )
        ),
        maybe(
          map(
            combine(
              combine(maybe_s_nl, exact('else'), s),
              combine(maybe_s_nl, exact('{', 'expected an opening brace ({)'), maybe_s_nl),
              withStatementClosingChar(
                '}',
                withLatelyDeclared(() => blockBody)
              ),
              combine(maybe_s_nl, exact('}', 'expected a closing brace (})'))
            ),
            ([_, __, { parsed: body }]) => body
          )
        )
      ),
      ([_, cond, __, { parsed: then }, ___, { parsed: elif }, { parsed: els }]) => ({ cond, then, elif, els })
    ),

    forLoop: map(
      combine(
        combine(exact('for'), s),
        failure(identifier, 'expected an identifier'),
        maybe(
          map(
            combine(
              maybe_s,
              exact(','),
              maybe_s,
              failure(identifier, 'expected a secondary identifier after comma (,)')
            ),
            ([_, __, ___, loopvar2]) => loopvar2
          )
        ),
        combine(
          failure(s, 'expected a space before the "in" keyword'),
          exact('in', 'expected "in" keyword'),
          failure(s, 'expected a space after the "in" keyword')
        ),
        mappedCases<ForLoopSubject>()('type', {
          range: map(combine(exact('seq'), s, expr, combine(s, exact('to'), s), expr), ([_, __, from, ___, to]) => ({
            from,
            to,
          })),
          expr: toOneProp(failure(expr, 'expected an expression to iterate on'), 'expr'),
        }),
        map(
          combine(
            combine(maybe_s_nl, exact('{', 'expected an opening brace ({)'), maybe_s_nl),
            withStatementClosingChar(
              '}',
              withLatelyDeclared(() => blockBody)
            ),
            combine(maybe_s_nl, exact('}', 'expected a closing brace (})'))
          ),
          ([_, { parsed: body }, __]) => body
        )
      ),
      ([_, loopvar, { parsed: loopvar2 }, __, subject, { parsed: body }]) => ({ loopvar, loopvar2, subject, body })
    ),

    whileLoop: map(
      combine(
        combine(exact('while'), s),
        failure(exprOrTypeAssertion, 'expected a loop condition'),
        map(
          combine(
            combine(maybe_s_nl, exact('{', 'expected an opening brace ({)'), maybe_s_nl),
            withStatementClosingChar(
              '}',
              withLatelyDeclared(() => blockBody)
            ),
            combine(maybe_s_nl, exact('}', 'expected a closing brace (})'))
          ),
          ([_, { parsed: body }]) => body
        )
      ),
      ([_, cond, { parsed: body }]) => ({
        cond,
        body,
      })
    ),

    continue: exact('continue'),
    break: exact('break'),

    tryBlock: map(
      combine(
        exact('try'),
        map(
          combine(
            combine(maybe_s_nl, exact('{', 'expected an opening brace ({)'), maybe_s_nl),
            withStatementClosingChar(
              '}',
              withContinuationKeyword(
                ['catch'],
                withLatelyDeclared(() => blockBody)
              )
            ),
            combine(maybe_s_nl, exact('}', 'expected a closing brace (})'))
          ),
          ([_, { parsed: body }, __]) => body
        ),
        map(
          combine(
            combine(maybe_s_nl, exact('catch', 'expected a "catch" clause'), s),
            failure(identifier, 'expected an identifier for the "catch" clause')
          ),
          ([_, catchVarname]) => catchVarname
        ),
        map(
          combine(
            combine(maybe_s_nl, exact('{', 'expected an opening brace ({)'), maybe_s_nl),
            withStatementClosingChar(
              '}',
              withLatelyDeclared(() => blockBody)
            ),
            combine(maybe_s_nl, exact('}', 'expected a closing brace (})'))
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
        failure(identifier, 'expected a name for the type alias'),
        maybe_s,
        failure(exact('='), 'expected an assignment (=) operator'),
        maybe_s_nl,
        failure(valueType, 'expected a type')
      ),
      ([_, __, typename, ___, ____, _____, content]) => ({ typename, content })
    ),

    enumDecl: map(
      combine(
        exact('enum'),
        s,
        failure(identifier, 'expected an identifier'),
        combine(maybe_s_nl, exact('{', 'expected an opening brace'), maybe_s_nl),
        takeWhile1(identifier, {
          inter: combine(maybe_s_nl, exact(','), maybe_s_nl),
          interExpect: 'expected another variant name',
        }),
        maybe_s_nl,
        exact('}', 'expected a closing brace (})')
      ),
      ([_, __, typename, ___, { parsed: variants }]) => ({ typename, variants })
    ),

    match: enumMatchingBlock,

    fnDecl: map(
      combine(
        withLatelyDeclared(() => fnDecl),
        combine(maybe_s_nl, exact('{', "expected an opening brace ({) for the function's body"), maybe_s_nl),
        withStatementClosingChar(
          '}',
          withLatelyDeclared(() => blockBody)
        ),
        combine(maybe_s_nl, exact('}', "expected a closing brace (}) to end the function's body"))
      ),
      ([
        {
          parsed: { name, fnType },
        },
        _,
        body,
        __,
      ]) => ({ name, fnType, body })
    ),

    return: map(
      combine(
        exact('return'),
        maybe(
          map(
            combine(
              failIfMatches(lookahead(matchStatementClose)),
              map(combine(s, expr), ([_, expr]) => expr)
            ),
            ([_, { parsed: expr }]) => expr
          )
        )
      ),
      ([_, { parsed: expr }]) => ({
        expr,
      })
    ),

    throw: map(combine(exact('throw'), s, failure(expr, 'expected a value to throw')), ([_, __, expr]) => ({
      expr,
    })),

    panic: map(combine(exact('panic'), s, expr), ([{ parsed: category }, _, message]) => ({ category, message })),

    assignment: map(
      combine(
        identifier,
        maybe_s_nl,
        takeWhile(failIfMatchesElse(exact('[]'), nonNullablePropertyAccess)),
        maybe(exact('[]')),
        maybe_s_nl,
        combine(maybe(suppressErrorPrecedence(doubleOpForAssignment)), maybe_s_nl, exact('='), maybe_s_nl),
        failure(expr, 'expected an expression to assign')
      ),
      ([
        varname,
        _,
        { parsed: propAccesses },
        { parsed: listPush },
        __,
        {
          parsed: [prefixOp],
        },
        expr,
      ]) => ({
        varname,
        propAccesses,
        prefixOp: flattenMaybeToken(prefixOp),
        listPush: listPush !== null,
        expr,
      })
    ),

    cmdCall: map(cmdCall(endOfCmdCallStatement), (content) => ({ content })),

    cmdDecl: map(
      combine(
        exact('@command'),
        s,
        failure(identifier, 'expected a command name to declare'),
        maybe_s_nl,
        cmdDeclSubCommand
      ),
      ([_, __, name, ___, { parsed: body }]) => ({ name, body })
    ),

    fileInclusion: then(
      combine(exact('@include'), s, failure(rawString, 'expected a file path to include')),
      ([_, __, { parsed: filePath }], { at, parsed: [____, _____, filePathToken], matched }, context) => {
        const resolvedFilePath = context.sourceServer.resolvePath(filePath, context.currentFilePath)
        const fileContent = context.sourceServer.read(resolvedFilePath)

        if (fileContent === false) {
          return err(filePathToken.at.start, filePathToken.at.next, context, 'file was not found')
        }

        const sub = parseFile(context.sourceServer, resolvedFilePath, fileContent, program, context.$custom)

        if (!sub.ok) return sub

        return success(at.start, at.next, { content: sub.data.parsed }, matched)
      }
    ),
  },
  'failed to parse statement'
)

export const statementChainFree: Parser<StatementChain> = map(
  combine(
    statement,
    maybe_s,
    takeWhile(
      failIfMatchesElse(
        or([endOfStatementChain, matchContinuationKeyword]),
        map(
          combine(
            maybe_s,
            failure(statementChainOp, 'expected end of statement'),
            maybe_s_nl,
            failure(statement, 'expected another statement')
          ),
          ([_, op, __, chainedStatement]): ChainedStatement => ({ op, chainedStatement })
        )
      ),
      { inter: maybe_s, interExpect: false }
    ),
    endOfStatementChain
  ),
  ([start, __, { parsed: sequence }]): StatementChain => ({
    type: 'chain',
    start,
    sequence,
  })
)

export const statementChain: Parser<StatementChain> = or<StatementChain>([
  map(combine(bol('internal error: statement chain must start at BOL'), maybe_s, eol()), (_, __) => ({
    type: 'empty',
  })),
  map(combine(bol(), maybe_s, statementChainFree), ([_, __, { parsed: chain }]) => chain),
])

export const blockBody: Parser<Token<StatementChain>[]> = takeWhile(
  or([
    map(combine(maybe_s, eol()), () => ({ type: 'empty' })),
    failIfMatchesElse(
      matchStatementClose,
      map(
        combine(
          maybe_s,
          withLatelyDeclared(() => statementChainFree)
        ),
        ([_, { parsed: chain }]) => chain
      )
    ),
  ])
)
