import { Parser, Token } from '../lib/base'
import { combine } from '../lib/combinations'
import { extract, failIf, failIfElse } from '../lib/conditions'
import { lookahead, not } from '../lib/consumeless'
import { contextualFailure, failure } from '../lib/errors'
import { maybe_s, maybe_s_nl, unicodeAlphanumericUnderscore } from '../lib/littles'
import { takeWhile } from '../lib/loops'
import { exact, oneOf, oneOfMap } from '../lib/matchers'
import { mappedCases, mappedCasesComposed, or } from '../lib/switches'
import { map, mapFull, silence, toOneProp } from '../lib/transform'
import { mapToken, selfRef, withLatelyDeclared } from '../lib/utils'
import { cmdFlag } from './cmdarg'
import { cmdCall } from './cmdcall'
import { withStatementClose } from './context'
import {
  DoubleArithOp,
  DoubleLogicOp,
  DoubleOp,
  Expr,
  ExprPropAccess,
  ExprPropAccessSequence,
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
    ([capture, start, sequenceRest]) => ({
      start,
      sequence: sequenceRest.parsed,
      capture,
    })
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
    ]),
    failure(not(_opSym), 'Syntax error: unknown operator')
  ),
  ([sym]) => sym.parsed
)

export const doubleLogicOp: Parser<DoubleLogicOp> = map(
  combine(
    oneOfMap([
      ['&&', DoubleLogicOp.And],
      ['||', DoubleLogicOp.Or],
    ]),
    failure(not(_opSym), 'Syntax error: unknown operator')
  ),
  ([sym]) => sym.parsed
)

export const doubleOp: Parser<DoubleOp> = mappedCases<DoubleOp>()('type', {
  arith: toOneProp(doubleArithOp, 'op'),
  logic: toOneProp(doubleLogicOp, 'op'),
})

export const singleLogicOp: Parser<SingleLogicOp> = map(
  combine(oneOfMap([['!', SingleLogicOp.Not]]), failure(not(_opSym), 'Syntax error: unknown operator')),
  ([sym]) => sym.parsed
)

export const singleOp: Parser<SingleOp> = mappedCases<SingleOp>()('type', {
  logic: toOneProp(singleLogicOp, 'op'),
})

export const exprNoIndex: Parser<Expr> = selfRef((exprNoIndex) =>
  or<Expr>(
    [
      // "(" s expr s ")" s <op> s expr
      map(
        combine(
          exact('('),
          withLatelyDeclared(() => expr),
          exact(')'),
          doubleOp,
          failure(
            withLatelyDeclared(() => expr),
            'Syntax error: expected an expression after the operator'
          ),
          {
            inter: maybe_s_nl,
          }
        ),
        ([_, left, __, op, right]) => ({
          type: 'doubleOp',
          left,
          op,
          right,
        })
      ),

      // "(" s expr s ")"
      map(
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
          type: 'paren',
          inner,
        })
      ),

      // // Catch incomplete paren expressions
      // failWithPrecedenceIf(exact('('), 'Syntax error: expected an expression after the opening parenthesis', 'after'),

      // <slop> s expr
      map(
        combine(
          singleOp,
          failure(
            withLatelyDeclared(() => expr),
            'Syntax error: expected an expression after the operator'
          ),
          { inter: maybe_s }
        ),
        ([op, right]) => ({ type: 'singleOp', op, right })
      ),

      // value s <op> s expr
      map(
        combine(
          value,
          doubleOp,
          failure(
            withLatelyDeclared(() => expr),
            'Syntax error: expected an expression after the operator'
          ),
          {
            inter: maybe_s_nl,
          }
        ),
        ([left, op, right]) => ({
          type: 'doubleOp',
          left: mapToken(left, (_, left) => ({ type: 'value', content: left })),
          op,
          right,
        })
      ),

      // value
      map(value, (_, content) => ({ type: 'value', content })),
    ],

    'Syntax error: failed to parse expression'
  )
)

export const expr: Parser<Expr> = selfRef((expr) =>
  mapFull(
    combine(
      exprNoIndex,
      takeWhile(
        or<ExprPropAccess>([
          map(combine(exact('['), expr, exact(']')), ([_, indexOrKey, __]) => ({ type: 'refIndexOrKey', indexOrKey })),
          map(combine(exact('.'), identifier), ([_, member]) => ({ type: 'refStructMember', member })),
        ])
      )
    ),
    ([expr, suffixes], complete): Token<Expr> =>
      suffixes.parsed.length
        ? mapToken(
            complete,
            (_): ExprPropAccessSequence => ({
              type: 'propAccessSequence',
              from: expr,
              sequence: suffixes.parsed,
            })
          )
        : expr
  )
)
