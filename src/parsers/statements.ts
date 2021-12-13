import { Block, ChainedStatement, ElIfBlock, ForLoopSubject, Statement, StatementChain } from '../shared/ast'
import { cmdCall } from './cmdcall'
import { cmdDeclSubCommand } from './cmddecl'
import {
  CustomContext,
  mapContextProp,
  matchContinuationKeyword,
  matchStatementClose,
  withContinuationKeyword,
  withinTypeAliasDefinition,
  withStatementClosingChar,
} from './context'
import { condOrTypeAssertion, expr } from './expr'
import { fnDecl } from './fn'
import { fnCall } from './fncall'
import { err, parseFile, Parser, success } from './lib/base'
import { combine } from './lib/combinations'
import { extract, failIfMatches, failIfMatchesElse, maybe, then } from './lib/conditions'
import { lookahead } from './lib/consumeless'
import { feedContext } from './lib/context'
import { failure } from './lib/errors'
import { maybe_s, maybe_s_nl, s } from './lib/littles'
import { takeWhile, takeWhile1 } from './lib/loops'
import { bol, eol, exact } from './lib/matchers'
import { mappedCases, or } from './lib/switches'
import { map, silence, suppressErrorPrecedence, toOneProp } from './lib/transform'
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
        failure(condOrTypeAssertion, 'expected a condition'),
        failure(s, 'expected a whitespace after the condition'),
        withContinuationKeyword(
          ['elif', 'else'],
          withLatelyDeclared(() => blockWithBraces)
        ),
        extract(
          takeWhile<ElIfBlock>(
            map(
              combine(
                combine(maybe_s_nl, exact('elif'), s),
                failure(condOrTypeAssertion, 'expected a condition'),
                failure(s, 'expected a whitespace after the condition'),
                withContinuationKeyword(
                  ['else', 'elif'],
                  withLatelyDeclared(() => blockWithBraces)
                )
              ),
              ([_, cond, __, { parsed: body }]) => ({ cond, body })
            ),
            { inter: maybe_s_nl, interExpect: false }
          )
        ),
        maybe(
          map(
            combine(
              maybe_s_nl,
              exact('else'),
              maybe_s_nl,
              withLatelyDeclared(() => blockWithBraces)
            ),
            ([_, __, ___, { parsed: body }]) => body
          )
        )
      ),
      ([_, cond, __, { parsed: then }, { parsed: elif }, { parsed: els }]) => ({ cond, then, elif, els })
    ),

    forLoopDuo: map(
      combine(
        combine(exact('for'), s),
        failure(identifier, 'expected an identifier'),
        map(
          combine(maybe_s, exact(','), maybe_s, failure(identifier, 'expected a secondary identifier after comma (,)')),
          ([_, __, ___, loopvar2]) => loopvar2
        ),
        combine(
          failure(s, 'expected a space before the "in" keyword'),
          exact('in', 'expected "in" keyword'),
          failure(s, 'expected a space after the "in" keyword')
        ),
        failure(expr, 'expected an expression to iterate on'),
        maybe_s_nl,
        withLatelyDeclared(() => blockWithBraces)
      ),
      ([_, keyVar, { parsed: valueVar }, __, subject, ___, { parsed: body }]) => ({ keyVar, valueVar, subject, body })
    ),

    forLoop: map(
      combine(
        combine(exact('for'), s),
        failure(identifier, 'expected an identifier'),
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
          expr: toOneProp('expr', failure(expr, 'expected an expression to iterate on')),
        }),
        maybe_s_nl,
        withLatelyDeclared(() => blockWithBraces)
      ),
      ([_, loopVar, __, subject, ___, { parsed: body }]) => ({ loopVar, subject, body })
    ),

    whileLoop: map(
      combine(
        combine(exact('while'), s),
        failure(condOrTypeAssertion, 'expected a loop condition'),
        maybe_s_nl,
        withLatelyDeclared(() => blockWithBraces)
      ),
      ([_, cond, __, { parsed: body }]) => ({
        cond,
        body,
      })
    ),

    continue: exact('continue'),
    break: exact('break'),

    typeAlias: map(
      combine(
        exact('type'),
        s,
        failure(identifier, 'expected a name for the type alias'),
        maybe_s,
        failure(exact('='), 'expected an assignment (=) operator'),
        maybe_s_nl,
        failure(withinTypeAliasDefinition(valueType), 'expected a type')
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
      feedContext(
        withLatelyDeclared(() => fnDecl),
        (context: CustomContext, { genericsDef }) =>
          mapContextProp(context, 'genericsDefinitions', (def) => def.concat(genericsDef)),
        map(
          combine(
            maybe_s_nl,
            withLatelyDeclared(() => blockWithBraces)
          ),
          ([_, body]) => body
        ),
        (_) => void 0
      ),
      ([
        {
          parsed: { name, fnType },
        },
        { parsed: body },
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

    panic: map(combine(exact('panic'), s, expr), ([{ parsed: category }, _, message]) => ({ category, message })),

    assignment: map(
      combine(
        identifier,
        maybe_s_nl,
        takeWhile(failIfMatchesElse(exact('[]'), nonNullablePropertyAccess)),
        maybe(silence(exact('[]'))),
        maybe_s_nl,
        combine(maybe(suppressErrorPrecedence(doubleOpForAssignment)), maybe_s_nl, exact('='), maybe_s_nl),
        failure(expr, 'expected an expression to assign')
      ),
      ([
        varname,
        _,
        { parsed: propAccesses },
        listPush,
        __,
        {
          parsed: [prefixOp],
        },
        expr,
      ]) => ({
        varname,
        propAccesses,
        prefixOp: flattenMaybeToken(prefixOp),
        listPush: flattenMaybeToken(listPush),
        expr,
      })
    ),

    fnCall: map(fnCall, (content) => ({ content })),

    cmdCall: map(cmdCall(endOfCmdCallStatement), (_, content) => ({ content })),

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

export const block: Parser<Block> = takeWhile<StatementChain>(
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

export const blockWithBraces: Parser<Block> = map(
  combine(
    exact('{', 'expected an opening brace ({)'),
    maybe_s_nl,
    withStatementClosingChar('}', block),
    maybe_s_nl,
    exact('}', 'expected a closing brace (})')
  ),
  ([_, __, { parsed: body }]) => body
)
