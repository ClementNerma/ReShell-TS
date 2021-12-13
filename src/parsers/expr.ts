import { Parser } from '../lib/base'
import { combine } from '../lib/combinations'
import { failure } from '../lib/errors'
import { maybe_s, maybe_s_nl, s } from '../lib/littles'
import { takeWhile } from '../lib/loops'
import { exact } from '../lib/matchers'
import { mappedCases } from '../lib/switches'
import { map, toOneProp } from '../lib/transform'
import { logUsage, selfRef, withLatelyDeclared } from '../lib/utils'
import { ElIfExpr, Expr, ExprElement, ExprSequenceAction } from '../shared/parsed'
import { withStatementClosingChar } from './context'
import { doubleOp, singleOp } from './operators'
import { propertyAccess } from './propaccess'
import { identifier } from './tokens'
import { valueType } from './types'
import { value } from './value'

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
            logUsage(withLatelyDeclared)(() => expr),
            'Expected an expression in the "if" body'
          ),
          exact('}', 'Expected a closing brace (}) to close the "if" body'),
          takeWhile<ElIfExpr>(
            map(
              combine(
                combine(exact('elif'), s),
                failure(
                  withLatelyDeclared(() => expr),
                  'Expecting a condition'
                ),
                exact('{', 'Expected an opening brace ({) after the condition'),
                failure(
                  withLatelyDeclared(() => expr),
                  'Expected an expression in the "elif" body'
                ),
                exact('}', 'Expected an opening brace (}) to close the "elif" body'),
                { inter: maybe_s_nl }
              ),
              ([_, cond, __, expr]) => ({ cond, expr })
            )
          ),
          exact('else', 'Expected an "else" counterpart'),
          exact('{', 'Expected an opening brace ({) for the "else" counterpart'),
          failure(
            withLatelyDeclared(() => expr),
            'Expected an expression in the "else" body'
          ),
          exact('}', 'Expected a closing brace (}) to close the "else" body'),
          { inter: maybe_s_nl }
        ),
        ([_, cond, __, then, ___, { parsed: elif }, ____, _____, els, ______]) => ({ cond, then, elif, els })
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
