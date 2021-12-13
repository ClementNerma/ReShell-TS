import { CmdDeclSubCommand, CmdVariant, CmdVariantContent, CmdVariantSignature } from '../shared/ast'
import { fnArg } from './fn'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { failIfMatches, maybe, useSeparatorIf } from './lib/conditions'
import { failure } from './lib/errors'
import { maybe_s_nl, s } from './lib/littles'
import { takeWhile, takeWhile1 } from './lib/loops'
import { exact } from './lib/matchers'
import { mappedCases } from './lib/switches'
import { map } from './lib/transform'
import { withLatelyDeclared } from './lib/utils'
import { rawString } from './literals'
import { cmdAction } from './tokens'

const cmdDeclDescription: Parser<string> = map(
  combine(
    exact('['),
    maybe_s_nl,
    failure(rawString, 'expected a description string (quoted with ")'),
    maybe_s_nl,
    exact(']'),
    maybe_s_nl
  ),
  ([_, __, { parsed: description }]) => description
)

const cmdDeclSubCommandVariantSignature: Parser<CmdVariantSignature> = mappedCases<CmdVariantSignature>()('type', {
  subCmd: map(
    combine(
      exact('=>'),
      maybe_s_nl,
      withLatelyDeclared(() => cmdDeclSubCommand)
    ),
    ([_, __, { parsed: content }]) => ({ content })
  ),

  direct: map(
    combine(
      exact('('),
      maybe_s_nl,
      useSeparatorIf(
        takeWhile(
          withLatelyDeclared(() => fnArg),
          {
            inter: combine(maybe_s_nl, exact(','), maybe_s_nl, failIfMatches(exact('...'))),
            interExpect: 'expected another argument',
          }
        ),
        combine(maybe_s_nl, exact(','), maybe_s_nl),
        exact('...')
      ),
      maybe_s_nl,
      exact(')', 'expected a closing parenthesis ")" after the arguments list')
    ),
    ([
      _,
      __,
      {
        parsed: [{ parsed: args }, rest],
      },
    ]) => ({ args, rest })
  ),
})

const cmdDeclSubCommandVariantContent: Parser<CmdVariantContent> = map(
  combine(
    maybe(map(combine(cmdDeclDescription, maybe_s_nl), ([description]) => description)),
    failure(cmdDeclSubCommandVariantSignature, 'expected a signature (function type or variant content)')
  ),
  ([{ parsed: description }, { parsed: signature }]) => ({ description, signature })
)

export const cmdDeclSubCommand: Parser<CmdDeclSubCommand> = map(
  combine(
    exact('{', 'expected an opening brace ({)'),
    maybe_s_nl,
    maybe(
      map(
        combine(
          exact('@base'),
          s,
          cmdDeclSubCommandVariantContent,
          maybe_s_nl,
          exact(',', 'expected a comma separator after base declaration'),
          maybe_s_nl
        ),
        ([_, __, content]) => content
      )
    ),
    takeWhile<CmdVariant>(
      map(
        combine(
          takeWhile1(failure(cmdAction, 'expected an argument value (either a double-quoted string or a flag)'), {
            inter: combine(maybe_s_nl, exact('|'), maybe_s_nl),
            interExpect:
              'expected another argument value (either a double-quoted string or a flag) after union (|) separator',
            noMatchError: 'expected an argument or flag name for this variant',
          }),
          maybe_s_nl,
          cmdDeclSubCommandVariantContent
        ),
        ([
          { parsed: argCandidates },
          _,
          {
            parsed: { description, signature },
          },
        ]) => ({
          argCandidates,
          description,
          signature,
        })
      ),
      { inter: combine(maybe_s_nl, exact(','), maybe_s_nl), interExpect: 'expected another variant' }
    ),
    maybe_s_nl,
    exact('}', 'expected a closing brace (}) after the sub-command declaration')
  ),
  ([_, __, { parsed: base }, { parsed: variants }]) => ({ base, variants })
)
