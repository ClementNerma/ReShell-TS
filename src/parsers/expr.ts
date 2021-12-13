import { Parser } from '../lib/base'
import { combine } from '../lib/combinations'
import { extract, failIf, failIfElse } from '../lib/conditions'
import { lookahead, not } from '../lib/consumeless'
import { contextualFailure, failure } from '../lib/errors'
import { maybe_s, maybe_s_nl, unicodeAlphanumericUnderscore } from '../lib/littles'
import { takeWhile } from '../lib/loops'
import { exact, match, oneOf, oneOfMap } from '../lib/matchers'
import { mappedCases, mappedCasesComposed, or } from '../lib/switches'
import { map, silence, toOneProp } from '../lib/transform'
import { mapToken, selfRef, withLatelyDeclared } from '../lib/utils'
import { cmdFlag } from './cmdarg'
import { cmdCall } from './cmdcall'
import { withStatementClose } from './context'
import {
  ComputedStringSegment,
  DoubleArithOp,
  DoubleLogicOp,
  DoubleOp,
  Expr,
  ExprElement,
  ExprSequenceAction,
  FnCallArg,
  InlineChainedCmdCall,
  InlineCmdCallCapture,
  SingleLogicOp,
  SingleOp,
  Value,
} from './data'
import { literalValue, rawString } from './literals'
import { propertyAccess } from './propaccess'
import { blockBody } from './statements'
import { endOfInlineCmdCall, statementChainOp } from './stmtend'
import { identifier, keyword } from './tokens'
import { fnType, valueType } from './types'

