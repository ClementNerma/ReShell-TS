import {
  ElIfExpr,
  Expr,
  ExprElement,
  ExprElementContent,
  ExprOrNever,
  ExprOrTypeAssertion,
  ValueType,
} from '../shared/ast'
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
      // "(" expr ")"
      paren: map(
        combine(
          combine(exact('('), maybe_s_nl),
          failure(
            withLatelyDeclared(() => expr),
            'expected an expression after an opening parenthesis'
          ),
          combine(maybe_s_nl, exact(')'))
        ),
        ([_, inner, __]) => ({
          inner,
        })
      ),

      // <single operator> s expr
      singleOp: map(
        combine(
          singleOp,
          maybe_s,
          failure(
            withLatelyDeclared(() => simpleExpr),
            'expected an expression after the operator'
          )
        ),
        ([op, _, right]) => ({ op, right })
      ),

      // if <cond> { <then> } else { <else> }
      ternary: map(
        combine(
          combine(exact('if'), s),
          failure(
            withLatelyDeclared(() => exprOrTypeAssertion),
            'expected a condition'
          ),
          combine(maybe_s_nl, exact('{', 'expected an opening brace ({)'), maybe_s_nl),
          failure(
            withLatelyDeclared(() => exprOrNever),
            'expected an expression'
          ),
          combine(maybe_s_nl, exact('}', 'expected a closing brace (}) to close the "if" body'), maybe_s_nl),
          extract(
            takeWhile<ElIfExpr>(
              map(
                combine(
                  combine(exact('elif'), s),
                  failure(
                    withLatelyDeclared(() => exprOrTypeAssertion),
                    'expecting a condition'
                  ),
                  combine(maybe_s_nl, exact('{', 'expected an opening brace ({)'), maybe_s_nl),
                  failure(
                    withLatelyDeclared(() => exprOrNever),
                    'expected an expression'
                  ),
                  combine(maybe_s_nl, exact('}', 'expected an opening brace (}) to close the "elif" body'))
                ),
                ([_, cond, __, expr]) => ({ cond, expr })
              ),
              { inter: maybe_s_nl, interExpect: false }
            )
          ),
          combine(
            maybe_s_nl,
            exact('else', 'expected an "else" variant'),
            maybe_s_nl,
            exact('{', 'expected an opening brace ({)'),
            maybe_s_nl
          ),
          failure(
            withLatelyDeclared(() => exprOrNever),
            'expected an expression'
          ),
          combine(maybe_s_nl, exact('}', 'expected a closing brace (}) to close the "else" body'))
        ),
        ([_, cond, __, then, ___, { parsed: elif }, ____, els]) => ({ cond, then, elif, els })
      ),

      try: map(
        combine(
          combine(exact('try'), maybe_s_nl),
          map(
            combine(
              combine(exact('{', 'expected an opening brace ({)'), maybe_s_nl),
              withStatementClosingChar(
                '}',
                withLatelyDeclared(() => expr)
              ),
              combine(maybe_s_nl, exact('}', "expected a closing brace (}) to close the block's content"))
            ),
            ([_, expr, __]) => expr
          ),
          map(
            combine(
              combine(maybe_s_nl, exact('catch', 'expected a "catch" clause'), s),
              failure(identifier, 'expected an identifier for the "catch" clause')
            ),
            ([_, catchVarname]) => catchVarname
          ),
          map(
            combine(
              combine(maybe_s_nl, exact('{', 'expected an opening brace ({)'), maybe_s_nl),
              withStatementClosingChar(
                '}',
                withLatelyDeclared(() => exprOrNever)
              ),
              combine(maybe_s_nl, exact('}', "expected a closing brace (}) to close the block's content"))
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
    'failed to parse expression'
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
        combine(maybe_s, doubleOp, maybe_s_nl, failure(exprElement, 'expected an expression after the operator')),
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
  invertedAssertion: map(
    combine(
      identifier,
      s,
      or<ValueType | null>([
        map(combine(exact('is'), s, exact('null')), (_) => null),
        map(
          combine(s, exact('isnt'), s, failure(valueType, 'expected a type after the "isnt" type assertion operator')),
          ([_, __, ___, { parsed: type }]) => type
        ),
      ])
    ),
    ([varname, _, minimum]) => ({ varname, minimum: flattenMaybeToken(minimum) })
  ),

  assertion: map(
    combine(
      identifier,
      combine(s, exact('is'), s),
      or<ValueType | null>([
        map(combine(exact('not'), s, exact('null', 'expected `not null` type assertion')), (_) => null),
        failure(valueType, 'expected a type after the "is" type assertion operator'),
      ])
    ),
    ([varname, _, minimum]) => ({ varname, minimum: flattenMaybeToken(minimum) })
  ),

  expr: toOneProp(expr, 'inner'),
})

export const exprOrNever: Parser<ExprOrNever> = mappedCases<ExprOrNever>()('type', {
  throw: map(combine(exact('throw'), s, expr), ([_, __, expr]) => ({ expr })),
  return: map(combine(exact('return'), s, expr), ([_, __, expr]) => ({ expr })),
  panic: map(combine(exact('panic'), s, expr), ([_, __, message]) => ({ message })),
  expr: toOneProp(expr, 'content'),
})
