import { Parser } from '../lib/base'
import { combine } from '../lib/combinations'
import { extract, failIfMatches, failIfMatchesAndCond, failIfMatchesElse } from '../lib/conditions'
import { lookahead, not } from '../lib/consumeless'
import { contextualFailure, failure } from '../lib/errors'
import { buildUnicodeRegexMatcher, maybe_s, maybe_s_nl, unicodeAlphanumericUnderscore } from '../lib/littles'
import { takeWhile, takeWhile1 } from '../lib/loops'
import { exact, match, oneOfMap } from '../lib/matchers'
import { mappedCases, mappedCasesComposed, or } from '../lib/switches'
import { map, toOneProp } from '../lib/transform'
import { mapToken, withLatelyDeclared } from '../lib/utils'
import {
  ComputedPathSegment,
  ComputedStringSegment,
  FnCallArg,
  InlineChainedCmdCall,
  InlineCmdCallCapture,
  Value,
} from '../shared/parsed'
import { cmdFlag } from './cmdarg'
import { cmdCall } from './cmdcall'
import { withStatementClosingChar } from './context'
import { expr } from './expr'
import { literalValue, rawString } from './literals'
import { blockBody } from './statements'
import { endOfInlineCmdCall, statementChainOp } from './stmtend'
import { identifier, keyword } from './tokens'
import { fnType } from './types'

