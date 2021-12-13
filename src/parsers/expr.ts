import { Parser, Token } from '../lib/base'
import { combine } from '../lib/combinations'
import { ifThenElse } from '../lib/conditions'
import { fail, lookahead, not } from '../lib/consumeless'
import { failure } from '../lib/errors'
import { maybe_s, maybe_s_nl, s } from '../lib/littles'
import { takeWhile } from '../lib/loops'
import { exact, oneOf } from '../lib/matchers'
import { mappedCases, mappedCasesComposed, or } from '../lib/switches'
import { map, mapFull, silence, toOneProp } from '../lib/transform'
import { mapToken, selfRef, withLatelyDeclared } from '../lib/utils'
import { cmdArg } from './cmdarg'
import {
  CmdArg,
  DoubleArithOp,
  DoubleLogicOp,
  DoubleOp,
  Expr,
  ExprPropAccess,
  ExprPropAccessSequence,
  InlineChainedCmdCall,
  InlineCmdCall,
  SingleLogicOp,
  SingleOp,
  Value,
} from './data'
import { literalValue } from './literals'
import { endOfInner, statementChainOp } from './stmtend'
import { identifier } from './tokens'

export const inlineCmdCall: Parser<InlineCmdCall> = or<InlineCmdCall>(
  [
    map(combine(identifier, lookahead(endOfInner)), ([name, _]) => ({
      name,
      args: [],
    })),
    map(
      combine(
        identifier,
        takeWhile(
          ifThenElse<CmdArg>(
            lookahead(endOfInner),
            fail(),
            failure(
              withLatelyDeclared(() => cmdArg),
              'Syntax error: invalid argument provided'
            )
          ),
          {
            inter: s,
          }
        ),
        {
          inter: s,
        }
      ),
      ([name, args]) => ({
        name,
        args: args.parsed ?? [],
      })
    ),
  ],
  'Syntax error: expected inline command call'
)

export const value: Parser<Value> = mappedCasesComposed<Value>()('type', literalValue, {
  reference: toOneProp(identifier, 'varname'),
  inlineCmdCallSequence: map(
    combine(
      exact('$('),
      inlineCmdCall,
      takeWhile<InlineChainedCmdCall>(
        map(
          combine(
            maybe_s,
            statementChainOp,
            failure(inlineCmdCall, 'Syntax error: expected inline command call after chaining operator'),
            { inter: maybe_s_nl }
          ),
          ([_, op, chainedCmdCall]) => ({ op, chainedCmdCall })
        ),
        { inter: maybe_s }
      ),
      exact(')', "Syntax error: expected closing paren ')' after inline command call"),
      { inter: maybe_s_nl }
    ),
    ([_, start, sequenceRest]) => ({
      start,
      sequence: sequenceRest.parsed,
    })
  ),
})

export const _opSym: Parser<void> = silence(oneOf(['+', '-', '*', '/', '%', '&', '|', '^', '!']))

export const doubleArithOp: Parser<DoubleArithOp> = or<DoubleArithOp>(
  (['+', '-', '*', '/', '%'] as const).map((sym) => map(combine(exact(sym), not(_opSym)), (_) => sym))
)

export const doubleLogicOp: Parser<DoubleLogicOp> = or<DoubleLogicOp>(
  (['&&', '||'] as const).map((sym) => map(combine(exact(sym), not(_opSym)), (_) => sym))
)

export const doubleOp: Parser<DoubleOp> = mappedCases<DoubleOp>()('type', {
  arith: toOneProp(doubleArithOp, 'op'),
  logic: toOneProp(doubleLogicOp, 'op'),
})

export const singleLogicOp: Parser<SingleLogicOp> = or<SingleLogicOp>(
  (['!'] as const).map((sym) => map(combine(exact(sym), not(_opSym)), (_) => sym))
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
