import { Parser } from '../lib/base'
import { combine } from '../lib/combinations'
import { extract, failIf, failIfElse } from '../lib/conditions'
import { lookahead, not } from '../lib/consumeless'
import { contextualFailure, failure } from '../lib/errors'
import { maybe_s, maybe_s_nl, unicodeAlphanumericUnderscore } from '../lib/littles'
import { takeWhile } from '../lib/loops'
import { exact, oneOf, oneOfMap } from '../lib/matchers'
import { mappedCases, mappedCasesComposed, or } from '../lib/switches'
import { map, silence, toOneProp } from '../lib/transform'
import { mapToken, selfRef, withLatelyDeclared } from '../lib/utils'
import { cmdFlag } from './cmdarg'
import { cmdCall } from './cmdcall'
import { withStatementClose } from './context'
import {
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
import { literalString, literalValue } from './literals'
import { endOfInlineCmdCall, statementChainOp } from './stmtend'
import { identifier } from './tokens'

export const value: Parser<Value> = mappedCasesComposed<Value>()('type', literalValue, {
  list: map(
    combine(
      exact('['),
      takeWhile(
        withLatelyDeclared(() => expr),
        { inter: combine(maybe_s_nl, exact(','), maybe_s_nl) }
      ),
      exact(']'),
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
                message: "Syntax error: expected either an identifier or the end of the map's content",
                tip: 'Key names in map values must be written between quotes',
              }),
              contextualFailure(
                literalString,
                (ctx) => ctx.loopData?.iter !== 0,
                'Syntax error: expected a map key name'
              ),
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
      exact(')', "Syntax error: expected a closing parenthesis ')' to close the map's content"),
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
                (ctx) => ctx.loopData?.iter !== 0,
                'Syntax error: expected either a member name, or a closing brace (}) to close the structure'
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
      exact('}', 'Syntax error: expected a closing brace (}) to close the structure'),
      {
        inter: maybe_s_nl,
      }
    ),
    ([_, entries, __]) => ({
      entries: mapToken(entries, (_, { parsed }) => parsed),
    })
  ),

  fnCall: map(
    combine(
      identifier,
      exact('('),
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
              'Syntax error: invalid argument provided'
            )
          ),
          { inter: combine(maybe_s_nl, exact(','), maybe_s_nl) }
        )
      ),
      exact(')'),
      { inter: maybe_s }
    ),
    ([name, _, { parsed: args }, __]) => ({ name, args })
  ),

  inlineCmdCallSequence: map(
    combine(
      oneOfMap<InlineCmdCallCapture>([
        ['$*(', InlineCmdCallCapture.Both],
        ['$!(', InlineCmdCallCapture.Stderr],
        ['$(', InlineCmdCallCapture.Stdout],
      ]),
      failure(
        withLatelyDeclared(() => cmdCall(endOfInlineCmdCall)),
        'Syntax error: expected inline command call'
      ),
      takeWhile<InlineChainedCmdCall>(
        map(
          combine(
            maybe_s,
            statementChainOp,
            failure(
              withLatelyDeclared(() => cmdCall(endOfInlineCmdCall)),
              'Syntax error: expected inline command call after chaining operator'
            ),
            { inter: maybe_s_nl }
          ),
          ([_, op, chainedCmdCall]) => ({ op, chainedCmdCall })
        ),
        { inter: maybe_s }
      ),
      exact(')', "Syntax error: expected closing paren ')' after inline command call"),
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
    failure(not(_opSym), 'Syntax error: unknown operator')
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
    failure(not(_opSym), 'Syntax error: unknown operator')
  ),
  ([{ parsed: sym }]) => sym
)

export const doubleOp: Parser<DoubleOp> = mappedCases<DoubleOp>()('type', {
  arith: toOneProp(doubleArithOp, 'op'),
  logic: toOneProp(doubleLogicOp, 'op'),
})

export const singleLogicOp: Parser<SingleLogicOp> = map(
  combine(oneOfMap([['!', SingleLogicOp.Not]]), failure(not(_opSym), 'Syntax error: unknown operator')),
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
            'Syntax error: expected an expression after the operator'
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
            'Syntax error: expected an expression after an opening parenthesis'
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
            'Syntax error: expected a condition'
          ),
          exact('{', 'Syntax error: expected an opening brace ({) after the condition'),
          failure(
            withLatelyDeclared(() => expr),
            'Syntax error: expected an expression in the "if" body'
          ),
          exact('}', 'Syntax error: expected a closing brace (}) to close the "if" body'),
          exact('else', 'Syntax error: expected an "else" counterpart'),
          exact('{', 'Syntax error: expected an opening brace ({) for the "else" counterpart'),
          failure(
            withLatelyDeclared(() => expr),
            'Syntax error: expected an expression in the "else" body'
          ),
          exact('}', 'Syntax error: expected a closing brace (}) to close the "else" body'),
          { inter: maybe_s_nl }
        ),
        ([_, cond, __, then, ___, ____, _____, els, ______]) => ({ cond, then, els })
      ),

      // value
      value: map(value, (_, content) => ({ content })),
    },
    'Syntax error: failed to parse expression'
  )
)

export const exprSequenceAction: Parser<ExprSequenceAction> = or<ExprSequenceAction>([
  map(
    combine(
      exact('['),
      withLatelyDeclared(() => expr),
      exact(']')
    ),
    ([_, indexOrKey, __]) => ({ type: 'refIndexOrKey', indexOrKey })
  ),
  map(combine(exact('.'), identifier), ([_, member]) => ({ type: 'refStructMember', member })),
  map(
    combine(maybe_s, doubleOp, failure(exprElement, 'Syntax error: expected an expression after operator'), {
      inter: maybe_s,
    }),
    ([_, op, right]) => ({
      type: 'doubleOp',
      op,
      right,
    })
  ),
])

export const expr: Parser<Expr> = selfRef((expr) =>
  map(combine(exprElement, takeWhile(exprSequenceAction)), ([from, { parsed: sequence }]) => ({
    from,
    sequence,
  }))
)