export const value: Parser<Value> = mappedCasesComposed<Value>()('type', literalValue, {
  computedString: map(
    combine(
      exact('"'),
      takeWhile(
        or<ComputedStringSegment>([
          map(match(/([^\\"\$\n]|\\[^\n])+/), (_, content) => ({ type: 'literal', content })),
          map(
            combine(
              exact('$'),
              exact('{', {
                message: 'Expecting an expression after the "$" symbol',
                complements: [
                  ['Tip', 'If you want to write an expression, write "${" to open it and "}" to close it'],
                  ['Tip', 'If you want to write the "$" symbol alone, you can escape it with a backslash "\\"'],
                ],
              }),
              failure(
                withLatelyDeclared(() => expr),
                'Failed to parse the inner expression'
              ),
              exact('}', 'Expected a closing brace (}) to close the inner expression'),
              { inter: maybe_s_nl }
            ),
            ([_, __, expr]) => ({ type: 'expr', expr })
          ),
        ])
      ),
      exact('"', 'Opened string has not been closed with a quote (")')
    ),
    ([_, { parsed: segments }, __]) => ({ segments })
  ),

  computedPath: map(
    failIfMatchesAndCond(
      takeWhile1(
        or<ComputedPathSegment>([
          map(exact('/'), () => ({ type: 'separator' })),
          map(
            buildUnicodeRegexMatcher((l, d) => `(${l}|${d}|\\.|\\\\.)+`),
            (_, content) => ({ type: 'literal', content })
          ),
          map(
            combine(
              exact('${'),
              failure(
                withLatelyDeclared(() => expr),
                'Failed to parse the inner expression'
              ),
              exact('}', 'Expected a closing brace (}) to close the inner path expression'),
              { inter: maybe_s_nl }
            ),
            ([_, expr, __]) => ({ type: 'expr', expr })
          ),
        ])
      ),
      (segments) => !segments.find(({ parsed: segment }) => segment.type === 'separator')
    ),
    (segments) => ({ segments })
  ),

  list: map(
    combine(
      exact('['),
      takeWhile(
        withLatelyDeclared(() => expr),
        { inter: combine(maybe_s_nl, exact(','), maybe_s_nl) }
      ),
      exact(']', "Expected a closing bracket (]) to end the list's content"),
      { inter: maybe_s_nl }
    ),
    ([_, items, __]) => ({ items })
  ),

  map: map(
    combine(
      exact('map:('),
      extract(
        takeWhile(
          map(
            combine(
              failIfMatches(lookahead(unicodeAlphanumericUnderscore), {
                message: "Expected either an identifier or the end of the map's content",
                complements: [['Tip', 'Key names in map values must be written between quotes']],
              }),
              contextualFailure(rawString, (ctx) => !ctx.loopData!.firstIter, 'Expected a map key name'),
              exact(':'),
              withLatelyDeclared(() => expr),
              { inter: maybe_s_nl }
            ),
            ([_, key, __, value]) => ({ key, value })
          ),
          {
            inter: combine(maybe_s_nl, exact(','), maybe_s_nl),
          }
        )
      ),
      exact(')', "Expected a closing parenthesis ')' to close the map's content"),
      {
        inter: maybe_s_nl,
      }
    ),
    ([_, entries, __]) => ({
      entries: mapToken(entries, (_, { parsed }) => parsed),
    })
  ),

  struct: map(
    combine(
      exact('{'),
      extract(
        takeWhile(
          map(
            combine(
              contextualFailure(
                identifier,
                (ctx) => !ctx.loopData!.firstIter,
                'Expected either a member name, or a closing brace (}) to close the structure'
              ),
              exact(':'),
              withLatelyDeclared(() => expr),
              { inter: maybe_s_nl }
            ),
            ([name, _, value]) => ({ name, value })
          ),
          { inter: combine(maybe_s_nl, exact(','), maybe_s_nl) }
        )
      ),
      exact('}', 'Expected a closing brace (}) to close the structure'),
      { inter: maybe_s_nl }
    ),
    ([_, members, __]) => ({
      members: mapToken(members, (_, { parsed }) => parsed),
    })
  ),

  closure: map(
    combine(
      withLatelyDeclared(() => fnType),
      exact('{', "Expected an opening brace ({) for the closure's content"),
      withStatementClosingChar(
        '}',
        withLatelyDeclared(() => blockBody)
      ),
      exact('}', "Expected a closing brace (}) after the closure's content"),
      { inter: maybe_s_nl }
    ),
    ([{ parsed: fnType }, __, { parsed: body }, ___]) => ({ fnType, body })
  ),

  fnCall: map(
    combine(
      failure(not(keyword), 'Cannot use reserved keyword alone'),
      identifier,
      exact('('),
      maybe_s_nl,
      withStatementClosingChar(
        ')',
        takeWhile(
          failIfMatchesElse(
            endOfInlineCmdCall,
            failure(
              mappedCases<FnCallArg>()('type', {
                flag: withLatelyDeclared(() => cmdFlag),
                expr: toOneProp(
                  withLatelyDeclared(() => expr),
                  'expr'
                ),
              }),
              'Invalid argument provided'
            )
          ),
          { inter: combine(maybe_s_nl, exact(','), maybe_s_nl) }
        )
      ),
      maybe_s_nl,
      exact(')', 'Expected a closing parenthesis to end the list of arguments'),
      { inter: maybe_s }
    ),
    ([_, name, __, ___, { parsed: args }]) => ({ name, args })
  ),

  inlineCmdCallSequence: map(
    combine(
      oneOfMap<InlineCmdCallCapture>([
        ['$*(', InlineCmdCallCapture.Both],
        ['$!(', InlineCmdCallCapture.Stderr],
        ['$(', InlineCmdCallCapture.Stdout],
      ]),
      failure(
        withStatementClosingChar(
          ')',
          withLatelyDeclared(() => cmdCall(endOfInlineCmdCall))
        ),
        'Expected inline command call'
      ),
      takeWhile<InlineChainedCmdCall>(
        map(
          combine(
            maybe_s,
            statementChainOp,
            failure(
              withLatelyDeclared(() => cmdCall(endOfInlineCmdCall)),
              'Expected inline command call after chaining operator'
            ),
            { inter: maybe_s_nl }
          ),
          ([_, op, chainedCmdCall]) => ({ op, chainedCmdCall })
        ),
        { inter: maybe_s }
      ),
      exact(')', "Expected closing paren ')' after inline command call"),
      { inter: maybe_s_nl }
    ),
    ([capture, start, { parsed: sequence }]) => ({ start, sequence, capture })
  ),

  reference: toOneProp(identifier, 'varname'),
})
