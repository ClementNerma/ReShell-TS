import { Parser } from '../lib/base'
import { combine } from '../lib/combinations'
import { failIfMatches } from '../lib/conditions'
import { failure } from '../lib/errors'
import { maybe_s, maybe_s_nl, s } from '../lib/littles'
import { takeWhile, takeWhile1 } from '../lib/loops'
import { exact, oneOf, oneOfMap } from '../lib/matchers'
import { mappedCases } from '../lib/switches'
import { map, silence, toOneProp } from '../lib/transform'
import { selfRef, withLatelyDeclared } from '../lib/utils'
import { withStatementClosingChar } from './context'
import {
  DoubleArithOp,
  DoubleLogicOp,
  DoubleOp,
  Expr,
  ExprElement,
  ExprSequenceAction,
  SingleLogicOp,
  SingleOp,
} from './data'
import { propertyAccess } from './propaccess'
import { identifier } from './tokens'
import { valueType } from './types'
import { value } from './value'

export const _catchUnknownOperator: Parser<void> = silence(
  takeWhile1(oneOf(['+', '-', '*', '/', '%', '&', '|', '^', '!', '<', '>', '=']))
)

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
    failIfMatches(_catchUnknownOperator, 'Unknown operator')
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
    failIfMatches(_catchUnknownOperator, 'Unknown operator')
  ),
  ([{ parsed: sym }]) => sym
)

export const doubleOp: Parser<DoubleOp> = mappedCases<DoubleOp>()('type', {
  arith: toOneProp(doubleArithOp, 'op'),
  logic: toOneProp(doubleLogicOp, 'op'),
})

export const singleLogicOp: Parser<SingleLogicOp> = map(
  combine(oneOfMap([['!', SingleLogicOp.Not]]), failIfMatches(_catchUnknownOperator, 'Unknown operator')),
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

      try: map(
        combine(
          exact('try'),
          map(
            combine(
              exact('{', "Expected an opening brace ({) for the try's expression"),
              withStatementClosingChar(
                '}',
                withLatelyDeclared(() => expr)
              ),
              exact('}', "Expected a closing brace (}) to close the block's content"),
              { inter: maybe_s_nl }
            ),
            ([_, { parsed: expr }, __]) => expr
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
              exact('{', 'Expected an opening brace ({) for the "catch" clause\'s expression'),
              withStatementClosingChar(
                '}',
                withLatelyDeclared(() => expr)
              ),
              exact('}', "Expected a closing brace (}) to close the block's content"),
              { inter: maybe_s_nl }
            ),
            ([_, { parsed: expr }, __]) => expr
          ),
          { inter: maybe_s_nl }
        ),
        ([_, trying, { parsed: catchVarname }, catchExpr]) => ({
          trying,
          catchVarname,
          catchExpr,
        })
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

export const exprSequenceAction: Parser<ExprSequenceAction> = mappedCases<ExprSequenceAction>()('type', {
  propAccess: toOneProp(propertyAccess, 'access'),

  doubleOp: map(
    combine(maybe_s, doubleOp, failure(exprElement, 'Expected an expression after operator'), {
      inter: maybe_s,
    }),
    ([_, op, right]) => ({
      type: 'doubleOp',
      op,
      right,
    })
  ),
})

export const expr: Parser<Expr> = map(
  combine(exprElement, takeWhile(exprSequenceAction)),
  ([from, { parsed: sequence }]) => ({
    from,
    sequence,
  })
)
