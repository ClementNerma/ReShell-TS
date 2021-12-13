import { ElIfExpr, Expr, ExprElement, ExprSequenceAction } from '../shared/parsed'
import { withStatementClosingChar } from './context'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { extract } from './lib/conditions'
import { failure } from './lib/errors'
import { maybe_s, maybe_s_nl, s } from './lib/littles'
import { takeWhile } from './lib/loops'
import { exact } from './lib/matchers'
import { mappedCases } from './lib/switches'
import { map, toOneProp } from './lib/transform'
import { selfRef, withLatelyDeclared } from './lib/utils'
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
          maybe_s,
          failure(
            withLatelyDeclared(() => simpleExpr),
            'Expected an expression after the operator'
          )
        ),
        ([op, _, right]) => ({ op, right })
      ),

      // "(" expr ")"
      paren: map(
        combine(
          combine(exact('('), maybe_s_nl),
          failure(
            withLatelyDeclared(() => expr),
            'Expected an expression after an opening parenthesis'
          ),
          combine(maybe_s_nl, exact(')'))
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
          combine(maybe_s_nl, exact('{', 'Expected an opening brace ({) after the condition'), maybe_s_nl),
          failure(
            withLatelyDeclared(() => expr),
            'Expected an expression in the "if" body'
          ),
          combine(maybe_s_nl, exact('}', 'Expected a closing brace (}) to close the "if" body'), maybe_s_nl),
          extract(
            takeWhile<ElIfExpr>(
              map(
                combine(
                  combine(exact('elif'), s),
                  failure(
                    withLatelyDeclared(() => expr),
                    'Expecting a condition'
                  ),
                  combine(maybe_s_nl, exact('{', 'Expected an opening brace ({) after the condition'), maybe_s_nl),
                  failure(
                    withLatelyDeclared(() => expr),
                    'Expected an expression in the "elif" body'
                  ),
                  combine(maybe_s_nl, exact('}', 'Expected an opening brace (}) to close the "elif" body'))
                ),
                ([_, cond, __, expr]) => ({ cond, expr })
              ),
              { inter: maybe_s_nl }
            )
          ),
          combine(
            maybe_s_nl,
            exact('else', 'Expected an "else" counterpart'),
            maybe_s_nl,
            exact('{', 'Expected an opening brace ({) for the "else" counterpart'),
            maybe_s_nl
          ),
          failure(
            withLatelyDeclared(() => expr),
            'Expected an expression in the "else" body'
          ),
          combine(maybe_s_nl, exact('}', 'Expected a closing brace (}) to close the "else" body'))
        ),
        ([_, cond, __, then, ___, { parsed: elif }, ____, els]) => ({ cond, then, elif, els })
      ),

      try: map(
        combine(
          combine(exact('try'), maybe_s_nl),
          map(
            combine(
              combine(exact('{', "Expected an opening brace ({) for the try's expression"), maybe_s_nl),
              withStatementClosingChar(
                '}',
                withLatelyDeclared(() => expr)
              ),
              combine(maybe_s_nl, exact('}', "Expected a closing brace (}) to close the block's content"))
            ),
            ([_, { parsed: expr }, __]) => expr
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
              combine(
                maybe_s_nl,
                exact('{', 'Expected an opening brace ({) for the "catch" clause\'s expression'),
                maybe_s_nl
              ),
              withStatementClosingChar(
                '}',
                withLatelyDeclared(() => expr)
              ),
              combine(maybe_s_nl, exact('}', "Expected a closing brace (}) to close the block's content"))
            ),
            ([_, { parsed: expr }, __]) => expr
          )
        ),
        ([_, trying, { parsed: catchVarname }, catchExpr]) => ({
          trying,
          catchVarname,
          catchExpr,
        })
      ),

      assertion: map(
        combine(
          identifier,
          combine(s, exact('is'), s),
          failure(valueType, 'Expected a type after the "is" type assertion operator')
        ),
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
    combine(maybe_s, doubleOp, maybe_s, failure(exprElement, 'Expected an expression after operator')),
    ([_, op, __, right]) => ({
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