export const value: Parser<Value> = mappedCasesComposed<Value>()('type', literalValue, {
  computedString: map(
    combine(
      exact('"'),
      takeWhile(
        or<ComputedStringSegment>([
          map(match(/([^\\"\$\n]|\\[^\n])+/), (_, content) => ({ type: 'literal', content })),
          map(
            combine(
              exact('${'),
              failure(
                withLatelyDeclared(() => expr),
                'Failed to parse the inner expression'
              ),
              exact('}', 'Expected a closing brace (}) to close the inner expression'),
              { inter: maybe_s_nl }
            ),
            ([_, expr, __]) => ({ type: 'expr', expr })
          ),
        ])
      ),
      exact('"', 'Opened string has not been closed with a quote (")')
    ),
    ([_, { parsed: segments }, __]) => ({ segments })
  ),

  list: map(
    combine(
      exact('['),
      takeWhile(
        withLatelyDeclared(() => expr),
        { inter: combine(maybe_s_nl, exact(','), maybe_s_nl) }
      ),
      exact(']', "Expected a closing bracket (]) to end the list's content"),
      {
        inter: maybe_s_nl,
      }
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
              failIf(lookahead(unicodeAlphanumericUnderscore), {
                message: "Expected either an identifier or the end of the map's content",
                tip: 'Key names in map values must be written between quotes',
              }),
              contextualFailure(rawString, (ctx) => !ctx.loopData!.firstIter, 'Expected a map key name'),
              exact(':'),
              withLatelyDeclared(() => expr),
              { inter: maybe_s_nl }
            ),
            ([_, key, __, expr]) => ({ key, expr })
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
            ([member, _, expr]) => ({ member, expr })
          ),
          {
            inter: combine(maybe_s_nl, exact(','), maybe_s_nl),
          }
        )
      ),
      exact('}', 'Expected a closing brace (}) to close the structure'),
      {
        inter: maybe_s_nl,
      }
    ),
    ([_, entries, __]) => ({
      entries: mapToken(entries, (_, { parsed }) => parsed),
    })
  ),

  closure: map(
    combine(
      withLatelyDeclared(() => fnType),
      exact('{', "Expected an opening brace ({) for the closure's content"),
      withStatementClose(
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
      withStatementClose(
        ')',
        takeWhile(
          failIfElse(
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
        withStatementClose(
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

export const _opSym: Parser<void> = silence(oneOf(['+', '-', '*', '/', '%', '&', '|', '^', '!']))

export const doubleArithOp: Parser<DoubleArithOp> = map(
  combine(
    oneOfMap([
      ['+', DoubleArithOp.Add],
      ['-', DoubleArithOp.Sub],
      ['*', DoubleArithOp.Mul],
      ['/', DoubleArithOp.Div],
      ['%', DoubleArithOp.Rem],
      ['??', DoubleArithOp.Null],
    ]),
    failure(not(_opSym), 'Unknown operator')
  ),
  ([{ parsed: sym }]) => sym
)

export const doubleLogicOp: Parser<DoubleLogicOp> = map(
  combine(
    oneOfMap([
      ['&&', DoubleLogicOp.And],
      ['||', DoubleLogicOp.Or],
      ['^', DoubleLogicOp.Xor],
      ['==', DoubleLogicOp.Eq],
      ['!=', DoubleLogicOp.NotEq],
      ['>=', DoubleLogicOp.GreaterThanOrEqualTo],
      ['<=', DoubleLogicOp.LessThanOrEqualTo],
      ['>', DoubleLogicOp.GreaterThan],
      ['<', DoubleLogicOp.LessThan],
    ]),
    failure(not(_opSym), 'Unknown operator')
  ),
  ([{ parsed: sym }]) => sym
)

export const doubleOp: Parser<DoubleOp> = mappedCases<DoubleOp>()('type', {
  arith: toOneProp(doubleArithOp, 'op'),
  logic: toOneProp(doubleLogicOp, 'op'),
})

export const singleLogicOp: Parser<SingleLogicOp> = map(
  combine(oneOfMap([['!', SingleLogicOp.Not]]), failure(not(_opSym), 'Unknown operator')),
  ([{ parsed: sym }]) => sym
)

export const singleOp: Parser<SingleOp> = mappedCases<SingleOp>()('type', {
  logic: toOneProp(singleLogicOp, 'op'),
})

export const exprElement: Parser<ExprElement> = selfRef((simpleExpr) =>
  mappedCases<ExprElement>()(
    'type',
    {
      // <single operator> s expr
      singleOp: map(
        combine(
          singleOp,
          failure(
            withLatelyDeclared(() => simpleExpr),
            'Expected an expression after the operator'
          ),
          { inter: maybe_s }
        ),
        ([op, right]) => ({ op, right })
      ),

      // "(" expr ")"
      paren: map(
        combine(
          exact('('),
          failure(
            withLatelyDeclared(() => expr),
            'Expected an expression after an opening parenthesis'
          ),
          exact(')'),
          {
            inter: maybe_s_nl,
          }
        ),
        ([_, inner, __]) => ({
          inner,
        })
      ),

      // if <cond> { <then> } else { <else> }
      ternary: map(
        combine(
          exact('if'),
          failure(
            withLatelyDeclared(() => expr),
            'Expected a condition'
          ),
          exact('{', 'Expected an opening brace ({) after the condition'),
          failure(
            withLatelyDeclared(() => expr),
            'Expected an expression in the "if" body'
          ),
          exact('}', 'Expected a closing brace (}) to close the "if" body'),
          exact('else', 'Expected an "else" counterpart'),
          exact('{', 'Expected an opening brace ({) for the "else" counterpart'),
          failure(
            withLatelyDeclared(() => expr),
            'Expected an expression in the "else" body'
          ),
          exact('}', 'Expected a closing brace (}) to close the "else" body'),
          { inter: maybe_s_nl }
        ),
        ([_, cond, __, then, ___, ____, _____, els, ______]) => ({ cond, then, els })
      ),

      assertion: map(
        combine(identifier, exact('is'), failure(valueType, 'Expected a type after the "is" type assertion operator'), {
          inter: maybe_s,
        }),
        ([varname, _, minimum]) => ({ varname, minimum })
      ),

      // value
      value: map(value, (_, content) => ({ content })),
    },
    'Failed to parse expression'
  )
)

export const exprSequenceAction: Parser<ExprSequenceAction> = or<ExprSequenceAction>([
  propertyAccess,

  map(
    combine(maybe_s, doubleOp, failure(exprElement, 'Expected an expression after operator'), {
      inter: maybe_s,
    }),
    ([_, op, right]) => ({
      type: 'doubleOp',
      op,
      right,
    })
  ),
])

export const expr: Parser<Expr> = map(
  combine(exprElement, takeWhile(exprSequenceAction)),
  ([from, { parsed: sequence }]) => ({
    from,
    sequence,
  })
)
