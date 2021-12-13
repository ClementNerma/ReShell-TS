import { Expr } from '../shared/ast'
import { Token } from '../shared/parsed'
import { expr } from './expr'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { extract } from './lib/conditions'
import { failure } from './lib/errors'
import { maybe_s_nl, s } from './lib/littles'
import { takeWhile1 } from './lib/loops'
import { exact } from './lib/matchers'
import { map } from './lib/transform'
import { withLatelyDeclared } from './lib/utils'
import { blockBody } from './statements'
import { identifier } from './tokens'

export const enumMatching: <T>(
  bodyParser: Parser<T>
) => Parser<{ subject: Token<Expr>; arms: { variant: Token<string>; matchWith: Token<T> }[] }> = (bodyParser) =>
  map(
    combine(
      exact('match'),
      s,
      failure(
        withLatelyDeclared(() => expr),
        'expected an expression to match on'
      ),
      maybe_s_nl,
      exact('{', 'expected an opening brace'),
      maybe_s_nl,
      extract(
        takeWhile1(
          map(
            combine(identifier, maybe_s_nl, exact('=>', 'expected a match arm (=>)'), maybe_s_nl, bodyParser),
            ([variant, _, __, ___, matchWith]) => ({ variant, matchWith })
          ),
          {
            inter: combine(maybe_s_nl, exact(','), maybe_s_nl),
            interExpect: 'expected another match',
            noMatchError: 'please provide at least one match',
          }
        )
      ),
      exact('}', "expected a closing brace (}) after the match's body")
    ),
    ([_, __, subject, ___, ____, _____, { parsed: arms }]) => ({ subject, arms })
  )

export const enumMatchingExpr = enumMatching(withLatelyDeclared(() => expr))
export const enumMatchingBlock = enumMatching(withLatelyDeclared(() => blockBody))
