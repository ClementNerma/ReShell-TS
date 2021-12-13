import { ElIfExpr, Expr, ExprElement, ExprElementContent, ExprOrTypeAssertion, ValueType } from '../shared/parsed'
import { withStatementClosingChar } from './context'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { extract } from './lib/conditions'
import { never } from './lib/consumeless'
import { failure } from './lib/errors'
import { maybe_s, maybe_s_nl, s } from './lib/littles'
import { takeWhile } from './lib/loops'
import { exact } from './lib/matchers'
import { mappedCases, or } from './lib/switches'
import { map, toOneProp } from './lib/transform'
import { flattenMaybeToken, selfRef, withLatelyDeclared } from './lib/utils'
import { doubleOp, singleOp } from './operators'
import { propertyAccess } from './propaccess'
import { identifier } from './tokens'
import { valueType } from './types'
import { value } from './value'

export const exprElementContent: Parser<ExprElementContent> = selfRef((simpleExpr) =>
  mappedCases<ExprElementContent>()(
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
          combine(exact('if'), s),
          failure(
            withLatelyDeclared(() => exprOrTypeAssertion),
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
                    withLatelyDeclared(() => exprOrTypeAssertion),
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
            ([_, expr, __]) => expr
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
            ([_, expr, __]) => expr
          )
        ),
        ([_, { parsed: trying }, { parsed: catchVarname }, { parsed: catchExpr }]) => ({
          trying,
          catchVarname,
          catchExpr,
        })
      ),

      // value
      value: map(value, (_, content) => ({ content })),

      // Internal
      synth: never(),
    },
    'Failed to parse expression'
  )
)

export const exprElement: Parser<ExprElement> = map(
  combine(exprElementContent, takeWhile(propertyAccess)),
  ([content, { parsed: propAccess }]) => ({ content, propAccess })
)

export const expr: Parser<Expr> = map(
  combine(
    exprElement,
    takeWhile(
      map(
        combine(maybe_s, doubleOp, maybe_s_nl, failure(exprElement, 'Expected an expression after operator')),
        ([_, op, __, right]) => ({
          type: 'doubleOp',
          op,
          right,
        })
      )
    )
  ),
  ([from, { parsed: doubleOps }]) => ({
    from,
    doubleOps,
  })
)

export const exprOrTypeAssertion: Parser<ExprOrTypeAssertion> = mappedCases<ExprOrTypeAssertion>()('type', {
  assertion: map(
    combine(
      identifier,
      combine(s, exact('is'), s),
      or<ValueType | null>([
        map(combine(exact('not'), s, exact('null', 'Expected `not null` type assertion')), (_) => null),
        failure(valueType, 'Expected a type after the "is" type assertion operator'),
      ])
    ),
    ([varname, _, minimum]) => ({ varname, minimum: flattenMaybeToken(minimum) })
  ),

  expr: toOneProp(expr, 'inner'),
})
