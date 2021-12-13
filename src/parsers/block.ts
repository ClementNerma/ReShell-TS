import { Block, Statement } from '../shared/ast'
import { matchStatementClose, withStatementClosingChar } from './context'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { failIfMatchesElse } from './lib/conditions'
import { maybe_s, maybe_s_nl } from './lib/littles'
import { takeWhile } from './lib/loops'
import { eol, eos, exact } from './lib/matchers'
import { or } from './lib/switches'
import { map } from './lib/transform'
import { statement } from './statements'

export const block: Parser<Block> = takeWhile<Statement>(
  failIfMatchesElse(combine(maybe_s_nl, or<unknown>([matchStatementClose, eos()])), statement),
  {
    inter: combine(maybe_s, or<unknown>([eol(), exact(';')]), maybe_s_nl),
    interExpect: false,
  }
)

export const blockWithBraces: Parser<Block> = map(
  combine(
    exact('{', 'expected an opening brace ({)'),
    maybe_s_nl,
    withStatementClosingChar('}', block),
    maybe_s_nl,
    exact('}', 'expected a closing brace (})')
  ),
  ([_, __, { parsed: body }]) => body
)
